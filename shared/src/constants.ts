export const BOARD_SIZE = 10;

export const FLEET = [
  { name: "carrier", length: 5 },
  { name: "battleship", length: 4 },
  { name: "cruiser", length: 3 },
  { name: "submarine", length: 3 },
  { name: "destroyer", length: 2 },
] as const;

export const TOTAL_SHIP_CELLS = FLEET.reduce((acc, ship) => acc + ship.length, 0);

export const SHOT_CAP = 100;

export const CONSECUTIVE_SCHEMA_ERROR_LIMIT = 5;
