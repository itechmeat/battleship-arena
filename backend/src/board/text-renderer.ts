import { BOARD_SIZE, type BoardView, type CellState } from "@battleship-arena/shared";

const COLUMN_LETTERS = Array.from({ length: BOARD_SIZE }, (_value, index) =>
  String.fromCharCode("A".charCodeAt(0) + index),
).join("");

function symbolFor(cell: CellState): string {
  switch (cell) {
    case "miss":
      return "o";
    case "hit":
      return "X";
    case "sunk":
      return "S";
    case "unknown":
      return ".";
  }
}

export function renderBoardText(view: BoardView): string {
  const lines: string[] = [`   ${COLUMN_LETTERS}`];

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    let rowLine = "";
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const cell = view.cells[row * BOARD_SIZE + col] ?? "unknown";
      rowLine += symbolFor(cell);
    }
    const rowLabel = String(row + 1).padStart(2, "0");
    lines.push(`${rowLabel} ${rowLine}`);
  }

  return lines.join("\n");
}
