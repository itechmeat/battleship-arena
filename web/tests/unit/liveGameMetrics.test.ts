import type { RunShotRow } from "@battleship-arena/shared";
import { describe, expect, test } from "bun:test";

import { deriveMetrics, formatDurationMs } from "../../src/islands/liveGameMetrics.ts";
import { formatUsd, formatUsdMicros } from "../../src/lib/format.ts";

function shot(
  idx: number,
  result: RunShotRow["result"],
  usage: Partial<
    Pick<RunShotRow, "tokensIn" | "tokensOut" | "reasoningTokens" | "costUsdMicros">
  > = {},
): RunShotRow {
  return {
    runId: "run-1",
    idx,
    row: null,
    col: null,
    result,
    rawResponse: "",
    reasoningText: null,
    llmError: null,
    tokensIn: usage.tokensIn ?? 0,
    tokensOut: usage.tokensOut ?? 0,
    reasoningTokens: usage.reasoningTokens ?? null,
    costUsdMicros: usage.costUsdMicros ?? 0,
    durationMs: 0,
    createdAt: 0,
  };
}

describe("deriveMetrics", () => {
  test("reports timeout errors separately from schema errors", () => {
    expect(
      deriveMetrics([
        shot(0, "schema_error"),
        shot(1, "timeout"),
        shot(2, "hit"),
        shot(3, "sunk", {
          tokensIn: 100,
          tokensOut: 80,
          reasoningTokens: 70,
          costUsdMicros: 123,
        }),
        shot(4, "invalid_coordinate"),
        shot(5, "miss", {
          tokensIn: 50,
          tokensOut: 20,
          reasoningTokens: null,
          costUsdMicros: 77,
        }),
      ]),
    ).toEqual({
      shotsFired: 6,
      hits: 2,
      schemaErrors: 1,
      timeoutErrors: 1,
      invalidCoordinates: 1,
      tokensIn: 150,
      tokensOut: 100,
      reasoningTokens: 70,
      costUsdMicros: 200,
    });
  });
});

describe("formatDurationMs", () => {
  test("formats elapsed durations", () => {
    expect(formatDurationMs(0)).toBe("0:00");
    expect(formatDurationMs(65_400)).toBe("1:05");
    expect(formatDurationMs(3_661_000)).toBe("1:01:01");
  });
});

describe("formatUsdMicros", () => {
  test("formats USD micros with readable thousandth precision", () => {
    expect(formatUsd(0.0004)).toBe("<$0.001");
    expect(formatUsd(0.1254)).toBe("$0.125");
    expect(formatUsdMicros(0)).toBe("$0");
    expect(formatUsdMicros(123)).toBe("<$0.001");
    expect(formatUsdMicros(1_250_000)).toBe("$1.250");
  });
});
