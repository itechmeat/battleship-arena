import { describe, expect, test } from "bun:test";

import { BOARD_SIZE, FLEET, TOTAL_SHIP_CELLS } from "@battleship-arena/shared";

import { generateBoard } from "../../src/board/generator.ts";

function neighbors(row: number, col: number): ReadonlyArray<readonly [number, number]> {
  const out: Array<readonly [number, number]> = [];

  for (let deltaRow = -1; deltaRow <= 1; deltaRow += 1) {
    for (let deltaCol = -1; deltaCol <= 1; deltaCol += 1) {
      if (deltaRow === 0 && deltaCol === 0) {
        continue;
      }

      out.push([row + deltaRow, col + deltaCol]);
    }
  }

  return out;
}

describe("generateBoard", () => {
  test("returns the same layout for the same seed", () => {
    expect(JSON.stringify(generateBoard("2026-04-21"))).toBe(
      JSON.stringify(generateBoard("2026-04-21")),
    );
  });

  test("matches the shared fleet definition", () => {
    const layout = generateBoard("2026-04-21");

    expect(layout.ships.length).toBe(FLEET.length);
    layout.ships.forEach((ship, index) => {
      const expectedShip = FLEET[index];
      if (expectedShip === undefined) {
        throw new Error(`Missing fleet entry at index ${index}`);
      }

      expect(ship.name).toBe(expectedShip.name);
      expect(ship.length).toBe(expectedShip.length);
      expect(ship.cells.length).toBe(expectedShip.length);
    });
  });

  test("has exactly 17 occupied cells", () => {
    const layout = generateBoard("2026-04-21");
    const occupied = new Set<string>();

    layout.ships.forEach((ship) => {
      ship.cells.forEach((cell) => {
        occupied.add(`${cell.row}:${cell.col}`);
      });
    });

    expect(occupied.size).toBe(TOTAL_SHIP_CELLS);
  });

  test("keeps ships in range, non-overlapping, and non-touching across 50 seeds", () => {
    const seeds = Array.from({ length: 50 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 0, 1 + index));
      return date.toISOString().slice(0, 10);
    });

    for (const seed of seeds) {
      const layout = generateBoard(seed);
      const cellToShip = new Map<string, number>();

      layout.ships.forEach((ship, shipIndex) => {
        ship.cells.forEach((cell) => {
          expect(cell.row).toBeGreaterThanOrEqual(0);
          expect(cell.row).toBeLessThan(BOARD_SIZE);
          expect(cell.col).toBeGreaterThanOrEqual(0);
          expect(cell.col).toBeLessThan(BOARD_SIZE);

          const key = `${cell.row}:${cell.col}`;
          expect(cellToShip.has(key)).toBe(false);
          cellToShip.set(key, shipIndex);
        });
      });

      layout.ships.forEach((ship, shipIndex) => {
        ship.cells.forEach((cell) => {
          neighbors(cell.row, cell.col).forEach(([neighborRow, neighborCol]) => {
            const neighborShip = cellToShip.get(`${neighborRow}:${neighborCol}`);
            if (neighborShip !== undefined) {
              expect(neighborShip).toBe(shipIndex);
            }
          });
        });
      });
    }
  });

  test("round-trips the seedDate onto the layout", () => {
    expect(generateBoard("2026-04-21").seedDate).toBe("2026-04-21");
  });
});
