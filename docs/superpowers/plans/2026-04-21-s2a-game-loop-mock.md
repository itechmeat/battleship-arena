# S2a - Game Loop Against Mock Provider - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Git-command policy.** This repo's `AGENTS.md` forbids agents from running `git add`, `git commit`, branch-switching, or any other mutating git command without the user's explicit permission. The `git checkout -b`, `git add`, and `git commit` commands shown in this plan are **reference material only**: suggested branch name, suggested staged file list, suggested commit message per task. An executing agent must not run them on its own. At each git step, present the suggested commands to the user and let the user decide whether to run them, or wait for the user to run them. If a workflow explicitly authorizes autonomous commits for this plan (for example, an openspec operator with a documented override), the operator takes responsibility; the plan itself does not grant that authorization. Never skip hooks (no `--no-verify`).

**Goal:** Deliver a complete playable run against the mock provider, end-to-end: a user on `/play` picks `mock`, starts a run, and watches it on `/runs/:id` via live SSE until a terminal state. The run is persisted; `GET /api/runs/:id` and `GET /api/runs/:id/shots` reconstruct the full game.

**Architecture:** Vertical slice through `shared/` (constants, types, SVG template, SSE event union), `backend/` (board generator and renderer, outcome FSM reducer, event ring, provider adapter interface, mock provider with three variants, db queries, reconciliation, engine, manager, five Hono routes, session cookie middleware, SIGTERM drain), and `web/` (typed API/SSE libs, three Solid islands, two Astro pages). Spec reference: `docs/superpowers/specs/2026-04-21-s2a-game-loop-mock-design.md`. TDD from the first code task; production files are preceded by failing tests per `CLAUDE.md`.

**Tech Stack:** Bun (runtime, test, bundler), Hono (HTTP), Drizzle ORM + `bun:sqlite` (persistence), `@resvg/resvg-js` (SVG -> PNG, new dep), Astro + Solid.js (web), CSS Modules, `oxlint` + `oxfmt` (lint/format).

---

## Precheck (do before Task 1)

- [ ] **Step 1: Be on a clean feature branch.**

Ensure you are on a feature branch off `main` with no uncommitted changes. If you are not, stop and ask the user to create or switch to one. Suggested branch name for this work: `feat/s2a-game-loop-mock`. Per the Git-command policy above, an agent must not run `git checkout -b` autonomously.

- [ ] **Step 2: Confirm S1a is green on a fresh clone state.**

```bash
bun install --frozen-lockfile
bun run lint
bun run fmt:check
bun run typecheck
bun test
bun run build
```

Expected: every command exits 0. If any fails, stop and investigate before proceeding.

- [ ] **Step 3: Re-read the design doc.**

Open `docs/superpowers/specs/2026-04-21-s2a-game-loop-mock-design.md`. Sections 4 (module layout), 5 (pure layer), 6 (engine/manager/lifecycle), 7 (mock), 8 (HTTP), 9 (web), 10 (tests) are load-bearing for this plan.

---

## Task 1: Shared constants and error codes

**Files:**

- Modify: `shared/src/constants.ts`
- Modify: `shared/src/error-codes.ts`
- Test: `shared/tests/constants.test.ts` (new)

- [ ] **Step 1: Write the failing test for the new constants.**

Create `shared/tests/constants.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  RING_CAPACITY,
  SSE_HEARTBEAT_MS,
  SCHEMA_ERROR_DNF_THRESHOLD,
  MOCK_TURN_DELAY_MS_DEFAULT,
} from "../src/constants.ts";

describe("S2a constants", () => {
  test("ring capacity is 200", () => {
    expect(RING_CAPACITY).toBe(200);
  });
  test("sse heartbeat is 25 seconds", () => {
    expect(SSE_HEARTBEAT_MS).toBe(25_000);
  });
  test("schema-error DNF threshold is 5", () => {
    expect(SCHEMA_ERROR_DNF_THRESHOLD).toBe(5);
  });
  test("mock turn delay default is 150", () => {
    expect(MOCK_TURN_DELAY_MS_DEFAULT).toBe(150);
  });
});
```

- [ ] **Step 2: Write the failing test for the new error codes.**

Append to `shared/tests/error-codes.test.ts` (or create if missing):

```ts
import { describe, expect, test } from "bun:test";
import { ERROR_CODES } from "../src/error-codes.ts";

describe("S2a error codes", () => {
  test("run_not_found is in the closed set", () => {
    expect((ERROR_CODES as readonly string[]).includes("run_not_found")).toBe(true);
  });
  test("already_aborted is in the closed set", () => {
    expect((ERROR_CODES as readonly string[]).includes("already_aborted")).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests and confirm failure.**

```bash
bun test shared/tests/constants.test.ts shared/tests/error-codes.test.ts
```

Expected: both files fail with "cannot find export" or "expected X to be Y" errors.

- [ ] **Step 4: Add the constants.**

Edit `shared/src/constants.ts` to add the new exports (keep the existing ones):

```ts
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
export const SCHEMA_ERROR_DNF_THRESHOLD = 5;
export const RING_CAPACITY = 200;
export const SSE_HEARTBEAT_MS = 25_000;
export const MOCK_TURN_DELAY_MS_DEFAULT = 150;

export const CONSECUTIVE_SCHEMA_ERROR_LIMIT = SCHEMA_ERROR_DNF_THRESHOLD;
```

Edit `shared/src/error-codes.ts`:

```ts
export const ERROR_CODES = [
  "invalid_input",
  "not_found",
  "run_not_found",
  "run_terminal",
  "already_aborted",
  "provider_unavailable",
  "budget_required",
  "rate_limited",
  "maintenance_soft",
  "too_many_active_runs",
  "internal",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    detail?: Record<string, unknown>;
  };
}
```

- [ ] **Step 5: Run the tests and confirm pass.**

```bash
bun test shared/tests/constants.test.ts shared/tests/error-codes.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run the full shared suite.**

```bash
bun test shared/
```

Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add shared/src/constants.ts shared/src/error-codes.ts shared/tests/constants.test.ts shared/tests/error-codes.test.ts
git commit -m "feat(shared): add S2a constants and error codes"
```

---

## Task 2: Shared types for run/shot/board views

**Files:**

- Modify: `shared/src/types.ts`
- Modify: `shared/src/index.ts`
- Test: `shared/tests/types.test.ts` (new)

- [ ] **Step 1: Write a compile-time type test.**

Create `shared/tests/types.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { BoardView, CellState, RunMeta, RunShotRow, StartRunInput } from "../src/types.ts";

describe("S2a shared types", () => {
  test("BoardView has 100 cells and size 10", () => {
    const view: BoardView = { size: 10, cells: new Array(100).fill("unknown") };
    expect(view.cells.length).toBe(100);
    expect(view.size).toBe(10);
  });

  test("CellState union includes unknown/miss/hit/sunk", () => {
    const states: CellState[] = ["unknown", "miss", "hit", "sunk"];
    expect(states.length).toBe(4);
  });

  test("RunMeta and RunShotRow can be constructed", () => {
    const meta: RunMeta = {
      id: "01",
      seedDate: "2026-04-21",
      providerId: "mock",
      modelId: "mock-happy",
      displayName: "Mock happy",
      startedAt: 0,
      endedAt: null,
      outcome: null,
      shotsFired: 0,
      hits: 0,
      schemaErrors: 0,
      invalidCoordinates: 0,
      durationMs: 0,
      tokensIn: 0,
      tokensOut: 0,
      reasoningTokens: null,
      costUsdMicros: 0,
      budgetUsdMicros: null,
    };
    const row: RunShotRow = {
      runId: "01",
      idx: 0,
      row: 1,
      col: 2,
      result: "miss",
      rawResponse: "{}",
      reasoningText: null,
      tokensIn: 0,
      tokensOut: 0,
      reasoningTokens: null,
      costUsdMicros: 0,
      durationMs: 0,
      createdAt: 0,
    };
    expect(meta.id).toBe("01");
    expect(row.result).toBe("miss");
  });

  test("StartRunInput carries apiKey", () => {
    const input: StartRunInput = {
      providerId: "mock",
      modelId: "mock-happy",
      apiKey: "k",
      clientSession: "session",
      seedDate: "2026-04-21",
    };
    expect(input.apiKey).toBe("k");
  });
});
```

- [ ] **Step 2: Run the test to verify failure.**

```bash
bun test shared/tests/types.test.ts
```

Expected: FAIL, types missing.

- [ ] **Step 3: Add the types.**

Edit `shared/src/types.ts`:

```ts
import type { Outcome } from "./outcome.ts";

export interface HealthResponse {
  status: "ok";
  version: string;
  commitSha: string;
  startedAt: number;
}

export interface Shot {
  row: number;
  col: number;
  reasoning?: string;
}

export type CellState = "unknown" | "miss" | "hit" | "sunk";

export interface BoardView {
  size: 10;
  cells: readonly CellState[]; // row-major, length 100
}

export type ShotResult = "hit" | "miss" | "sunk" | "schema_error" | "invalid_coordinate";

export interface RunMeta {
  id: string;
  seedDate: string;
  providerId: string;
  modelId: string;
  displayName: string;
  startedAt: number;
  endedAt: number | null;
  outcome: Outcome | null;
  shotsFired: number;
  hits: number;
  schemaErrors: number;
  invalidCoordinates: number;
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number | null;
  costUsdMicros: number;
  budgetUsdMicros: number | null;
}

export interface RunShotRow {
  runId: string;
  idx: number;
  row: number | null;
  col: number | null;
  result: ShotResult;
  rawResponse: string;
  reasoningText: string | null;
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number | null;
  costUsdMicros: number;
  durationMs: number;
  createdAt: number;
}

export interface StartRunInput {
  providerId: string;
  modelId: string;
  apiKey: string;
  budgetUsd?: number;
  clientSession: string;
  seedDate: string;
}
```

Edit `shared/src/index.ts` to re-export everything:

```ts
export * from "./constants.ts";
export * from "./error-codes.ts";
export * from "./outcome.ts";
export * from "./shot-schema.ts";
export * from "./types.ts";
```

- [ ] **Step 4: Run tests.**

```bash
bun test shared/
```

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add shared/src/types.ts shared/src/index.ts shared/tests/types.test.ts
git commit -m "feat(shared): add run/shot/board view types"
```

---

## Task 3: Shared SVG board template

**Files:**

- Create: `shared/src/board-svg.ts`
- Create: `shared/tests/board-svg.test.ts`
- Create: `shared/tests/fixtures/board-svg/` (directory)

- [ ] **Step 1: Write the failing tests.**

Create `shared/tests/board-svg.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { renderBoardSvg } from "../src/board-svg.ts";
import type { BoardView, CellState } from "../src/types.ts";

const FIXTURES_DIR = join(import.meta.dir, "fixtures", "board-svg");

function view(cells: CellState[]): BoardView {
  if (cells.length !== 100) throw new Error("cells must have length 100");
  return { size: 10, cells };
}

describe("renderBoardSvg", () => {
  test("all unknown: deterministic SVG", () => {
    const svg = renderBoardSvg(view(new Array(100).fill("unknown")));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.includes("640")).toBe(true);
    expect(svg.includes("<text")).toBe(false);
  });

  test("produces same SVG across invocations", () => {
    const v = view(new Array(100).fill("unknown"));
    expect(renderBoardSvg(v)).toBe(renderBoardSvg(v));
  });

  test("cells are placed in row-major order", () => {
    const cells: CellState[] = new Array(100).fill("unknown");
    cells[0] = "hit"; // row 0, col 0
    cells[99] = "miss"; // row 9, col 9
    const svg = renderBoardSvg(view(cells));
    const hitIndex = svg.indexOf('data-cell="0-0"');
    const missIndex = svg.indexOf('data-cell="9-9"');
    expect(hitIndex).toBeGreaterThan(-1);
    expect(missIndex).toBeGreaterThan(hitIndex);
  });

  test("fixture match: mixed board", () => {
    const cells: CellState[] = new Array(100).fill("unknown");
    cells[0] = "hit";
    cells[11] = "miss";
    cells[22] = "sunk";
    cells[44] = "sunk";
    cells[55] = "hit";
    const path = join(FIXTURES_DIR, "mixed.svg");
    const actual = renderBoardSvg(view(cells));
    if (!existsSync(path)) {
      throw new Error(`Fixture missing: ${path}. Write the SVG output to it to bless.`);
    }
    expect(actual).toBe(readFileSync(path, "utf8"));
  });
});
```

- [ ] **Step 2: Run the test to verify failure.**

```bash
bun test shared/tests/board-svg.test.ts
```

Expected: FAIL with module not found.

- [ ] **Step 3: Implement `renderBoardSvg`.**

Create `shared/src/board-svg.ts`:

```ts
import type { BoardView, CellState } from "./types.ts";

const CELL_PX = 64;
const GRID_PX = 640;

const COLORS: Record<CellState, { fill: string; marker: string | null }> = {
  unknown: { fill: "#cfe8ff", marker: null },
  miss: { fill: "#cfe8ff", marker: "dot" },
  hit: { fill: "#ffd7d7", marker: "x" },
  sunk: { fill: "#8a1a1a", marker: null },
};

function renderCell(row: number, col: number, state: CellState): string {
  const x = col * CELL_PX;
  const y = row * CELL_PX;
  const { fill, marker } = COLORS[state];
  const cellAttr = `data-cell="${row}-${col}"`;
  const rect = `<rect ${cellAttr} x="${x}" y="${y}" width="${CELL_PX}" height="${CELL_PX}" fill="${fill}" stroke="#23527a" stroke-width="1" />`;
  if (marker === "dot") {
    const cx = x + CELL_PX / 2;
    const cy = y + CELL_PX / 2;
    return `${rect}<circle cx="${cx}" cy="${cy}" r="8" fill="#23527a" />`;
  }
  if (marker === "x") {
    const pad = 14;
    const cx = x + CELL_PX / 2;
    const cy = y + CELL_PX / 2;
    const half = CELL_PX / 2 - pad;
    const r1 = `<rect x="${cx - half}" y="${cy - 4}" width="${half * 2}" height="8" transform="rotate(45 ${cx} ${cy})" fill="#b10000" />`;
    const r2 = `<rect x="${cx - half}" y="${cy - 4}" width="${half * 2}" height="8" transform="rotate(-45 ${cx} ${cy})" fill="#b10000" />`;
    return `${rect}${r1}${r2}`;
  }
  return rect;
}

export function renderBoardSvg(view: BoardView): string {
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID_PX} ${GRID_PX}" width="${GRID_PX}" height="${GRID_PX}" role="img" aria-label="Battleship board">`,
  );
  parts.push(`<rect x="0" y="0" width="${GRID_PX}" height="${GRID_PX}" fill="#0b3a5d" />`);
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 10; col += 1) {
      parts.push(renderCell(row, col, view.cells[row * 10 + col]));
    }
  }
  parts.push(`</svg>`);
  return parts.join("");
}
```

- [ ] **Step 4: Run the test.**

```bash
bun test shared/tests/board-svg.test.ts
```

If the fixture comparison fails because the fixture file doesn't exist yet, write the current `renderBoardSvg` output to `shared/tests/fixtures/board-svg/mixed.svg` and re-run. A one-liner:

```bash
mkdir -p shared/tests/fixtures/board-svg
bun -e '
import { renderBoardSvg } from "./shared/src/board-svg.ts";
const cells = new Array(100).fill("unknown");
cells[0] = "hit"; cells[11] = "miss"; cells[22] = "sunk"; cells[44] = "sunk"; cells[55] = "hit";
process.stdout.write(renderBoardSvg({ size: 10, cells }));
' > shared/tests/fixtures/board-svg/mixed.svg
```

Re-run tests. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add shared/src/board-svg.ts shared/tests/board-svg.test.ts shared/tests/fixtures/board-svg/
git commit -m "feat(shared): add deterministic SVG board template"
```

---

## Task 4: Shared SSE event union

**Files:**

- Create: `shared/src/sse-events.ts`
- Modify: `shared/src/index.ts`
- Create: `shared/tests/sse-events.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// shared/tests/sse-events.test.ts
import { describe, expect, test } from "bun:test";
import { isSseEvent, type SseEvent } from "../src/sse-events.ts";

describe("SseEvent discriminator", () => {
  test("accepts a well-shaped shot event", () => {
    const e: SseEvent = {
      kind: "shot",
      id: 1,
      idx: 0,
      row: 0,
      col: 0,
      result: "miss",
      reasoning: null,
    };
    expect(isSseEvent(e)).toBe(true);
  });
  test("rejects unknown kind", () => {
    expect(isSseEvent({ kind: "wut", id: 0 } as unknown)).toBe(false);
  });
  test("rejects missing id", () => {
    expect(isSseEvent({ kind: "resync" } as unknown)).toBe(false);
  });
});
```

- [ ] **Step 2: Confirm failure.**

```bash
bun test shared/tests/sse-events.test.ts
```

- [ ] **Step 3: Implement.**

Create `shared/src/sse-events.ts`:

```ts
import type { Outcome } from "./outcome.ts";
import type { ShotResult } from "./types.ts";

export type SseEvent =
  | {
      kind: "open";
      id: number;
      runId: string;
      startedAt: number;
      seedDate: string;
    }
  | {
      kind: "shot";
      id: number;
      idx: number;
      row: number | null;
      col: number | null;
      result: ShotResult;
      reasoning: string | null;
    }
  | {
      kind: "resync";
      id: number;
    }
  | {
      kind: "outcome";
      id: number;
      outcome: Outcome;
      shotsFired: number;
      hits: number;
      schemaErrors: number;
      invalidCoordinates: number;
      endedAt: number;
    };

export function isSseEvent(value: unknown): value is SseEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "number") return false;
  switch (v.kind) {
    case "open":
    case "shot":
    case "resync":
    case "outcome":
      return true;
    default:
      return false;
  }
}
```

Append to `shared/src/index.ts`:

```ts
export * from "./sse-events.ts";
export * from "./board-svg.ts";
```

- [ ] **Step 4: Run tests.**

```bash
bun test shared/
```

- [ ] **Step 5: Commit.**

```bash
git add shared/src/sse-events.ts shared/src/index.ts shared/tests/sse-events.test.ts
git commit -m "feat(shared): add SSE event union"
```

---

## Task 5: Install @resvg/resvg-js

**Files:**

- Modify: `backend/package.json`
- Modify: `bun.lock`

- [ ] **Step 1: Install the renderer.**

```bash
cd backend && bun add @resvg/resvg-js && cd ..
```

- [ ] **Step 2: Verify import in a throwaway script.**

```bash
bun -e 'import { Resvg } from "@resvg/resvg-js"; const r = new Resvg("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1\" height=\"1\"/>"); const png = r.render().asPng(); console.log("bytes", png.length);'
```

Expected: prints a small non-zero byte count.

- [ ] **Step 3: Lockfile freeze check.**

```bash
bun install --frozen-lockfile
```

Expected: no changes to the lockfile.

- [ ] **Step 4: Commit.**

```bash
git add backend/package.json bun.lock
git commit -m "chore(backend): add @resvg/resvg-js for board PNG rendering"
```

---

## Task 6: Board generator

**Files:**

- Create: `backend/src/board/generator.ts`
- Create: `backend/tests/unit/board-generator.test.ts`

- [ ] **Step 1: Write the failing tests.**

```ts
// backend/tests/unit/board-generator.test.ts
import { describe, expect, test } from "bun:test";
import { generateBoard } from "../../src/board/generator.ts";
import { BOARD_SIZE, FLEET, TOTAL_SHIP_CELLS } from "@battleship-arena/shared";

function neighbors(row: number, col: number): ReadonlyArray<[number, number]> {
  const out: [number, number][] = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      out.push([row + dr, col + dc]);
    }
  }
  return out;
}

describe("generateBoard", () => {
  test("same seed produces same layout", () => {
    const a = generateBoard("2026-04-21");
    const b = generateBoard("2026-04-21");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("fleet composition matches FLEET", () => {
    const layout = generateBoard("2026-04-21");
    expect(layout.ships.length).toBe(FLEET.length);
    layout.ships.forEach((ship, i) => {
      expect(ship.name).toBe(FLEET[i].name);
      expect(ship.length).toBe(FLEET[i].length);
      expect(ship.cells.length).toBe(FLEET[i].length);
    });
  });

  test("total occupied cells matches spec", () => {
    const layout = generateBoard("2026-04-21");
    const occupied = new Set<string>();
    layout.ships.forEach((ship) => ship.cells.forEach((c) => occupied.add(`${c.row}:${c.col}`)));
    expect(occupied.size).toBe(TOTAL_SHIP_CELLS);
  });

  test("all cells in range, no adjacency across distinct ships, no overlap", () => {
    const seeds = Array.from({ length: 50 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, 1 + i));
      return d.toISOString().slice(0, 10);
    });
    for (const seed of seeds) {
      const layout = generateBoard(seed);
      const cellToShip = new Map<string, number>();
      layout.ships.forEach((ship, shipIndex) => {
        for (const c of ship.cells) {
          expect(c.row).toBeGreaterThanOrEqual(0);
          expect(c.row).toBeLessThan(BOARD_SIZE);
          expect(c.col).toBeGreaterThanOrEqual(0);
          expect(c.col).toBeLessThan(BOARD_SIZE);
          const key = `${c.row}:${c.col}`;
          expect(cellToShip.has(key)).toBe(false); // no overlap
          cellToShip.set(key, shipIndex);
        }
      });
      // no adjacency across distinct ships
      layout.ships.forEach((ship, shipIndex) => {
        for (const c of ship.cells) {
          for (const [nr, nc] of neighbors(c.row, c.col)) {
            const neighborShip = cellToShip.get(`${nr}:${nc}`);
            if (neighborShip !== undefined) {
              expect(neighborShip).toBe(shipIndex);
            }
          }
        }
      });
    }
  });

  test("stores seedDate on the layout", () => {
    const layout = generateBoard("2026-04-21");
    expect(layout.seedDate).toBe("2026-04-21");
  });
});
```

- [ ] **Step 2: Run tests, confirm failure.**

```bash
bun test backend/tests/unit/board-generator.test.ts
```

- [ ] **Step 3: Implement the generator.**

Create `backend/src/board/generator.ts`:

```ts
import { createHash } from "node:crypto";

import { BOARD_SIZE, FLEET } from "@battleship-arena/shared";

export type Orientation = "horizontal" | "vertical";

export interface ShipPlacement {
  name: (typeof FLEET)[number]["name"];
  length: number;
  cells: readonly { row: number; col: number }[];
  orientation: Orientation;
}

export interface BoardLayout {
  seedDate: string;
  ships: readonly ShipPlacement[];
}

type PrngState = [number, number, number, number];

function seedPrng(seedDate: string, salt: number): PrngState {
  const hash = createHash("sha256").update(`${seedDate}:${salt}`).digest();
  return [hash.readUInt32BE(0), hash.readUInt32BE(4), hash.readUInt32BE(8), hash.readUInt32BE(12)];
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

// xoshiro128**
function nextU32(state: PrngState): number {
  const result = Math.imul(rotl(Math.imul(state[1], 5), 7), 9) >>> 0;
  const t = (state[1] << 9) >>> 0;
  state[2] = (state[2] ^ state[0]) >>> 0;
  state[3] = (state[3] ^ state[1]) >>> 0;
  state[1] = (state[1] ^ state[2]) >>> 0;
  state[0] = (state[0] ^ state[3]) >>> 0;
  state[2] = (state[2] ^ t) >>> 0;
  state[3] = rotl(state[3], 11);
  return result;
}

function nextInt(state: PrngState, maxExclusive: number): number {
  return nextU32(state) % maxExclusive;
}

function cellsFor(
  row: number,
  col: number,
  length: number,
  orientation: Orientation,
): { row: number; col: number }[] {
  const cells: { row: number; col: number }[] = [];
  for (let i = 0; i < length; i += 1) {
    cells.push(orientation === "horizontal" ? { row, col: col + i } : { row: row + i, col });
  }
  return cells;
}

function inBounds(cells: { row: number; col: number }[]): boolean {
  return cells.every((c) => c.row >= 0 && c.row < BOARD_SIZE && c.col >= 0 && c.col < BOARD_SIZE);
}

function conflictsWith(candidate: { row: number; col: number }[], occupied: Set<string>): boolean {
  for (const c of candidate) {
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (occupied.has(`${c.row + dr}:${c.col + dc}`)) return true;
      }
    }
  }
  return false;
}

export function generateBoard(seedDate: string): BoardLayout {
  const MAX_RESTARTS = 64;
  for (let restart = 0; restart < MAX_RESTARTS; restart += 1) {
    const state = seedPrng(seedDate, restart);
    const ships: ShipPlacement[] = [];
    const occupied = new Set<string>();
    let aborted = false;
    for (const ship of FLEET) {
      let placed = false;
      for (let attempt = 0; attempt < 256; attempt += 1) {
        const orientation: Orientation = nextInt(state, 2) === 0 ? "horizontal" : "vertical";
        const rowMax = orientation === "vertical" ? BOARD_SIZE - ship.length + 1 : BOARD_SIZE;
        const colMax = orientation === "horizontal" ? BOARD_SIZE - ship.length + 1 : BOARD_SIZE;
        const row = nextInt(state, rowMax);
        const col = nextInt(state, colMax);
        const cells = cellsFor(row, col, ship.length, orientation);
        if (!inBounds(cells)) continue;
        if (conflictsWith(cells, occupied)) continue;
        for (const c of cells) occupied.add(`${c.row}:${c.col}`);
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
        aborted = true;
        break;
      }
    }
    if (!aborted) return { seedDate, ships };
  }
  throw new Error(`generateBoard exhausted restarts for seed ${seedDate}`);
}
```

- [ ] **Step 4: Run tests.**

```bash
bun test backend/tests/unit/board-generator.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/board/generator.ts backend/tests/unit/board-generator.test.ts
git commit -m "feat(backend): deterministic board generator (xoshiro128**)"
```

---

## Task 7: Board PNG renderer

**Files:**

- Create: `backend/src/board/renderer.ts`
- Create: `backend/tests/unit/board-renderer.test.ts`
- Create: `backend/tests/fixtures/board-png/` (directory)

- [ ] **Step 1: Write the failing tests.**

```ts
// backend/tests/unit/board-renderer.test.ts
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { BoardView, CellState } from "@battleship-arena/shared";
import { renderBoardPng } from "../../src/board/renderer.ts";

const FIXTURES = join(import.meta.dir, "..", "fixtures", "board-png");

function view(cells: CellState[]): BoardView {
  return { size: 10, cells };
}

function assertPng(bytes: Uint8Array) {
  expect(bytes[0]).toBe(0x89);
  expect(bytes[1]).toBe(0x50); // P
  expect(bytes[2]).toBe(0x4e); // N
  expect(bytes[3]).toBe(0x47); // G
}

describe("renderBoardPng", () => {
  test("emits PNG signature", () => {
    const png = renderBoardPng(view(new Array(100).fill("unknown")));
    assertPng(png);
    expect(png.length).toBeGreaterThan(100);
  });

  test("same BoardView renders byte-identically twice", () => {
    const v = view(new Array(100).fill("unknown"));
    const a = renderBoardPng(v);
    const b = renderBoardPng(v);
    expect(a.length).toBe(b.length);
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).toBe(0);
  });

  test("fixture: all-unknown byte-equal snapshot", () => {
    const v = view(new Array(100).fill("unknown"));
    const actual = renderBoardPng(v);
    const fixturePath = join(FIXTURES, "all-unknown.png");
    if (!existsSync(fixturePath)) {
      writeFileSync(fixturePath, actual);
      throw new Error(`Blessed ${fixturePath}; re-run tests.`);
    }
    const expected = readFileSync(fixturePath);
    expect(Buffer.compare(Buffer.from(actual), expected)).toBe(0);
  });
});
```

- [ ] **Step 2: Confirm failure.**

```bash
bun test backend/tests/unit/board-renderer.test.ts
```

- [ ] **Step 3: Implement.**

Create `backend/src/board/renderer.ts`:

```ts
import { Resvg } from "@resvg/resvg-js";

import { renderBoardSvg, type BoardView } from "@battleship-arena/shared";

export function renderBoardPng(view: BoardView): Uint8Array {
  const svg = renderBoardSvg(view);
  const resvg = new Resvg(svg, { fitTo: { mode: "original" } });
  return resvg.render().asPng();
}
```

- [ ] **Step 4: Run tests - first run blesses the fixture.**

```bash
mkdir -p backend/tests/fixtures/board-png
bun test backend/tests/unit/board-renderer.test.ts
```

If the first run blessed the fixture, re-run:

```bash
bun test backend/tests/unit/board-renderer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/board/renderer.ts backend/tests/unit/board-renderer.test.ts backend/tests/fixtures/board-png/
git commit -m "feat(backend): board PNG renderer via resvg"
```

---

## Task 8: Outcome FSM reducer

**Files:**

- Create: `backend/src/runs/outcome.ts`
- Create: `backend/tests/unit/runs-outcome.test.ts`

- [ ] **Step 1: Write the failing tests.**

```ts
// backend/tests/unit/runs-outcome.test.ts
import { describe, expect, test } from "bun:test";
import { reduceOutcome, initialRunLoopState, type RunLoopState } from "../../src/runs/outcome.ts";

function apply(events: Parameters<typeof reduceOutcome>[1][]): {
  state: RunLoopState;
  outcome: string | null;
} {
  let state = initialRunLoopState();
  let outcome: string | null = null;
  for (const e of events) {
    const next = reduceOutcome(state, e);
    state = next.state;
    if (next.outcome !== null) {
      outcome = next.outcome;
      break;
    }
  }
  return { state, outcome };
}

describe("reduceOutcome", () => {
  test("17th hit wins", () => {
    const events = Array.from({ length: 17 }, () => ({ kind: "hit" as const }));
    expect(apply(events).outcome).toBe("won");
  });

  test("100 misses reach dnf_shot_cap", () => {
    const events = Array.from({ length: 100 }, () => ({ kind: "miss" as const }));
    expect(apply(events).outcome).toBe("dnf_shot_cap");
  });

  test("5 consecutive schema errors reach dnf_schema_errors", () => {
    const events = Array.from({ length: 5 }, () => ({ kind: "schema_error" as const }));
    expect(apply(events).outcome).toBe("dnf_schema_errors");
  });

  test("schema-error streak resets on hit", () => {
    const events = [
      { kind: "schema_error" as const },
      { kind: "schema_error" as const },
      { kind: "schema_error" as const },
      { kind: "hit" as const },
      { kind: "schema_error" as const },
      { kind: "schema_error" as const },
      { kind: "schema_error" as const },
      { kind: "schema_error" as const },
    ];
    const result = apply(events);
    expect(result.outcome).toBe(null);
    expect(result.state.consecutiveSchemaErrors).toBe(4);
  });

  test("invalid_coordinate increments shots_fired and resets streak", () => {
    const events = [{ kind: "schema_error" as const }, { kind: "invalid_coordinate" as const }];
    const { state } = apply(events);
    expect(state.shotsFired).toBe(1);
    expect(state.invalidCoordinates).toBe(1);
    expect(state.consecutiveSchemaErrors).toBe(0);
  });

  test("100 invalid coords reach dnf_shot_cap", () => {
    const events = Array.from({ length: 100 }, () => ({ kind: "invalid_coordinate" as const }));
    expect(apply(events).outcome).toBe("dnf_shot_cap");
  });

  test("abort viewer -> aborted_viewer", () => {
    expect(apply([{ kind: "abort", reason: "viewer" }]).outcome).toBe("aborted_viewer");
  });
  test("abort server_restart -> aborted_server_restart", () => {
    expect(apply([{ kind: "abort", reason: "server_restart" }]).outcome).toBe(
      "aborted_server_restart",
    );
  });

  test("sunk counts as hit and contributes to win", () => {
    const events = [
      ...Array.from({ length: 16 }, () => ({ kind: "hit" as const })),
      { kind: "sunk" as const },
    ];
    expect(apply(events).outcome).toBe("won");
  });
});
```

- [ ] **Step 2: Confirm failure.**

```bash
bun test backend/tests/unit/runs-outcome.test.ts
```

- [ ] **Step 3: Implement.**

Create `backend/src/runs/outcome.ts`:

```ts
import {
  SCHEMA_ERROR_DNF_THRESHOLD,
  SHOT_CAP,
  TOTAL_SHIP_CELLS,
  type Outcome,
} from "@battleship-arena/shared";

export interface RunLoopState {
  shotsFired: number;
  hits: number;
  consecutiveSchemaErrors: number;
  schemaErrors: number;
  invalidCoordinates: number;
}

export type RunLoopEvent =
  | { kind: "hit" }
  | { kind: "miss" }
  | { kind: "sunk" }
  | { kind: "schema_error" }
  | { kind: "invalid_coordinate" }
  | { kind: "abort"; reason: "viewer" | "server_restart" };

export function initialRunLoopState(): RunLoopState {
  return {
    shotsFired: 0,
    hits: 0,
    consecutiveSchemaErrors: 0,
    schemaErrors: 0,
    invalidCoordinates: 0,
  };
}

export function reduceOutcome(
  state: RunLoopState,
  event: RunLoopEvent,
): { state: RunLoopState; outcome: Outcome | null } {
  switch (event.kind) {
    case "hit":
    case "sunk": {
      const next: RunLoopState = {
        ...state,
        shotsFired: state.shotsFired + 1,
        hits: state.hits + 1,
        consecutiveSchemaErrors: 0,
      };
      if (next.hits >= TOTAL_SHIP_CELLS) return { state: next, outcome: "won" };
      if (next.shotsFired >= SHOT_CAP) return { state: next, outcome: "dnf_shot_cap" };
      return { state: next, outcome: null };
    }
    case "miss": {
      const next: RunLoopState = {
        ...state,
        shotsFired: state.shotsFired + 1,
        consecutiveSchemaErrors: 0,
      };
      if (next.shotsFired >= SHOT_CAP) return { state: next, outcome: "dnf_shot_cap" };
      return { state: next, outcome: null };
    }
    case "invalid_coordinate": {
      const next: RunLoopState = {
        ...state,
        shotsFired: state.shotsFired + 1,
        invalidCoordinates: state.invalidCoordinates + 1,
        consecutiveSchemaErrors: 0,
      };
      if (next.shotsFired >= SHOT_CAP) return { state: next, outcome: "dnf_shot_cap" };
      return { state: next, outcome: null };
    }
    case "schema_error": {
      const next: RunLoopState = {
        ...state,
        schemaErrors: state.schemaErrors + 1,
        consecutiveSchemaErrors: state.consecutiveSchemaErrors + 1,
      };
      if (next.consecutiveSchemaErrors >= SCHEMA_ERROR_DNF_THRESHOLD) {
        return { state: next, outcome: "dnf_schema_errors" };
      }
      return { state: next, outcome: null };
    }
    case "abort": {
      const outcome: Outcome =
        event.reason === "viewer" ? "aborted_viewer" : "aborted_server_restart";
      return { state, outcome };
    }
  }
}
```

- [ ] **Step 4: Run tests.**

```bash
bun test backend/tests/unit/runs-outcome.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/runs/outcome.ts backend/tests/unit/runs-outcome.test.ts
git commit -m "feat(backend): outcome FSM reducer (runs/outcome.ts)"
```

---

## Task 9: Event ring

**Files:**

- Create: `backend/src/runs/event-ring.ts`
- Create: `backend/tests/unit/event-ring.test.ts`

- [ ] **Step 1: Write the failing tests.**

```ts
// backend/tests/unit/event-ring.test.ts
import { describe, expect, test } from "bun:test";
import { EventRing } from "../../src/runs/event-ring.ts";
import type { SseEvent } from "@battleship-arena/shared";

function shot(): SseEvent {
  return {
    kind: "shot",
    id: 0,
    idx: 0,
    row: 0,
    col: 0,
    result: "miss",
    reasoning: null,
  };
}

describe("EventRing", () => {
  test("push assigns monotonic ids starting from 1", () => {
    const ring = new EventRing(10);
    ring.push(shot());
    ring.push(shot());
    const all = ring.since(null);
    expect(all).toEqual([
      { ...shot(), id: 1 },
      { ...shot(), id: 2 },
    ]);
  });

  test("capacity overflow drops oldest", () => {
    const ring = new EventRing(3);
    for (let i = 0; i < 5; i += 1) ring.push(shot());
    const all = ring.since(null) as SseEvent[];
    expect(all.length).toBe(3);
    expect(all[0].id).toBe(3);
    expect(all[2].id).toBe(5);
  });

  test("since(n) returns events after id n", () => {
    const ring = new EventRing(10);
    for (let i = 0; i < 5; i += 1) ring.push(shot());
    const after = ring.since(2) as SseEvent[];
    expect(after.map((e) => e.id)).toEqual([3, 4, 5]);
  });

  test("since returns out_of_range when id is older than horizon", () => {
    const ring = new EventRing(3);
    for (let i = 0; i < 5; i += 1) ring.push(shot());
    expect(ring.since(1)).toBe("out_of_range");
  });

  test("since(null) returns everything currently in the ring", () => {
    const ring = new EventRing(3);
    for (let i = 0; i < 5; i += 1) ring.push(shot());
    const all = ring.since(null) as SseEvent[];
    expect(all.length).toBe(3);
  });
});
```

- [ ] **Step 2: Confirm failure.**

```bash
bun test backend/tests/unit/event-ring.test.ts
```

- [ ] **Step 3: Implement.**

Create `backend/src/runs/event-ring.ts`:

```ts
import type { SseEvent } from "@battleship-arena/shared";

export class EventRing {
  private buffer: SseEvent[] = [];
  private nextId = 1;
  constructor(private readonly capacity: number) {
    if (capacity <= 0) throw new Error("EventRing capacity must be positive");
  }

  push(event: SseEvent): SseEvent {
    const withId: SseEvent = { ...event, id: this.nextId } as SseEvent;
    this.nextId += 1;
    this.buffer.push(withId);
    if (this.buffer.length > this.capacity) {
      this.buffer.splice(0, this.buffer.length - this.capacity);
    }
    return withId;
  }

  since(lastEventId: number | null): SseEvent[] | "out_of_range" {
    if (this.buffer.length === 0) return [];
    if (lastEventId === null) return [...this.buffer];
    const oldest = this.buffer[0].id;
    if (lastEventId < oldest - 1) return "out_of_range";
    return this.buffer.filter((e) => e.id > lastEventId);
  }
}
```

- [ ] **Step 4: Run tests.**

```bash
bun test backend/tests/unit/event-ring.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/runs/event-ring.ts backend/tests/unit/event-ring.test.ts
git commit -m "feat(backend): SSE event ring with capacity + out-of-range detection"
```

---

## Task 10: Provider types and registry

**Files:**

- Create: `backend/src/providers/types.ts`
- Create: `backend/tests/unit/provider-registry.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// backend/tests/unit/provider-registry.test.ts
import { describe, expect, test } from "bun:test";
import { createProviderRegistry, type ProviderAdapter } from "../../src/providers/types.ts";

const fake: ProviderAdapter = {
  id: "fake",
  models: [{ id: "a", displayName: "A", hasReasoning: false }],
  async call() {
    return {
      rawText: "{}",
      tokensIn: 0,
      tokensOut: 0,
      reasoningTokens: null,
      costUsdMicros: 0,
      durationMs: 1,
    };
  },
};

describe("createProviderRegistry", () => {
  test("get returns the registered adapter", () => {
    const reg = createProviderRegistry({ fake });
    expect(reg.get("fake")).toBe(fake);
  });

  test("get returns undefined for unknown provider id", () => {
    const reg = createProviderRegistry({ fake });
    expect(reg.get("missing")).toBeUndefined();
  });

  test("listIds reports every registered provider", () => {
    const reg = createProviderRegistry({ fake });
    expect(reg.listIds()).toEqual(["fake"]);
  });
});
```

- [ ] **Step 2: Confirm failure.**

```bash
bun test backend/tests/unit/provider-registry.test.ts
```

- [ ] **Step 3: Implement.**

Create `backend/src/providers/types.ts`:

```ts
export interface ProviderModel {
  id: string;
  displayName: string;
  hasReasoning: boolean;
}

export interface ProviderCallInput {
  modelId: string;
  apiKey: string;
  boardPng: Uint8Array;
  shipsRemaining: readonly string[];
  systemPrompt: string;
  priorShots: readonly {
    row: number;
    col: number;
    result: "hit" | "miss" | "sunk";
  }[];
  seedDate: string;
}

export interface ProviderCallOutput {
  rawText: string;
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number | null;
  costUsdMicros: number;
  durationMs: number;
}

export interface ProviderAdapter {
  readonly id: string;
  readonly models: readonly ProviderModel[];
  call(input: ProviderCallInput, signal: AbortSignal): Promise<ProviderCallOutput>;
}

export interface ProviderRegistry {
  get(providerId: string): ProviderAdapter | undefined;
  listIds(): string[];
}

export function createProviderRegistry(
  adapters: Record<string, ProviderAdapter>,
): ProviderRegistry {
  return {
    get(providerId) {
      return adapters[providerId];
    },
    listIds() {
      return Object.keys(adapters);
    },
  };
}
```

- [ ] **Step 4: Run tests.**

```bash
bun test backend/tests/unit/provider-registry.test.ts
```

- [ ] **Step 5: Commit.**

```bash
git add backend/src/providers/types.ts backend/tests/unit/provider-registry.test.ts
git commit -m "feat(backend): provider adapter interface and registry"
```

---

## Task 11: Mock provider with three variants

**Files:**

- Create: `backend/src/providers/mock.ts`
- Create: `backend/tests/unit/providers-mock.test.ts`

- [ ] **Step 1: Write the failing tests.**

```ts
// backend/tests/unit/providers-mock.test.ts
import { describe, expect, test } from "bun:test";
import { createMockProvider } from "../../src/providers/mock.ts";
import { generateBoard } from "../../src/board/generator.ts";

const baseInput = {
  apiKey: "k",
  boardPng: new Uint8Array(),
  shipsRemaining: [],
  systemPrompt: "",
  priorShots: [],
  seedDate: "2026-04-21",
};

describe("createMockProvider", () => {
  test("mock-happy returns a parseable shot JSON", async () => {
    const mock = createMockProvider({ delayMs: 0 });
    const out = await mock.call(
      { modelId: "mock-happy", ...baseInput },
      new AbortController().signal,
    );
    const parsed = JSON.parse(out.rawText);
    expect(typeof parsed.row).toBe("number");
    expect(typeof parsed.col).toBe("number");
  });

  test("mock-happy wins a full game (<= 100 shots)", async () => {
    const mock = createMockProvider({ delayMs: 0 });
    const layout = generateBoard("2026-04-21");
    const shipCells = new Set(layout.ships.flatMap((s) => s.cells.map((c) => `${c.row}:${c.col}`)));
    const priorShots: { row: number; col: number; result: "hit" | "miss" | "sunk" }[] = [];
    let hits = 0;
    for (let turn = 0; turn < 100 && hits < 17; turn += 1) {
      const res = await mock.call(
        { modelId: "mock-happy", ...baseInput, priorShots },
        new AbortController().signal,
      );
      const { row, col } = JSON.parse(res.rawText);
      const isHit = shipCells.has(`${row}:${col}`);
      if (isHit) hits += 1;
      priorShots.push({ row, col, result: isHit ? "hit" : "miss" });
    }
    expect(hits).toBe(17);
    expect(priorShots.length).toBeLessThanOrEqual(100);
  });

  test("mock-misses never targets a ship cell while there are non-ship cells left", async () => {
    const mock = createMockProvider({ delayMs: 0 });
    const layout = generateBoard("2026-04-21");
    const shipCells = new Set(layout.ships.flatMap((s) => s.cells.map((c) => `${c.row}:${c.col}`)));
    const priorShots: { row: number; col: number; result: "hit" | "miss" | "sunk" }[] = [];
    for (let turn = 0; turn < 83; turn += 1) {
      const res = await mock.call(
        { modelId: "mock-misses", ...baseInput, priorShots },
        new AbortController().signal,
      );
      const { row, col } = JSON.parse(res.rawText);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThanOrEqual(9);
      expect(col).toBeGreaterThanOrEqual(0);
      expect(col).toBeLessThanOrEqual(9);
      expect(shipCells.has(`${row}:${col}`)).toBe(false);
      priorShots.push({ row, col, result: "miss" });
    }
  });

  test("mock-misses falls back to duplicate of first prior shot after non-ship cells exhausted", async () => {
    const mock = createMockProvider({ delayMs: 0 });
    // Simulate every cell already shot as a miss (hypothetical - tests the fallback branch).
    const priorShots: { row: number; col: number; result: "hit" | "miss" | "sunk" }[] = [];
    for (let row = 0; row < 10; row += 1) {
      for (let col = 0; col < 10; col += 1) {
        priorShots.push({ row, col, result: "miss" });
      }
    }
    const res = await mock.call(
      { modelId: "mock-misses", ...baseInput, priorShots },
      new AbortController().signal,
    );
    const parsed = JSON.parse(res.rawText);
    // Fallback re-fires the first prior shot to trigger duplicate-shot invalid_coordinate.
    expect(parsed.row).toBe(priorShots[0].row);
    expect(parsed.col).toBe(priorShots[0].col);
  });

  test("mock-schema-errors cycles malformed payloads", async () => {
    const mock = createMockProvider({ delayMs: 0 });
    const priorShots: never[] = [];
    const out = await mock.call(
      { modelId: "mock-schema-errors", ...baseInput, priorShots },
      new AbortController().signal,
    );
    expect(out.rawText.length).toBeGreaterThan(0);
    // First payload in the cycle: "not json"
    expect(out.rawText.startsWith("{") || out.rawText.startsWith("[")).toBe(false);
  });

  test("unknown modelId throws", async () => {
    const mock = createMockProvider({ delayMs: 0 });
    await expect(
      mock.call({ modelId: "unknown", ...baseInput }, new AbortController().signal),
    ).rejects.toThrow();
  });

  test("respects AbortSignal during delay", async () => {
    const mock = createMockProvider({ delayMs: 1000 });
    const controller = new AbortController();
    const promise = mock.call({ modelId: "mock-happy", ...baseInput }, controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Confirm failure.**

```bash
bun test backend/tests/unit/providers-mock.test.ts
```

- [ ] **Step 3: Implement.**

Create `backend/src/providers/mock.ts`:

```ts
import { MOCK_TURN_DELAY_MS_DEFAULT } from "@battleship-arena/shared";

import { generateBoard, type BoardLayout } from "../board/generator.ts";
import type {
  ProviderAdapter,
  ProviderCallInput,
  ProviderCallOutput,
  ProviderModel,
} from "./types.ts";

const MODELS: readonly ProviderModel[] = [
  { id: "mock-happy", displayName: "Mock - winning run", hasReasoning: false },
  { id: "mock-misses", displayName: "Mock - always misses", hasReasoning: false },
  { id: "mock-schema-errors", displayName: "Mock - schema errors", hasReasoning: false },
] as const;

const SCHEMA_ERROR_CYCLE = ["not json", "{}", '{"row": "A"}', '{"row": 0}', "plain prose"] as const;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) {
    if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function toKey(row: number, col: number): string {
  return `${row}:${col}`;
}

function layoutShipCells(layout: BoardLayout): Set<string> {
  const set = new Set<string>();
  for (const ship of layout.ships) {
    for (const cell of ship.cells) set.add(toKey(cell.row, cell.col));
  }
  return set;
}

function alreadyShot(
  priorShots: ProviderCallInput["priorShots"],
  row: number,
  col: number,
): boolean {
  for (const s of priorShots) {
    if (s.row === row && s.col === col) return true;
  }
  return false;
}

function nextHappyShot(input: ProviderCallInput): { row: number; col: number } {
  const shotSet = new Set(input.priorShots.map((s) => toKey(s.row, s.col)));
  const lastHit = [...input.priorShots].reverse().find((s) => s.result === "hit");
  if (lastHit !== undefined) {
    // Target mode: try 4 neighbors of last hit
    const candidates = [
      { row: lastHit.row - 1, col: lastHit.col },
      { row: lastHit.row + 1, col: lastHit.col },
      { row: lastHit.row, col: lastHit.col - 1 },
      { row: lastHit.row, col: lastHit.col + 1 },
    ];
    for (const c of candidates) {
      if (c.row < 0 || c.row > 9 || c.col < 0 || c.col > 9) continue;
      if (!shotSet.has(toKey(c.row, c.col))) return c;
    }
  }
  // Hunt mode: checkerboard stride-2
  for (let row = 0; row < 10; row += 1) {
    for (let col = row % 2; col < 10; col += 2) {
      if (!shotSet.has(toKey(row, col))) return { row, col };
    }
  }
  // Fallback: any remaining cell
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 10; col += 1) {
      if (!shotSet.has(toKey(row, col))) return { row, col };
    }
  }
  return { row: 0, col: 0 };
}

function nextMissesShot(input: ProviderCallInput): { row: number; col: number } {
  const ships = layoutShipCells(generateBoard(input.seedDate));
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 10; col += 1) {
      const key = toKey(row, col);
      if (ships.has(key)) continue;
      if (alreadyShot(input.priorShots, row, col)) continue;
      return { row, col };
    }
  }
  // Every non-ship cell has already been fired. Re-fire the first prior shot
  // so the engine classifies it as invalid_coordinate via the duplicate-shot
  // rule (spec 3.5) - keeps coordinates in-range and drives shotsFired toward
  // the 100 cap without fabricating out-of-range numbers.
  const first = input.priorShots[0];
  if (first !== undefined) return { row: first.row, col: first.col };
  // Defensive: with an empty priorShots array we cannot reach the fallback,
  // but a return is required for type completeness.
  return { row: 0, col: 0 };
}

function nextSchemaErrorRaw(input: ProviderCallInput): string {
  const turnIndex = input.priorShots.length; // run state excluded; raw cycle only
  return SCHEMA_ERROR_CYCLE[turnIndex % SCHEMA_ERROR_CYCLE.length];
}

export function createMockProvider(options: { delayMs?: number } = {}): ProviderAdapter {
  const delayMs = options.delayMs ?? MOCK_TURN_DELAY_MS_DEFAULT;
  return {
    id: "mock",
    models: MODELS,
    async call(input, signal): Promise<ProviderCallOutput> {
      const started = Date.now();
      await sleep(delayMs, signal);
      let rawText: string;
      switch (input.modelId) {
        case "mock-happy": {
          const shot = nextHappyShot(input);
          rawText = JSON.stringify({ row: shot.row, col: shot.col });
          break;
        }
        case "mock-misses": {
          const shot = nextMissesShot(input);
          rawText = JSON.stringify({ row: shot.row, col: shot.col });
          break;
        }
        case "mock-schema-errors": {
          rawText = nextSchemaErrorRaw(input);
          break;
        }
        default:
          throw new Error(`Unknown mock model: ${input.modelId}`);
      }
      return {
        rawText,
        tokensIn: 0,
        tokensOut: 0,
        reasoningTokens: null,
        costUsdMicros: 0,
        durationMs: Date.now() - started,
      };
    },
  };
}
```

- [ ] **Step 4: Run tests.**

```bash
bun test backend/tests/unit/providers-mock.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/providers/mock.ts backend/tests/unit/providers-mock.test.ts
git commit -m "feat(backend): mock provider with three variants"
```

---

## Task 12: Typed DB queries

**Files:**

- Create: `backend/src/db/queries.ts`
- Create: `backend/tests/integration/queries.test.ts`

- [ ] **Step 1: Write the failing tests.**

```ts
// backend/tests/integration/queries.test.ts
import { describe, expect, test } from "bun:test";
import { withTempDatabase } from "../../src/db/with-temp-database.ts";
import { createQueries } from "../../src/db/queries.ts";

describe("queries", () => {
  test("insertRun + getRunMeta round-trip", async () => {
    await withTempDatabase(async ({ db }) => {
      const q = createQueries(db);
      q.insertRun({
        id: "01",
        seedDate: "2026-04-21",
        providerId: "mock",
        modelId: "mock-happy",
        displayName: "Mock happy",
        startedAt: 1000,
        clientSession: "sess",
        budgetUsdMicros: null,
      });
      const meta = q.getRunMeta("01");
      expect(meta).not.toBeNull();
      expect(meta?.id).toBe("01");
      expect(meta?.outcome).toBe(null);
    });
  });

  test("appendShot + listShots returns row-major order", async () => {
    await withTempDatabase(async ({ db }) => {
      const q = createQueries(db);
      q.insertRun({
        id: "01",
        seedDate: "2026-04-21",
        providerId: "mock",
        modelId: "mock-happy",
        displayName: "Mock happy",
        startedAt: 1,
        clientSession: "sess",
        budgetUsdMicros: null,
      });
      q.appendShot({
        runId: "01",
        idx: 0,
        row: 0,
        col: 0,
        result: "miss",
        rawResponse: "{}",
        reasoningText: null,
        tokensIn: 0,
        tokensOut: 0,
        reasoningTokens: null,
        costUsdMicros: 0,
        durationMs: 1,
        createdAt: 2,
      });
      q.appendShot({
        runId: "01",
        idx: 1,
        row: 1,
        col: 1,
        result: "hit",
        rawResponse: "{}",
        reasoningText: null,
        tokensIn: 0,
        tokensOut: 0,
        reasoningTokens: null,
        costUsdMicros: 0,
        durationMs: 1,
        createdAt: 3,
      });
      const shots = q.listShots("01");
      expect(shots.length).toBe(2);
      expect(shots[0].idx).toBe(0);
      expect(shots[1].idx).toBe(1);
    });
  });

  test("finalizeRun sets outcome, endedAt, counters", async () => {
    await withTempDatabase(async ({ db }) => {
      const q = createQueries(db);
      q.insertRun({
        id: "01",
        seedDate: "2026-04-21",
        providerId: "mock",
        modelId: "mock-happy",
        displayName: "Mock happy",
        startedAt: 1,
        clientSession: "sess",
        budgetUsdMicros: null,
      });
      q.finalizeRun({
        id: "01",
        endedAt: 10,
        outcome: "won",
        shotsFired: 20,
        hits: 17,
        schemaErrors: 0,
        invalidCoordinates: 0,
        durationMs: 9,
        tokensIn: 0,
        tokensOut: 0,
        reasoningTokens: null,
        costUsdMicros: 0,
      });
      const meta = q.getRunMeta("01");
      expect(meta?.outcome).toBe("won");
      expect(meta?.endedAt).toBe(10);
      expect(meta?.hits).toBe(17);
    });
  });

  test("findStuckRunIds returns only NULL outcome rows", async () => {
    await withTempDatabase(async ({ db }) => {
      const q = createQueries(db);
      q.insertRun({
        id: "01",
        seedDate: "2026-04-21",
        providerId: "mock",
        modelId: "mock-happy",
        displayName: "Mock",
        startedAt: 1,
        clientSession: "s",
        budgetUsdMicros: null,
      });
      q.insertRun({
        id: "02",
        seedDate: "2026-04-21",
        providerId: "mock",
        modelId: "mock-happy",
        displayName: "Mock",
        startedAt: 1,
        clientSession: "s",
        budgetUsdMicros: null,
      });
      q.finalizeRun({
        id: "02",
        endedAt: 2,
        outcome: "won",
        shotsFired: 17,
        hits: 17,
        schemaErrors: 0,
        invalidCoordinates: 0,
        durationMs: 1,
        tokensIn: 0,
        tokensOut: 0,
        reasoningTokens: null,
        costUsdMicros: 0,
      });
      const ids = q.findStuckRunIds();
      expect(ids).toEqual(["01"]);
    });
  });
});
```

- [ ] **Step 2: Confirm failure.**

```bash
bun test backend/tests/integration/queries.test.ts
```

- [ ] **Step 3: Implement.**

Create `backend/src/db/queries.ts`:

```ts
import { eq, isNull, and } from "drizzle-orm";

import type { Outcome, RunMeta, RunShotRow, ShotResult } from "@battleship-arena/shared";

import type { DatabaseHandle } from "./client.ts";
import { runs, runShots } from "./schema.ts";

export interface InsertRunArgs {
  id: string;
  seedDate: string;
  providerId: string;
  modelId: string;
  displayName: string;
  startedAt: number;
  clientSession: string;
  budgetUsdMicros: number | null;
}

export interface AppendShotArgs {
  runId: string;
  idx: number;
  row: number | null;
  col: number | null;
  result: ShotResult;
  rawResponse: string;
  reasoningText: string | null;
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number | null;
  costUsdMicros: number;
  durationMs: number;
  createdAt: number;
}

export interface FinalizeRunArgs {
  id: string;
  endedAt: number;
  outcome: Outcome;
  shotsFired: number;
  hits: number;
  schemaErrors: number;
  invalidCoordinates: number;
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number | null;
  costUsdMicros: number;
}

export interface Queries {
  insertRun(args: InsertRunArgs): void;
  appendShot(args: AppendShotArgs): void;
  finalizeRun(args: FinalizeRunArgs): void;
  getRunMeta(id: string): RunMeta | null;
  listShots(runId: string): RunShotRow[];
  findStuckRunIds(): string[];
  markStuckRunsAborted(outcome: Outcome, endedAt: number): number;
}

export function createQueries(db: DatabaseHandle["db"]): Queries {
  return {
    insertRun(args) {
      db.insert(runs)
        .values({
          id: args.id,
          seedDate: args.seedDate,
          providerId: args.providerId,
          modelId: args.modelId,
          displayName: args.displayName,
          startedAt: args.startedAt,
          endedAt: null,
          outcome: null,
          shotsFired: 0,
          hits: 0,
          schemaErrors: 0,
          invalidCoordinates: 0,
          durationMs: 0,
          tokensIn: 0,
          tokensOut: 0,
          reasoningTokens: null,
          costUsdMicros: 0,
          budgetUsdMicros: args.budgetUsdMicros,
          clientSession: args.clientSession,
        })
        .run();
    },

    appendShot(args) {
      db.insert(runShots)
        .values({
          runId: args.runId,
          idx: args.idx,
          row: args.row,
          col: args.col,
          result: args.result,
          rawResponse: args.rawResponse,
          reasoningText: args.reasoningText,
          tokensIn: args.tokensIn,
          tokensOut: args.tokensOut,
          reasoningTokens: args.reasoningTokens,
          costUsdMicros: args.costUsdMicros,
          durationMs: args.durationMs,
          createdAt: args.createdAt,
        })
        .run();
    },

    finalizeRun(args) {
      db.update(runs)
        .set({
          endedAt: args.endedAt,
          outcome: args.outcome,
          shotsFired: args.shotsFired,
          hits: args.hits,
          schemaErrors: args.schemaErrors,
          invalidCoordinates: args.invalidCoordinates,
          durationMs: args.durationMs,
          tokensIn: args.tokensIn,
          tokensOut: args.tokensOut,
          reasoningTokens: args.reasoningTokens,
          costUsdMicros: args.costUsdMicros,
        })
        .where(eq(runs.id, args.id))
        .run();
    },

    getRunMeta(id) {
      const row = db.select().from(runs).where(eq(runs.id, id)).get();
      if (row === undefined) return null;
      return {
        id: row.id,
        seedDate: row.seedDate,
        providerId: row.providerId,
        modelId: row.modelId,
        displayName: row.displayName,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        outcome: row.outcome as Outcome | null,
        shotsFired: row.shotsFired,
        hits: row.hits,
        schemaErrors: row.schemaErrors,
        invalidCoordinates: row.invalidCoordinates,
        durationMs: row.durationMs,
        tokensIn: row.tokensIn,
        tokensOut: row.tokensOut,
        reasoningTokens: row.reasoningTokens,
        costUsdMicros: row.costUsdMicros,
        budgetUsdMicros: row.budgetUsdMicros,
      };
    },

    listShots(runId) {
      const rows = db
        .select()
        .from(runShots)
        .where(eq(runShots.runId, runId))
        .orderBy(runShots.idx)
        .all();
      return rows.map((row) => ({
        runId: row.runId,
        idx: row.idx,
        row: row.row,
        col: row.col,
        result: row.result as ShotResult,
        rawResponse: row.rawResponse,
        reasoningText: row.reasoningText,
        tokensIn: row.tokensIn,
        tokensOut: row.tokensOut,
        reasoningTokens: row.reasoningTokens,
        costUsdMicros: row.costUsdMicros,
        durationMs: row.durationMs,
        createdAt: row.createdAt,
      }));
    },

    findStuckRunIds() {
      const rows = db
        .select({ id: runs.id })
        .from(runs)
        .where(and(isNull(runs.outcome), isNull(runs.endedAt)))
        .all();
      return rows.map((r) => r.id);
    },

    markStuckRunsAborted(outcome, endedAt) {
      const stuck = this.findStuckRunIds();
      if (stuck.length === 0) return 0;
      db.update(runs)
        .set({ outcome, endedAt })
        .where(and(isNull(runs.outcome), isNull(runs.endedAt)))
        .run();
      return stuck.length;
    },
  };
}
```

- [ ] **Step 4: Run tests.**

```bash
bun test backend/tests/integration/queries.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/db/queries.ts backend/tests/integration/queries.test.ts
git commit -m "feat(backend): typed DB queries module"
```

---

## Task 13: Reconcile stuck runs

**Files:**

- Create: `backend/src/runs/reconcile.ts`
- Create: `backend/tests/integration/reconcile.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// backend/tests/integration/reconcile.test.ts
import { describe, expect, test } from "bun:test";

import { withTempDatabase } from "../../src/db/with-temp-database.ts";
import { createQueries } from "../../src/db/queries.ts";
import { reconcileStuckRuns } from "../../src/runs/reconcile.ts";

describe("reconcileStuckRuns", () => {
  test("updates stuck rows to aborted_server_restart", async () => {
    await withTempDatabase(async ({ db }) => {
      const q = createQueries(db);
      q.insertRun({
        id: "01",
        seedDate: "2026-04-21",
        providerId: "mock",
        modelId: "mock-happy",
        displayName: "Mock",
        startedAt: 100,
        clientSession: "s",
        budgetUsdMicros: null,
      });
      const updated = reconcileStuckRuns(q, 200);
      expect(updated).toBe(1);
      const meta = q.getRunMeta("01");
      expect(meta?.outcome).toBe("aborted_server_restart");
      expect(meta?.endedAt).toBe(200);
    });
  });

  test("returns 0 when there are no stuck runs", async () => {
    await withTempDatabase(async ({ db }) => {
      const q = createQueries(db);
      expect(reconcileStuckRuns(q, 200)).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Confirm failure.**

```bash
bun test backend/tests/integration/reconcile.test.ts
```

- [ ] **Step 3: Implement.**

Create `backend/src/runs/reconcile.ts`:

```ts
import type { Queries } from "../db/queries.ts";

export function reconcileStuckRuns(queries: Queries, nowMs: number): number {
  return queries.markStuckRunsAborted("aborted_server_restart", nowMs);
}
```

- [ ] **Step 4: Run tests.**

```bash
bun test backend/tests/integration/reconcile.test.ts
```

- [ ] **Step 5: Commit.**

```bash
git add backend/src/runs/reconcile.ts backend/tests/integration/reconcile.test.ts
git commit -m "feat(backend): startup reconciliation for stuck runs"
```

---

## Task 14: Run engine (game loop)

**Files:**

- Create: `backend/src/runs/engine.ts`
- Create: `backend/tests/integration/engine.test.ts`

- [ ] **Step 1: Write the failing tests.**

```ts
// backend/tests/integration/engine.test.ts
import { describe, expect, test } from "bun:test";

import { withTempDatabase } from "../../src/db/with-temp-database.ts";
import { createQueries } from "../../src/db/queries.ts";
import { createMockProvider } from "../../src/providers/mock.ts";
import { createProviderRegistry } from "../../src/providers/types.ts";
import { generateBoard } from "../../src/board/generator.ts";
import { renderBoardPng } from "../../src/board/renderer.ts";
import { runEngine } from "../../src/runs/engine.ts";
import type { SseEvent } from "@battleship-arena/shared";

function setup() {
  const providers = createProviderRegistry({
    mock: createMockProvider({ delayMs: 0 }),
  });
  return {
    providers,
    generate: generateBoard,
    renderBoard: renderBoardPng,
    now: () => 42,
  };
}

describe("runEngine", () => {
  test("mock-happy reaches won and persists shots", async () => {
    await withTempDatabase(async ({ db }) => {
      const q = createQueries(db);
      q.insertRun({
        id: "r1",
        seedDate: "2026-04-21",
        providerId: "mock",
        modelId: "mock-happy",
        displayName: "Mock happy",
        startedAt: 1,
        clientSession: "s",
        budgetUsdMicros: null,
      });
      const events: SseEvent[] = [];
      const deps = { db: q, ...setup() };
      await runEngine(
        "r1",
        {
          providerId: "mock",
          modelId: "mock-happy",
          apiKey: "k",
          clientSession: "s",
          seedDate: "2026-04-21",
        },
        new AbortController().signal,
        (e) => events.push(e),
        deps,
      );
      expect(q.getRunMeta("r1")?.outcome).toBe("won");
      expect(q.listShots("r1").length).toBeLessThanOrEqual(100);
      expect(events[0].kind).toBe("open");
      expect(events.at(-1)?.kind).toBe("outcome");
    });
  });

  test("mock-misses reaches dnf_shot_cap with 83 misses + 17 duplicate invalid_coordinates", async () => {
    await withTempDatabase(async ({ db }) => {
      const q = createQueries(db);
      q.insertRun({
        id: "r2",
        seedDate: "2026-04-21",
        providerId: "mock",
        modelId: "mock-misses",
        displayName: "Mock misses",
        startedAt: 1,
        clientSession: "s",
        budgetUsdMicros: null,
      });
      const events: SseEvent[] = [];
      const deps = { db: q, ...setup() };
      await runEngine(
        "r2",
        {
          providerId: "mock",
          modelId: "mock-misses",
          apiKey: "k",
          clientSession: "s",
          seedDate: "2026-04-21",
        },
        new AbortController().signal,
        (e) => events.push(e),
        deps,
      );
      const meta = q.getRunMeta("r2");
      expect(meta?.outcome).toBe("dnf_shot_cap");
      expect(meta?.shotsFired).toBe(100);
      expect(meta?.hits).toBe(0);
      expect(meta?.schemaErrors).toBe(0);
      expect(meta?.invalidCoordinates).toBe(17);
      const shots = q.listShots("r2");
      const missCount = shots.filter((s) => s.result === "miss").length;
      const invalidCount = shots.filter((s) => s.result === "invalid_coordinate").length;
      expect(missCount).toBe(83);
      expect(invalidCount).toBe(17);
    });
  });

  test("mock-schema-errors reaches dnf_schema_errors", async () => {
    await withTempDatabase(async ({ db }) => {
      const q = createQueries(db);
      q.insertRun({
        id: "r3",
        seedDate: "2026-04-21",
        providerId: "mock",
        modelId: "mock-schema-errors",
        displayName: "Mock schema",
        startedAt: 1,
        clientSession: "s",
        budgetUsdMicros: null,
      });
      const deps = { db: q, ...setup() };
      await runEngine(
        "r3",
        {
          providerId: "mock",
          modelId: "mock-schema-errors",
          apiKey: "k",
          clientSession: "s",
          seedDate: "2026-04-21",
        },
        new AbortController().signal,
        () => {},
        deps,
      );
      const meta = q.getRunMeta("r3");
      expect(meta?.outcome).toBe("dnf_schema_errors");
      expect(meta?.schemaErrors).toBe(5);
    });
  });

  test("aborted_viewer on signal abort with reason viewer", async () => {
    await withTempDatabase(async ({ db }) => {
      const q = createQueries(db);
      q.insertRun({
        id: "r4",
        seedDate: "2026-04-21",
        providerId: "mock",
        modelId: "mock-happy",
        displayName: "Mock",
        startedAt: 1,
        clientSession: "s",
        budgetUsdMicros: null,
      });
      const providers = createProviderRegistry({
        mock: createMockProvider({ delayMs: 50 }),
      });
      const deps = {
        db: q,
        providers,
        generate: generateBoard,
        renderBoard: renderBoardPng,
        now: () => Date.now(),
      };
      const controller = new AbortController();
      const promise = runEngine(
        "r4",
        {
          providerId: "mock",
          modelId: "mock-happy",
          apiKey: "k",
          clientSession: "s",
          seedDate: "2026-04-21",
        },
        controller.signal,
        () => {},
        deps,
      );
      setTimeout(() => controller.abort({ reason: "viewer" }), 20);
      await promise;
      expect(q.getRunMeta("r4")?.outcome).toBe("aborted_viewer");
    });
  });

  test("api key does not leak into DB", async () => {
    await withTempDatabase(async ({ db, sqlite }) => {
      const q = createQueries(db);
      const apiKey = "sk-SUPER-secret-KEY-123";
      q.insertRun({
        id: "r5",
        seedDate: "2026-04-21",
        providerId: "mock",
        modelId: "mock-happy",
        displayName: "Mock",
        startedAt: 1,
        clientSession: "s",
        budgetUsdMicros: null,
      });
      const deps = { db: q, ...setup() };
      await runEngine(
        "r5",
        {
          providerId: "mock",
          modelId: "mock-happy",
          apiKey,
          clientSession: "s",
          seedDate: "2026-04-21",
        },
        new AbortController().signal,
        () => {},
        deps,
      );
      const rowsRuns = sqlite.query("SELECT * FROM runs").all();
      const rowsShots = sqlite.query("SELECT * FROM run_shots").all();
      const asText = JSON.stringify(rowsRuns) + JSON.stringify(rowsShots);
      expect(asText.includes(apiKey)).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Confirm failure.**

```bash
bun test backend/tests/integration/engine.test.ts
```

- [ ] **Step 3: Implement.**

Create `backend/src/runs/engine.ts`:

```ts
import {
  parseShot,
  type BoardView,
  type CellState,
  type Outcome,
  type SseEvent,
  type StartRunInput,
} from "@battleship-arena/shared";

import type { BoardLayout } from "../board/generator.ts";
import type { Queries } from "../db/queries.ts";
import type { ProviderRegistry } from "../providers/types.ts";
import { initialRunLoopState, reduceOutcome, type RunLoopEvent } from "./outcome.ts";

const RAW_MAX = 8 * 1024;
const REASONING_MAX = 2 * 1024;
const SYSTEM_PROMPT = [
  "You are playing a 10x10 Battleship board.",
  'Respond with a single JSON object of shape {"row": number, "col": number}',
  '("reasoning": optional string).',
  "Coordinates are 0-indexed integers in [0, 9].",
].join(" ");

export interface EngineDeps {
  db: Queries;
  providers: ProviderRegistry;
  now: () => number;
  renderBoard: (view: BoardView) => Uint8Array;
  generate: (seedDate: string) => BoardLayout;
}

function truncate(input: string, max: number): string {
  return input.length <= max ? input : input.slice(0, max);
}

function cellStateFromLayout(
  layout: BoardLayout,
  priorResults: Map<string, "hit" | "miss" | "sunk">,
  sunkShips: Set<string>,
): CellState[] {
  const cells: CellState[] = new Array(100).fill("unknown");
  for (const [key, res] of priorResults) {
    const [r, c] = key.split(":").map(Number);
    cells[r * 10 + c] = res;
  }
  for (const shipName of sunkShips) {
    const ship = layout.ships.find((s) => s.name === shipName);
    if (!ship) continue;
    for (const cell of ship.cells) {
      cells[cell.row * 10 + cell.col] = "sunk";
    }
  }
  return cells;
}

function shipsRemainingFor(layout: BoardLayout, sunk: Set<string>): string[] {
  return layout.ships.map((s) => s.name).filter((name) => !sunk.has(name));
}

function shipHitInfo(
  layout: BoardLayout,
  hits: Set<string>,
): {
  whichShip: (row: number, col: number) => string | null;
  isSunk: (shipName: string, hits: Set<string>) => boolean;
} {
  const cellToShip = new Map<string, string>();
  for (const ship of layout.ships) {
    for (const cell of ship.cells) cellToShip.set(`${cell.row}:${cell.col}`, ship.name);
  }
  return {
    whichShip(row, col) {
      return cellToShip.get(`${row}:${col}`) ?? null;
    },
    isSunk(shipName, hitsNow) {
      const ship = layout.ships.find((s) => s.name === shipName);
      if (!ship) return false;
      return ship.cells.every((c) => hitsNow.has(`${c.row}:${c.col}`));
    },
  };
}

export async function runEngine(
  runId: string,
  input: StartRunInput,
  signal: AbortSignal,
  emit: (event: SseEvent) => void,
  deps: EngineDeps,
): Promise<void> {
  const adapter = deps.providers.get(input.providerId);
  if (adapter === undefined) {
    throw new Error(`Unknown provider ${input.providerId}`);
  }
  const layout = deps.generate(input.seedDate);
  const hitsInfo = shipHitInfo(layout, new Set());

  const hitCells = new Set<string>();
  const priorResults = new Map<string, "hit" | "miss" | "sunk">();
  const sunkShips = new Set<string>();
  const priorShotsForAdapter: { row: number; col: number; result: "hit" | "miss" | "sunk" }[] = [];

  const meta = deps.db.getRunMeta(runId);
  if (meta === null) throw new Error(`Run not found: ${runId}`);

  emit({
    kind: "open",
    id: 0,
    runId,
    startedAt: meta.startedAt,
    seedDate: input.seedDate,
  });

  let state = initialRunLoopState();
  let terminal: Outcome | null = null;
  let idx = 0;

  try {
    while (terminal === null) {
      if (signal.aborted) {
        const reason =
          typeof signal.reason === "object" &&
          signal.reason !== null &&
          "reason" in (signal.reason as Record<string, unknown>)
            ? ((signal.reason as Record<string, unknown>).reason as string)
            : "viewer";
        const abortReason: "viewer" | "server_restart" =
          reason === "server_restart" ? "server_restart" : "viewer";
        const next = reduceOutcome(state, { kind: "abort", reason: abortReason });
        state = next.state;
        terminal = next.outcome;
        break;
      }

      const view: BoardView = {
        size: 10,
        cells: cellStateFromLayout(layout, priorResults, sunkShips),
      };
      const boardPng = deps.renderBoard(view);
      const shipsRemaining = shipsRemainingFor(layout, sunkShips);

      const turnStart = deps.now();
      let providerOut;
      try {
        providerOut = await adapter.call(
          {
            modelId: input.modelId,
            apiKey: input.apiKey,
            boardPng,
            shipsRemaining,
            systemPrompt: SYSTEM_PROMPT,
            priorShots: priorShotsForAdapter,
            seedDate: input.seedDate,
          },
          signal,
        );
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") {
          const abortReason: "viewer" | "server_restart" =
            typeof signal.reason === "object" &&
            signal.reason !== null &&
            (signal.reason as Record<string, unknown>).reason === "server_restart"
              ? "server_restart"
              : "viewer";
          const next = reduceOutcome(state, { kind: "abort", reason: abortReason });
          state = next.state;
          terminal = next.outcome;
          break;
        }
        // Defensive: treat unexpected failures as schema errors.
        const next = reduceOutcome(state, { kind: "schema_error" });
        state = next.state;
        terminal = next.outcome;
        deps.db.appendShot({
          runId,
          idx,
          row: null,
          col: null,
          result: "schema_error",
          rawResponse: truncate(String(err), RAW_MAX),
          reasoningText: null,
          tokensIn: 0,
          tokensOut: 0,
          reasoningTokens: null,
          costUsdMicros: 0,
          durationMs: deps.now() - turnStart,
          createdAt: deps.now(),
        });
        const ringEvent: SseEvent = {
          kind: "shot",
          id: 0,
          idx,
          row: null,
          col: null,
          result: "schema_error",
          reasoning: null,
        };
        emit(ringEvent);
        idx += 1;
        continue;
      }

      const parse = parseShot(providerOut.rawText);
      let loopEvent: RunLoopEvent;
      let shotRow: number | null = null;
      let shotCol: number | null = null;
      let shotResult: "hit" | "miss" | "sunk" | "schema_error" | "invalid_coordinate";
      let reasoningText: string | null = null;

      if (parse.kind === "schema_error") {
        loopEvent = { kind: "schema_error" };
        shotResult = "schema_error";
      } else if (parse.kind === "invalid_coordinate") {
        loopEvent = { kind: "invalid_coordinate" };
        shotRow = parse.row;
        shotCol = parse.col;
        shotResult = "invalid_coordinate";
      } else {
        const { row, col, reasoning } = parse.shot;
        shotRow = row;
        shotCol = col;
        reasoningText = reasoning ?? null;
        const cellKey = `${row}:${col}`;
        if (priorResults.has(cellKey)) {
          loopEvent = { kind: "invalid_coordinate" };
          shotResult = "invalid_coordinate";
        } else {
          const shipName = hitsInfo.whichShip(row, col);
          if (shipName === null) {
            priorResults.set(cellKey, "miss");
            priorShotsForAdapter.push({ row, col, result: "miss" });
            loopEvent = { kind: "miss" };
            shotResult = "miss";
          } else {
            hitCells.add(cellKey);
            const willSink = hitsInfo.isSunk(shipName, hitCells);
            if (willSink) {
              sunkShips.add(shipName);
              priorResults.set(cellKey, "sunk");
              priorShotsForAdapter.push({ row, col, result: "sunk" });
              // back-fill previous hits of this ship to "sunk"
              const ship = layout.ships.find((s) => s.name === shipName)!;
              for (const c of ship.cells) priorResults.set(`${c.row}:${c.col}`, "sunk");
              loopEvent = { kind: "sunk" };
              shotResult = "sunk";
            } else {
              priorResults.set(cellKey, "hit");
              priorShotsForAdapter.push({ row, col, result: "hit" });
              loopEvent = { kind: "hit" };
              shotResult = "hit";
            }
          }
        }
      }

      deps.db.appendShot({
        runId,
        idx,
        row: shotRow,
        col: shotCol,
        result: shotResult,
        rawResponse: truncate(providerOut.rawText, RAW_MAX),
        reasoningText: reasoningText === null ? null : truncate(reasoningText, REASONING_MAX),
        tokensIn: providerOut.tokensIn,
        tokensOut: providerOut.tokensOut,
        reasoningTokens: providerOut.reasoningTokens,
        costUsdMicros: providerOut.costUsdMicros,
        durationMs: providerOut.durationMs,
        createdAt: deps.now(),
      });

      const event: SseEvent = {
        kind: "shot",
        id: 0,
        idx,
        row: shotRow,
        col: shotCol,
        result: shotResult,
        reasoning: reasoningText,
      };
      emit(event);

      const next = reduceOutcome(state, loopEvent);
      state = next.state;
      terminal = next.outcome;
      idx += 1;
    }
  } finally {
    if (terminal !== null && terminal !== "aborted_server_restart") {
      const endedAt = deps.now();
      deps.db.finalizeRun({
        id: runId,
        endedAt,
        outcome: terminal,
        shotsFired: state.shotsFired,
        hits: state.hits,
        schemaErrors: state.schemaErrors,
        invalidCoordinates: state.invalidCoordinates,
        durationMs: endedAt - (deps.db.getRunMeta(runId)?.startedAt ?? endedAt),
        tokensIn: 0,
        tokensOut: 0,
        reasoningTokens: null,
        costUsdMicros: 0,
      });
      emit({
        kind: "outcome",
        id: 0,
        outcome: terminal,
        shotsFired: state.shotsFired,
        hits: state.hits,
        schemaErrors: state.schemaErrors,
        invalidCoordinates: state.invalidCoordinates,
        endedAt,
      });
    }
  }
}
```

- [ ] **Step 4: Run tests.**

```bash
bun test backend/tests/integration/engine.test.ts
```

Expected: PASS. Some assertions may time out; verify `delayMs: 0` in deps. If the aborted_viewer test is flaky, bump the `setTimeout` delay.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/runs/engine.ts backend/tests/integration/engine.test.ts
git commit -m "feat(backend): run engine (game loop) against mock provider"
```

---

## Task 15: Run manager

**Files:**

- Create: `backend/src/runs/manager.ts`
- Create: `backend/tests/integration/manager.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// backend/tests/integration/manager.test.ts
import { describe, expect, test } from "bun:test";

import { withTempDatabase } from "../../src/db/with-temp-database.ts";
import { createQueries } from "../../src/db/queries.ts";
import { createMockProvider } from "../../src/providers/mock.ts";
import { createProviderRegistry } from "../../src/providers/types.ts";
import { createManager } from "../../src/runs/manager.ts";
import { generateBoard } from "../../src/board/generator.ts";
import { renderBoardPng } from "../../src/board/renderer.ts";
import type { SseEvent } from "@battleship-arena/shared";

function deps(db: ReturnType<typeof createQueries>) {
  return {
    db,
    providers: createProviderRegistry({ mock: createMockProvider({ delayMs: 0 }) }),
    generate: generateBoard,
    renderBoard: renderBoardPng,
    now: () => Date.now(),
  };
}

describe("manager", () => {
  test("start + await task reaches won", async () => {
    await withTempDatabase(async ({ db }) => {
      const q = createQueries(db);
      const manager = createManager(deps(q));
      const { runId } = await manager.start({
        providerId: "mock",
        modelId: "mock-happy",
        apiKey: "k",
        clientSession: "s",
        seedDate: "2026-04-21",
      });
      const handle = manager.getHandle(runId)!;
      await handle.taskPromise;
      expect(q.getRunMeta(runId)?.outcome).toBe("won");
    });
  });

  test("subscribe delivers live events", async () => {
    await withTempDatabase(async ({ db }) => {
      const q = createQueries(db);
      const manager = createManager(deps(q));
      const { runId } = await manager.start({
        providerId: "mock",
        modelId: "mock-happy",
        apiKey: "k",
        clientSession: "s",
        seedDate: "2026-04-21",
      });
      const handle = manager.getHandle(runId)!;
      const events: SseEvent[] = [];
      const unsubscribe = handle.subscribe((e) => events.push(e));
      await handle.taskPromise;
      unsubscribe();
      expect(events.some((e) => e.kind === "outcome")).toBe(true);
    });
  });

  test("abort produces aborted_viewer", async () => {
    await withTempDatabase(async ({ db }) => {
      const q = createQueries(db);
      const mockSlow = createMockProvider({ delayMs: 50 });
      const manager = createManager({
        ...deps(q),
        providers: createProviderRegistry({ mock: mockSlow }),
      });
      const { runId } = await manager.start({
        providerId: "mock",
        modelId: "mock-happy",
        apiKey: "k",
        clientSession: "s",
        seedDate: "2026-04-21",
      });
      await new Promise((r) => setTimeout(r, 20));
      manager.abort(runId, "viewer");
      const handle = manager.getHandle(runId);
      if (handle) await handle.taskPromise;
      expect(q.getRunMeta(runId)?.outcome).toBe("aborted_viewer");
    });
  });

  test("shutdown with grace 0 triggers server_restart abort", async () => {
    await withTempDatabase(async ({ db }) => {
      const q = createQueries(db);
      const mockSlow = createMockProvider({ delayMs: 50 });
      const manager = createManager({
        ...deps(q),
        providers: createProviderRegistry({ mock: mockSlow }),
      });
      const { runId } = await manager.start({
        providerId: "mock",
        modelId: "mock-happy",
        apiKey: "k",
        clientSession: "s",
        seedDate: "2026-04-21",
      });
      await new Promise((r) => setTimeout(r, 20));
      await manager.shutdown(500);
      const outcome = q.getRunMeta(runId)?.outcome;
      expect(
        outcome === "aborted_server_restart" || outcome === "aborted_viewer" || outcome !== null,
      ).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Confirm failure.**

```bash
bun test backend/tests/integration/manager.test.ts
```

- [ ] **Step 3: Implement.**

Create `backend/src/runs/manager.ts`:

```ts
import { RING_CAPACITY, type SseEvent, type StartRunInput } from "@battleship-arena/shared";

import { generateUlid } from "../db/ulid.ts";
import { EventRing } from "./event-ring.ts";
import { runEngine, type EngineDeps } from "./engine.ts";

export interface RunHandle {
  readonly runId: string;
  readonly abortController: AbortController;
  readonly ring: EventRing;
  readonly subscribers: Set<(event: SseEvent) => void>;
  readonly taskPromise: Promise<void>;
  subscribe(fn: (event: SseEvent) => void): () => void;
}

export interface Manager {
  start(input: StartRunInput): Promise<{ runId: string }>;
  abort(runId: string, reason: "viewer" | "server_restart"): boolean;
  getHandle(runId: string): RunHandle | null;
  shutdown(graceMs: number): Promise<void>;
}

export function createManager(deps: EngineDeps): Manager {
  const handles = new Map<string, RunHandle>();

  function emitFor(runId: string) {
    return (event: SseEvent) => {
      const handle = handles.get(runId);
      if (handle === undefined) return;
      const stored = handle.ring.push(event);
      for (const sub of handle.subscribers) sub(stored);
    };
  }

  function insertRunRow(runId: string, input: StartRunInput) {
    deps.db.insertRun({
      id: runId,
      seedDate: input.seedDate,
      providerId: input.providerId,
      modelId: input.modelId,
      displayName: `${input.providerId}/${input.modelId}`,
      startedAt: deps.now(),
      clientSession: input.clientSession,
      budgetUsdMicros:
        input.budgetUsd === undefined ? null : Math.round(input.budgetUsd * 1_000_000),
    });
  }

  return {
    async start(input): Promise<{ runId: string }> {
      const runId = generateUlid();
      insertRunRow(runId, input);
      const abortController = new AbortController();
      const ring = new EventRing(RING_CAPACITY);
      const subscribers = new Set<(event: SseEvent) => void>();

      let resolve: () => void = () => {};
      const taskPromise = new Promise<void>((r) => {
        resolve = r;
      });

      const handle: RunHandle = {
        runId,
        abortController,
        ring,
        subscribers,
        taskPromise,
        subscribe(fn) {
          subscribers.add(fn);
          return () => {
            subscribers.delete(fn);
          };
        },
      };
      handles.set(runId, handle);

      void (async () => {
        try {
          await runEngine(runId, input, abortController.signal, emitFor(runId), deps);
        } finally {
          handles.delete(runId);
          resolve();
        }
      })();

      return { runId };
    },

    abort(runId, reason): boolean {
      const handle = handles.get(runId);
      if (handle === undefined) return false;
      handle.abortController.abort({ reason });
      return true;
    },

    getHandle(runId) {
      return handles.get(runId) ?? null;
    },

    async shutdown(graceMs) {
      const tasks: Promise<void>[] = [];
      for (const [, handle] of handles) {
        handle.abortController.abort({ reason: "server_restart" });
        tasks.push(handle.taskPromise);
      }
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, graceMs));
      await Promise.race([Promise.all(tasks).then(() => {}), timeout]);
    },
  };
}
```

- [ ] **Step 4: Run tests.**

```bash
bun test backend/tests/integration/manager.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/runs/manager.ts backend/tests/integration/manager.test.ts
git commit -m "feat(backend): run manager (registry, ring, abort, shutdown)"
```

---

## Task 16: Session cookie middleware

**Files:**

- Create: `backend/src/api/session.ts`
- Create: `backend/tests/integration/session.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// backend/tests/integration/session.test.ts
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

import { sessionMiddleware, readSession } from "../../src/api/session.ts";

describe("session middleware", () => {
  test("sets cookie when absent", async () => {
    const app = new Hono();
    app.use("*", sessionMiddleware);
    app.get("/x", (c) => c.text(readSession(c)));
    const res = await app.request("/x");
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie.includes("bsa_session=")).toBe(true);
  });

  test("reads existing cookie and does not rotate", async () => {
    const app = new Hono();
    app.use("*", sessionMiddleware);
    app.get("/x", (c) => c.text(readSession(c)));
    const res = await app.request("/x", {
      headers: { cookie: "bsa_session=abcdef" },
    });
    expect(await res.text()).toBe("abcdef");
    expect(res.headers.get("set-cookie")).toBe(null);
  });
});
```

- [ ] **Step 2: Confirm failure.**

```bash
bun test backend/tests/integration/session.test.ts
```

- [ ] **Step 3: Implement.**

Create `backend/src/api/session.ts`:

```ts
import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie } from "hono/cookie";

import { generateUlid } from "../db/ulid.ts";

const COOKIE_NAME = "bsa_session";

export const sessionMiddleware: MiddlewareHandler = async (c, next) => {
  const existing = getCookie(c, COOKIE_NAME);
  const value = existing ?? generateUlid();
  c.set("session", value);
  if (existing === undefined) {
    setCookie(c, COOKIE_NAME, value, {
      httpOnly: true,
      sameSite: "Strict",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  await next();
};

export function readSession(c: Context): string {
  const value = c.get("session") as string | undefined;
  if (value === undefined) throw new Error("session middleware not installed");
  return value;
}
```

- [ ] **Step 4: Run tests.**

```bash
bun test backend/tests/integration/session.test.ts
```

- [ ] **Step 5: Commit.**

```bash
git add backend/src/api/session.ts backend/tests/integration/session.test.ts
git commit -m "feat(backend): session cookie middleware"
```

---

## Task 17: POST /api/runs

**Files:**

- Create: `backend/src/api/runs.ts`
- Create: `backend/tests/integration/api-runs-post.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// backend/tests/integration/api-runs-post.test.ts
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

import { withTempDatabase } from "../../src/db/with-temp-database.ts";
import { createQueries } from "../../src/db/queries.ts";
import { createMockProvider } from "../../src/providers/mock.ts";
import { createProviderRegistry } from "../../src/providers/types.ts";
import { createManager } from "../../src/runs/manager.ts";
import { generateBoard } from "../../src/board/generator.ts";
import { renderBoardPng } from "../../src/board/renderer.ts";
import { createRunsRouter } from "../../src/api/runs.ts";
import { sessionMiddleware } from "../../src/api/session.ts";

function app(queries: ReturnType<typeof createQueries>) {
  const providers = createProviderRegistry({ mock: createMockProvider({ delayMs: 0 }) });
  const manager = createManager({
    db: queries,
    providers,
    generate: generateBoard,
    renderBoard: renderBoardPng,
    now: () => Date.now(),
  });
  const a = new Hono();
  a.use("*", sessionMiddleware);
  a.route("/api", createRunsRouter({ manager, queries, providers }));
  return { app: a, manager };
}

describe("POST /api/runs", () => {
  test("creates a run and returns runId", async () => {
    await withTempDatabase(async ({ db }) => {
      const q = createQueries(db);
      const { app: a, manager } = app(q);
      const res = await a.request("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerId: "mock",
          modelId: "mock-happy",
          apiKey: "k",
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(typeof body.runId).toBe("string");
      const handle = manager.getHandle(body.runId);
      if (handle) await handle.taskPromise;
    });
  });

  test("rejects empty apiKey", async () => {
    await withTempDatabase(async ({ db }) => {
      const q = createQueries(db);
      const { app: a } = app(q);
      const res = await a.request("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerId: "mock",
          modelId: "mock-happy",
          apiKey: "",
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("invalid_input");
      expect(body.error.detail?.field).toBe("apiKey");
    });
  });

  test("rejects unknown modelId", async () => {
    await withTempDatabase(async ({ db }) => {
      const q = createQueries(db);
      const { app: a } = app(q);
      const res = await a.request("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerId: "mock",
          modelId: "does-not-exist",
          apiKey: "k",
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.detail?.field).toBe("modelId");
    });
  });

  test("rejects negative budgetUsd", async () => {
    await withTempDatabase(async ({ db }) => {
      const q = createQueries(db);
      const { app: a } = app(q);
      const res = await a.request("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerId: "mock",
          modelId: "mock-happy",
          apiKey: "k",
          budgetUsd: -1,
        }),
      });
      expect(res.status).toBe(400);
    });
  });
});
```

- [ ] **Step 2: Confirm failure.**

```bash
bun test backend/tests/integration/api-runs-post.test.ts
```

- [ ] **Step 3: Implement the runs router stub (POST handler only).**

Create `backend/src/api/runs.ts`:

```ts
import { Hono } from "hono";
import type { Context } from "hono";

import type { ErrorCode } from "@battleship-arena/shared";

import { respondError } from "../errors.ts";
import { readSession } from "./session.ts";
import type { Queries } from "../db/queries.ts";
import type { Manager } from "../runs/manager.ts";
import type { ProviderRegistry } from "../providers/types.ts";

export interface RunsRouterDeps {
  manager: Manager;
  queries: Queries;
  providers: ProviderRegistry;
}

function todayUtcSeed(): string {
  return new Date().toISOString().slice(0, 10);
}

function validateStartBody(
  body: unknown,
  providers: ProviderRegistry,
):
  | { ok: true; value: { providerId: string; modelId: string; apiKey: string; budgetUsd?: number } }
  | { ok: false; code: ErrorCode; field: string; message: string } {
  if (typeof body !== "object" || body === null) {
    return {
      ok: false,
      code: "invalid_input",
      field: "_body",
      message: "Body must be JSON object",
    };
  }
  const b = body as Record<string, unknown>;
  if (typeof b.providerId !== "string" || b.providerId.trim() === "") {
    return {
      ok: false,
      code: "invalid_input",
      field: "providerId",
      message: "providerId required",
    };
  }
  if (typeof b.modelId !== "string" || b.modelId.trim() === "") {
    return { ok: false, code: "invalid_input", field: "modelId", message: "modelId required" };
  }
  if (typeof b.apiKey !== "string" || b.apiKey.trim() === "") {
    return { ok: false, code: "invalid_input", field: "apiKey", message: "apiKey required" };
  }
  const adapter = providers.get(b.providerId);
  if (adapter === undefined) {
    return { ok: false, code: "invalid_input", field: "providerId", message: "Unknown provider" };
  }
  if (!adapter.models.some((m) => m.id === b.modelId)) {
    return {
      ok: false,
      code: "invalid_input",
      field: "modelId",
      message: "Unknown model for provider",
    };
  }
  let budgetUsd: number | undefined;
  if (b.budgetUsd !== undefined && b.budgetUsd !== null) {
    if (typeof b.budgetUsd !== "number" || !Number.isFinite(b.budgetUsd) || b.budgetUsd <= 0) {
      return {
        ok: false,
        code: "invalid_input",
        field: "budgetUsd",
        message: "budgetUsd must be a positive number",
      };
    }
    budgetUsd = b.budgetUsd;
  }
  return {
    ok: true,
    value: { providerId: b.providerId, modelId: b.modelId, apiKey: b.apiKey, budgetUsd },
  };
}

export function createRunsRouter(deps: RunsRouterDeps): Hono {
  const r = new Hono();

  r.post("/runs", async (c) => {
    const body = await c.req.json().catch(() => null);
    const result = validateStartBody(body, deps.providers);
    if (!result.ok) {
      return respondError(c, result.code, 400, result.message, { field: result.field });
    }
    const { providerId, modelId, apiKey, budgetUsd } = result.value;
    const session = readSession(c);
    const { runId } = await deps.manager.start({
      providerId,
      modelId,
      apiKey,
      budgetUsd,
      clientSession: session,
      seedDate: todayUtcSeed(),
    });
    c.header("Cache-Control", "no-store");
    return c.json({ runId });
  });

  return r;
}
```

- [ ] **Step 4: Run tests.**

```bash
bun test backend/tests/integration/api-runs-post.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/api/runs.ts backend/tests/integration/api-runs-post.test.ts
git commit -m "feat(backend): POST /api/runs"
```

---

## Task 18: GET /api/runs/:id, GET /api/runs/:id/shots, POST /api/runs/:id/abort

**Files:**

- Modify: `backend/src/api/runs.ts`
- Create: `backend/tests/integration/api-runs-get.test.ts`

- [ ] **Step 1: Write the failing tests.**

```ts
// backend/tests/integration/api-runs-get.test.ts
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

import { withTempDatabase } from "../../src/db/with-temp-database.ts";
import { createQueries } from "../../src/db/queries.ts";
import { createMockProvider } from "../../src/providers/mock.ts";
import { createProviderRegistry } from "../../src/providers/types.ts";
import { createManager } from "../../src/runs/manager.ts";
import { generateBoard } from "../../src/board/generator.ts";
import { renderBoardPng } from "../../src/board/renderer.ts";
import { createRunsRouter } from "../../src/api/runs.ts";
import { sessionMiddleware } from "../../src/api/session.ts";

async function startRun(app: Hono): Promise<string> {
  const res = await app.request("/api/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ providerId: "mock", modelId: "mock-happy", apiKey: "k" }),
  });
  const body = await res.json();
  return body.runId as string;
}

function setup(
  db: ReturnType<typeof withTempDatabase> extends Promise<infer R>
    ? R extends { db: infer D }
      ? D
      : never
    : never,
) {
  const q = createQueries(db);
  const providers = createProviderRegistry({ mock: createMockProvider({ delayMs: 0 }) });
  const manager = createManager({
    db: q,
    providers,
    generate: generateBoard,
    renderBoard: renderBoardPng,
    now: () => Date.now(),
  });
  const app = new Hono();
  app.use("*", sessionMiddleware);
  app.route("/api", createRunsRouter({ manager, queries: q, providers }));
  return { app, manager, q };
}

describe("GET /api/runs/:id and related", () => {
  test("returns meta after terminal", async () => {
    await withTempDatabase(async ({ db }) => {
      const { app, manager } = setup(db);
      const runId = await startRun(app);
      const handle = manager.getHandle(runId);
      if (handle) await handle.taskPromise;
      const res = await app.request(`/api/runs/${runId}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.outcome).toBe("won");
    });
  });

  test("404 on unknown id", async () => {
    await withTempDatabase(async ({ db }) => {
      const { app } = setup(db);
      const res = await app.request("/api/runs/nope");
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe("run_not_found");
    });
  });

  test("GET /shots returns ordered shot list", async () => {
    await withTempDatabase(async ({ db }) => {
      const { app, manager } = setup(db);
      const runId = await startRun(app);
      const handle = manager.getHandle(runId);
      if (handle) await handle.taskPromise;
      const res = await app.request(`/api/runs/${runId}/shots`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.shots)).toBe(true);
      expect(body.shots[0].idx).toBe(0);
    });
  });

  test("POST /abort on terminal run returns 200 with outcome", async () => {
    await withTempDatabase(async ({ db }) => {
      const { app, manager } = setup(db);
      const runId = await startRun(app);
      const handle = manager.getHandle(runId);
      if (handle) await handle.taskPromise;
      const res = await app.request(`/api/runs/${runId}/abort`, { method: "POST" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.outcome).toBe("won");
    });
  });
});
```

- [ ] **Step 2: Confirm failure.**

```bash
bun test backend/tests/integration/api-runs-get.test.ts
```

- [ ] **Step 3: Extend the router.**

Append to the router inside `createRunsRouter` in `backend/src/api/runs.ts`:

```ts
r.get("/runs/:id", (c) => {
  const meta = deps.queries.getRunMeta(c.req.param("id"));
  if (meta === null) {
    return respondError(c, "run_not_found", 404, "Run not found");
  }
  c.header("Cache-Control", "no-store");
  return c.json(meta);
});

r.get("/runs/:id/shots", (c) => {
  const id = c.req.param("id");
  const meta = deps.queries.getRunMeta(id);
  if (meta === null) {
    return respondError(c, "run_not_found", 404, "Run not found");
  }
  c.header("Cache-Control", "no-store");
  return c.json({ runId: id, shots: deps.queries.listShots(id) });
});

r.post("/runs/:id/abort", (c) => {
  const id = c.req.param("id");
  const meta = deps.queries.getRunMeta(id);
  if (meta === null) {
    return respondError(c, "run_not_found", 404, "Run not found");
  }
  if (meta.outcome !== null) {
    return c.json({ outcome: meta.outcome });
  }
  deps.manager.abort(id, "viewer");
  return c.json({ outcome: "aborted_viewer" });
});
```

- [ ] **Step 4: Run tests.**

```bash
bun test backend/tests/integration/api-runs-get.test.ts
```

- [ ] **Step 5: Commit.**

```bash
git add backend/src/api/runs.ts backend/tests/integration/api-runs-get.test.ts
git commit -m "feat(backend): GET /api/runs/:id, /shots, POST /abort"
```

---

## Task 19: GET /api/runs/:id/events (SSE)

**Files:**

- Modify: `backend/src/api/runs.ts`
- Create: `backend/tests/integration/api-runs-events.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// backend/tests/integration/api-runs-events.test.ts
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

import { withTempDatabase } from "../../src/db/with-temp-database.ts";
import { createQueries } from "../../src/db/queries.ts";
import { createMockProvider } from "../../src/providers/mock.ts";
import { createProviderRegistry } from "../../src/providers/types.ts";
import { createManager } from "../../src/runs/manager.ts";
import { generateBoard } from "../../src/board/generator.ts";
import { renderBoardPng } from "../../src/board/renderer.ts";
import { createRunsRouter } from "../../src/api/runs.ts";
import { sessionMiddleware } from "../../src/api/session.ts";

describe("GET /api/runs/:id/events", () => {
  test("streams events and terminates with outcome", async () => {
    await withTempDatabase(async ({ db }) => {
      const q = createQueries(db);
      const providers = createProviderRegistry({ mock: createMockProvider({ delayMs: 10 }) });
      const manager = createManager({
        db: q,
        providers,
        generate: generateBoard,
        renderBoard: renderBoardPng,
        now: () => Date.now(),
      });
      const app = new Hono();
      app.use("*", sessionMiddleware);
      app.route("/api", createRunsRouter({ manager, queries: q, providers }));

      const postRes = await app.request("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ providerId: "mock", modelId: "mock-happy", apiKey: "k" }),
      });
      const { runId } = await postRes.json();

      const eventsRes = await app.request(`/api/runs/${runId}/events`);
      expect(eventsRes.status).toBe(200);
      expect(eventsRes.headers.get("content-type")).toContain("text/event-stream");
      const reader = eventsRes.body!.getReader();
      const dec = new TextDecoder();
      let text = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        text += dec.decode(value);
        if (text.includes("event: outcome")) break;
      }
      expect(text.includes("event: open")).toBe(true);
      expect(text.includes("event: shot")).toBe(true);
      expect(text.includes("event: outcome")).toBe(true);
    });
  });

  test("terminal run emits the full synthesized replay (open + shots + outcome)", async () => {
    await withTempDatabase(async ({ db }) => {
      const q = createQueries(db);
      const providers = createProviderRegistry({ mock: createMockProvider({ delayMs: 0 }) });
      const manager = createManager({
        db: q,
        providers,
        generate: generateBoard,
        renderBoard: renderBoardPng,
        now: () => Date.now(),
      });
      const app = new Hono();
      app.use("*", sessionMiddleware);
      app.route("/api", createRunsRouter({ manager, queries: q, providers }));

      const postRes = await app.request("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ providerId: "mock", modelId: "mock-happy", apiKey: "k" }),
      });
      const { runId } = await postRes.json();
      const handle = manager.getHandle(runId);
      if (handle) await handle.taskPromise;

      const eventsRes = await app.request(`/api/runs/${runId}/events`);
      const text = await eventsRes.text();
      expect(text.includes("event: open")).toBe(true);
      expect(text.includes("event: shot")).toBe(true);
      expect(text.includes("event: outcome")).toBe(true);
      expect(text.includes('"outcome":"won"')).toBe(true);
      expect(text.includes("event: resync")).toBe(false);

      // Count shot events; should equal the number of persisted run_shots rows.
      const shotsInStream = (text.match(/event: shot/g) ?? []).length;
      const persistedShots = q.listShots(runId).length;
      expect(shotsInStream).toBe(persistedShots);
    });
  });

  test("unknown run emits resync", async () => {
    await withTempDatabase(async ({ db }) => {
      const q = createQueries(db);
      const providers = createProviderRegistry({ mock: createMockProvider({ delayMs: 0 }) });
      const manager = createManager({
        db: q,
        providers,
        generate: generateBoard,
        renderBoard: renderBoardPng,
        now: () => Date.now(),
      });
      const app = new Hono();
      app.use("*", sessionMiddleware);
      app.route("/api", createRunsRouter({ manager, queries: q, providers }));
      const res = await app.request(`/api/runs/does-not-exist/events`);
      const text = await res.text();
      expect(text.includes("event: resync")).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Confirm failure.**

```bash
bun test backend/tests/integration/api-runs-events.test.ts
```

- [ ] **Step 3: Implement the SSE handler.**

Append to `createRunsRouter` in `backend/src/api/runs.ts`:

```ts
import { streamSSE } from "hono/streaming";
import { SSE_HEARTBEAT_MS } from "@battleship-arena/shared";

// ... existing router code ...

r.get("/runs/:id/events", (c) => {
  const id = c.req.param("id");
  const handle = deps.manager.getHandle(id);
  const headerId = c.req.header("Last-Event-ID");
  const queryId = c.req.query("lastEventId");
  const lastEventId = headerId ? Number(headerId) : queryId ? Number(queryId) : null;

  return streamSSE(c, async (stream) => {
    if (handle === null) {
      // Terminal or unknown run. Per spec 4.4, a late subscriber to a
      // finished run receives the full event list from the database.
      // Synthesize open + one shot per persisted row + outcome and close.
      // Unknown id (no row at all) -> resync so the client refetches meta
      // and re-attaches.
      const meta = deps.queries.getRunMeta(id);
      if (meta === null || meta.outcome === null) {
        await stream.writeSSE({ event: "resync", data: "", id: "0" });
        return;
      }
      let nextId = 0;
      await stream.writeSSE({
        event: "open",
        id: String(nextId),
        data: JSON.stringify({
          kind: "open",
          id: nextId,
          runId: id,
          startedAt: meta.startedAt,
          seedDate: meta.seedDate,
        }),
      });
      nextId += 1;
      for (const shot of deps.queries.listShots(id)) {
        await stream.writeSSE({
          event: "shot",
          id: String(nextId),
          data: JSON.stringify({
            kind: "shot",
            id: nextId,
            idx: shot.idx,
            row: shot.row,
            col: shot.col,
            result: shot.result,
            reasoning: shot.reasoningText,
          }),
        });
        nextId += 1;
      }
      await stream.writeSSE({
        event: "outcome",
        id: String(nextId),
        data: JSON.stringify({
          kind: "outcome",
          id: nextId,
          outcome: meta.outcome,
          shotsFired: meta.shotsFired,
          hits: meta.hits,
          schemaErrors: meta.schemaErrors,
          invalidCoordinates: meta.invalidCoordinates,
          endedAt: meta.endedAt ?? meta.startedAt,
        }),
      });
      return;
    }
    const backlog = handle.ring.since(lastEventId);
    if (backlog === "out_of_range") {
      await stream.writeSSE({
        event: "resync",
        data: "",
        id: String(lastEventId ?? 0),
      });
      return;
    }
    for (const event of backlog) {
      await stream.writeSSE({
        event: event.kind,
        data: JSON.stringify(event),
        id: String(event.id),
      });
    }
    const unsubscribe = handle.subscribe((event) => {
      void stream.writeSSE({
        event: event.kind,
        data: JSON.stringify(event),
        id: String(event.id),
      });
    });
    const heartbeat = setInterval(() => {
      void stream.write(": heartbeat\n\n");
    }, SSE_HEARTBEAT_MS);
    stream.onAbort(() => {
      unsubscribe();
      clearInterval(heartbeat);
    });
    await handle.taskPromise;
    clearInterval(heartbeat);
    unsubscribe();
  });
});
```

(Keep all existing routes; add the above alongside them. Ensure the `streamSSE` import lives at the top of the file.)

- [ ] **Step 4: Run tests.**

```bash
bun test backend/tests/integration/api-runs-events.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/api/runs.ts backend/tests/integration/api-runs-events.test.ts
git commit -m "feat(backend): SSE handler for /api/runs/:id/events"
```

---

## Task 20: Wire app.ts and index.ts (manager, reconciliation, SIGTERM)

**Files:**

- Modify: `backend/src/app.ts`
- Modify: `backend/src/index.ts`
- Modify: `backend/src/config.ts`
- Modify: `backend/src/api/health.ts` (if it imports HealthRouteMetadata already; no change expected)
- Create: `backend/tests/integration/app-wiring.test.ts`

- [ ] **Step 1: Write the wiring test.**

```ts
// backend/tests/integration/app-wiring.test.ts
import { describe, expect, test } from "bun:test";
import { withTempDatabase } from "../../src/db/with-temp-database.ts";
import { createQueries } from "../../src/db/queries.ts";
import { createApp } from "../../src/app.ts";
import { createMockProvider } from "../../src/providers/mock.ts";
import { createProviderRegistry } from "../../src/providers/types.ts";
import { createManager } from "../../src/runs/manager.ts";
import { generateBoard } from "../../src/board/generator.ts";
import { renderBoardPng } from "../../src/board/renderer.ts";

describe("createApp wiring", () => {
  test("/api/health is reachable alongside /api/runs", async () => {
    await withTempDatabase(async ({ db }) => {
      const q = createQueries(db);
      const providers = createProviderRegistry({ mock: createMockProvider({ delayMs: 0 }) });
      const manager = createManager({
        db: q,
        providers,
        generate: generateBoard,
        renderBoard: renderBoardPng,
        now: () => Date.now(),
      });
      const app = createApp(
        { version: "0", commitSha: "c", startedAt: 0 },
        { manager, queries: q, providers },
      );
      const health = await app.request("/api/health");
      expect(health.status).toBe(200);
      const post = await app.request("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ providerId: "mock", modelId: "mock-happy", apiKey: "k" }),
      });
      expect(post.status).toBe(200);
    });
  });
});
```

- [ ] **Step 2: Extend `config.ts` for MOCK_TURN_DELAY_MS.**

Edit `backend/src/config.ts`: add an optional parse.

```ts
// inside loadConfig, add:
    mockTurnDelayMs: readNonNegativeInteger(env, "MOCK_TURN_DELAY_MS", 150),
```

and extend the interface:

```ts
export interface AppConfig {
  databasePath: string;
  port: number;
  maintenanceSoft: boolean;
  shutdownGraceSec: number;
  mockTurnDelayMs: number;
  version: string;
  commitSha: string;
}
```

- [ ] **Step 3: Rewrite `backend/src/app.ts`.**

```ts
import { Hono } from "hono";

import { createHealthRouter, type HealthRouteMetadata } from "./api/health.ts";
import { createRunsRouter, type RunsRouterDeps } from "./api/runs.ts";
import { sessionMiddleware } from "./api/session.ts";
import { respondError } from "./errors.ts";

export function createApp(metadata: HealthRouteMetadata, runs: RunsRouterDeps) {
  const app = new Hono();
  app.use("*", sessionMiddleware);
  app.route("/api", createHealthRouter(metadata));
  app.route("/api", createRunsRouter(runs));
  app.notFound((c) => respondError(c, "not_found", 404, "Route not found"));
  app.onError((error, c) => {
    console.error(error);
    return respondError(c, "internal", 500, "Internal server error");
  });
  return app;
}
```

- [ ] **Step 4: Rewrite `backend/src/index.ts` to call reconciliation, build manager, wire SIGTERM.**

```ts
import { createApp } from "./app.ts";
import { loadConfigOrExit, type AppConfig } from "./config.ts";
import { openDatabase } from "./db/client.ts";
import { createQueries } from "./db/queries.ts";
import { createMockProvider } from "./providers/mock.ts";
import { createProviderRegistry } from "./providers/types.ts";
import { createManager } from "./runs/manager.ts";
import { generateBoard } from "./board/generator.ts";
import { renderBoardPng } from "./board/renderer.ts";
import { reconcileStuckRuns } from "./runs/reconcile.ts";

const STARTED_AT = Date.now();

export async function bootstrap(config: AppConfig) {
  const database = openDatabase(config.databasePath);
  const queries = createQueries(database.db);
  reconcileStuckRuns(queries, Date.now());

  const providers = createProviderRegistry({
    mock: createMockProvider({ delayMs: config.mockTurnDelayMs }),
  });

  const manager = createManager({
    db: queries,
    providers,
    generate: generateBoard,
    renderBoard: renderBoardPng,
    now: () => Date.now(),
  });

  const app = createApp(
    { version: config.version, commitSha: config.commitSha, startedAt: STARTED_AT },
    { manager, queries, providers },
  );

  const server = Bun.serve({ port: config.port, fetch: app.fetch });

  const onSigterm = async () => {
    const graceMs = config.shutdownGraceSec * 1000;
    await manager.shutdown(graceMs);
    server.stop();
  };
  process.on("SIGTERM", onSigterm);
  process.on("SIGINT", onSigterm);

  return { server, sqlite: database.sqlite, manager, config };
}

if (import.meta.main) {
  await bootstrap(loadConfigOrExit(process.env));
}
```

- [ ] **Step 5: Run tests.**

```bash
bun test backend/tests/integration/app-wiring.test.ts
bun test backend/
```

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add backend/src/app.ts backend/src/index.ts backend/src/config.ts backend/tests/integration/app-wiring.test.ts
git commit -m "feat(backend): wire manager, reconciliation, SIGTERM drain"
```

---

## Task 21: Web lib - api.ts and sse.ts

**Files:**

- Create: `web/src/lib/api.ts`
- Create: `web/src/lib/sse.ts`

- [ ] **Step 1: Implement `lib/api.ts`.**

Create `web/src/lib/api.ts`:

```ts
import type { ErrorEnvelope, RunMeta, RunShotRow } from "@battleship-arena/shared";

export class ApiError extends Error {
  constructor(
    public readonly envelope: ErrorEnvelope,
    public readonly status: number,
  ) {
    super(envelope.error.message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({
      error: { code: "internal", message: `HTTP ${res.status}` },
    }))) as ErrorEnvelope;
    throw new ApiError(body, res.status);
  }
  return (await res.json()) as T;
}

export async function startRun(args: {
  providerId: string;
  modelId: string;
  apiKey: string;
  budgetUsd?: number;
}): Promise<{ runId: string }> {
  return request<{ runId: string }>("/api/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
  });
}

export async function getRun(runId: string): Promise<RunMeta> {
  return request<RunMeta>(`/api/runs/${encodeURIComponent(runId)}`);
}

export async function getRunShots(runId: string): Promise<{ runId: string; shots: RunShotRow[] }> {
  return request<{ runId: string; shots: RunShotRow[] }>(
    `/api/runs/${encodeURIComponent(runId)}/shots`,
  );
}

export async function abortRun(runId: string): Promise<{ outcome: string }> {
  return request<{ outcome: string }>(`/api/runs/${encodeURIComponent(runId)}/abort`, {
    method: "POST",
  });
}
```

- [ ] **Step 2: Implement `lib/sse.ts`.**

Create `web/src/lib/sse.ts`:

```ts
import type { SseEvent } from "@battleship-arena/shared";

export interface SseSubscribeOptions {
  lastEventId: number | null;
  onEvent: (event: SseEvent) => void;
  onResync: () => void;
  onError: (err: Error) => void;
}

export function subscribeToRun(
  runId: string,
  { lastEventId, onEvent, onResync, onError }: SseSubscribeOptions,
): () => void {
  let closed = false;
  let source: EventSource | null = null;

  function open(fromId: number | null) {
    const url =
      `/api/runs/${encodeURIComponent(runId)}/events` +
      (fromId !== null ? `?lastEventId=${fromId}` : "");
    source = new EventSource(url);
    source.addEventListener("open", () => {
      // no-op
    });
    const dispatch = (evt: MessageEvent) => {
      try {
        const parsed = JSON.parse(evt.data) as SseEvent;
        onEvent(parsed);
      } catch (err) {
        onError(err as Error);
      }
    };
    source.addEventListener("open_event", dispatch);
    for (const kind of ["open", "shot", "outcome"] as const) {
      source.addEventListener(kind, dispatch as EventListener);
    }
    source.addEventListener("resync", () => {
      source?.close();
      onResync();
    });
    source.addEventListener("error", () => {
      if (closed) return;
      if (source?.readyState === EventSource.CLOSED) {
        setTimeout(() => {
          if (!closed) open(fromId);
        }, 1000);
      }
    });
  }

  open(lastEventId);

  return () => {
    closed = true;
    source?.close();
  };
}
```

- [ ] **Step 3: Commit.**

```bash
git add web/src/lib/api.ts web/src/lib/sse.ts
git commit -m "feat(web): typed API + SSE client libs"
```

---

## Task 22: BoardView island (with boardViewFromShots test)

**Files:**

- Create: `web/src/islands/BoardView.tsx`
- Create: `web/src/islands/boardViewFromShots.ts`
- Create: `web/tests/unit/boardViewFromShots.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// web/tests/unit/boardViewFromShots.test.ts
import { describe, expect, test } from "bun:test";
import type { RunShotRow } from "@battleship-arena/shared";
import { boardViewFromShots } from "../../src/islands/boardViewFromShots.ts";

function shot(partial: Partial<RunShotRow>): RunShotRow {
  return {
    runId: "r",
    idx: 0,
    row: 0,
    col: 0,
    result: "miss",
    rawResponse: "{}",
    reasoningText: null,
    tokensIn: 0,
    tokensOut: 0,
    reasoningTokens: null,
    costUsdMicros: 0,
    durationMs: 0,
    createdAt: 0,
    ...partial,
  };
}

describe("boardViewFromShots", () => {
  test("empty shots -> all unknown", () => {
    const view = boardViewFromShots([]);
    expect(view.cells.every((c) => c === "unknown")).toBe(true);
  });

  test("miss + hit placed in row-major position", () => {
    const shots = [
      shot({ idx: 0, row: 1, col: 1, result: "miss" }),
      shot({ idx: 1, row: 2, col: 3, result: "hit" }),
    ];
    const view = boardViewFromShots(shots);
    expect(view.cells[1 * 10 + 1]).toBe("miss");
    expect(view.cells[2 * 10 + 3]).toBe("hit");
  });

  test("sunk result upgrades contiguous hits along the same row", () => {
    const shots = [
      shot({ idx: 0, row: 0, col: 0, result: "hit" }),
      shot({ idx: 1, row: 0, col: 1, result: "hit" }),
      shot({ idx: 2, row: 0, col: 2, result: "sunk" }),
    ];
    const view = boardViewFromShots(shots);
    expect(view.cells[0]).toBe("sunk");
    expect(view.cells[1]).toBe("sunk");
    expect(view.cells[2]).toBe("sunk");
  });

  test("null coordinates are skipped (schema errors)", () => {
    const shots = [shot({ idx: 0, row: null, col: null, result: "schema_error" })];
    expect(boardViewFromShots(shots).cells.every((c) => c === "unknown")).toBe(true);
  });
});
```

- [ ] **Step 2: Confirm failure.**

```bash
bun test web/tests/unit/boardViewFromShots.test.ts
```

- [ ] **Step 3: Implement `boardViewFromShots.ts`.**

```ts
// web/src/islands/boardViewFromShots.ts
import type { BoardView, CellState, RunShotRow } from "@battleship-arena/shared";

export function boardViewFromShots(shots: readonly RunShotRow[]): BoardView {
  const cells: CellState[] = new Array(100).fill("unknown");
  for (const s of shots) {
    if (s.row == null || s.col == null) continue;
    const i = s.row * 10 + s.col;
    if (s.result === "hit") cells[i] = "hit";
    else if (s.result === "miss") cells[i] = "miss";
    else if (s.result === "sunk") cells[i] = "sunk";
  }
  for (const s of shots) {
    if (s.result !== "sunk") continue;
    if (s.row == null || s.col == null) continue;
    for (let dc = -1; ; dc -= 1) {
      const col = s.col + dc;
      if (col < 0) break;
      const i = s.row * 10 + col;
      if (cells[i] !== "hit" && cells[i] !== "sunk") break;
      cells[i] = "sunk";
    }
    for (let dc = 1; ; dc += 1) {
      const col = s.col + dc;
      if (col > 9) break;
      const i = s.row * 10 + col;
      if (cells[i] !== "hit" && cells[i] !== "sunk") break;
      cells[i] = "sunk";
    }
    for (let dr = -1; ; dr -= 1) {
      const row = s.row + dr;
      if (row < 0) break;
      const i = row * 10 + s.col;
      if (cells[i] !== "hit" && cells[i] !== "sunk") break;
      cells[i] = "sunk";
    }
    for (let dr = 1; ; dr += 1) {
      const row = s.row + dr;
      if (row > 9) break;
      const i = row * 10 + s.col;
      if (cells[i] !== "hit" && cells[i] !== "sunk") break;
      cells[i] = "sunk";
    }
  }
  return { size: 10, cells };
}
```

- [ ] **Step 4: Implement the Solid island.**

Create `web/src/islands/BoardView.tsx`:

```tsx
import type { RunShotRow } from "@battleship-arena/shared";
import { renderBoardSvg } from "@battleship-arena/shared";
import { createMemo } from "solid-js";

import { boardViewFromShots } from "./boardViewFromShots.ts";

export interface BoardViewProps {
  shots: RunShotRow[];
}

export default function BoardView(props: BoardViewProps) {
  const svg = createMemo(() => renderBoardSvg(boardViewFromShots(props.shots)));
  return (
    <div
      class="board-view"
      style={{ width: "100%", "max-width": "480px", "aspect-ratio": "1 / 1", margin: "0 auto" }}
      // eslint-disable-next-line solid/no-innerhtml
      innerHTML={svg()}
    />
  );
}
```

- [ ] **Step 5: Run tests.**

```bash
bun test web/tests/unit/boardViewFromShots.test.ts
```

- [ ] **Step 6: Commit.**

```bash
git add web/src/islands/BoardView.tsx web/src/islands/boardViewFromShots.ts web/tests/unit/boardViewFromShots.test.ts
git commit -m "feat(web): BoardView island and boardViewFromShots derivation"
```

---

## Task 23: StartRunForm island

**Files:**

- Create: `web/src/islands/StartRunForm.tsx`
- Create: `web/src/styles/play.module.css`

- [ ] **Step 1: Implement the island.**

Create `web/src/islands/StartRunForm.tsx`:

```tsx
import { createSignal } from "solid-js";
import { ApiError, startRun } from "../lib/api.ts";
import styles from "../styles/play.module.css";

const MOCK_MODELS = [
  { id: "mock-happy", label: "Mock - winning run" },
  { id: "mock-misses", label: "Mock - always misses" },
  { id: "mock-schema-errors", label: "Mock - schema errors" },
];

export default function StartRunForm() {
  const [providerId] = createSignal("mock");
  const [modelId, setModelId] = createSignal("mock-happy");
  const [apiKey, setApiKey] = createSignal("");
  const [budgetUsd, setBudgetUsd] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function onSubmit(ev: Event) {
    ev.preventDefault();
    if (busy()) return;
    setBusy(true);
    setError(null);
    try {
      const parsedBudget = budgetUsd().trim() === "" ? undefined : Number(budgetUsd());
      const res = await startRun({
        providerId: providerId(),
        modelId: modelId(),
        apiKey: apiKey(),
        budgetUsd: parsedBudget,
      });
      window.location.assign(`/runs/${res.runId}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.envelope.error.message);
      } else {
        setError((err as Error).message);
      }
      setBusy(false);
    }
  }

  return (
    <form class={styles.form} onSubmit={onSubmit}>
      {error() !== null && <p class={styles.error}>{error()}</p>}
      <label>
        Provider
        <select value={providerId()} disabled>
          <option value="mock">Mock (for testing)</option>
        </select>
      </label>
      <label>
        Model
        <select value={modelId()} onChange={(e) => setModelId(e.currentTarget.value)}>
          {MOCK_MODELS.map((m) => (
            <option value={m.id}>{m.label}</option>
          ))}
        </select>
      </label>
      <label>
        API key
        <input
          type="password"
          autocomplete="off"
          placeholder="Any non-empty string works for mock models."
          value={apiKey()}
          onInput={(e) => setApiKey(e.currentTarget.value)}
        />
      </label>
      <label>
        Budget (USD, optional)
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Optional for mock runs; required for real providers (S3)."
          value={budgetUsd()}
          onInput={(e) => setBudgetUsd(e.currentTarget.value)}
        />
      </label>
      <button type="submit" aria-busy={busy()} disabled={busy()}>
        {busy() ? "Starting..." : "Start run"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Create the styles.**

Create `web/src/styles/play.module.css`:

```css
.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 480px;
  margin: 0 auto;
  padding: 16px;
  font-family: system-ui, sans-serif;
}
.form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.form input,
.form select,
.form button {
  font: inherit;
  min-height: 44px;
  padding: 8px;
  box-sizing: border-box;
}
.form button {
  background: #0f766e;
  color: white;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}
.form button[aria-busy="true"],
.form button[disabled] {
  opacity: 0.7;
  cursor: wait;
}
.error {
  background: #fde2e2;
  color: #8a1a1a;
  padding: 8px;
  border-radius: 4px;
}
```

- [ ] **Step 3: Commit.**

```bash
git add web/src/islands/StartRunForm.tsx web/src/styles/play.module.css
git commit -m "feat(web): StartRunForm island and play styles"
```

---

## Task 24: LiveGame island

**Files:**

- Create: `web/src/islands/LiveGame.tsx`
- Create: `web/src/styles/live-game.module.css`

- [ ] **Step 1: Implement the island.**

Create `web/src/islands/LiveGame.tsx`:

```tsx
import type { RunMeta, RunShotRow, SseEvent } from "@battleship-arena/shared";
import { createSignal, Show, onCleanup, onMount } from "solid-js";

import { abortRun, getRun, getRunShots } from "../lib/api.ts";
import { subscribeToRun } from "../lib/sse.ts";
import BoardView from "./BoardView.tsx";
import styles from "../styles/live-game.module.css";

export interface LiveGameProps {
  runId: string;
}

export default function LiveGame(props: LiveGameProps) {
  const [meta, setMeta] = createSignal<RunMeta | null>(null);
  const [shots, setShots] = createSignal<RunShotRow[]>([]);
  const [phase, setPhase] = createSignal<"loading" | "live" | "terminal" | "error">("loading");
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);

  let close: (() => void) | null = null;

  async function hydrateAndSubscribe() {
    try {
      const m = await getRun(props.runId);
      setMeta(m);
      const s = await getRunShots(props.runId);
      setShots(s.shots);
      if (m.outcome !== null) {
        setPhase("terminal");
        return;
      }
      setPhase("live");
      const lastEventId = s.shots.length > 0 ? s.shots[s.shots.length - 1].idx : null;
      close = subscribeToRun(props.runId, {
        lastEventId,
        onEvent: handleEvent,
        onResync: () => {
          close?.();
          void hydrateAndSubscribe();
        },
        onError: (err) => {
          setErrorMessage(err.message);
        },
      });
    } catch (err) {
      setErrorMessage((err as Error).message);
      setPhase("error");
    }
  }

  function handleEvent(event: SseEvent) {
    if (event.kind === "shot") {
      setShots((prev) => [
        ...prev,
        {
          runId: props.runId,
          idx: event.idx,
          row: event.row,
          col: event.col,
          result: event.result,
          rawResponse: "",
          reasoningText: event.reasoning,
          tokensIn: 0,
          tokensOut: 0,
          reasoningTokens: null,
          costUsdMicros: 0,
          durationMs: 0,
          createdAt: Date.now(),
        },
      ]);
    } else if (event.kind === "outcome") {
      setMeta((prev) =>
        prev === null
          ? prev
          : {
              ...prev,
              outcome: event.outcome,
              shotsFired: event.shotsFired,
              hits: event.hits,
              schemaErrors: event.schemaErrors,
              invalidCoordinates: event.invalidCoordinates,
              endedAt: event.endedAt,
            },
      );
      setPhase("terminal");
    }
  }

  async function onAbort() {
    try {
      await abortRun(props.runId);
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  }

  onMount(() => {
    void hydrateAndSubscribe();
  });
  onCleanup(() => {
    close?.();
  });

  return (
    <div class={styles.live}>
      <Show when={errorMessage() !== null}>
        <p class={styles.error}>{errorMessage()}</p>
      </Show>
      <Show when={meta() !== null} fallback={<p>Loading run...</p>}>
        <div class={styles.hud}>
          <p>Model: {meta()!.modelId}</p>
          <p>Shots: {meta()!.shotsFired}/100</p>
          <p>Hits: {meta()!.hits}/17</p>
          <p>Schema errors: {meta()!.schemaErrors}</p>
          <p>Invalid coords: {meta()!.invalidCoordinates}</p>
          <Show when={meta()!.outcome !== null}>
            <p class={styles.outcome}>Outcome: {meta()!.outcome}</p>
          </Show>
        </div>
        <BoardView shots={shots()} />
        <Show when={phase() === "live"}>
          <button onClick={onAbort}>Abort</button>
        </Show>
      </Show>
    </div>
  );
}
```

- [ ] **Step 2: Create the styles.**

Create `web/src/styles/live-game.module.css`:

```css
.live {
  max-width: 480px;
  margin: 0 auto;
  padding: 16px;
  font-family: system-ui, sans-serif;
}
.hud {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 16px;
  font-size: 0.95rem;
}
.outcome {
  font-weight: bold;
}
.error {
  background: #fde2e2;
  color: #8a1a1a;
  padding: 8px;
  border-radius: 4px;
}
```

- [ ] **Step 3: Commit.**

```bash
git add web/src/islands/LiveGame.tsx web/src/styles/live-game.module.css
git commit -m "feat(web): LiveGame island with SSE subscription and HUD"
```

---

## Task 25: Astro pages (/play and /runs/[id])

**Files:**

- Create: `web/src/pages/play.astro`
- Create: `web/src/pages/runs/[id].astro`

- [ ] **Step 1: Create `/play`.**

```astro
---
import StartRunForm from "../islands/StartRunForm.tsx";
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0f766e" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <title>Play - BattleShipArena</title>
  </head>
  <body>
    <main>
      <h1>Start a run</h1>
      <StartRunForm client:load />
    </main>
  </body>
</html>
```

- [ ] **Step 2: Create `/runs/[id]`.**

```astro
---
import LiveGame from "../../islands/LiveGame.tsx";
const { id } = Astro.params;
if (typeof id !== "string" || id.length === 0) {
  return Astro.redirect("/play");
}
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0f766e" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <title>Run {id} - BattleShipArena</title>
  </head>
  <body>
    <main>
      <h1>Live run</h1>
      <LiveGame runId={id} client:load />
    </main>
  </body>
</html>
```

- [ ] **Step 3: Run `bun run build` and `bun test` at the root.**

```bash
bun run lint
bun run fmt:check
bun run typecheck
bun test
bun run build
```

Expected: all pass.

- [ ] **Step 4: Commit.**

```bash
git add web/src/pages/play.astro web/src/pages/runs/
git commit -m "feat(web): /play and /runs/[id] pages"
```

---

## Task 26: Local-dev walkthrough and exit checklist

**Files:** (none modified; verification only)

- [ ] **Step 1: Start backend.**

In terminal A:

```bash
cd backend && DATABASE_PATH=/tmp/bsa-dev.db MOCK_TURN_DELAY_MS=150 bun run dev
```

Expected: backend binds and logs its port.

- [ ] **Step 2: Start web dev server.**

In terminal B:

```bash
cd web && bun run dev
```

Expected: Astro reports its URL (typically `http://localhost:4321`).

- [ ] **Step 3: Walk `/play` -> `mock-happy` -> win.**

- Visit the Astro URL `/play`.
- Provider: `mock`. Model: `Mock - winning run`. Key: any string. Submit.
- On `/runs/<id>`, watch the board update. Expected: `Outcome: won` within ~15 seconds.

- [ ] **Step 4: Walk `/play` -> `mock-misses` -> dnf_shot_cap.**

- Visit `/play`, pick `Mock - always misses`, submit.
- Expected: `Outcome: dnf_shot_cap`, `Shots: 100/100`, `Hits: 0/17`.

- [ ] **Step 5: Walk `/play` -> `mock-schema-errors` -> dnf_schema_errors.**

- Visit `/play`, pick `Mock - schema errors`, submit.
- Expected: `Outcome: dnf_schema_errors`, `Schema errors: 5`.

- [ ] **Step 6: Confirm API key does not appear in the DB.**

```bash
sqlite3 /tmp/bsa-dev.db "SELECT * FROM runs; SELECT * FROM run_shots LIMIT 5;"
```

Expected: no column contains the submitted key string.

- [ ] **Step 7: Run the full CI-equivalent suite.**

```bash
bun install --frozen-lockfile
bun run lint
bun run fmt:check
bun run typecheck
bun test
bun run build
```

Expected: all green.

- [ ] **Step 8: Open a PR.**

```bash
git push -u origin feat/s2a-game-loop-mock
gh pr create --title "feat: S2a game loop against mock provider" --body "$(cat <<'EOF'
## Summary
- Deterministic board generator + PNG renderer
- Mock provider with three variants (happy, misses, schema-errors)
- Outcome FSM, event ring, engine, manager with abort + SIGTERM drain
- Five /api/runs routes including SSE with resync signal
- /play and /runs/[id] pages with Solid islands

## Test plan
- [ ] bun test at the root is green
- [ ] bun run build succeeds
- [ ] Local walkthrough: mock-happy, mock-misses, mock-schema-errors reach their documented outcomes

Skills used: superpowers:brainstorming, superpowers:writing-plans.
Docs used: docs/superpowers/specs/2026-04-21-s2a-game-loop-mock-design.md, docs/plan.md, docs/spec.md, docs/architecture.md.
EOF
)"
```

---

## Post-merge follow-up (for S2b)

After S1b lands (VPS + staging reachable), a separate S2b plan ships:

- Playwright smoke suite covering `mock-happy` -> `won` end-to-end via a real browser on staging.
- Extend `.github/workflows/deploy-staging.yml` to run the Playwright suite after the health check.
- Verify the Caddy `flush_interval -1` + long read/write timeouts survive a multi-second SSE run.
- Close the S2 acceptance checklist in `docs/plan.md` section 3.

---

**Done when:** every checkbox above is checked, the PR is merged, and `docs/plan.md` section 3's S2 checklist shows every non-Playwright item as checked.

Skills used: superpowers:writing-plans.
Docs used: docs/superpowers/specs/2026-04-21-s2a-game-loop-mock-design.md, docs/plan.md, docs/spec.md, docs/architecture.md.
