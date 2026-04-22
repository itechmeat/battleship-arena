import { createHash } from "node:crypto";

import { BOARD_SIZE, FLEET } from "@battleship-arena/shared";

export type Orientation = "horizontal" | "vertical";

export interface ShipCell {
  row: number;
  col: number;
}

export interface ShipPlacement {
  name: (typeof FLEET)[number]["name"];
  length: number;
  cells: readonly ShipCell[];
  orientation: Orientation;
}

export interface BoardLayout {
  seedDate: string;
  ships: readonly ShipPlacement[];
}

type PrngState = [number, number, number, number];

function rotateLeft(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function seedState(seedDate: string, salt: number): PrngState {
  const hash = createHash("sha256").update(`${seedDate}:${salt}`).digest();

  return [hash.readUInt32BE(0), hash.readUInt32BE(4), hash.readUInt32BE(8), hash.readUInt32BE(12)];
}

function nextU32(state: PrngState): number {
  const result = Math.imul(rotateLeft(Math.imul(state[1], 5) >>> 0, 7), 9) >>> 0;
  const temp = (state[1] << 9) >>> 0;

  state[2] = (state[2] ^ state[0]) >>> 0;
  state[3] = (state[3] ^ state[1]) >>> 0;
  state[1] = (state[1] ^ state[2]) >>> 0;
  state[0] = (state[0] ^ state[3]) >>> 0;
  state[2] = (state[2] ^ temp) >>> 0;
  state[3] = rotateLeft(state[3], 11);

  return result;
}

function nextInt(state: PrngState, maxExclusive: number): number {
  if (maxExclusive <= 0) {
    throw new RangeError(`maxExclusive must be greater than 0, received ${maxExclusive}`);
  }

  return nextU32(state) % maxExclusive;
}

function cellsFor(row: number, col: number, length: number, orientation: Orientation): ShipCell[] {
  const cells: ShipCell[] = [];

  for (let index = 0; index < length; index += 1) {
    cells.push(
      orientation === "horizontal" ? { row, col: col + index } : { row: row + index, col },
    );
  }

  return cells;
}

function isInBounds(cells: readonly ShipCell[]): boolean {
  return cells.every(
    (cell) => cell.row >= 0 && cell.row < BOARD_SIZE && cell.col >= 0 && cell.col < BOARD_SIZE,
  );
}

function conflictsWithOccupied(
  candidate: readonly ShipCell[],
  occupied: ReadonlySet<string>,
): boolean {
  for (const cell of candidate) {
    for (let deltaRow = -1; deltaRow <= 1; deltaRow += 1) {
      for (let deltaCol = -1; deltaCol <= 1; deltaCol += 1) {
        if (occupied.has(`${cell.row + deltaRow}:${cell.col + deltaCol}`)) {
          return true;
        }
      }
    }
  }

  return false;
}

export function generateBoard(seedDate: string): BoardLayout {
  const MAX_RESTARTS = 64;
  const MAX_ATTEMPTS_PER_SHIP = 256;

  for (let salt = 0; salt < MAX_RESTARTS; salt += 1) {
    const state = seedState(seedDate, salt);
    const occupied = new Set<string>();
    const ships: ShipPlacement[] = [];
    let complete = true;

    for (const ship of FLEET) {
      let placed = false;

      for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_SHIP; attempt += 1) {
        const orientation: Orientation = nextInt(state, 2) === 0 ? "horizontal" : "vertical";
        const rowLimit = orientation === "vertical" ? BOARD_SIZE - ship.length + 1 : BOARD_SIZE;
        const colLimit = orientation === "horizontal" ? BOARD_SIZE - ship.length + 1 : BOARD_SIZE;
        const row = nextInt(state, rowLimit);
        const col = nextInt(state, colLimit);
        const cells = cellsFor(row, col, ship.length, orientation);

        if (!isInBounds(cells) || conflictsWithOccupied(cells, occupied)) {
          continue;
        }

        cells.forEach((cell) => {
          occupied.add(`${cell.row}:${cell.col}`);
        });
        ships.push({
          name: ship.name,
          length: ship.length,
          cells,
          orientation,
        });
        placed = true;
        break;
      }

      if (!placed) {
        complete = false;
        break;
      }
    }

    if (complete) {
      return { seedDate, ships };
    }
  }

  throw new Error(`Could not generate a valid layout for seed ${seedDate}`);
}
