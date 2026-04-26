import { BOARD_SIZE } from "./constants.ts";
import type { Shot } from "./types.ts";

export type ParseShotResult =
  | { kind: "ok"; shot: Shot }
  | { kind: "schema_error" }
  | { kind: "invalid_coordinate"; row: number; col: number };

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const COLUMN_LETTER_RE = /^([A-J])(0?[1-9]|10)$/i;

function parseCellNotation(cell: string): { row: number; col: number } | null {
  const match = COLUMN_LETTER_RE.exec(cell.trim());
  if (match === null) {
    return null;
  }

  const letter = match[1];
  const number = match[2];
  if (letter === undefined || number === undefined) {
    return null;
  }

  const col = letter.toUpperCase().charCodeAt(0) - "A".charCodeAt(0);
  const row = Number(number) - 1;

  return { row, col };
}

export function parseShot(rawText: string): ParseShotResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { kind: "schema_error" };
  }

  if (!isObjectRecord(parsed)) {
    return { kind: "schema_error" };
  }

  const reasoning = parsed.reasoning;
  if (reasoning !== undefined && typeof reasoning !== "string") {
    return { kind: "schema_error" };
  }

  let row: number;
  let col: number;

  if (typeof parsed.cell === "string") {
    const coords = parseCellNotation(parsed.cell);
    if (coords === null) {
      return { kind: "schema_error" };
    }

    row = coords.row;
    col = coords.col;
  } else if (isInteger(parsed.row) && isInteger(parsed.col)) {
    row = parsed.row;
    col = parsed.col;
  } else {
    return { kind: "schema_error" };
  }

  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
    return { kind: "invalid_coordinate", row, col };
  }

  return {
    kind: "ok",
    shot: reasoning === undefined ? { row, col } : { row, col, reasoning },
  };
}
