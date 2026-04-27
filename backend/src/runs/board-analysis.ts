import { BOARD_SIZE, type BoardView, type CellState } from "@battleship-arena/shared";

import type { BoardLayout, ShipPlacement } from "../board/generator.ts";

export interface LegalPriorShot {
  row: number;
  col: number;
  result: "hit" | "miss" | "sunk";
}

export function boardCoordinateKey(row: number, col: number): string {
  return `${row}:${col}`;
}

function hitKeysFor(legalPriorShots: readonly LegalPriorShot[]): Set<string> {
  return new Set(
    legalPriorShots
      .filter((shot) => shot.result === "hit" || shot.result === "sunk")
      .map((shot) => boardCoordinateKey(shot.row, shot.col)),
  );
}

export function findShipAt(
  layout: BoardLayout,
  row: number,
  col: number,
): ShipPlacement | undefined {
  return layout.ships.find((ship) =>
    ship.cells.some((cell) => cell.row === row && cell.col === col),
  );
}

export function buildBoardView(
  layout: BoardLayout,
  legalPriorShots: readonly LegalPriorShot[],
): BoardView {
  const cells: CellState[] = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => "unknown");
  const hitKeys = hitKeysFor(legalPriorShots);
  const missShots = legalPriorShots.filter((shot) => shot.result === "miss");
  const sunkShipKeys = new Set<string>();

  for (const ship of layout.ships) {
    const isSunk = ship.cells.every((cell) => hitKeys.has(boardCoordinateKey(cell.row, cell.col)));
    if (!isSunk) {
      continue;
    }

    ship.cells.forEach((cell) => {
      sunkShipKeys.add(boardCoordinateKey(cell.row, cell.col));
    });
  }

  for (const shot of missShots) {
    cells[shot.row * BOARD_SIZE + shot.col] = "miss";
  }

  for (const ship of layout.ships) {
    for (const cell of ship.cells) {
      const index = cell.row * BOARD_SIZE + cell.col;
      const key = boardCoordinateKey(cell.row, cell.col);

      if (sunkShipKeys.has(key)) {
        cells[index] = "sunk";
        continue;
      }

      if (hitKeys.has(key)) {
        cells[index] = "hit";
      }
    }
  }

  return { size: BOARD_SIZE, cells };
}

export function shipsRemaining(
  layout: BoardLayout,
  legalPriorShots: readonly LegalPriorShot[],
): string[] {
  const hitKeys = hitKeysFor(legalPriorShots);

  return layout.ships
    .filter(
      (ship) => !ship.cells.every((cell) => hitKeys.has(boardCoordinateKey(cell.row, cell.col))),
    )
    .map((ship) => ship.name);
}
