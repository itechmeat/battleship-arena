import { describe, expect, test } from "bun:test";

import type { RunMeta, RunShotRow } from "@battleship-arena/shared";

import {
  createInitialReplayState,
  replayReducer,
  replayTickMs,
  type ReplayAction,
  type ReplayState,
} from "../../src/islands/replayReducer.ts";

const run: RunMeta = {
  id: "run-1",
  seedDate: "2026-04-24",
  providerId: "openrouter",
  modelId: "openai/gpt-5-nano",
  displayName: "OpenAI: GPT-5 Nano",
  startedAt: 1,
  endedAt: 2,
  outcome: "won",
  shotsFired: 2,
  hits: 17,
  schemaErrors: 0,
  invalidCoordinates: 0,
  durationMs: 1,
  tokensIn: 0,
  tokensOut: 0,
  reasoningTokens: null,
  costUsdMicros: 0,
  budgetUsdMicros: null,
};

function shot(idx: number): RunShotRow {
  return {
    runId: "run-1",
    idx,
    row: idx,
    col: idx,
    result: "miss",
    rawResponse: "{}",
    reasoningText: null,
    llmError: null,
    tokensIn: 0,
    tokensOut: 0,
    reasoningTokens: null,
    costUsdMicros: 0,
    durationMs: 1,
    createdAt: idx,
  };
}

type LoadedReplayState = ReplayState & {
  status: "idle" | "playing" | "done";
  run: RunMeta;
  shots: readonly RunShotRow[];
};

function loadedState(overrides: Partial<LoadedReplayState> = {}): ReplayState {
  const base: LoadedReplayState = {
    status: "idle",
    idx: 0,
    speed: 1,
    run,
    shots: [shot(0), shot(1), shot(2)],
  };

  return {
    ...base,
    ...overrides,
  };
}

describe("replayReducer", () => {
  test("starts loading and transitions to idle once data loads", () => {
    const initial = createInitialReplayState();
    const loaded = replayReducer(initial, {
      kind: "loaded",
      run,
      shots: [shot(0), shot(1)],
    });

    expect(initial).toEqual({ status: "loading", idx: 0, speed: 1 });
    expect(loaded).toEqual({
      status: "idle",
      idx: 0,
      speed: 1,
      run,
      shots: [shot(0), shot(1)],
    });
  });

  test("tick advances while playing and flips to done at the end", () => {
    let state = replayReducer(loadedState(), { kind: "play" });

    state = replayReducer(state, { kind: "tick" });
    expect(state).toMatchObject({ status: "playing", idx: 1 });

    state = replayReducer(state, { kind: "tick" });
    state = replayReducer(state, { kind: "tick" });
    expect(state).toMatchObject({ status: "done", idx: 3 });
    expect(replayReducer(state, { kind: "tick" })).toBe(state);
  });

  test("seek clamps to the available shot range and preserves status", () => {
    const state = loadedState({ status: "playing", idx: 1, speed: 2 });

    expect(replayReducer(state, { kind: "seek", idx: -1 })).toMatchObject({
      status: "playing",
      idx: 0,
      speed: 2,
    });
    expect(replayReducer(state, { kind: "seek", idx: 99 })).toMatchObject({
      status: "playing",
      idx: 3,
      speed: 2,
    });
    expect(replayReducer(state, { kind: "seek", idx: 2 })).toMatchObject({
      status: "playing",
      idx: 2,
      speed: 2,
    });
  });

  test("play from done rewinds and speed actions preserve playback state", () => {
    let state = loadedState({ status: "done", idx: 3, speed: 2 });

    state = replayReducer(state, { kind: "play" });
    expect(state).toMatchObject({ status: "playing", idx: 0, speed: 2 });

    state = replayReducer(state, { kind: "speed", speed: 4 });
    expect(state).toMatchObject({ status: "playing", idx: 0, speed: 4 });
    expect(replayTickMs(state.speed)).toBe(200);
    expect(replayTickMs(1)).toBe(800);
    expect(replayTickMs(2)).toBe(400);
  });

  test("step actions clamp without changing status", () => {
    const start = loadedState({ idx: 0 });
    const end = loadedState({ idx: 3 });
    const action: ReplayAction = { kind: "stepForward" };

    expect(replayReducer(start, { kind: "stepBack" })).toBe(start);
    expect(replayReducer(end, action)).toBe(end);
    expect(replayReducer(loadedState({ idx: 1 }), action)).toMatchObject({ idx: 2 });
  });

  test("load failure enters error state", () => {
    expect(
      replayReducer(createInitialReplayState(), { kind: "loadFailed", message: "Nope" }),
    ).toEqual({
      status: "error",
      idx: 0,
      speed: 1,
      message: "Nope",
    });
  });
});
