import { describe, expect, test } from "bun:test";

import type { BoardLayout } from "../../src/board/generator.ts";
import { boardCoordinateKey } from "../../src/runs/board-analysis.ts";
import { classifyShot } from "../../src/runs/shot-classifier.ts";

const layout: BoardLayout = {
  seedDate: "test-seed",
  ships: [
    {
      name: "destroyer",
      length: 2,
      orientation: "horizontal",
      cells: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ],
    },
  ],
};

function shot(row: number, col: number, reasoning = "r") {
  return JSON.stringify({ row, col, reasoning });
}

describe("run shot classifier", () => {
  test("classifies misses and preserves legal miss shots", () => {
    expect(classifyShot(layout, [], new Set(), shot(5, 5))).toEqual(
      expect.objectContaining({
        row: 5,
        col: 5,
        result: "miss",
        reasoningText: "r",
        event: { kind: "miss" },
        legalShot: { row: 5, col: 5, result: "miss" },
      }),
    );
  });

  test("classifies hits and sunk shots", () => {
    expect(classifyShot(layout, [], new Set(), shot(0, 0))).toEqual(
      expect.objectContaining({
        result: "hit",
        event: { kind: "hit" },
        legalShot: { row: 0, col: 0, result: "hit" },
      }),
    );

    expect(
      classifyShot(
        layout,
        [{ row: 0, col: 0, result: "hit" }],
        new Set([boardCoordinateKey(0, 0)]),
        shot(0, 1),
      ),
    ).toEqual(
      expect.objectContaining({
        result: "sunk",
        event: { kind: "sunk" },
        legalShot: { row: 0, col: 1, result: "sunk" },
      }),
    );
  });

  test("rejects duplicate legal coordinates as invalid coordinates", () => {
    expect(classifyShot(layout, [], new Set([boardCoordinateKey(0, 0)]), shot(0, 0))).toEqual(
      expect.objectContaining({
        row: 0,
        col: 0,
        result: "invalid_coordinate",
        legalShot: null,
      }),
    );
  });

  test("classifies malformed and out-of-bounds provider output", () => {
    expect(classifyShot(layout, [], new Set(), "not json")).toEqual(
      expect.objectContaining({
        row: null,
        col: null,
        result: "schema_error",
        event: { kind: "schema_error" },
      }),
    );

    expect(classifyShot(layout, [], new Set(), shot(10, 0))).toEqual(
      expect.objectContaining({
        row: null,
        col: null,
        result: "invalid_coordinate",
        event: { kind: "invalid_coordinate" },
      }),
    );
  });
});
