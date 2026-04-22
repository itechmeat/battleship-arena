# S2a - Game loop end-to-end against the mock provider: Design

Date: 2026-04-21
Status: awaiting user review before implementation plan.
Source story: `docs/plan.md` section 5 ("Story S2 - Game loop end-to-end against the mock provider").
Related documents: `docs/about.md`, `docs/spec.md`, `docs/architecture.md`, `docs/plan.md`, `docs/superpowers/specs/2026-04-20-s1-bootstrap-design.md`, `CLAUDE.md`, `AGENTS.md`.

This document records every decision taken during the S2 brainstorm together with the reasoning that produced it. The reasoning is part of the contract and must not be deleted on a later editorial pass. If a decision is overturned, the overturning decision is recorded next to it; the original is preserved. The shape of the document mirrors the S1 design doc so a reviewer who has seen that one can find their way around this one without effort.

## 0. Meta - why this document exists in this shape

The four canonical documents specify the product, the contract, the architecture, and the four stories that land the MVP. `plan.md` section 5 is the S2 story. It lists acceptance criteria and a 12-task punch list, but it does not decide the choice points that only appear once the story is sequenced into an implementation: which PNG rendering approach to use, how the SSE ring handles reconnects beyond the ring horizon, whether S2 is one slice or two, how the mock provider's "bad model" variant is addressed, what the visible and invisible layers of the live-view island look like, and so on. This document picks those. It does not repeat what the canonical documents say.

## 1. Scope decision - S2 is split into S2a and S2b

### 1.1 The split

- **S2a** - tasks 1-10 of `plan.md` section 5.5, executed entirely inside the repository with verification on a developer machine and in `pr.yml`. All game-loop code, all mock-provider code, all five runs-scoped Hono routes, both web pages, the full unit + integration test surface. S2a ends when `pr.yml` is green on the S2a PR, the shared progress checklist items for S2 that are verifiable in-repo are checked, and a local-dev walkthrough demonstrates all three mock model variants reaching their terminal states.
- **S2b** - plan tasks 11 and 12: the Playwright smoke test and the first green end-to-end run against live staging. S2b cannot start until S1b (VPS provisioning, DNS, Caddy, systemd units, backup timers, first green `deploy-staging.yml`) is complete and merged.

### 1.2 Why split - reasoning preserved

The three options discussed at brainstorm time:

- **(A) Keep S2 as one slice.** All twelve tasks in one change; the slice is declared done only when the Playwright smoke passes against a live staging URL.
- **(B) Split S2 into S2a + S2b.** Selected.
- **(C) Defer Playwright entirely until S4.** Drop the staging dependency from S2 and redefine verification as "manual walkthrough on local dev plus full unit + integration coverage."

The rationale recorded at decision time:

> S2 task 11 can only succeed once `staging.arena.example` is reachable. Today's repository state is S1a-only (last commit `feat(s1a): ...`), so the VPS half of S1 is not yet in hand. Bundling the Playwright smoke into S2 recreates the exact coupling that motivated splitting S1 - a fast, reversible code slice held hostage by a slow, operator-decisions slice (DNS, Let's Encrypt, SSH identity, reboot drill). Splitting moves the non-operator work to `main` immediately and leaves a small, focused S2b that anyone can pick up once S1b lands.

(C) was rejected because deferring Playwright to S4 would cost the benchmark its only automated evidence that the full user flow survives a real browser on real mobile Safari / Chrome. The problem is not that Playwright belongs later - it is that Playwright requires staging, and staging is not this story's job. Splitting keeps Playwright in S2's envelope, just behind its own gate.

(A) was rejected because the story's green/red signal would become meaningless: half the work finishes in a day, the other half stalls on a DNS propagation or an LE rate limit, and the merge window for the code half is held hostage by the operator half.

### 1.3 Definition of done - S2a

On a fresh clone:

- `bun install --frozen-lockfile`, `bun run lint`, `bun run fmt:check`, `bun run typecheck`, `bun test`, `bun run build` all pass at the root and in every workspace.
- Unit + integration tests cover every S2a outcome path per section 7.1 and 7.2 of this document.
- `bun run dev:backend` and `bun run dev:web` together serve the local flow:
  - Visit `/play`, pick `mock` + `mock-happy`, paste any non-empty string as the key, submit.
  - Browser navigates to `/runs/:id`, the board updates live (one shot every ~150 ms), the HUD counters update, a `won` terminal screen renders without reload.
  - Reloading the page mid-run resumes the live view from the ring and continues without losing events.
  - The same flow with `mock-misses` reaches `dnf_shot_cap`; with `mock-schema-errors` reaches `dnf_schema_errors`.
- `curl` against the running backend confirms: `GET /api/runs/:id` returns the row, `GET /api/runs/:id/shots` returns the full shot list, `GET /api/runs/:id/events` on a terminal id returns the full event replay (`open` + one `shot` per persisted row + `outcome`) and closes, `POST /api/runs/:id/abort` on a terminal run returns 200.
- Database inspection (`sqlite3 /tmp/bsa-dev.db "SELECT * FROM runs, run_shots;"`) contains no column that stores the submitted API key.
- `pr.yml` is green on the S2a PR. `deploy-staging.yml` runs its `build` job; its `deploy` job still writes the `### Deploy gate: DISABLED` step summary from S1a if S1b has not landed. S2a does not flip that gate.
- This brainstorm (`docs/superpowers/specs/2026-04-21-s2a-game-loop-mock-design.md`) is committed and referenced from the implementation-plan doc.

### 1.4 Definition of done - S2b

Out of scope for this document; listed here as a forward pointer.

- S1b staging is alive.
- Playwright suite covers: `/play` form submission with `mock-happy`, live view transitions to `won`, `GET /api/runs/:id` via API asserts the outcome. Extended to cover the two DNF variants if the test time budget allows.
- Playwright runs in `deploy-staging.yml` after the health check, fails the workflow on a red run.
- S2 overall acceptance in `plan.md` section 5.2 is satisfied once S2b merges.

### 1.5 Explicit non-goals inside S2a

- No real provider adapters. The `providers/` directory contains only `mock.ts` and `types.ts`.
- No pricing math. `cost_usd_micros` and `reasoning_tokens` columns are written as `0` / `null` for mock rows.
- No `dnf_budget` path. The FSM's event union does not include a cost-overrun event in S2a.
- No `llm_unreachable` path. No mock variant produces it; the FSM knows the outcome string exists but no code writes it.
- No `/api/providers`, `/api/board`, `/api/leaderboard`, `/api/status`, `/api/admin/maintenance`. All deferred.
- No replay viewer, no leaderboard panel, no today's-board preview.
- No Playwright. Moved to S2b.
- No `Clock` abstraction. Moved to S4 task 1.
- No concurrent-run cap per session. Hardening, after S3.
- No soft or hard maintenance route handling. S4 territory.

### 1.6 Scope clarifications relative to `plan.md`

These are drift corrections the brainstorm records so the S2a plan step does not duplicate or contradict work already done in S1a.

- **Plan task 4 is already mostly done.** `backend/src/db/schema.ts` as it stands after S1a already declares every column `spec.md` 5.1 specifies for both `runs` and `run_shots`, plus the two required indexes. Task 4 reduces in S2a to adding `backend/src/db/queries.ts` (typed reads/writes used by engine + routes) and verifying no new migration is needed. If a missing column is discovered during implementation, it becomes a new numbered migration; we never edit the S1a migration.
- **Startup reconciliation for `aborted_server_restart` belongs in S2a, not S4.** Plan 5.2 lists this outcome as one of the states the FSM must reach in at least one test. The honest implementation is the boot-time scan that turns stuck `running` rows into `aborted_server_restart`. S4 task 4 then becomes "verify the already-implemented reconciliation survives a `systemctl kill -s SIGKILL` drill on staging" rather than new implementation work.

## 2. Toolchain additions

The only new runtime dependency introduced by S2a is the PNG renderer.

### 2.1 PNG renderer: `@resvg/resvg-js`

**Decision.** Use `@resvg/resvg-js`. Author the board as a small SVG template in `shared/`, convert SVG to PNG via Rust/WASM in `backend/src/board/renderer.ts`. The same SVG template is reused by the web island for on-screen rendering.

**Alternatives considered.**

- **`@napi-rs/canvas`** - native Skia/Cairo-backed Canvas 2D API, drawn imperatively. Fast, but binary output drifts across minor version bumps. Canvas via Skia is famously not byte-stable; any renovate PR nudging `@napi-rs/canvas` risks burning the entire PNG snapshot suite.
- **Hand-rolled minimal PNG encoder over a raw pixel buffer.** Zero runtime deps, guaranteed byte-for-byte determinism. Rejected because a 10x10 PNG with five cell states, subgrid outlines, phone-legible markers, and a hit-vs-sunk distinction quickly becomes reinventing a tiny vector renderer by hand. SVG is the language designed for this. We would also give up the shared template between server and client and would still need our own pure-JS zlib unless we reach for `pako` (another dep).

**Reasoning recorded at decision time.**

> The LiveGame and ReplayPlayer islands will render the board as SVG client-side. Authoring the server-side board as SVG first and converting to PNG means the same template file can be shared between `backend/src/board/renderer.ts` and the web island via a pure function in `shared/`. The LLM sees the same picture a human viewer sees. Plan task 2 demands snapshot tests; Resvg renders without font fallbacks (we use shapes only; the ships-remaining preamble is text-channel only per spec 3.3), so the output is stable across Node/Bun versions and across macOS/Linux CI runners. Prebuilt binaries cover `darwin-x64`, `darwin-arm64`, `linux-x64`, `linux-arm64`. No `node-gyp`, no system Cairo, no surprise native build failure. Spec 9.1 already forbids Docker, so we cannot paper over a native build failure with a container image.

**Cost of the decision.** One dependency (with a transitive WASM payload, about 2 MB). npm resolves the correct platform variant automatically via optional dependencies. One shared SVG template. Determinism relies on never embedding text inside the SVG.

## 3. SSE resume semantics

**Decision.** Ring replay plus a server-emitted `resync` signal. The SSE handler replays ring entries when `Last-Event-ID` is within the ring horizon; when it is older, the server emits a single `event: resync`. The client re-fetches `GET /api/runs/:id/shots`, rebuilds local state, then re-subscribes at the latest idx.

**Alternatives considered.**

- **Full resume: ring replay + DB-backed replay.** On reconnect with `Last-Event-ID: <idx>`, the server replays from ring if in horizon; if older, the server queries `run_shots`, synthesizes missed events, and sends them before resuming live.
- **No resume in S2a.** Forward-only; reconnects start at the current wall-clock tick.

**Reasoning recorded at decision time.**

> Keeping the SSE handler to "read from a ring, emit events, send `resync` when out of range" keeps the surface area small enough to unit-test the ring in isolation and integration-test the handler with a fake ring. The full-resume option drags `db/queries.ts` archive reads into the SSE handler and doubles the surface. Plan tasks 4 and 8 already require `GET /api/runs/:id/shots`; making the resync flow go "open SSE, see `resync`, fetch `/api/runs/:id/shots`, re-open SSE" reuses one endpoint instead of implementing two pathways that return the same data. The 200-event ring covers every "mobile tab drops Wi-Fi" scenario the spec calls out (max ~150 events per run); `resync` only fires on the edge case of a tab closed and reopened after the ring rolls, which with a mock run realistically cannot happen. Forward-compatibility with the replay viewer is free: `/runs/:id/replay` in S3 is exactly the "rebuild state from archive then render" flow, so the client code is written once. Forward-only (option C) was rejected because it would weaken the spec 4.1 rationale ("SSE was chosen specifically because Last-Event-ID resume covers the realistic mobile failure mode"); if we defer resume we should record a spec deviation, and the cost of doing it now is small enough that the deviation is the worse choice.

**Event id shape under this decision.** Every SSE event carries an `id:` field that is the ring-assigned monotonic integer. Ring entries are `{ id, event, data }` triples. Reconnects send entries with `id > Last-Event-ID`. `Last-Event-ID` below `oldestIdInRing - 1` triggers `resync`.

**Scope limit.** This decision governs reconnects to an **active** run. Late subscribers to a **terminal** run are handled separately per `spec.md` 4.4: the SSE handler reads the persisted row and synthesizes a single `outcome` event, then closes. See section 8.5 for the concrete handler.

## 4. Module layout

### 4.1 Backend (`backend/src/`)

```
backend/src/
  api/
    health.ts                (exists)
    runs.ts                  NEW - POST, GET :id, GET :id/shots,
                             GET :id/events, POST :id/abort
  board/
    generator.ts             NEW - seed -> BoardLayout (pure)
    renderer.ts              NEW - BoardView -> PNG via resvg
  providers/
    mock.ts                  NEW - adapter + three behavior variants
    types.ts                 NEW - ProviderAdapter, ProviderCall{Input,Output}
  runs/
    outcome.ts               NEW - pure reducer (state, event) -> { state, outcome? }
    engine.ts                NEW - per-turn loop, owns apiKey in closure
    manager.ts               NEW - registry, ring, subscribers, abort wiring
    reconcile.ts             NEW - startup scan for aborted_server_restart
  db/
    queries.ts               NEW - typed reads/writes used by engine + routes
    schema.ts                (exists; no edit expected in S2a)
    client.ts                (exists; add shutdown-hook entry point if needed)
    migrator.ts              (exists)
    with-temp-database.ts    (exists)
  app.ts                     EDIT - mount api/runs, inject manager
  index.ts                   EDIT - wire SIGTERM drain, call reconciliation
  config.ts                  EDIT - add MOCK_TURN_DELAY_MS parsing (optional)
```

### 4.2 Shared (`shared/src/`)

```
shared/src/
  board-svg.ts               NEW - pure (BoardView) => string; used by both
                             backend/board/renderer.ts and the web island
  sse-events.ts              NEW - SseEvent union: open | shot | resync | outcome
  types.ts                   EDIT - add RunMeta, RunShotRow, StartRunInput,
                             BoardView, CellState
  constants.ts               EDIT - add RING_CAPACITY (= 200),
                             SSE_HEARTBEAT_MS (= 25_000),
                             SCHEMA_ERROR_DNF_THRESHOLD (= 5),
                             MOCK_TURN_DELAY_MS_DEFAULT (= 150)
  index.ts                   EDIT - re-export new modules
  outcome.ts                 (exists; no edit)
  error-codes.ts             EDIT - add run_not_found, already_aborted
  shot-schema.ts             (exists; reused by engine)
```

### 4.3 Web (`web/src/`)

```
web/src/
  pages/
    index.astro              (exists; no edit in S2a)
    play.astro               NEW
    runs/
      [id].astro             NEW
  islands/
    StartRunForm.tsx         NEW - provider + model picker, key, budget, submit
    LiveGame.tsx             NEW - subscribes SSE, renders board, HUD
    BoardView.tsx            NEW - renders shared SVG from shot list
  lib/
    api.ts                   NEW - typed fetch wrapper over shared types
    sse.ts                   NEW - EventSource subscriber with resync handling
  styles/
    play.module.css          NEW
    live-game.module.css     NEW
```

### 4.4 Ownership seams

- `api/runs.ts` calls only `runs/manager.ts`, `db/queries.ts`, `errors.ts`. It never imports `providers/*`, never imports `engine.ts` directly.
- `runs/manager.ts` owns `Map<runId, RunHandle>` where `RunHandle = { abortController, ring, subscribers, taskPromise }`. It starts engine tasks but never holds `input.apiKey` - the key is passed only into the engine closure and dropped on return.
- `runs/engine.ts` owns the per-turn loop, consumes provider adapters, calls `db/queries.ts` to persist shots and finalize the run, and calls `runs/outcome.ts` as a pure reducer each turn.
- `runs/outcome.ts` exports `reduceOutcome(state, event)` returning `{ state, outcome: Outcome | null }`. No I/O. No time.
- `runs/reconcile.ts` exports `reconcileStuckRuns(db, nowMs)`. Called once from `bootstrap(config)` after `openDatabase` and before the HTTP listener binds (mirrors migration ordering).
- `providers/mock.ts` is a factory: `createMockProvider({ delayMs?, variants? })` returning a `ProviderAdapter`. Default construction wires the three behaviors to fixed model IDs.
- `board/*` never reaches into `runs/*`. `engine.ts` imports `board/generator.ts` and `board/renderer.ts` directly.
- `shared/board-svg.ts` is the only place the grid geometry and the cell-state-to-visual mapping lives. Both the PNG renderer and the DOM island derive from it.

## 5. Pure layer

### 5.1 `shared/src/board-svg.ts`

```ts
export type CellState = "unknown" | "miss" | "hit" | "sunk";
export interface BoardView {
  size: 10;
  cells: readonly CellState[]; // length 100, row-major
}
export function renderBoardSvg(view: BoardView): string; // deterministic
```

- No `<text>` elements inside the SVG. The ships-remaining preamble is text-channel only per `spec.md` 3.3; the image never carries coordinate text or ship-name text, so models cannot bypass spatial reasoning.
- Fixed viewBox `0 0 640 640` (64px per cell). No font metrics involved.
- Cell visuals: `unknown` = plain light-blue fill; `miss` = a filled dot in a darker shade; `hit` = a red X built from two rotated rectangles; `sunk` = solid red fill with a dark border, no marker.
- Pure-string output. Unit tests assert on the SVG string directly and on the rendered PNG bytes indirectly.

### 5.2 `backend/src/board/generator.ts`

```ts
export interface ShipPlacement {
  name: "carrier" | "battleship" | "cruiser" | "submarine" | "destroyer";
  length: number;
  cells: readonly { row: number; col: number }[];
  orientation: "horizontal" | "vertical";
}
export interface BoardLayout {
  seedDate: string; // YYYY-MM-DD
  ships: readonly ShipPlacement[]; // length 5, fleet order
}
export function generateBoard(seedDate: string): BoardLayout;
```

- **PRNG.** `xoshiro128**`, seeded by taking the first 16 bytes of SHA-256(`seedDate`) and reducing to four u32 state words. Widely used, passes standard statistical tests, byte-stable across Bun versions, no runtime dep.
- **Placement.** Rejection sampling. For each ship in fleet order: pick orientation, pick anchor, check bounds + no overlap + no 8-neighborhood adjacency. Retry up to a capped attempt count; on cap, restart the full layout with a deterministic sub-seed rotation.
- **Determinism.** Snapshot the layout for three fixed seed dates. Property-based test over a 365-day window asserts fleet composition, in-range cells, no overlap, no adjacency.
- **No adjacency** per `spec.md` 3.1 (stricter rule - no two ships share an edge).

### 5.3 `backend/src/board/renderer.ts`

```ts
import { renderBoardSvg, type BoardView } from "@battleship-arena/shared";
import { Resvg } from "@resvg/resvg-js";
export function renderBoardPng(view: BoardView): Uint8Array {
  const svg = renderBoardSvg(view);
  return new Resvg(svg).render().asPng();
}
```

- Integration snapshot tests commit 4-5 reference PNGs under `backend/tests/fixtures/board-png/`. Assert byte-equality. If Resvg ever produces different bytes post-upgrade, the test fails and fixtures are re-blessed in the same PR.
- No cache. Re-render per turn. 10x10 SVG is sub-millisecond; caching adds invalidation complexity for no measurable gain.

### 5.4 `backend/src/runs/outcome.ts`

Reducer pattern, fully pure:

```ts
export interface RunLoopState {
  shotsFired: number;
  hits: number;
  consecutiveSchemaErrors: number;
  schemaErrors: number;
  invalidCoordinates: number;
  totalShipCells: 17;
}
export type RunLoopEvent =
  | { kind: "hit" }
  | { kind: "miss" }
  | { kind: "sunk" }
  | { kind: "schema_error" }
  | { kind: "invalid_coordinate" }
  | { kind: "abort"; reason: "viewer" | "server_restart" };
export function reduceOutcome(
  state: RunLoopState,
  event: RunLoopEvent,
): { state: RunLoopState; outcome: Outcome | null };
```

- `hit`/`sunk` reset `consecutiveSchemaErrors` to 0, increment `shotsFired` and `hits`. If `hits === 17`, outcome `won`.
- `miss` resets `consecutiveSchemaErrors` to 0, increments `shotsFired`. If `shotsFired === 100`, outcome `dnf_shot_cap`.
- `schema_error` increments `schemaErrors` and `consecutiveSchemaErrors`. If the streak reaches 5, outcome `dnf_schema_errors`. Does not touch `shotsFired`.
- `invalid_coordinate` increments `invalidCoordinates`, increments `shotsFired`, resets the consecutive streak to 0 (matching `spec.md` 3.5: "consumes a turn, does not count toward `dnf_schema_errors`"). If `shotsFired === 100`, outcome `dnf_shot_cap`.
- `abort(reason)` -> outcome `aborted_viewer` or `aborted_server_restart`.
- `dnf_budget` and `llm_unreachable` are not reachable in this reducer's event union in S2a. S3 extends it.

### 5.5 Seed rollover

S2a does not introduce the `Clock` abstraction; plan puts it in S4 task 1. For S2a the engine reads `new Date().toISOString().slice(0, 10)` once at `POST /api/runs` handling and stores `seedDate` on the `runs` row; the engine never re-reads the clock mid-run. This is already the correct run-level behavior: a run sticks to whichever seed it started on. S4 adds the injected clock to cover the 23:55 edge case in a unit test.

## 6. Engine, manager, and lifecycle

### 6.1 `runs/manager.ts`

```ts
export interface RunHandle {
  readonly runId: string;
  readonly abortController: AbortController;
  readonly ring: EventRing;
  readonly subscribers: Set<(event: SseEvent) => void>;
  readonly taskPromise: Promise<void>;
}

export interface Manager {
  start(input: StartRunInput): Promise<{ runId: string }>;
  abort(runId: string, reason: "viewer" | "server_restart"): boolean;
  subscribe(runId: string, onEvent: (e: SseEvent) => void): () => void;
  getRing(runId: string): EventRing | null;
  shutdown(graceMs: number): Promise<void>;
}
```

- `start(input)` generates a ULID, inserts the `running` row, calls `engine.run(runId, input, signal, emit)` in an IIFE. `input.apiKey` is handed in to `engine.run` only, never retained in the handle.
- `emit(event)` both pushes to `ring` and fans out to `subscribers`.
- `abort(runId, reason)` calls `runHandle.abortController.abort({ reason })`. The reason is read inside the engine after the abort fires (standard `AbortController.abort(reason)`).
- On engine return the manager deletes the run from the registry and closes remaining subscribers.
- `shutdown(graceMs)` iterates active handles, aborts each with `"server_restart"`, awaits every `taskPromise` up to `graceMs`. Anything still running when grace elapses is orphaned; the next boot's reconciliation scan handles those rows.

### 6.2 `EventRing`

```ts
export class EventRing {
  constructor(capacity: number); // RING_CAPACITY = 200
  push(event: SseEvent): void; // assigns monotonic id, trims to capacity
  since(lastEventId: number | null): SseEvent[] | "out_of_range";
}
```

- Internally an array + head pointer + `nextId` counter. Each pushed event carries the assigned id.
- `since(null)` returns all current ring entries. `since(n)` returns entries with `id > n`, or `"out_of_range"` if `n < oldestIdInRing - 1`.

### 6.3 `runs/engine.ts`

```ts
export interface EngineDeps {
  db: Queries;
  providers: ProviderRegistry;
  now: () => number;
  renderBoard: (view: BoardView) => Uint8Array;
  generate: (seedDate: string) => BoardLayout;
}

export async function runEngine(
  runId: string,
  input: StartRunInput, // contains apiKey; this is the only place it lives
  signal: AbortSignal,
  emit: (e: SseEvent) => void,
  deps: EngineDeps,
): Promise<void>;
```

Loop structure:

1. Compute `BoardView` from prior shots + layout.
2. Render PNG via `deps.renderBoard`.
3. Compute the ships-remaining text preamble from the hits-per-ship map.
4. `adapter.call({ modelId, apiKey, boardPng, shipsRemaining, systemPrompt, priorShots, seedDate }, signal)`.
5. Parse `rawText` via `shared/shot-schema.ts`.
6. Map parse result to `RunLoopEvent`. For `invalid_coordinate`, row/col are still recorded on `run_shots`.
7. Insert the `run_shots` row (idx, row, col, result, raw_response truncated to 8 KiB, reasoning_text truncated to 2 KiB, token counts from adapter output, duration).
8. Emit `{ kind: "shot", idx, row, col, result, reasoning }`.
9. Call `reduceOutcome(state, event)`. If `outcome !== null`, break.

Abort handling:

- Every `await` inside the loop observes `signal`. A rejected `adapter.call` with `AbortError` unwinds to a `finally` block that persists terminal counters (no partial `run_shots` row), writes `outcome` + `ended_at`, emits the `outcome` event, and returns.
- The adapter respects `signal` and tears down its HTTP request; for mock this is a `setTimeout` cleared on `signal.aborted`.
- `signal.reason` discriminates `aborted_viewer` vs `aborted_server_restart`. When `reason === "server_restart"` the engine does not try to write the terminal outcome; the reconciliation scan on next boot writes it. This avoids racing the `systemctl` grace window close.

Defensive path:

- Any unexpected throw (not AbortError, not typed HTTP failure) is caught and translated into a schema-error turn. After 5 consecutive, DNF. Prevents a run from hanging on a latent bug. Not a spec requirement; recorded for future reviewers.

S2a columns always written as zero:

- `tokensIn`, `tokensOut`, `reasoningTokens`, `costUsdMicros` are always `0` / `null` on mock rows. Columns stay non-nullable per schema.

Key handling:

- `input.apiKey` is read once, passed to `adapter.call`, never stored in any outer scope. On engine return, closure is released. Matches `spec.md` 4.3.

### 6.4 `runs/reconcile.ts`

```ts
export function reconcileStuckRuns(db: Queries, nowMs: number): number;
```

- One SQL update: `UPDATE runs SET outcome='aborted_server_restart', ended_at=:nowMs WHERE outcome IS NULL AND ended_at IS NULL`.
- Returns affected rows.
- Called once from `bootstrap(config)` after `openDatabase` and before `Bun.serve` binds.

### 6.5 SIGTERM drain in `index.ts`

```ts
process.on("SIGTERM", async () => {
  const graceMs = config.shutdownGraceSec * 1000;
  await manager.shutdown(graceMs);
  server.stop();
});
```

- For S2a this is wired but only covers the mock case. Testing via real signals is hostile to Bun's test runner; the test that proves the path calls `manager.shutdown(0)` while a mock run with `delayMs=200` is mid-flight and asserts the resulting outcome appears as `aborted_server_restart` on the next `reconcile` or via the in-flight engine's abort-with-reason handling.

### 6.6 `StartRunInput` shape

```ts
export interface StartRunInput {
  providerId: string; // "mock"
  modelId: string; // "mock-happy" | "mock-misses" | "mock-schema-errors"
  apiKey: string; // any non-empty string in S2a
  budgetUsd?: number; // optional; ignored in S2a
  clientSession: string; // from cookie, set by middleware if absent
  seedDate: string; // computed at POST handling
}
```

- Assembled by the route handler from body + cookie + clock. Engine never reads `process.env` or `new Date()` directly; everything arrives through `deps` or `input`.

## 7. Mock provider

### 7.1 Adapter interface

`backend/src/providers/types.ts`:

```ts
export interface ProviderAdapter {
  readonly id: string;
  readonly models: readonly ProviderModel[];
  call(input: ProviderCallInput, signal: AbortSignal): Promise<ProviderCallOutput>;
}

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
  priorShots: readonly { row: number; col: number; result: "hit" | "miss" | "sunk" }[];
  seedDate: string; // YYYY-MM-DD; public info; real adapters ignore it.
}

export interface ProviderCallOutput {
  rawText: string;
  tokensIn: number; // 0 for mock
  tokensOut: number; // 0 for mock
  reasoningTokens: number | null; // null for mock
  costUsdMicros: number; // 0 for mock
  durationMs: number;
}
```

**Controlled extension of `spec.md` 6.1.** The spec's `ProviderCallInput` does not include `seedDate`. We add it here because:

1. `seedDate` is public information. `/api/board?date=YYYY-MM-DD` (S3) exposes it on the wire; the `runs.seed_date` column is returned by `GET /api/runs/:id`; the value appears in the frontend URL model. Passing it to the adapter leaks nothing.
2. It lets `mock-misses` do the maximum possible work before degrading. A 10x10 board has 100 cells and 17 ship cells, so only 83 non-ship cells exist; a pure 100-miss run is geometrically impossible. Without `seedDate`, a blind mock's only path to `dnf_shot_cap` is 100 `invalid_coordinate` turns from turn 1. With `seedDate`, the mock fires 83 genuine misses first and degrades to duplicate-shot `invalid_coordinate` only for the final 17 turns. The final DB state has `shotsFired=100, hits=0, misses=83, invalidCoordinates=17`, which is a closer analogue to a real model stuck in a sweep than an all-`invalid_coordinate` run would be.
3. Real S3 adapters accept the field and discard it. No real-provider change in behavior.

The spec change is recorded here; `spec.md` 6.1 gets a one-line update when the implementation lands (same PR, so the spec and the code cannot drift).

Stateless between calls. Mock reconstructs any per-run state from `seedDate` + `priorShots` alone. Keeps adapter tests hermetic and the adapter itself trivial to reason about.

### 7.2 Three model variants

`plan.md` task 3 says "mock.ts (happy path) and mock.ts 'bad' variant (schema errors on demand)." We ship three model IDs - one shared adapter, three behaviors keyed by `modelId`:

| model id             | behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                 | covers outcome             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `mock-happy`         | Deterministic hunt + target: checkerboard sweep, focus on neighbors after a hit, continue along the axis on a second hit. Always parse-clean, in-range, non-duplicate shots.                                                                                                                                                                                                                                                                             | `won` (always, <100 shots) |
| `mock-misses`        | Calls `generateBoard(input.seedDate)` to derive the layout, enumerates non-ship cells in reading order, fires the first one not already in `priorShots`. Exhausts the 83 non-ship cells as genuine `miss` turns. For turns 84-100, all 83 non-ship cells have been shot, so the adapter re-fires cell `(0, 0)` which triggers `invalid_coordinate` via the duplicate-shot rule. Final state: `shotsFired=100, hits=0, misses=83, invalidCoordinates=17`. | `dnf_shot_cap`             |
| `mock-schema-errors` | Emits malformed `rawText` cycling through: `"not json"`, `"{}"`, `{"row": "A"}`, `{"row": 0}` (missing col), `"plain prose"`. Pure schema-error path.                                                                                                                                                                                                                                                                                                    | `dnf_schema_errors`        |

Coverage for `aborted_viewer` uses `mock-happy` plus `POST /api/runs/:id/abort` mid-run. Coverage for `aborted_server_restart` uses the reconciliation scan test. Neither needs a separate mock variant.

Note on benchmark honesty. Mock is fixture-like, not a competing model. Its job is to drive the game loop end-to-end in CI without tokens. Deterministic hunt/target is the minimum that reliably reaches `won` under 100 shots.

### 7.3 Turn pacing

```ts
export function createMockProvider(options?: { delayMs?: number }): ProviderAdapter;
```

- Default `delayMs = 150`. On each `call`, the adapter does `await sleep(delayMs, signal)`. If `signal.aborted` mid-sleep, the promise rejects with `AbortError`.
- `sleep(ms, signal)` is a three-line utility resolving a `setTimeout`, rejecting on `signal.abort`, clearing the timer in either path.
- Production bootstrap wires the default so a human watching `/runs/:id` sees live updates while a full mock win finishes in ~15 seconds.
- Tests pass `{ delayMs: 0 }` explicitly to keep the suite fast.

### 7.4 Duration metric

- Adapter stopwatches wall-clock around its own work. `durationMs` on `ProviderCallOutput` is persisted to `run_shots.duration_ms`.
- `runs.duration_ms` is computed at terminal time as `ended_at - started_at` per `spec.md` 5.1 ("wall-clock from first request to terminal state").

### 7.5 Registration

```ts
// backend/src/app.ts (edit)
const providers = createProviderRegistry({
  mock: createMockProvider({ delayMs: config.mockTurnDelayMs ?? 150 }),
});
```

- `config.ts` gains optional `MOCK_TURN_DELAY_MS` parsing (default 150). Tests instantiate `createMockProvider({ delayMs: 0 })` directly and bypass the registry default.
- S3 adds real adapters to this same registry; the interface contract is S3-stable.

## 8. HTTP API

### 8.1 Route surface

All routes in a new `api/runs.ts` router, mounted at `/api`. JSON bodies. `ErrorEnvelope` on every non-2xx. `Cache-Control: no-store` on every mutating or dynamic route.

| method | path                   | purpose                                                                               |
| ------ | ---------------------- | ------------------------------------------------------------------------------------- |
| POST   | `/api/runs`            | Start a run. Body `{ providerId, modelId, apiKey, budgetUsd? }`. Returns `{ runId }`. |
| GET    | `/api/runs/:id`        | Run metadata.                                                                         |
| GET    | `/api/runs/:id/shots`  | Full shot list in idx order.                                                          |
| GET    | `/api/runs/:id/events` | SSE stream. Honors `Last-Event-ID`. Closes on terminal.                               |
| POST   | `/api/runs/:id/abort`  | Aborts with `aborted_viewer`. Idempotent: 200 if already terminal.                    |

### 8.2 Request validation

Hand-rolled per-field validation in the route handler, matching the style of `shared/src/shot-schema.ts`. No validator dep.

- `POST /api/runs`:
  - Missing/non-string `providerId` or `modelId` -> `invalid_input` with `detail.field`.
  - `providerId` not in the registry -> `invalid_input`, `detail.field = "providerId"`, 400.
  - `modelId` not in that provider's `models` list -> `invalid_input`, `detail.field = "modelId"`, 400.
  - Missing/empty `apiKey` -> `invalid_input`, `detail.field = "apiKey"`, 400. Mock accepts any non-empty string.
  - `budgetUsd` present but not a positive finite number -> `invalid_input`, 400.
- `POST /api/runs/:id/abort` on a terminal run -> 200 with current outcome (not 409). Abort is "stop now"; if the run is already stopped, the intent is satisfied.
- `GET /api/runs/:id` on unknown id -> 404 `run_not_found`. The same code is used for `GET /api/runs/:id/shots`, `GET /api/runs/:id/events`, and `POST /api/runs/:id/abort` when the id does not exist.

### 8.3 Shared types (additions in `shared/src/types.ts`)

```ts
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
  // clientSession is NOT exposed in responses; internal identifier only.
}

export interface RunShotRow {
  runId: string;
  idx: number;
  row: number | null;
  col: number | null;
  result: "hit" | "miss" | "sunk" | "schema_error" | "invalid_coordinate";
  rawResponse: string;
  reasoningText: string | null;
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number | null;
  costUsdMicros: number;
  durationMs: number;
  createdAt: number;
}
```

### 8.4 SSE event schema

`shared/src/sse-events.ts`:

```ts
export type SseEvent =
  | { kind: "open"; id: number; runId: string; startedAt: number; seedDate: string }
  | {
      kind: "shot";
      id: number;
      idx: number;
      row: number | null;
      col: number | null;
      result: "hit" | "miss" | "sunk" | "schema_error" | "invalid_coordinate";
      reasoning: string | null;
    }
  | { kind: "resync"; id: number }
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
```

- `event:` header is always set; `id:` is always the ring-assigned monotonic integer.
- `open` is the first event pushed by the engine when the loop starts.
- `shot` carries `null` for `row`/`col` when parse failed or coordinates were missing.
- `resync` is server-initiated when `Last-Event-ID` is older than ring horizon. Client re-fetches archive and re-subscribes.
- `outcome` is the final event; server writes it then closes the stream.

### 8.5 SSE handler mechanics

Using Hono's `streamSSE` from `hono/streaming`:

```ts
runsRouter.get("/runs/:id/events", (c) => {
  const runId = c.req.param("id");
  const lastEventIdHeader = c.req.header("Last-Event-ID");
  const lastEventId = lastEventIdHeader == null ? null : Number(lastEventIdHeader);

  return streamSSE(c, async (stream) => {
    const handle = manager.getHandle(runId);
    if (handle == null) {
      // Terminal path (spec 4.4): synthesize the full event list from the
      // persisted row plus run_shots, so late subscribers receive the
      // complete replay through the SSE channel.
      const meta = queries.getRunMeta(runId);
      if (meta == null || meta.outcome == null) {
        // Unknown run, or row present but not terminal and no live handle
        // (possible only during a brief reconciliation race). Emit resync so
        // the client refetches meta and re-attaches.
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
          runId,
          startedAt: meta.startedAt,
          seedDate: meta.seedDate,
        }),
      });
      nextId += 1;
      for (const shot of queries.listShots(runId)) {
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
      // Mid-run subscriber requested an id older than the ring horizon.
      await stream.writeSSE({ event: "resync", data: "", id: String(lastEventId ?? 0) });
      return;
    }
    for (const event of backlog) {
      await stream.writeSSE(serialize(event));
    }
    const unsubscribe = handle.subscribe((event) => stream.writeSSE(serialize(event)));
    const heartbeat = setInterval(() => stream.write(": heartbeat\n\n"), SSE_HEARTBEAT_MS);
    stream.onAbort(() => {
      unsubscribe();
      clearInterval(heartbeat);
    });
    await handle.taskPromise;
  });
});
```

- `SSE_HEARTBEAT_MS = 25_000`. Caddy's `flush_interval -1` and long `read_timeout`/`write_timeout` (set in the Caddyfile) cover idle-timeout-free streaming; the heartbeat is defense-in-depth for intermediary proxies.
- A comment line (`": heartbeat\n\n"`) is invisible to SSE consumers but keeps TCP alive.
- **Terminal-run contract** (spec 4.4 literal reading): the server synthesizes the full event list from the persisted row plus `run_shots` - one `open` event, one `shot` event per persisted row in idx order, one `outcome` event - then closes. Late subscribers thus receive the complete replay through the SSE channel. Event ids are re-assigned 0, 1, 2, ... for the synthesized stream; they are not the same ids the ring used while the run was live (the ring is long gone by the time a late subscriber arrives).
- `resync` is emitted only on a row that has no active handle and no persisted terminal outcome: either an unknown id, or the brief race window where the row was inserted but the engine has not written an outcome yet. It is not used for genuinely terminal runs.

### 8.6 Session cookie

- Middleware mounted before `api/runs.ts`: on every incoming request, if no `bsa_session` cookie exists, generate a fresh ULID token and set it on the response with `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=31536000`.
- `POST /api/runs` reads the cookie and writes it to `runs.client_session`.
- `Secure` is always on (Caddy terminates TLS). In local dev over plain HTTP the browser drops `Secure` and S2a does not rely on the cookie for anything beyond populating the column.
- `architecture.md` 8's "max 10 simultaneous runs per `client_session`" is not wired in S2a. The column is populated so S3's leaderboard de-dup and any future `too_many_active_runs` check have the identifier they need.

### 8.7 API key handling on the route

- `apiKey` is extracted from the request body exactly once, passed to `manager.start({ ..., apiKey })`, never logged, never placed in any log line emitted by the route handler.
- If a Hono logger is enabled, it is configured to skip `/api/runs` bodies entirely. Log lines show method, path, status, duration, nothing else.
- `POST /api/runs` response is `{ runId }` - no echo of any request field.

## 9. Web layer

### 9.1 Page set

```
/        (exists from S1a; no edit in S2a)
/play    NEW: Astro page + <StartRunForm /> island
/runs/:id NEW: Astro page + <LiveGame /> island
```

- Both pages render a static Astro shell plus a single Solid island. Astro pages do no server-side data fetching in S2a; islands own all dynamic state.

### 9.2 `<StartRunForm />`

- Provider picker is a `<select>` even though S2a only has `mock`; S3 adds options, not new UI.
- Model picker is dependent on `providerId`. For `mock`: three options - "Mock - winning run" (`mock-happy`, default), "Mock - always misses" (`mock-misses`), "Mock - schema errors" (`mock-schema-errors`).
- API key field: `<input type="password" autocomplete="off">`. Placeholder text explains "Any non-empty string works for mock models." Never prefilled, never persisted to any client storage (no localStorage, no sessionStorage, no IndexedDB).
- Budget field: `<input type="number" step="0.01" min="0">`. Label notes "Optional for mock runs, required for real providers (S3)." Submit allowed with empty budget.
- Submit handler calls `lib/api.ts` `startRun(...)`. On 200: `location.assign('/runs/' + runId)`. On non-2xx: render `ErrorEnvelope.error.message` inline at the top of the form. No toast, no modal, no alert.
- Disabled-while-submitting latch: submit button gets `aria-busy` and the disabled attribute while the request is in flight.

### 9.3 `<LiveGame runId />`

```ts
type LiveState =
  | { phase: "loading" }
  | { phase: "hydrating"; meta: RunMeta; shots: RunShotRow[] }
  | { phase: "live"; meta: RunMeta; shots: RunShotRow[]; lastEventId: number | null }
  | { phase: "terminal"; meta: RunMeta; shots: RunShotRow[] }
  | { phase: "error"; message: string };
```

Mount sequence:

1. `GET /api/runs/:id` - if `outcome !== null`, fetch shots and transition to `terminal`.
2. `GET /api/runs/:id/shots` - hydrate prior shots.
3. Compute `lastEventId` from `shots[-1].idx`.
4. Open `EventSource('/api/runs/:id/events?lastEventId=N')`. `EventSource` cannot set headers directly; the server accepts either the `Last-Event-ID` header (sent by browsers on auto-reconnects) or a `lastEventId` query parameter (for initial subscription).
5. On `shot`, append to state and re-render.
6. On `outcome`, transition to `terminal`.
7. On `resync`, re-run steps 1-4.
8. On `EventSource.onerror` with `readyState === CLOSED`, re-open manually with the latest id.

### 9.4 `<BoardView />`

Pure Solid component. Input: `shots: RunShotRow[]`. Output: SVG built via shared `renderBoardSvg`. The island derives a `BoardView` from the shot list; on a `sunk` event it upgrades adjacent `hit` cells to `sunk` by flood-fill along row/column adjacency. Server's PNG renderer does the same derivation. Keeping this on the client avoids expanding the SSE event shape with a ships-sunk map.

### 9.5 HUD

A small panel next to the board showing `shotsFired / 100`, `hits / 17`, `schemaErrors`, `invalidCoordinates`, `durationMs`. Derived on the client from `Date.now() - meta.startedAt` while live, from `meta.durationMs` when terminal.

### 9.6 `lib/api.ts` and `lib/sse.ts`

- `lib/api.ts`: typed wrappers over shared types - `startRun`, `getRun`, `getRunShots`, `abortRun`. Single `fetch` helper that parses `ErrorEnvelope` on non-2xx and throws a typed `ApiError`. All calls `credentials: "same-origin"` so the session cookie rides along.
- `lib/sse.ts`: `subscribeToRun(runId, { lastEventId, onEvent, onResync, onError })` returns a close function. Implements manual re-open when `readyState === CLOSED`. No third-party SSE dep.

### 9.7 Styling

- `web/src/styles/play.module.css`, `web/src/styles/live-game.module.css`. Both authored mobile-first, constrained column up to ~480px wide, centered. Touch targets >= 44px. No global CSS, no color system package, no theming. S2a is intentionally unpolished; visual refinement is a later pass.
- `BoardView` SVG sets `width: 100%; aspect-ratio: 1 / 1; max-width: 480px; display: block; margin: 0 auto;`. The SVG `viewBox` (`0 0 640 640`) scales to fit.

### 9.8 PWA service worker

`spec.md` 7.4: SW caches shell only, never `/api/*`. S1a already ships a shell-only SW with the correct allowlist. S2a changes nothing in the SW; `/play` and `/runs/:id` are shell HTML already covered.

### 9.9 What S2a deliberately does not ship on the web

- No leaderboard panel, no today's-board preview, no replay viewer, no filters.
- No toasts, modals, or skeleton loaders.
- No dark mode, no theming, no brand-color CSS variables beyond S1a.
- No offline indicator.

## 10. Tests

### 10.1 Unit

| module                    | coverage                                                                                                                                                                                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/shot-schema`      | Already covered in S1a. S2a adds cases for each parse outcome.                                                                                                                                                                                                             |
| `shared/board-svg`        | Snapshot 4 `BoardView` fixtures (all unknown, mixed hits + misses, one sunk ship, terminal win). Byte-stable string snapshots in `tests/fixtures/board-svg/`.                                                                                                              |
| `backend/board/generator` | 3 fixed-seed snapshots. Property-based over 365 seeds: fleet composition, in-range, no overlap, no adjacency.                                                                                                                                                              |
| `backend/board/renderer`  | 4 PNG snapshot fixtures in `backend/tests/fixtures/board-png/`, byte-equal assertion. Re-blessed from CI on Resvg upgrade.                                                                                                                                                 |
| `backend/providers/mock`  | `mock-happy` reconstruction is pure (20 random prior-shot lists -> idempotent). `mock-misses` never collides with ship cells while any non-ship cell is unshot, then falls back to duplicating a prior shot. `mock-schema-errors` cycles through the 5 malformed payloads. |
| `backend/runs/outcome`    | Every transition in the reducer, including reset rules on `hit`/`miss`/`sunk` and separate accounting for `schema_error` vs `invalid_coordinate`.                                                                                                                          |
| `backend/runs/event-ring` | Capacity overflow drops oldest, `since(null)` returns all, `since(n)` returns `id > n`, out-of-range returns `"out_of_range"`.                                                                                                                                             |
| `web/islands/BoardView`   | `boardViewFromShots` derivation: sunk flood correctly upgrades adjacent `hit` cells to `sunk`. Pure-function test, no DOM.                                                                                                                                                 |

### 10.2 Integration

`tests/integration/*.test.ts`. Every test wraps in `withTempDatabase`. Each spins a real Hono app via `createApp(...)` and sends requests through `app.request()` (no port binding needed).

| scenario                               | outcome asserted         | notes                                                                                                                                                                                                                                                    |
| -------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full mock happy path                   | `won`                    | `mock-happy`, `delayMs: 0`. Assert `runs.outcome`, `run_shots` count, final SSE event is `outcome`.                                                                                                                                                      |
| Always-misses                          | `dnf_shot_cap`           | `mock-misses`, `delayMs: 0`. Assert `shotsFired === 100`, `hits === 0`, `invalidCoordinates === 17` (turns 84-100 are duplicate-shot), `schemaErrors === 0`. Also assert the `run_shots` table contains 83 `miss` rows and 17 `invalid_coordinate` rows. |
| Schema-error DNF                       | `dnf_schema_errors`      | `mock-schema-errors`. Assert 5 consecutive schema-error rows, outcome emitted.                                                                                                                                                                           |
| Viewer abort mid-run                   | `aborted_viewer`         | `mock-happy` with `delayMs: 200`. After 2 shots, `POST /api/runs/:id/abort`. Assert final outcome.                                                                                                                                                       |
| Startup reconciliation                 | `aborted_server_restart` | Seed `runs` row with `outcome=NULL, ended_at=NULL`. Call `reconcileStuckRuns`. Assert row updated.                                                                                                                                                       |
| SSE initial subscription               | ring backlog delivered   | Run to 3 shots; subscribe with no `lastEventId`; assert `open + shot*3` in backlog.                                                                                                                                                                      |
| SSE resume with `lastEventId` in-range | missed events delivered  | Run to 5 shots; subscribe with `lastEventId=2`; assert only shots 3-5 delivered.                                                                                                                                                                         |
| SSE resync when out-of-range           | `resync` event emitted   | Build a ring with horizon > 200; subscribe with `lastEventId=0`; assert single `resync` event.                                                                                                                                                           |
| SSE on terminal run                    | full replay delivered    | Run to `won`, wait for terminal, then subscribe. Assert the stream contains `event: open`, at least one `event: shot`, and `event: outcome` with `outcome=won`. No `event: resync`.                                                                      |
| SSE on unknown run                     | `resync` event emitted   | Subscribe to `/api/runs/<nonexistent>/events`. Assert single `resync` event (no 404; SSE is a stream).                                                                                                                                                   |
| `POST /api/runs` validation            | `invalid_input` codes    | Missing providerId, unknown modelId, empty apiKey, negative budget: status + code + `detail.field`.                                                                                                                                                      |
| `GET /api/runs/:id` unknown id         | `run_not_found`          | 404. Same code asserted on `GET /api/runs/:id/shots` unknown id, `POST /api/runs/:id/abort` unknown id.                                                                                                                                                  |
| `POST /api/runs/:id/abort` terminal    | 200 + current outcome    | Start + win + abort. Assert 200, not 409.                                                                                                                                                                                                                |
| API key never persists                 | no column contains key   | After a run, scan `SELECT * FROM runs` and `SELECT * FROM run_shots` for the submitted key substring - none present.                                                                                                                                     |

Every test runs with `DATABASE_PATH` pointing to a per-test `/tmp/` file via `withTempDatabase`. The guard in `backend/tests/setup.ts` blocks misconfigurations.

### 10.3 Test helpers

- `createMockProvider({ delayMs: 0 })` for every test.
- `drive(app, input)` helper: `POST /api/runs`, subscribes to SSE via `app.request('/api/runs/:id/events', ...)`, returns a promise that resolves on `outcome`. Used by the four outcome tests so each test body reads like five lines.
- In-memory `TestEventCollector` attached to the manager's emission and the persisted DB, so assertions cover both the stored state and the emitted stream.

### 10.4 What S2a defers to later stories

1. **Playwright smoke suite on staging.** S2b.
2. **Cross-UTC-day rollover test.** S4 with the `Clock` abstraction.
3. **`dnf_budget` and pricing math.** S3.
4. **`llm_unreachable` path.** S3 behind contract tests.
5. **Real provider adapters.** S3.
6. **Replay viewer.** S3.
7. **Leaderboard + filters.** S3.
8. **Maintenance toggles and SIGTERM drain staging exercise.** S4.
9. **Concurrent-run cap per session (10).** Hardening PR after S3.
10. **`POST /api/admin/maintenance`, `GET /api/status`.** S4.

## 11. Other decisions recorded without a question

These were pre-decided during the brainstorm under the "pick the most obvious options yourself" directive. Each is recorded so a future reviewer can challenge the defaults if they disagree.

### 11.1 FSM shape: reducer, not stateful object

`reduceOutcome(state, event) => { state, outcome }`. State is immutable. Alternative considered: a stateful object holding counters and exposing `apply(event)`. Reducer preserves testability (pure fn), matches `architecture.md` 2.1 ("runs/outcome is pure"), gives transition history for free in tests.

### 11.2 Abort signal reason discrimination

Use standard `AbortController.abort(reason)`. Reason is either `"viewer"` or `"server_restart"`. Engine reads `signal.reason` inside the abort-handling branch. Alternative considered: a second signal or a flag on the handle. Reason strings are native, already carried by the abort primitive, and do not require the manager to leak a second channel to the engine.

### 11.3 SSE heartbeat cadence

`SSE_HEARTBEAT_MS = 25_000`. Below every realistic intermediary idle timeout. Alternative considered: 50_000 (one per minute is plenty for most proxies). 25s is the defense-in-depth value that survives even aggressive intermediaries; the cost is a 40-byte comment line every 25 seconds, which is negligible.

### 11.4 Web client discovers run state: meta + archive + SSE

Explicitly three round-trips on first load of `/runs/:id`: meta, then archive, then SSE with `lastEventId`. Alternative considered: SSE-first with ring backlog only. Three-round-trip is chosen because a reloaded mid-run tab must see a hydrated board before the first new shot arrives, and because a terminal-run load avoids opening an SSE at all. Round-trip cost is sub-200ms on a local network; mobile users hit the SSE route once per navigation.

### 11.5 Model picker copy for S2a

Human labels: "Mock - winning run", "Mock - always misses", "Mock - schema errors". No technical model ID is visible in the UI; the form submits the internal id. This sets the expectation for S3 real-model labels and avoids leaking implementation detail.

### 11.6 Budget field for mock runs

Present but not required for S2a. Submit allowed with empty. Persisted as `NULL`. Alternative: hide the field for `mock`. Rejected because the same field in S3 is required for real providers; keeping the control visible in S2a avoids a UI shape change when S3 lands.

### 11.7 Session cookie lifetime

`Max-Age=31536000` (one year). Session is not an identity; this is a de-duplication identifier. A year is long enough to survive a visitor's typical engagement window; rotation on expiry is cheap.

### 11.8 No validator dependency

All field validation is hand-rolled, matching `shared/src/shot-schema.ts`. Alternatives considered: `zod`, `valibot`, `@sinclair/typebox`. Rejected because the validation surface in S2a is five shapes, the style already set in S1a is hand-rolled, and adding a validator dep now would require migrating S1a's existing validators as a consistency pass.

### 11.9 Engine concurrency model

Async function on the main event loop. No workers. Per spec and architecture the engine does one `await` per turn on a provider call; no CPU-heavy work anywhere. Workers would be unjustified complexity.

### 11.10 `apiKey` lifetime enforcement

Enforced by code layout: `runs/manager.ts` intentionally has no field that can hold `apiKey`, and the engine's outer scope is a function parameter that releases on return. No runtime assertion. Alternative considered: a defensive `Object.seal` or `WeakMap` to prove absence. Rejected because a runtime test is the right defense: the integration test "API key never persists" grep-scans the DB for the submitted key substring.

### 11.11 `seedDate` in `ProviderCallInput`

Extends `spec.md` 6.1 by one public field. Reasoning lives in section 7.1; the one-line TL;DR: `seedDate` is public information (exposed elsewhere in the API and the UI), real providers ignore it, and mock-misses needs it to produce a realistic DNF. Spec 6.1 gets the matching one-line addition in the same implementation PR so the code and the spec cannot drift.

## 12. Open risks

Recorded so the implementation plan can address them or accept them.

1. **`@resvg/resvg-js` cross-platform byte stability.** Verified on docs only, not yet on our own CI matrix. Mitigation: if a mac-local run and a CI run disagree on fixtures, we re-bless from CI and pin `@resvg/resvg-js` to an exact patch version.
2. **`EventSource` in test harness.** Bun's test runner does not expose a stable `EventSource` polyfill inside `app.request()`. Mitigation: SSE integration tests subscribe to the manager's emission directly (in-process) rather than through an HTTP `EventSource`; the HTTP SSE handler is exercised by a separate test that uses `fetch` against a running Hono app and parses the text stream manually.
3. **Adapter-reconstructed mock state.** `mock-happy` rebuilds hunt/target state from `priorShots` on every call. If the engine ever emits duplicate `priorShots` rows (a bug), the mock's reconstruction would diverge. Mitigation: engine unit test asserts `priorShots` handed to the adapter is the exact sequence of prior `run_shots` rows with `result in (hit, miss, sunk)`, excluding schema_error and invalid_coordinate rows.
4. **SIGTERM coverage.** Real signals are hostile to Bun's test runner, so S2a does not exercise SIGTERM directly. Mitigation: `manager.shutdown(0)` test covers the same code path; S4 covers the real signal drill on staging.

## 13. Acknowledgements

This document builds directly on `docs/superpowers/specs/2026-04-20-s1-bootstrap-design.md`. Where S1 set a precedent (split by irreversibility, preserve reasoning alongside decisions, pre-decide the obvious and ask only the hard ones), S2a follows the same shape.

Skills used: superpowers:brainstorming.
Docs used: `docs/about.md`, `docs/spec.md`, `docs/architecture.md`, `docs/plan.md`, `docs/superpowers/specs/2026-04-20-s1-bootstrap-design.md`.
