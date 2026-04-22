import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { renderBoardSvg } from "../src/board-svg.ts";
import type { BoardView, CellState } from "../src/types.ts";

const FIXTURES_DIR = join(import.meta.dir, "fixtures", "board-svg");

function boardView(cells: CellState[]): BoardView {
  if (cells.length !== 100) {
    throw new Error(`Expected 100 cells, received ${cells.length}`);
  }

  return { size: 10, cells };
}

describe("renderBoardSvg", () => {
  test("omits text nodes", () => {
    const svg = renderBoardSvg(boardView(Array.from({ length: 100 }, () => "unknown")));
    expect(svg.includes("<text")).toBe(false);
  });

  test("renders deterministically for identical input", () => {
    const view = boardView(Array.from({ length: 100 }, () => "unknown"));
    expect(renderBoardSvg(view)).toBe(renderBoardSvg(view));
  });

  test("places cells in row-major order", () => {
    const cells: CellState[] = Array.from({ length: 100 }, () => "unknown");
    cells[0] = "hit";
    cells[99] = "miss";

    const svg = renderBoardSvg(boardView(cells));
    expect(svg.indexOf('data-cell="0-0"')).toBeGreaterThan(-1);
    expect(svg.indexOf('data-cell="9-9"')).toBeGreaterThan(svg.indexOf('data-cell="0-0"'));
  });

  test("matches the mixed-board fixture", () => {
    const cells: CellState[] = Array.from({ length: 100 }, () => "unknown");
    cells[0] = "hit";
    cells[11] = "miss";
    cells[22] = "sunk";
    cells[44] = "sunk";
    cells[55] = "hit";

    const fixturePath = join(FIXTURES_DIR, "mixed.svg");
    if (!existsSync(fixturePath)) {
      throw new Error(`Fixture missing: ${fixturePath}`);
    }

    expect(renderBoardSvg(boardView(cells))).toBe(readFileSync(fixturePath, "utf8").trimEnd());
  });
});
