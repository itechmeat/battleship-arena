import { parseShot } from "@battleship-arena/shared";

import type { BoardLayout } from "../board/generator.ts";

import { boardCoordinateKey, findShipAt, type LegalPriorShot } from "./board-analysis.ts";
import type { RunLoopEvent } from "./outcome.ts";

export type ShotRunLoopEvent = Exclude<RunLoopEvent, { kind: "abort" }>;

export interface ClassifiedShot {
  row: number | null;
  col: number | null;
  result: "hit" | "miss" | "sunk" | "schema_error" | "invalid_coordinate";
  reasoningText: string | null;
  event: ShotRunLoopEvent;
  legalShot: LegalPriorShot | null;
}

export function classifyShot(
  layout: BoardLayout,
  legalPriorShots: readonly LegalPriorShot[],
  seenCoordinates: ReadonlySet<string>,
  rawText: string,
): ClassifiedShot {
  const parsed = parseShot(rawText);

  if (parsed.kind === "schema_error") {
    return {
      row: null,
      col: null,
      result: "schema_error",
      reasoningText: null,
      event: { kind: "schema_error" },
      legalShot: null,
    };
  }

  if (parsed.kind === "invalid_coordinate") {
    return {
      row: null,
      col: null,
      result: "invalid_coordinate",
      reasoningText: null,
      event: { kind: "invalid_coordinate" },
      legalShot: null,
    };
  }

  const reasoningText = parsed.shot.reasoning ?? null;
  const row = parsed.shot.row;
  const col = parsed.shot.col;
  const coordinateKey = boardCoordinateKey(row, col);

  if (seenCoordinates.has(coordinateKey)) {
    return {
      row,
      col,
      result: "invalid_coordinate",
      reasoningText,
      event: { kind: "invalid_coordinate" },
      legalShot: null,
    };
  }

  const ship = findShipAt(layout, row, col);
  if (ship === undefined) {
    return {
      row,
      col,
      result: "miss",
      reasoningText,
      event: { kind: "miss" },
      legalShot: { row, col, result: "miss" },
    };
  }

  const hitKeys = new Set(
    legalPriorShots
      .filter((shot) => shot.result === "hit" || shot.result === "sunk")
      .map((shot) => boardCoordinateKey(shot.row, shot.col)),
  );
  const sinksShip = ship.cells.every((cell) => {
    const cellKey = boardCoordinateKey(cell.row, cell.col);
    return cellKey === coordinateKey || hitKeys.has(cellKey);
  });
  const result = sinksShip ? "sunk" : "hit";

  return {
    row,
    col,
    result,
    reasoningText,
    event: { kind: result },
    legalShot: { row, col, result },
  };
}
