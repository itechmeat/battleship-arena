import { describe, expect, test } from "bun:test";

import type { BoardLayout } from "../../src/board/generator.ts";
import {
  boardCoordinateKey,
  buildBoardView,
  findShipAt,
  shipsRemaining,
} from "../../src/runs/board-analysis.ts";

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
    {
      name: "submarine",
      length: 3,
      orientation: "vertical",
      cells: [
        { row: 2, col: 2 },
        { row: 3, col: 2 },
        { row: 4, col: 2 },
      ],
    },
  ],
};

describe("run board analysis", () => {
  test("creates stable coordinate keys and finds ships by cell", () => {
    expect(boardCoordinateKey(3, 4)).toBe("3:4");
    expect(findShipAt(layout, 0, 1)?.name).toBe("destroyer");
    expect(findShipAt(layout, 9, 9)).toBeUndefined();
  });

  test("builds board view with misses, hits, and sunk cells", () => {
    const view = buildBoardView(layout, [
      { row: 5, col: 5, result: "miss" },
      { row: 0, col: 0, result: "hit" },
      { row: 0, col: 1, result: "sunk" },
    ]);

    expect(view.size).toBe(10);
    expect(view.cells[5 * 10 + 5]).toBe("miss");
    expect(view.cells[0]).toBe("sunk");
    expect(view.cells[1]).toBe("sunk");
    expect(view.cells[2 * 10 + 2]).toBe("unknown");
  });

  test("lists only ships that still have unhit cells", () => {
    expect(
      shipsRemaining(layout, [
        { row: 0, col: 0, result: "hit" },
        { row: 0, col: 1, result: "sunk" },
      ]),
    ).toEqual(["submarine"]);
  });
});
