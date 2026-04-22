import { describe, expect, test } from "bun:test";

import type { RunShotRow } from "@battleship-arena/shared";

import { boardViewFromShots } from "../../src/islands/boardViewFromShots.ts";

function shot(overrides: Partial<RunShotRow>): RunShotRow {
  return {
    runId: "run-1",
    idx: 0,
    row: 0,
    col: 0,
    result: "miss",
    rawResponse: "{}",
    reasoningText: null,
    tokensIn: 0,
    tokensOut: 0,
    reasoningTokens: null,
    costUsdMicros: 0,
    durationMs: 0,
    createdAt: 0,
    ...overrides,
  };
}

describe("boardViewFromShots", () => {
  test("empty shots produces an all-unknown board", () => {
    const board = boardViewFromShots([]);

    expect(board.size).toBe(10);
    expect(board.cells.every((cell) => cell === "unknown")).toBe(true);
  });

  test("miss and hit land at their row-major positions", () => {
    const board = boardViewFromShots([
      shot({ idx: 0, row: 0, col: 1, result: "miss" }),
      shot({ idx: 1, row: 2, col: 3, result: "hit" }),
    ]);

    expect(board.cells[1]).toBe("miss");
    expect(board.cells[2 * 10 + 3]).toBe("hit");
  });

  test("sunk upgrades contiguous hits along the row", () => {
    const board = boardViewFromShots([
      shot({ idx: 0, row: 4, col: 2, result: "hit" }),
      shot({ idx: 1, row: 4, col: 3, result: "hit" }),
      shot({ idx: 2, row: 4, col: 4, result: "sunk" }),
    ]);

    expect(board.cells[4 * 10 + 2]).toBe("sunk");
    expect(board.cells[4 * 10 + 3]).toBe("sunk");
    expect(board.cells[4 * 10 + 4]).toBe("sunk");
  });

  test("null coordinates are skipped", () => {
    const board = boardViewFromShots([
      shot({ idx: 0, row: null, col: null, result: "schema_error" }),
    ]);

    expect(board.cells.every((cell) => cell === "unknown")).toBe(true);
  });
});
