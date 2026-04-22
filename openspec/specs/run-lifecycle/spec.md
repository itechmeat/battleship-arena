# run-lifecycle Specification

## Purpose

TBD - created by archiving change s2a-game-loop-mock. Update Purpose after archive.

## Requirements

### Requirement: Outcome FSM reducer

The backend SHALL expose `reduceOutcome(state, event)` as a pure function returning `{ state, outcome: Outcome | null }`. State carries `shotsFired`, `hits`, `consecutiveSchemaErrors`, `schemaErrors`, `invalidCoordinates`. The event union covers `hit`, `miss`, `sunk`, `schema_error`, `invalid_coordinate`, and `abort` (with `reason: "viewer" | "server_restart"`). The reducer MUST apply the transition rules from `docs/spec.md` sections 3.5 and 4.2 exactly: `hit`/`sunk` increment `shotsFired` and `hits`, reset `consecutiveSchemaErrors` to 0, and emit `won` when `hits` reaches `TOTAL_SHIP_CELLS` (17); `miss` increments `shotsFired` only and resets the streak; `invalid_coordinate` increments both `shotsFired` and `invalidCoordinates` and resets the streak; `schema_error` increments `schemaErrors` and `consecutiveSchemaErrors` without touching `shotsFired`, and emits `dnf_schema_errors` when the streak reaches `SCHEMA_ERROR_DNF_THRESHOLD` (5); a non-terminal `hit`/`miss`/`invalid_coordinate` emits `dnf_shot_cap` when `shotsFired` reaches `SHOT_CAP` (100); `abort` emits `aborted_viewer` or `aborted_server_restart` per the supplied reason. The reducer MUST NOT perform I/O.

#### Scenario: 17th hit wins

- **WHEN** the reducer receives 17 consecutive `hit` events starting from the initial state
- **THEN** after the 17th the result's `outcome` equals `"won"`

#### Scenario: 100 misses reach dnf_shot_cap

- **WHEN** the reducer receives 100 consecutive `miss` events starting from the initial state
- **THEN** after the 100th the result's `outcome` equals `"dnf_shot_cap"`

#### Scenario: 5 consecutive schema errors reach dnf_schema_errors

- **WHEN** the reducer receives 5 consecutive `schema_error` events starting from the initial state
- **THEN** after the 5th the result's `outcome` equals `"dnf_schema_errors"`

#### Scenario: Hit resets the consecutive-schema-error streak

- **WHEN** the reducer receives 3 `schema_error` events, then 1 `hit`, then 4 more `schema_error` events
- **THEN** no intermediate result carries a terminal outcome and the resulting `consecutiveSchemaErrors` equals 4

#### Scenario: invalid_coordinate contributes to shot cap and resets streak

- **WHEN** the reducer receives 1 `schema_error` followed by 1 `invalid_coordinate`
- **THEN** resulting state has `shotsFired === 1`, `invalidCoordinates === 1`, `consecutiveSchemaErrors === 0`

#### Scenario: 100 invalid_coordinates also reach dnf_shot_cap

- **WHEN** the reducer receives 100 consecutive `invalid_coordinate` events
- **THEN** the 100th result's `outcome` equals `"dnf_shot_cap"`

#### Scenario: Abort reason discriminates outcome

- **WHEN** the reducer receives `abort { reason: "viewer" }` vs `abort { reason: "server_restart" }`
- **THEN** the first yields `aborted_viewer` and the second yields `aborted_server_restart`

### Requirement: Event ring with bounded capacity and out-of-range detection

The backend SHALL expose an `EventRing` class bounded at `RING_CAPACITY = 200` events per active run. `push(event)` MUST assign a monotonically increasing integer `id` starting at 1, append to the buffer, and drop the oldest entry when capacity is exceeded. `since(lastEventId)` MUST return a chronological array of events with `id > lastEventId`, OR the literal string `"out_of_range"` when `lastEventId` is less than `oldestIdInRing - 1`. `since(null)` MUST return every event currently in the ring.

#### Scenario: Ids start at 1 and are monotonic

- **WHEN** a fresh ring is pushed twice
- **THEN** `since(null)` returns two events with `id === 1` and `id === 2` respectively

#### Scenario: Overflow drops oldest and retains newest

- **WHEN** a ring of capacity 3 is pushed five times
- **THEN** `since(null)` returns exactly three events whose `id` values are 3, 4, 5

#### Scenario: since(n) returns only newer events

- **WHEN** a ring of capacity 10 has been pushed 5 times and `since(2)` is called
- **THEN** the return value is the three events with `id` values 3, 4, 5

#### Scenario: Out-of-range request is reported, not silently truncated

- **WHEN** a ring of capacity 3 has been pushed five times and `since(1)` is called
- **THEN** the return value is the literal string `"out_of_range"`

### Requirement: Run manager owns registry, ring, and abort wiring

The backend SHALL expose a `Manager` interface constructed via `createManager(deps)` with methods `start(input)`, `abort(runId, reason)`, `getHandle(runId)`, `shutdown(graceMs)`. `start` MUST generate a ULID run id, insert a `runs` row in status running, construct a `RunHandle` containing an `AbortController`, an `EventRing(RING_CAPACITY)`, a subscriber set, and a promise that resolves when the engine exits, then kick off `runEngine(runId, input, signal, emit)` in a fire-and-forget async context. `abort(runId, reason)` MUST call `abortController.abort({ reason })` and return true if the run was present, false otherwise. `shutdown(graceMs)` MUST first allow active engine promises up to `graceMs` milliseconds to settle normally, then abort any handles still in flight with reason `server_restart`, and finally await those aborted promises to settle. The manager MUST NOT retain any reference to the run's API key; `input.apiKey` is passed into `runEngine` and exists only inside that call's closure.

#### Scenario: start inserts a row and spawns the engine

- **WHEN** `manager.start(input)` is awaited against a clean DB
- **THEN** `getRunMeta(runId)` reports `outcome === null` and, once the returned handle's `taskPromise` resolves, the row's `outcome` is set

#### Scenario: abort aborts an active run

- **WHEN** an active slow run exists and `manager.abort(runId, "viewer")` is called
- **THEN** the returned boolean is `true`, the run's engine promise resolves, and the persisted row's `outcome` equals `"aborted_viewer"`

#### Scenario: abort returns false for an unknown id

- **WHEN** `manager.abort("nonexistent", "viewer")` is called
- **THEN** the returned boolean is `false`

#### Scenario: subscribers added to the handle receive subsequent live events

- **WHEN** a subscriber callback is added via `handle.subscribers.add(fn)` during an active run before the next provider turn resolves
- **THEN** the subscriber receives subsequent `shot` events and the final `outcome` event in order

#### Scenario: Manager's public API does not accept or retain apiKey as a field

- **WHEN** the `Manager` interface and the `RunHandle` type are inspected
- **THEN** neither type declares a field, method parameter (outside `start(input)`), method return value, or constructor property whose TypeScript type includes the `apiKey` string; `start(input)` is the only entry point that takes an `apiKey` and it hands the value directly into the `runEngine` call without storing it on the handle, the registry, or any closure variable retained by the manager after `start` returns

#### Scenario: Best-effort runtime canary finds no enumerable leak

- **WHEN** a test submits a distinctive `apiKey` sentinel via `manager.start(...)`, awaits the run to terminal, and scans the manager for the substring using `JSON.stringify(manager)`, `JSON.stringify(manager.getHandle(runId))` (during and after the run), and iteration over the handle's `ring.since(null)` and `subscribers` collections
- **THEN** the sentinel substring appears in none of those serializations; this is a regression canary for enumerable state, not a proof of absence (non-enumerable properties, symbol-keyed fields, `WeakMap` entries, and closure-captured values remain outside the canary's reach)

### Requirement: Per-turn game engine persists and emits

The backend SHALL expose `runEngine(runId, input, signal, emit, deps)` that drives the full game loop against the provider adapter keyed by `input.providerId` in `deps.providers`. Each turn MUST: (a) compute a `BoardView` from prior shots and the layout from `deps.generate(input.seedDate)`; (b) render the PNG via `deps.renderBoard`; (c) compute the ships-remaining text preamble; (d) call `adapter.call(callInput, signal)` with the `seedDate`, `priorShots`, and other fields documented by the provider interface; (e) parse `rawText` with `parseShot`; (f) classify the turn as `hit`, `miss`, `sunk`, `schema_error`, or `invalid_coordinate`, insert the appropriate `run_shots` row (raw response truncated to 8 KiB, reasoning to 2 KiB), and emit the corresponding `shot` SSE event; (g) call `reduceOutcome` and exit the loop on a terminal outcome. The engine MUST emit an `open` SSE event before the loop and, except for `aborted_server_restart`, an `outcome` SSE event after the loop and write the finalized `runs` row (`outcome`, `ended_at`, counters). On `AbortError` whose reason is `server_restart`, the engine MUST exit without writing the terminal row; startup reconciliation writes it instead. The engine MUST read `input.apiKey` only within its own closure; it MUST NOT place it in any variable reachable from outside.

#### Scenario: mock-happy reaches `won` and persists all shots

- **WHEN** `runEngine` runs with `providerId: "mock"`, `modelId: "mock-happy"`, `delayMs: 0`, against a clean run row for `seedDate = "2026-04-21"`
- **THEN** the run row's `outcome` equals `"won"`, the `run_shots` row count equals the terminal `shotsFired`, and the last emitted SSE event has `kind === "outcome"`

#### Scenario: mock-misses reaches `dnf_shot_cap` with a 83 misses + 17 invalid_coordinates split

- **WHEN** `runEngine` runs with `modelId: "mock-misses"` for `seedDate = "2026-04-21"`
- **THEN** the run row has `outcome === "dnf_shot_cap"`, `shotsFired === 100`, `hits === 0`, `invalidCoordinates === 17`, and `run_shots` contains 83 `miss` rows plus 17 `invalid_coordinate` rows

#### Scenario: mock-schema-errors reaches `dnf_schema_errors`

- **WHEN** `runEngine` runs with `modelId: "mock-schema-errors"`
- **THEN** the run row has `outcome === "dnf_schema_errors"` and exactly 5 `run_shots` rows with `result === "schema_error"`

#### Scenario: viewer abort resolves to aborted_viewer

- **WHEN** a run is in flight with `delayMs > 0` and its `AbortController` is aborted with reason `"viewer"`
- **THEN** the persisted row's `outcome` equals `"aborted_viewer"` and the final emitted SSE event is `outcome`

#### Scenario: API key never appears in any persisted value

- **WHEN** an engine run completes with a distinctive `apiKey` string
- **THEN** scanning every row of `runs` and `run_shots` for that substring returns zero matches

### Requirement: Startup reconciliation for stuck runs

The backend SHALL expose `reconcileStuckRuns(queries, nowMs)` that updates every `runs` row whose `outcome IS NULL AND ended_at IS NULL` to `outcome = "aborted_server_restart"` and `ended_at = nowMs`. The function MUST return the number of rows it updated. `bootstrap(config)` MUST call `reconcileStuckRuns(queries, Date.now())` after the migrator runs and before `Bun.serve` binds so that a restarted process observes any rows that were in flight at the prior shutdown.

#### Scenario: Stuck rows are transitioned

- **WHEN** a test seeds a `runs` row with `outcome = NULL` and `ended_at = NULL` and then calls `reconcileStuckRuns(queries, 200)`
- **THEN** the return value is 1 and the row's `outcome` equals `"aborted_server_restart"` with `ended_at === 200`

#### Scenario: No stuck rows yields 0

- **WHEN** `reconcileStuckRuns` is called against a database with only terminal or absent rows
- **THEN** the return value is 0 and no row is modified

#### Scenario: Reconciliation runs before listener binds

- **WHEN** `bootstrap(config)` runs against a database containing one stuck run row
- **THEN** by the time `GET /api/health` returns its first 200, that row's `outcome` equals `"aborted_server_restart"`

### Requirement: SIGTERM drain with grace window

The backend process SHALL install a SIGTERM (and SIGINT) handler that invokes `manager.shutdown(config.shutdownGraceSec * 1000)` and then stops the HTTP server. The shutdown path MUST catch and log failures from `manager.shutdown(...)` or `server.stop()` and MUST still attempt `server.stop()` in a `finally` path. Runs that complete within the grace window reach their own terminal state as usual. Runs still in flight when the grace elapses MUST remain in `running` state in the database so startup reconciliation on the next boot transitions them to `aborted_server_restart`.

#### Scenario: Slow mock run drained to aborted_server_restart when grace is 0

- **WHEN** a `mock-happy` run with `delayMs: 50` is in flight and `manager.shutdown(0)` is called
- **THEN** on a subsequent boot with `reconcileStuckRuns` invoked, that run's row's `outcome` equals `"aborted_server_restart"`
