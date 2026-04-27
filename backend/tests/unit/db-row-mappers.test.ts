import { describe, expect, test } from "bun:test";

import {
  mapRunMetaRow,
  mapRunShotRow,
  readOutcome,
  readShotResult,
} from "../../src/db/row-mappers.ts";

describe("database row mappers", () => {
  test("maps run metadata rows including terminal error fields", () => {
    expect(
      mapRunMetaRow({
        id: "run-1",
        seedDate: "2026-04-21",
        providerId: "openrouter",
        modelId: "deepseek/test",
        displayName: "DeepSeek Test",
        reasoningEnabled: true,
        startedAt: 1,
        endedAt: 10,
        outcome: "llm_unreachable",
        shotsFired: 0,
        hits: 0,
        schemaErrors: 0,
        invalidCoordinates: 0,
        durationMs: 9,
        tokensIn: 0,
        tokensOut: 0,
        reasoningTokens: null,
        costUsdMicros: 0,
        budgetUsdMicros: null,
        terminalErrorCode: "quota",
        terminalErrorStatus: 403,
        terminalErrorMessage: "limit",
      }),
    ).toEqual(
      expect.objectContaining({
        id: "run-1",
        outcome: "llm_unreachable",
        terminalErrorCode: "quota",
        terminalErrorStatus: 403,
        terminalErrorMessage: "limit",
      }),
    );
  });

  test("maps shot rows and validates enum values", () => {
    expect(readOutcome(null)).toBeNull();
    expect(() => readOutcome("unexpected")).toThrow("Unexpected outcome value");
    expect(readShotResult("hit")).toBe("hit");
    expect(() => readShotResult("bad")).toThrow("Unexpected shot result value");

    expect(
      mapRunShotRow({
        runId: "run-1",
        idx: 0,
        row: 1,
        col: 2,
        result: "hit",
        rawResponse: "{}",
        reasoningText: "r",
        llmError: null,
        tokensIn: 1,
        tokensOut: 2,
        reasoningTokens: null,
        costUsdMicros: 3,
        durationMs: 4,
        createdAt: 5,
      }),
    ).toEqual({
      runId: "run-1",
      idx: 0,
      row: 1,
      col: 2,
      result: "hit",
      rawResponse: "{}",
      reasoningText: "r",
      llmError: null,
      tokensIn: 1,
      tokensOut: 2,
      reasoningTokens: null,
      costUsdMicros: 3,
      durationMs: 4,
      createdAt: 5,
    });
  });
});
