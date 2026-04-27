import { describe, expect, test } from "bun:test";

import type { RunMeta, RunShotRow } from "@battleship-arena/shared";

import {
  appendShot,
  mergeOutcome,
  pageStateLabel,
  shotFromSseEvent,
  terminalErrorSummary,
} from "../../src/islands/liveRunState.ts";

function shot(overrides: Partial<RunShotRow>): RunShotRow {
  return {
    runId: "run-1",
    idx: 0,
    row: 0,
    col: 0,
    result: "miss",
    rawResponse: "",
    reasoningText: null,
    llmError: null,
    tokensIn: 0,
    tokensOut: 0,
    reasoningTokens: null,
    costUsdMicros: 0,
    durationMs: 0,
    createdAt: 100,
    ...overrides,
  };
}

function meta(overrides: Partial<RunMeta> = {}): RunMeta {
  return {
    id: "run-1",
    seedDate: "2026-04-21",
    providerId: "openrouter",
    modelId: "openai/gpt-5.4-nano",
    displayName: "OpenAI: GPT-5.4 Nano",
    reasoningEnabled: true,
    startedAt: 1,
    endedAt: null,
    outcome: null,
    shotsFired: 0,
    hits: 0,
    schemaErrors: 0,
    invalidCoordinates: 0,
    durationMs: 0,
    tokensIn: 0,
    tokensOut: 0,
    reasoningTokens: null,
    costUsdMicros: 0,
    budgetUsdMicros: null,
    terminalErrorCode: null,
    terminalErrorStatus: null,
    terminalErrorMessage: null,
    ...overrides,
  };
}

describe("live run state helpers", () => {
  test("appends shots in order and ignores duplicate indexes", () => {
    expect(appendShot([shot({ idx: 2 })], shot({ idx: 1 })).map((entry) => entry.idx)).toEqual([
      1, 2,
    ]);
    expect(appendShot([shot({ idx: 1, result: "hit" })], shot({ idx: 1, result: "miss" }))).toEqual(
      [shot({ idx: 1, result: "hit" })],
    );
  });

  test("maps SSE shot events to run shot rows", () => {
    expect(
      shotFromSseEvent("run-1", {
        kind: "shot",
        id: 3,
        idx: 2,
        row: 4,
        col: 5,
        result: "hit",
        reasoning: "reason",
      }),
    ).toEqual(
      expect.objectContaining({
        runId: "run-1",
        idx: 2,
        row: 4,
        col: 5,
        result: "hit",
      }),
    );
  });

  test("merges terminal outcomes and formats terminal diagnostics", () => {
    const merged = mergeOutcome(meta(), {
      kind: "outcome",
      id: 4,
      outcome: "provider_rate_limited",
      shotsFired: 3,
      hits: 1,
      schemaErrors: 0,
      invalidCoordinates: 0,
      endedAt: 200,
    });

    expect(merged).toEqual(
      expect.objectContaining({
        outcome: "provider_rate_limited",
        endedAt: 200,
        shotsFired: 3,
      }),
    );
    expect(
      terminalErrorSummary(
        meta({
          terminalErrorCode: "rate_limited",
          terminalErrorStatus: 429,
          terminalErrorMessage: "Key limit exceeded",
        }),
      ),
    ).toBe("HTTP 429 rate_limited: Key limit exceeded");
    expect(terminalErrorSummary(meta())).toBeNull();
  });

  test("labels phases for document titles", () => {
    expect(pageStateLabel("live")).toBe("In progress");
    expect(pageStateLabel("terminal")).toBe("Finished");
    expect(pageStateLabel("notFound")).toBe("Run not found");
  });
});
