import { BOARD_SIZE } from "./constants.ts";
import type { BoardView, CellState } from "./types.ts";

const CELL_PX = 64;
const GRID_PX = BOARD_SIZE * CELL_PX;

const FILL_BY_STATE: Record<CellState, string> = {
  unknown: "#cfe8ff",
  miss: "#cfe8ff",
  hit: "#ffd7d7",
  sunk: "#8a1a1a",
};

function assertBoardView(view: BoardView): void {
  if (view.size !== BOARD_SIZE) {
    throw new Error(`Expected board size ${BOARD_SIZE}, received ${view.size}`);
  }

  if (view.cells.length !== BOARD_SIZE * BOARD_SIZE) {
    throw new Error(`Expected ${BOARD_SIZE * BOARD_SIZE} cells, received ${view.cells.length}`);
  }
}

function renderCell(row: number, col: number, state: CellState): string {
  const x = col * CELL_PX;
  const y = row * CELL_PX;
  const cell = `<rect data-cell="${row}-${col}" x="${x}" y="${y}" width="${CELL_PX}" height="${CELL_PX}" fill="${FILL_BY_STATE[state]}" stroke="#23527a" stroke-width="1" />`;

  if (state === "miss") {
    const cx = x + CELL_PX / 2;
    const cy = y + CELL_PX / 2;
    return `${cell}<circle cx="${cx}" cy="${cy}" r="8" fill="#23527a" />`;
  }

  if (state === "hit") {
    const cx = x + CELL_PX / 2;
    const cy = y + CELL_PX / 2;
    const half = CELL_PX / 2 - 14;
    const first = `<rect x="${cx - half}" y="${cy - 4}" width="${half * 2}" height="8" transform="rotate(45 ${cx} ${cy})" fill="#b10000" />`;
    const second = `<rect x="${cx - half}" y="${cy - 4}" width="${half * 2}" height="8" transform="rotate(-45 ${cx} ${cy})" fill="#b10000" />`;
    return `${cell}${first}${second}`;
  }

  return cell;
}

export function renderBoardSvg(view: BoardView): string {
  assertBoardView(view);

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID_PX} ${GRID_PX}" width="${GRID_PX}" height="${GRID_PX}" role="img" aria-label="Battleship board">`,
    `<rect x="0" y="0" width="${GRID_PX}" height="${GRID_PX}" fill="#0b3a5d" />`,
  ];

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const state = view.cells[row * BOARD_SIZE + col];
      if (state === undefined) {
        throw new Error(`Missing cell at row ${row}, col ${col}`);
      }

      parts.push(renderCell(row, col, state));
    }
  }

  parts.push("</svg>");

  return parts.join("");
}
