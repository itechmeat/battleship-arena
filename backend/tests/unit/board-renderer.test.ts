import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import type { BoardView, CellState } from "@battleship-arena/shared";

import { renderBoardPng } from "../../src/board/renderer.ts";

const FIXTURES_DIR = join(import.meta.dir, "..", "fixtures", "board-png");

function boardView(cells: CellState[]): BoardView {
  if (cells.length !== 100) {
    throw new Error(`Expected 100 cells, received ${cells.length}`);
  }

  return { size: 10, cells };
}

describe("renderBoardPng", () => {
  test("emits the PNG signature", () => {
    const png = renderBoardPng(boardView(Array.from({ length: 100 }, () => "unknown")));

    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
  });

  test("renders byte-identically for identical input", () => {
    const view = boardView(Array.from({ length: 100 }, () => "unknown"));
    const first = renderBoardPng(view);
    const second = renderBoardPng(view);

    expect(first.length).toBe(second.length);
    expect(Array.from(first)).toEqual(Array.from(second));
  });

  test("matches the all-unknown fixture", () => {
    const fixturePath = join(FIXTURES_DIR, "all-unknown.png");
    if (!existsSync(fixturePath)) {
      throw new Error(`Fixture missing: ${fixturePath}`);
    }

    const actual = renderBoardPng(boardView(Array.from({ length: 100 }, () => "unknown")));
    const expected = readFileSync(fixturePath);
    expect(Array.from(actual)).toEqual(Array.from(expected));
  });
});
