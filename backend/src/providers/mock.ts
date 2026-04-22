import { MOCK_TURN_DELAY_MS_DEFAULT } from "@battleship-arena/shared";

import { generateBoard } from "../board/generator.ts";

import type { ProviderAdapter, ProviderCallInput, ProviderModel } from "./types.ts";

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

export function createMockProvider(options: { delayMs?: number } = {}): ProviderAdapter {
  const delayMs = options.delayMs ?? MOCK_TURN_DELAY_MS_DEFAULT;

  return {
    id: "mock",
    models: MODELS,
    async call(input, signal) {
      const startedAt = Date.now();
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
          throw new Error(`Unknown mock model: ${input.modelId}`);
      }

      return {
        rawText,
        tokensIn: 0,
        tokensOut: 0,
        reasoningTokens: null,
        costUsdMicros: 0,
        durationMs: Date.now() - startedAt,
      };
    },
  };
}
