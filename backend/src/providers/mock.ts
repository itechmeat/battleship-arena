import { MOCK_TURN_DELAY_MS_DEFAULT } from "@battleship-arena/shared";

import { generateBoard } from "../board/generator.ts";

import { ProviderError } from "./errors.ts";
import type {
  ProviderAdapter,
  ProviderCallInput,
  ProviderCallOutput,
  ProviderModel,
} from "./types.ts";

// TODO(2026-05, s3-real-providers): Remove this dev/test-only adapter and MODELS catalog
// once real providers ship. Until then, keep mock registration behind non-production flows
// and exclude it from production-facing provider selection and documentation.

const MODELS: readonly ProviderModel[] = [
  { id: "mock-happy", displayName: "Mock - winning run", hasReasoning: false },
  {
    id: "mock-misses",
    displayName: "Mock - always misses",
    hasReasoning: false,
  },
  {
    id: "mock-schema-errors",
    displayName: "Mock - schema errors",
    hasReasoning: false,
  },
];

function keyFor(row: number, col: number): string {
  return `${row}:${col}`;
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(abortError());
  }

  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function hasPriorShot(
  priorShots: ProviderCallInput["priorShots"],
  row: number,
  col: number,
): boolean {
  return priorShots.some((shot) => shot.row === row && shot.col === col);
}

function nextHappyShot(input: ProviderCallInput): { row: number; col: number } {
  const seen = new Set(input.priorShots.map((shot) => keyFor(shot.row, shot.col)));
  const lastHit = [...input.priorShots].reverse().find((shot) => shot.result === "hit");

  if (lastHit !== undefined) {
    const candidates = [
      { row: lastHit.row - 1, col: lastHit.col },
      { row: lastHit.row + 1, col: lastHit.col },
      { row: lastHit.row, col: lastHit.col - 1 },
      { row: lastHit.row, col: lastHit.col + 1 },
    ];

    for (const candidate of candidates) {
      if (
        candidate.row < 0 ||
        candidate.row > 9 ||
        candidate.col < 0 ||
        candidate.col > 9 ||
        seen.has(keyFor(candidate.row, candidate.col))
      ) {
        continue;
      }

      return candidate;
    }
  }

  for (let row = 0; row < 10; row += 1) {
    for (let col = row % 2; col < 10; col += 2) {
      if (!seen.has(keyFor(row, col))) {
        return { row, col };
      }
    }
  }

  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 10; col += 1) {
      if (!seen.has(keyFor(row, col))) {
        return { row, col };
      }
    }
  }

  return { row: 0, col: 0 };
}

function nextMissShot(input: ProviderCallInput): { row: number; col: number } {
  const shipCells = new Set(
    generateBoard(input.seedDate).ships.flatMap((ship) =>
      ship.cells.map((cell) => keyFor(cell.row, cell.col)),
    ),
  );

  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 10; col += 1) {
      if (shipCells.has(keyFor(row, col)) || hasPriorShot(input.priorShots, row, col)) {
        continue;
      }

      return { row, col };
    }
  }

  const firstShot = input.priorShots[0];
  if (firstShot !== undefined) {
    return { row: firstShot.row, col: firstShot.col };
  }

  return { row: 0, col: 0 };
}

export interface MockProviderTestHooks {
  costUsdMicros?: number;
  tokensIn?: number;
  tokensOut?: number;
  reasoningTokens?: number | null;
  failure?: "transient" | "unreachable" | null;
  beforeCall?: (input: ProviderCallInput) => void | Promise<void>;
  afterCall?: (output: ProviderCallOutput, input: ProviderCallInput) => void | Promise<void>;
}

function testHookFailure(kind: "transient" | "unreachable"): ProviderError {
  if (kind === "transient") {
    return new ProviderError({
      kind,
      code: "provider_5xx",
      providerId: "mock",
      message: "Mock transient provider failure",
      status: 503,
      cause: "mock transient failure",
    });
  }

  return new ProviderError({
    kind,
    code: "auth",
    providerId: "mock",
    message: "Mock unreachable provider failure",
    status: 401,
    cause: "mock unreachable failure",
  });
}

export function createMockProvider(
  options: {
    delayMs?: number;
    costUsdMicros?: number;
    tokensIn?: number;
    tokensOut?: number;
    reasoningTokens?: number | null;
    failure?: Error;
    testHooks?: MockProviderTestHooks;
  } = {},
): ProviderAdapter {
  const delayMs = options.delayMs ?? MOCK_TURN_DELAY_MS_DEFAULT;

  return {
    id: "mock",
    models: MODELS,
    async call(input, signal) {
      const startedAt = Date.now();
      await options.testHooks?.beforeCall?.(input);
      if (options.testHooks?.failure !== undefined && options.testHooks.failure !== null) {
        throw testHookFailure(options.testHooks.failure);
      }
      if (options.failure !== undefined) {
        throw options.failure;
      }

      await sleep(delayMs, signal);

      let rawText: string;
      switch (input.modelId) {
        case "mock-happy": {
          rawText = JSON.stringify(nextHappyShot(input));
          break;
        }
        case "mock-misses": {
          rawText = JSON.stringify(nextMissShot(input));
          break;
        }
        case "mock-schema-errors": {
          rawText = "not json";
          break;
        }
        default:
          throw new ProviderError({
            kind: "unreachable",
            code: "unsupported_model",
            providerId: "mock",
            message: "Mock model is not supported",
            status: 400,
            cause: input.modelId,
          });
      }

      const output: ProviderCallOutput = {
        rawText,
        tokensIn: options.testHooks?.tokensIn ?? options.tokensIn ?? 0,
        tokensOut: options.testHooks?.tokensOut ?? options.tokensOut ?? 0,
        reasoningTokens: options.testHooks?.reasoningTokens ?? options.reasoningTokens ?? null,
        costUsdMicros:
          input.mockCostUsd === undefined
            ? (options.testHooks?.costUsdMicros ?? options.costUsdMicros ?? 0)
            : Math.floor(input.mockCostUsd * 1_000_000),
        durationMs: Date.now() - startedAt,
      };

      await options.testHooks?.afterCall?.(output, input);

      return output;
    },
  };
}
