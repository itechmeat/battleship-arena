import type { BoardView, CellState, RunShotRow } from "@battleship-arena/shared";

const BOARD_SIZE = 10;

function toIndex(row: number, col: number): number {
  return row * BOARD_SIZE + col;
}

function paintSunkDirection(
  cells: CellState[],
  row: number,
  col: number,
  deltaRow: number,
  deltaCol: number,
) {
  let nextRow = row + deltaRow;
  let nextCol = col + deltaCol;

  while (nextRow >= 0 && nextRow < BOARD_SIZE && nextCol >= 0 && nextCol < BOARD_SIZE) {
    const index = toIndex(nextRow, nextCol);
    const current = cells[index];
    if (current !== "hit" && current !== "sunk") {
      break;
    }

    cells[index] = "sunk";
    nextRow += deltaRow;
    nextCol += deltaCol;
  }
}

export function boardViewFromShots(shots: readonly RunShotRow[]): BoardView {
  const cells: CellState[] = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => "unknown");

  for (const shot of shots) {
    if (shot.row === null || shot.col === null) {
      continue;
    }

    const index = toIndex(shot.row, shot.col);

    switch (shot.result) {
      case "miss":
        cells[index] = "miss";
        break;
      case "hit":
        cells[index] = "hit";
        break;
      case "sunk":
        cells[index] = "sunk";
        break;
      default:
        break;
    }
  }

  for (const shot of shots) {
    if (shot.result !== "sunk" || shot.row === null || shot.col === null) {
      continue;
    }

    paintSunkDirection(cells, shot.row, shot.col, -1, 0);
    paintSunkDirection(cells, shot.row, shot.col, 1, 0);
    paintSunkDirection(cells, shot.row, shot.col, 0, -1);
    paintSunkDirection(cells, shot.row, shot.col, 0, 1);
  }

  return { size: 10, cells };
}
