## MODIFIED Requirements

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

- **WHEN** the updated `accumulatedCostMicros` equals `40_000` after a `miss` event under `context: { budgetMicros: 40_000 }` and no earlier-priority outcome fires
- **THEN** the result's `outcome` equals `"dnf_budget"`

#### Scenario: Null budget never triggers dnf_budget

- **WHEN** any single non-`abort` event pushes `accumulatedCostMicros` arbitrarily high under `context: { budgetMicros: null }`
- **THEN** the FSM does not emit `dnf_budget` and the run continues until another terminal condition fires

#### Scenario: Zero budget never triggers dnf_budget

- **WHEN** any single non-`abort` event pushes `accumulatedCostMicros` arbitrarily high under `context: { budgetMicros: 0 }`
- **THEN** the FSM does not emit `dnf_budget` and the run continues until another terminal condition fires

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

## ADDED Requirements

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
