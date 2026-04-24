# run-lifecycle Specification

## Purpose

TBD - created by archiving change s2a-game-loop-mock. Update Purpose after archive.

## Requirements

### Requirement: Outcome FSM reducer

The backend SHALL expose `reduceOutcome(state, event, context)` as a pure function returning `{ state, outcome: Outcome | null }`. State carries `shotsFired`, `hits`, `consecutiveSchemaErrors`, `schemaErrors`, `invalidCoordinates`, and `accumulatedCostMicros` (a non-negative integer initialised to `0`). The `context` argument carries `budgetMicros: number | null` - the run's declared budget cap in integer micros, or `null` when no cap was declared. The event union covers `hit`, `miss`, `sunk`, `schema_error`, `invalid_coordinate`, and `abort` (with `reason: "viewer" | "server_restart"`); every non-`abort` event MUST additionally include `costUsdMicros: number` (a non-negative integer reported by the adapter for that turn). The reducer MUST apply the transition rules from `docs/spec.md` sections 3.5 and 4.2 exactly: `hit`/`sunk` increment `shotsFired` and `hits`, reset `consecutiveSchemaErrors` to 0, and emit `won` when `hits` reaches `TOTAL_SHIP_CELLS` (17); `miss` increments `shotsFired` only and resets the streak; `invalid_coordinate` increments both `shotsFired` and `invalidCoordinates` and resets the streak; `schema_error` increments `schemaErrors` and `consecutiveSchemaErrors` without touching `shotsFired`, and emits `dnf_schema_errors` when the streak reaches `SCHEMA_ERROR_DNF_THRESHOLD` (5); a non-terminal `hit`/`miss`/`invalid_coordinate` emits `dnf_shot_cap` when `shotsFired` reaches `SHOT_CAP` (100); `abort` emits `aborted_viewer` or `aborted_server_restart` per the supplied reason. For every non-`abort` event the reducer MUST also add `event.costUsdMicros` to `state.accumulatedCostMicros`. After the standard transitions are evaluated, the reducer SHALL evaluate terminal conditions in the fixed priority order `won > dnf_shot_cap > dnf_schema_errors > dnf_budget`; when two or more conditions fire on the same pass, the earliest-listed outcome wins and the later ones MUST NOT be returned. The reducer MUST emit `dnf_budget` if and only if `context.budgetMicros !== null AND context.budgetMicros > 0 AND the updated accumulatedCostMicros >= context.budgetMicros`, AND no earlier-priority outcome already fired on this pass. The reducer MUST NOT perform I/O.

#### Scenario: 17th hit wins

- **WHEN** the reducer receives 17 consecutive `hit` events (each with `costUsdMicros: 0`) starting from the initial state with `context: { budgetMicros: null }`
- **THEN** after the 17th the result's `outcome` equals `"won"`

#### Scenario: 100 misses reach dnf_shot_cap

- **WHEN** the reducer receives 100 consecutive `miss` events (each with `costUsdMicros: 0`) starting from the initial state with `context: { budgetMicros: null }`
- **THEN** after the 100th the result's `outcome` equals `"dnf_shot_cap"`

#### Scenario: 5 consecutive schema errors reach dnf_schema_errors

- **WHEN** the reducer receives 5 consecutive `schema_error` events (each with `costUsdMicros: 0`) starting from the initial state with `context: { budgetMicros: null }`
- **THEN** after the 5th the result's `outcome` equals `"dnf_schema_errors"`

#### Scenario: Hit resets the consecutive-schema-error streak

- **WHEN** the reducer receives 3 `schema_error` events, then 1 `hit`, then 4 more `schema_error` events (all with `costUsdMicros: 0` and `context: { budgetMicros: null }`)
- **THEN** no intermediate result carries a terminal outcome and the resulting `consecutiveSchemaErrors` equals 4

#### Scenario: invalid_coordinate contributes to shot cap and resets streak

- **WHEN** the reducer receives 1 `schema_error` followed by 1 `invalid_coordinate` (both with `costUsdMicros: 0`)
- **THEN** resulting state has `shotsFired === 1`, `invalidCoordinates === 1`, `consecutiveSchemaErrors === 0`

#### Scenario: 100 invalid_coordinates also reach dnf_shot_cap

- **WHEN** the reducer receives 100 consecutive `invalid_coordinate` events
- **THEN** the 100th result's `outcome` equals `"dnf_shot_cap"`

#### Scenario: Abort reason discriminates outcome

- **WHEN** the reducer receives `abort { reason: "viewer" }` vs `abort { reason: "server_restart" }`
- **THEN** the first yields `aborted_viewer` and the second yields `aborted_server_restart`

#### Scenario: Cost accumulates across non-abort events

- **WHEN** the reducer receives three events with `costUsdMicros` values `1_200`, `800`, and `2_500` (types `hit`, `miss`, `miss`) under `context: { budgetMicros: null }`
- **THEN** the final state's `accumulatedCostMicros` equals `4_500` and no intermediate result carries a terminal outcome

#### Scenario: Budget met exactly triggers dnf_budget

- **WHEN** state enters the evaluation pass with `accumulatedCostMicros: 39_500` and a `miss` event with `costUsdMicros: 500` is reduced under `context: { budgetMicros: 40_000 }`, and no earlier-priority outcome fires
- **THEN** the post-reduction `accumulatedCostMicros` equals `40_000` and the result's `outcome` equals `"dnf_budget"`

#### Scenario: Null budget never triggers dnf_budget

- **WHEN** a `miss` event with `costUsdMicros: 1_000_000` is reduced from initial state under `context: { budgetMicros: null }`, updating `accumulatedCostMicros` from `0` to `1_000_000`
- **THEN** the FSM does not emit `dnf_budget` and the result's `outcome` is `null`; a subsequent `miss` event with `costUsdMicros: 10_000_000` under the same context also does not emit `dnf_budget`

#### Scenario: Zero budget never triggers dnf_budget

- **WHEN** a `miss` event with `costUsdMicros: 1_000_000` is reduced from initial state under `context: { budgetMicros: 0 }`, updating `accumulatedCostMicros` from `0` to `1_000_000`
- **THEN** the FSM does not emit `dnf_budget` and the result's `outcome` is `null`; a subsequent `miss` event with `costUsdMicros: 10_000_000` under the same context also does not emit `dnf_budget`

#### Scenario: won wins a simultaneous-terminal turn against dnf_shot_cap

- **WHEN** the same turn records the 100th shot fired AND the 17th hit under any `context`
- **THEN** the FSM returns outcome `won`

#### Scenario: dnf_shot_cap beats dnf_budget on a simultaneous-terminal turn

- **WHEN** the same turn records the 100th shot fired AND pushes `accumulatedCostMicros` to meet `context.budgetMicros`
- **THEN** the FSM returns outcome `dnf_shot_cap`

#### Scenario: dnf_schema_errors beats dnf_budget on a simultaneous-terminal turn

- **WHEN** the same turn records the fifth consecutive `schema_error` AND pushes `accumulatedCostMicros` to meet `context.budgetMicros`
- **THEN** the FSM returns outcome `dnf_schema_errors`

#### Scenario: Winning turn that also crosses the budget resolves as won

- **WHEN** the same turn records the 17th hit AND pushes `accumulatedCostMicros` to meet `context.budgetMicros`
- **THEN** the FSM emits outcome `won` and does not emit `dnf_budget`

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

### Requirement: Engine persists accumulated cost on terminal state

The backend engine SHALL mirror the FSM's `accumulatedCostMicros` counter for each active run and SHALL persist the final value into `runs.cost_usd_micros` as part of the single terminal-state row write (alongside `outcome`, `ended_at`, and the other aggregate counters). The engine MUST NOT write `runs.cost_usd_micros` on intermediate turns and MUST NOT write a non-zero value when no adapter call has yet reported a cost.

#### Scenario: Three-turn run records the exact sum in runs.cost_usd_micros

- **WHEN** a run completes after exactly three adapter calls whose reported `costUsdMicros` values are `1_200`, `800`, and `2_500`
- **THEN** the persisted `runs.cost_usd_micros` equals `4_500` and is written only once, in the same transaction that sets the terminal `outcome`

#### Scenario: Zero-cost run persists zero

- **WHEN** a run terminates after turns whose `costUsdMicros` are all `0`
- **THEN** the persisted `runs.cost_usd_micros` equals `0`

### Requirement: ProviderError mapping to turn classification

The engine SHALL catch a thrown `ProviderError` raised by the provider adapter during `adapter.call` and SHALL branch on its `kind` discriminant. When `kind === "transient"`, the engine MUST record the turn as a `schema_error` turn by inserting a `run_shots` row with the following shape: `result = "schema_error"`, `row = NULL`, `col = NULL`, `raw_response = ""`, `reasoning_text = NULL`, `tokens_in = 0`, `tokens_out = 0`, `reasoning_tokens = NULL`, `cost_usd_micros = 0`, `duration_ms` set to the elapsed wall-clock of the failed adapter call, `created_at` set to the insertion time in Unix ms, and `llm_error` set to the `ProviderError.cause` string (truncated to 2 KiB if longer). The engine MUST then thread an FSM event of kind `schema_error` with `costUsdMicros: 0` through `reduceOutcome` so that `schemaErrors` and `consecutiveSchemaErrors` increment and the `dnf_schema_errors` streak can fire, and MUST NOT terminate the run on this event alone. When `kind === "unreachable"`, the engine MUST terminate the run with outcome `llm_unreachable`, MUST NOT insert any `run_shots` row for the failing turn, MUST NOT increment `schemaErrors` or `consecutiveSchemaErrors`, and MUST write the terminal `runs` row with the run's existing counters and `runs.cost_usd_micros` preserved at the value recorded before the failure.

#### Scenario: Transient provider error inserts a fully specified schema_error row

- **WHEN** the provider adapter throws `ProviderError { kind: "transient", cause: "503 upstream" }` on a single turn while `consecutiveSchemaErrors` is `0`
- **THEN** the engine inserts one `run_shots` row with `result = "schema_error"`, `row = NULL`, `col = NULL`, `raw_response = ""`, `reasoning_text = NULL`, `tokens_in = 0`, `tokens_out = 0`, `reasoning_tokens = NULL`, `cost_usd_micros = 0`, a non-negative `duration_ms`, a non-null `created_at`, `llm_error = "503 upstream"`, AND `schemaErrors` increments to `1`, `consecutiveSchemaErrors` increments to `1`, and the run remains non-terminal

#### Scenario: Unreachable provider error terminates with clean counters and no shot row

- **WHEN** the provider adapter throws `ProviderError { kind: "unreachable", cause: "401 unauthorized", status: 401 }` while `consecutiveSchemaErrors` is `0` and `schemaErrors` is `0`
- **THEN** the engine writes the terminal `runs` row with outcome `llm_unreachable`, no `run_shots` row is inserted for the failing turn, and `schemaErrors` and `consecutiveSchemaErrors` both remain at `0`

#### Scenario: Five consecutive transient errors reach dnf_schema_errors

- **WHEN** the provider adapter throws `ProviderError { kind: "transient" }` on five consecutive turns starting from a fresh state
- **THEN** the engine records five `run_shots` rows with `result = "schema_error"` and `llm_error` populated from each call's `cause`, and the fifth turn's FSM pass emits outcome `dnf_schema_errors`

### Requirement: run_shots.llm_error column exists in the schema

The `run_shots` table SHALL carry a nullable `llm_error TEXT` column for recording adapter-reported failure descriptions on `schema_error` turns produced by `ProviderError { kind: "transient" }`. If the column is absent from `backend/db/schema.ts`, a Drizzle migration SHALL be generated in the same change and applied on startup by the migration pipeline from `docs/spec.md` section 5.1. The column MUST be nullable so non-error `run_shots` rows carry `NULL` rather than an empty string.

#### Scenario: Schema exposes a nullable llm_error column

- **WHEN** the database schema is inspected after startup migrations have applied
- **THEN** the `run_shots` table has an `llm_error` column whose type is text-like and whose nullability allows `NULL`

#### Scenario: Non-error rows carry NULL llm_error

- **WHEN** a successful `hit`/`miss`/`sunk`/`invalid_coordinate` turn is persisted
- **THEN** that row's `llm_error` value is `NULL`
