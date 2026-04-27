import { describe, expect, test } from "bun:test";

import {
  addProviderOutputTotals,
  budgetUsdToMicros,
  buildFinalizeRunArgs,
  createAggregateTotals,
  truncateText,
} from "../../src/runs/run-totals.ts";
import type { RunLoopState } from "../../src/runs/outcome.ts";

describe("run totals helpers", () => {
  test("converts budgets, truncates text, and accumulates provider totals", () => {
    expect(budgetUsdToMicros(undefined)).toBeNull();
    expect(budgetUsdToMicros(0.29)).toBe(290000);
    expect(budgetUsdToMicros(0.1234567)).toBe(123456);
    expect(truncateText("abcdef", 3)).toBe("abc");
    expect(truncateText(`a${"\u{1F642}"}b`, 2)).toBe("a");
    expect(truncateText(`a${"\u{1F642}"}b`, 5)).toBe(`a${"\u{1F642}"}`);

    const totals = createAggregateTotals();
    addProviderOutputTotals(totals, {
      rawText: "{}",
      tokensIn: 10,
      tokensOut: 5,
      reasoningTokens: null,
      costUsdMicros: 100,
      durationMs: 20,
    });
    addProviderOutputTotals(totals, {
      rawText: "{}",
      tokensIn: 2,
      tokensOut: 3,
      reasoningTokens: 4,
      costUsdMicros: 50,
      durationMs: 10,
    });

    expect(totals).toEqual({ tokensIn: 12, tokensOut: 8, reasoningTokens: 4 });
  });

  test("builds finalize run arguments from state and totals", () => {
    const state: RunLoopState = {
      shotsFired: 7,
      hits: 3,
      schemaErrors: 1,
      invalidCoordinates: 2,
      consecutiveSchemaErrors: 0,
      accumulatedCostMicros: 99,
    };

    expect(
      buildFinalizeRunArgs({
        runId: "run-1",
        startedAt: 1000,
        endedAt: 1250,
        outcome: "won",
        state,
        totals: { tokensIn: 10, tokensOut: 20, reasoningTokens: null },
        terminalError: {
          terminalErrorCode: "quota",
          terminalErrorStatus: 403,
          terminalErrorMessage: "limit",
        },
      }),
    ).toEqual({
      id: "run-1",
      endedAt: 1250,
      outcome: "won",
      shotsFired: 7,
      hits: 3,
      schemaErrors: 1,
      invalidCoordinates: 2,
      durationMs: 250,
      tokensIn: 10,
      tokensOut: 20,
      reasoningTokens: null,
      costUsdMicros: 99,
      terminalErrorCode: "quota",
      terminalErrorStatus: 403,
      terminalErrorMessage: "limit",
    });
  });
});
