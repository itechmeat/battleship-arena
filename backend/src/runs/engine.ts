import { type Outcome, type SseEvent, type StartRunInput } from "@battleship-arena/shared";

import { generateBoard } from "../board/generator.ts";
import { renderBoardText } from "../board/text-renderer.ts";
// PNG renderer kept for the vision-based track. Disabled in this build; see
// providers/openai-compatible.ts for the corresponding image_url message branch.
// import { renderBoardPng } from "../board/renderer.ts";
import type { Queries } from "../db/queries.ts";
import { ProviderError } from "../providers/errors.ts";
import type { ProviderAdapter } from "../providers/types.ts";

import {
  boardCoordinateKey,
  buildBoardView,
  shipsRemaining,
  type LegalPriorShot,
} from "./board-analysis.ts";
import {
  abortError,
  isAbortError,
  isNonRetriable4xx,
  isProviderError,
  isProviderRateLimit,
  readAbortReason,
  serializeProviderError,
  terminalErrorFromProvider,
} from "./error-handling.ts";
import { initialRunLoopState, reduceOutcome, type RunLoopState } from "./outcome.ts";
import { SYSTEM_PROMPT } from "./prompt.ts";
import {
  buildFinalizeRunArgs,
  budgetUsdToMicros,
  createAggregateTotals,
  addProviderOutputTotals,
  RAW_RESPONSE_LIMIT,
  REASONING_TEXT_LIMIT,
  truncateText,
  type TerminalErrorFields,
} from "./run-totals.ts";
import { classifyShot } from "./shot-classifier.ts";

const DEFAULT_TURN_TIMEOUT_MS = 60_000;

type Awaitable<T> = T | Promise<T>;

export interface RunEngineDeps {
  queries: Queries;
  provider: ProviderAdapter;
  now?: () => number;
  turnTimeoutMs?: number;
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
  const totals = createAggregateTotals();
  const legalPriorShots: LegalPriorShot[] = [];
  const seenCoordinates = new Set<string>();
  let shotIndex = 0;

  const finalize = async (
    outcome: Outcome,
    endedAt: number,
    terminalError?: TerminalErrorFields,
  ): Promise<Outcome> => {
    deps.queries.finalizeRun(
      buildFinalizeRunArgs({
        runId,
        startedAt,
        endedAt,
        outcome,
        state,
        totals,
        ...(terminalError === undefined ? {} : { terminalError }),
      }),
    );

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

      addProviderOutputTotals(totals, providerOutput);
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
        seenCoordinates.add(boardCoordinateKey(classified.row, classified.col));
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
        if (isProviderRateLimit(error)) {
          return await finalize("provider_rate_limited", now(), terminalErrorFromProvider(error));
        }

        if (error.kind === "unreachable") {
          return await finalize("llm_unreachable", now(), terminalErrorFromProvider(error));
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
