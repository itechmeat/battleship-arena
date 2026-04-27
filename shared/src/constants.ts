export const BOARD_SIZE = 10;

export const FLEET = [
  { name: "carrier", length: 5 },
  { name: "battleship", length: 4 },
  { name: "cruiser", length: 3 },
  { name: "submarine", length: 3 },
  { name: "destroyer", length: 2 },
] as const;

export const TOTAL_SHIP_CELLS = FLEET.reduce((acc, ship) => acc + ship.length, 0);

export const DEFAULT_BENCHMARK_SEED_DATE = "2026-04-21";

export const SHOT_CAP = 100;

export const SCHEMA_ERROR_DNF_THRESHOLD = 5;
export const RING_CAPACITY = 200;
export const SSE_HEARTBEAT_MS = 25_000;
export const MOCK_TURN_DELAY_MS_DEFAULT = 150;

export const CONSECUTIVE_SCHEMA_ERROR_LIMIT = SCHEMA_ERROR_DNF_THRESHOLD;
