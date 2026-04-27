import { describe, expect, test } from "bun:test";

import type { BoardView, CellState, RunMeta, RunShotRow, StartRunInput } from "../src/types.ts";

describe("S2a shared types", () => {
  test("BoardView has size 10 and 100 cells", () => {
    const view: BoardView = {
      size: 10,
      cells: Array.from({ length: 100 }, () => "unknown"),
    };
    expect(view.size).toBe(10);
    expect(view.cells.length).toBe(100);
  });

  test("CellState union includes the four board states", () => {
    const states: CellState[] = ["unknown", "miss", "hit", "sunk"];
    expect(states.length).toBe(4);
  });

  test("RunMeta and RunShotRow can be constructed", () => {
    const meta: RunMeta = {
      id: "01",
      seedDate: "2026-04-21",
      providerId: "mock",
      modelId: "mock-happy",
      displayName: "Mock happy",
      reasoningEnabled: false,
      startedAt: 0,
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
    };
    const row: RunShotRow = {
      runId: "01",
      idx: 0,
      row: 1,
      col: 2,
      result: "miss",
      rawResponse: "{}",
      reasoningText: null,
      llmError: null,
      tokensIn: 0,
      tokensOut: 0,
      reasoningTokens: null,
      costUsdMicros: 0,
      durationMs: 0,
      createdAt: 0,
    };

    expect(meta.id).toBe("01");
    expect(row.result).toBe("miss");
  });

  test("StartRunInput carries apiKey and seedDate", () => {
    const input: StartRunInput = {
      providerId: "mock",
      modelId: "mock-happy",
      apiKey: "k",
      reasoningEnabled: false,
      clientSession: "session-1",
      seedDate: "2026-04-21",
    };

    expect(input.apiKey).toBe("k");
    expect(input.seedDate).toBe("2026-04-21");
  });
});
