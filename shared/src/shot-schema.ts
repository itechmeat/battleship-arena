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

  const row = parsed.row;
  const col = parsed.col;
  const reasoning = parsed.reasoning;

  if (!isInteger(row) || !isInteger(col)) {
    return { kind: "schema_error" };
  }

  if (reasoning !== undefined && typeof reasoning !== "string") {
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
