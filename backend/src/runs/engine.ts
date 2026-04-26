import {
  BOARD_SIZE,
  parseShot,
  type BoardView,
  type CellState,
  type Outcome,
  type SseEvent,
  type StartRunInput,
} from "@battleship-arena/shared";

import { generateBoard, type BoardLayout, type ShipPlacement } from "../board/generator.ts";
import { renderBoardText } from "../board/text-renderer.ts";
// PNG renderer kept for the vision-based track. Disabled in this build; see
// providers/openai-compatible.ts for the corresponding image_url message branch.
// import { renderBoardPng } from "../board/renderer.ts";
import type { Queries } from "../db/queries.ts";
import { isProviderError, ProviderError } from "../providers/errors.ts";
import type { ProviderAdapter } from "../providers/types.ts";

import {
  initialRunLoopState,
  reduceOutcome,
  type RunLoopEvent,
  type RunLoopState,
} from "./outcome.ts";
import { SYSTEM_PROMPT } from "./prompt.ts";

const RAW_RESPONSE_LIMIT = 8 * 1024;
const REASONING_TEXT_LIMIT = 2 * 1024;
const DEFAULT_TURN_TIMEOUT_MS = 60_000;
type ShotRunLoopEvent = Exclude<RunLoopEvent, { kind: "abort" }>;

type Awaitable<T> = T | Promise<T>;

interface LegalPriorShot {
  row: number;
  col: number;
  result: "hit" | "miss" | "sunk";
}

interface AggregateTotals {
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number | null;
}

export interface RunEngineDeps {
  queries: Queries;
  provider: ProviderAdapter;
  now?: () => number;
  turnTimeoutMs?: number;
}

function truncateText(text: string, limit: number): string {
  return text.length <= limit ? text : text.slice(0, limit);
}

function keyFor(row: number, col: number): string {
  return `${row}:${col}`;
}

function isAbortError(error: unknown): error is DOMException {
  return error instanceof DOMException && error.name === "AbortError";
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonRetriable4xx(error: unknown): boolean {
  if (!isObjectRecord(error) || typeof error.status !== "number") {
    return false;
  }

  return error.status >= 400 && error.status < 500 && error.status !== 429;
}

function readAbortReason(signal: AbortSignal): "viewer" | "server_restart" {
  const reason = signal.reason;
  if (isObjectRecord(reason) && reason.reason === "server_restart") {
    return "server_restart";
  }

  return "viewer";
}

function budgetUsdToMicros(budgetUsd: number | undefined): number | null {
  return budgetUsd === undefined ? null : Math.floor(budgetUsd * 1_000_000);
}

function addReasoningTokens(current: number | null, next: number | null): number | null {
  if (current === null && next === null) {
    return null;
  }

  return (current ?? 0) + (next ?? 0);
}

function serializeProviderError(error: { cause: string }): string {
  return truncateText(error.cause, REASONING_TEXT_LIMIT);
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

async function withTurnTimeout<T>(
  providerId: string,
  timeoutMs: number,
  parentSignal: AbortSignal,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (parentSignal.aborted) {
    throw abortError();
  }

  const controller = new AbortController();
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let rejectParentAbort: ((error: DOMException) => void) | null = null;

  const timeoutError = new ProviderError({
    kind: "transient",
    code: "timeout",
    providerId,
    message: "Provider turn timed out",
    cause: `Provider turn timed out after ${timeoutMs} ms`,
  });

  const onParentAbort = () => {
    controller.abort(parentSignal.reason);
    rejectParentAbort?.(abortError());
  };

  parentSignal.addEventListener("abort", onParentAbort, { once: true });

  const parentAbort = new Promise<never>((_, reject) => {
    rejectParentAbort = reject;
  });

  const turnTimeout = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(timeoutError);
      reject(timeoutError);
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(controller.signal), parentAbort, turnTimeout]);
  } catch (error) {
    if (timedOut && isAbortError(error)) {
      throw timeoutError;
    }

    throw error;
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }

    parentSignal.removeEventListener("abort", onParentAbort);
  }
}

function buildBoardView(
  layout: BoardLayout,
  legalPriorShots: readonly LegalPriorShot[],
): BoardView {
  const cells: CellState[] = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => "unknown");
  const hitKeys = new Set(
    legalPriorShots
      .filter((shot) => shot.result === "hit" || shot.result === "sunk")
      .map((shot) => keyFor(shot.row, shot.col)),
  );
  const missShots = legalPriorShots.filter((shot) => shot.result === "miss");
  const sunkShipKeys = new Set<string>();

  for (const ship of layout.ships) {
    const isSunk = ship.cells.every((cell) => hitKeys.has(keyFor(cell.row, cell.col)));
    if (!isSunk) {
      continue;
    }

    ship.cells.forEach((cell) => {
      sunkShipKeys.add(keyFor(cell.row, cell.col));
    });
  }

  for (const shot of missShots) {
    cells[shot.row * BOARD_SIZE + shot.col] = "miss";
  }

  for (const ship of layout.ships) {
    for (const cell of ship.cells) {
      const index = cell.row * BOARD_SIZE + cell.col;
      const key = keyFor(cell.row, cell.col);

      if (sunkShipKeys.has(key)) {
        cells[index] = "sunk";
        continue;
      }

      if (hitKeys.has(key)) {
        cells[index] = "hit";
      }
    }
  }

  return { size: 10, cells };
}

function shipsRemaining(layout: BoardLayout, legalPriorShots: readonly LegalPriorShot[]): string[] {
  const hitKeys = new Set(
    legalPriorShots
      .filter((shot) => shot.result === "hit" || shot.result === "sunk")
      .map((shot) => keyFor(shot.row, shot.col)),
  );

  return layout.ships
    .filter((ship) => !ship.cells.every((cell) => hitKeys.has(keyFor(cell.row, cell.col))))
    .map((ship) => ship.name);
}

function findShipAt(layout: BoardLayout, row: number, col: number): ShipPlacement | undefined {
  return layout.ships.find((ship) =>
    ship.cells.some((cell) => cell.row === row && cell.col === col),
  );
}

function classifyShot(
  layout: BoardLayout,
  legalPriorShots: readonly LegalPriorShot[],
  seenCoordinates: ReadonlySet<string>,
  rawText: string,
): {
  row: number | null;
  col: number | null;
  result: "hit" | "miss" | "sunk" | "schema_error" | "invalid_coordinate";
  reasoningText: string | null;
  event: ShotRunLoopEvent;
  legalShot: LegalPriorShot | null;
} {
  const parsed = parseShot(rawText);

  if (parsed.kind === "schema_error") {
    return {
      row: null,
      col: null,
      result: "schema_error",
      reasoningText: null,
      event: { kind: "schema_error" },
      legalShot: null,
    };
  }

  if (parsed.kind === "invalid_coordinate") {
    return {
      row: null,
      col: null,
      result: "invalid_coordinate",
      reasoningText: null,
      event: { kind: "invalid_coordinate" },
      legalShot: null,
    };
  }

  const reasoningText = parsed.shot.reasoning ?? null;
  const row = parsed.shot.row;
  const col = parsed.shot.col;
  const coordinateKey = keyFor(row, col);

  if (seenCoordinates.has(coordinateKey)) {
    return {
      row,
      col,
      result: "invalid_coordinate",
      reasoningText,
      event: { kind: "invalid_coordinate" },
      legalShot: null,
    };
  }

  const ship = findShipAt(layout, row, col);
  if (ship === undefined) {
    return {
      row,
      col,
      result: "miss",
      reasoningText,
      event: { kind: "miss" },
      legalShot: { row, col, result: "miss" },
    };
  }

  const hitKeys = new Set(
    legalPriorShots
      .filter((shot) => shot.result === "hit" || shot.result === "sunk")
      .map((shot) => keyFor(shot.row, shot.col)),
  );
  const sinksShip = ship.cells.every((cell) => {
    const cellKey = keyFor(cell.row, cell.col);
    return cellKey === coordinateKey || hitKeys.has(cellKey);
  });
  const result = sinksShip ? "sunk" : "hit";

  return {
    row,
    col,
    result,
    reasoningText,
    event: { kind: result },
    legalShot: { row, col, result },
  };
}

export async function runEngine(
  runId: string,
  input: StartRunInput,
  signal: AbortSignal,
  emit: (event: SseEvent) => Awaitable<void>,
  deps: RunEngineDeps,
): Promise<Outcome | null> {
  const now = deps.now ?? Date.now;
  const turnTimeoutMs = deps.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS;
  const startedAt = now();
  const layout = generateBoard(input.seedDate);
  const model = deps.provider.models.find((candidate) => candidate.id === input.modelId);

  if (model === undefined) {
    throw new Error(`Unknown model for provider ${deps.provider.id}: ${input.modelId}`);
  }

  const budgetUsdMicros = budgetUsdToMicros(input.budgetUsd);
  deps.queries.insertRun({
    id: runId,
    seedDate: input.seedDate,
    providerId: input.providerId,
    modelId: input.modelId,
    displayName: model.displayName,
    reasoningEnabled: input.reasoningEnabled,
    startedAt,
    clientSession: input.clientSession,
    budgetUsdMicros,
  });

  await emit({
    kind: "open",
    id: 0,
    runId,
    startedAt,
    seedDate: input.seedDate,
  });

  let state: RunLoopState = initialRunLoopState();
  const totals: AggregateTotals = {
    tokensIn: 0,
    tokensOut: 0,
    reasoningTokens: null,
  };
  const legalPriorShots: LegalPriorShot[] = [];
  const seenCoordinates = new Set<string>();
  let shotIndex = 0;

  const finalize = async (outcome: Outcome, endedAt: number): Promise<Outcome> => {
    deps.queries.finalizeRun({
      id: runId,
      endedAt,
      outcome,
      shotsFired: state.shotsFired,
      hits: state.hits,
      schemaErrors: state.schemaErrors,
      invalidCoordinates: state.invalidCoordinates,
      durationMs: endedAt - startedAt,
      tokensIn: totals.tokensIn,
      tokensOut: totals.tokensOut,
      reasoningTokens: totals.reasoningTokens,
      costUsdMicros: state.accumulatedCostMicros,
    });

    await emit({
      kind: "outcome",
      id: 0,
      outcome,
      shotsFired: state.shotsFired,
      hits: state.hits,
      schemaErrors: state.schemaErrors,
      invalidCoordinates: state.invalidCoordinates,
      endedAt,
    });

    return outcome;
  };

  while (true) {
    const boardText = renderBoardText(buildBoardView(layout, legalPriorShots));
    const turnStartedAt = now();

    try {
      const providerOutput = await withTurnTimeout(
        deps.provider.id,
        turnTimeoutMs,
        signal,
        (turnSignal) =>
          deps.provider.call(
            {
              modelId: input.modelId,
              apiKey: input.apiKey,
              reasoningEnabled: input.reasoningEnabled,
              boardText,
              shipsRemaining: shipsRemaining(layout, legalPriorShots),
              systemPrompt: SYSTEM_PROMPT,
              ...(input.mockCostUsd === undefined ? {} : { mockCostUsd: input.mockCostUsd }),
              priorShots: legalPriorShots,
              consecutiveSchemaErrors: state.consecutiveSchemaErrors,
              seedDate: input.seedDate,
            },
            turnSignal,
          ),
      );

      totals.tokensIn += providerOutput.tokensIn;
      totals.tokensOut += providerOutput.tokensOut;
      totals.reasoningTokens = addReasoningTokens(
        totals.reasoningTokens,
        providerOutput.reasoningTokens,
      );
      const classified = classifyShot(
        layout,
        legalPriorShots,
        seenCoordinates,
        providerOutput.rawText,
      );
      const createdAt = now();
      deps.queries.appendShot({
        runId,
        idx: shotIndex,
        row: classified.row,
        col: classified.col,
        result: classified.result,
        rawResponse: truncateText(providerOutput.rawText, RAW_RESPONSE_LIMIT),
        reasoningText:
          classified.reasoningText === null
            ? null
            : truncateText(classified.reasoningText, REASONING_TEXT_LIMIT),
        llmError: null,
        tokensIn: providerOutput.tokensIn,
        tokensOut: providerOutput.tokensOut,
        reasoningTokens: providerOutput.reasoningTokens,
        costUsdMicros: providerOutput.costUsdMicros,
        durationMs: providerOutput.durationMs,
        createdAt,
      });

      await emit({
        kind: "shot",
        id: 0,
        idx: shotIndex,
        row: classified.row,
        col: classified.col,
        result: classified.result,
        reasoning:
          classified.reasoningText === null
            ? null
            : truncateText(classified.reasoningText, REASONING_TEXT_LIMIT),
        tokensIn: providerOutput.tokensIn,
        tokensOut: providerOutput.tokensOut,
        reasoningTokens: providerOutput.reasoningTokens,
        costUsdMicros: providerOutput.costUsdMicros,
        durationMs: providerOutput.durationMs,
        createdAt,
      });

      shotIndex += 1;

      if (classified.row !== null && classified.col !== null) {
        seenCoordinates.add(keyFor(classified.row, classified.col));
      }

      if (classified.legalShot !== null) {
        legalPriorShots.push(classified.legalShot);
      }

      const reduced = reduceOutcome(
        state,
        { ...classified.event, costUsdMicros: providerOutput.costUsdMicros },
        { budgetMicros: budgetUsdMicros },
      );
      state = reduced.state;

      const outcome = reduced.outcome;

      if (outcome !== null) {
        return await finalize(outcome, now());
      }
    } catch (error) {
      if (isAbortError(error)) {
        const reason = readAbortReason(signal);
        if (reason === "server_restart") {
          return null;
        }

        state = reduceOutcome(state, { kind: "abort", reason }).state;
        return await finalize("aborted_viewer", now());
      }

      if (isProviderError(error)) {
        if (error.kind === "unreachable") {
          return await finalize("llm_unreachable", now());
        }

        const createdAt = now();
        const llmError = serializeProviderError(error);

        const failedResult = error.code === "timeout" ? "timeout" : "schema_error";

        deps.queries.appendShot({
          runId,
          idx: shotIndex,
          row: null,
          col: null,
          result: failedResult,
          rawResponse: "",
          reasoningText: null,
          llmError,
          tokensIn: 0,
          tokensOut: 0,
          reasoningTokens: null,
          costUsdMicros: 0,
          durationMs: createdAt - turnStartedAt,
          createdAt,
        });

        await emit({
          kind: "shot",
          id: 0,
          idx: shotIndex,
          row: null,
          col: null,
          result: failedResult,
          reasoning: null,
          tokensIn: 0,
          tokensOut: 0,
          reasoningTokens: null,
          costUsdMicros: 0,
          durationMs: createdAt - turnStartedAt,
          createdAt,
        });

        shotIndex += 1;

        const reduced = reduceOutcome(
          state,
          { kind: failedResult, costUsdMicros: 0 },
          { budgetMicros: budgetUsdMicros },
        );
        state = reduced.state;

        if (reduced.outcome !== null) {
          return await finalize(reduced.outcome, now());
        }

        continue;
      }

      if (isNonRetriable4xx(error)) {
        return await finalize("llm_unreachable", now());
      }

      throw error;
    }
  }
}
