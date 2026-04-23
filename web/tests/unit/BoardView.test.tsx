import { describe, expect, test } from "bun:test";

import { COLUMN_LABELS, ROW_LABELS } from "../../src/islands/boardCoordinates.ts";

describe("BoardCoordinates", () => {
  test("defines standard Battleship coordinates", () => {
    expect(COLUMN_LABELS).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]);
    expect(ROW_LABELS).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
  });
});
