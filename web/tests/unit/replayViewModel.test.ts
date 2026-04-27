import { describe, expect, test } from "bun:test";

import type { RunMeta } from "@battleship-arena/shared";

import { createInitialReplayState, replayReducer } from "../../src/islands/replayReducer.ts";
import {
  nextReplaySpeed,
  replayErrorMessage,
  replayProgressPercent,
  replayRun,
  replayShots,
} from "../../src/islands/replayViewModel.ts";

const run: RunMeta = {
  id: "run-1",
  seedDate: "2026-04-21",
  providerId: "openrouter",
  modelId: "openai/gpt-5.4-nano",
  displayName: "OpenAI: GPT-5.4 Nano",
  reasoningEnabled: true,
  startedAt: 1,
  endedAt: 2,
  outcome: "won",
  shotsFired: 0,
  hits: 0,
  schemaErrors: 0,
  invalidCoordinates: 0,
  durationMs: 1,
  tokensIn: 0,
  tokensOut: 0,
  reasoningTokens: null,
  costUsdMicros: 0,
  budgetUsdMicros: null,
  terminalErrorCode: null,
  terminalErrorStatus: null,
  terminalErrorMessage: null,
};

describe("replay view-model helpers", () => {
  test("selects loaded replay data and error messages", () => {
    const loaded = replayReducer(createInitialReplayState(), {
      kind: "loaded",
      run,
      shots: [],
    });
    expect(replayRun(loaded)).toBe(run);
    expect(replayShots(loaded)).toEqual([]);
    expect(replayErrorMessage(loaded)).toBeNull();

    const failed = replayReducer(createInitialReplayState(), {
      kind: "loadFailed",
      message: "Could not load replay.",
    });
    expect(replayRun(failed)).toBeNull();
    expect(replayErrorMessage(failed)).toBe("Could not load replay.");
  });

  test("cycles speed and computes progress", () => {
    expect(nextReplaySpeed(1)).toBe(2);
    expect(nextReplaySpeed(2)).toBe(4);
    expect(nextReplaySpeed(4)).toBe(1);
    expect(replayProgressPercent(0, 0)).toBe(0);
    expect(replayProgressPercent(2, 4)).toBe(50);
  });
});
