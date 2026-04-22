# mock-provider Specification

## Purpose

TBD - created by archiving change s2a-game-loop-mock. Update Purpose after archive.

## Requirements

### Requirement: Provider adapter interface

The backend SHALL expose a `ProviderAdapter` interface under `backend/src/providers/types.ts` with three fields (`id`, `models`, `call`). The `id` field is the provider's short slug. The `models` field is a readonly array of `ProviderModel` entries, each with `id`, `displayName`, and `hasReasoning`. The `call(input, signal)` method accepts a `ProviderCallInput` (`modelId`, `apiKey`, `boardPng`, `shipsRemaining`, `systemPrompt`, `priorShots`, `seedDate`) plus an `AbortSignal`, and returns a promise of `ProviderCallOutput` (`rawText`, `tokensIn`, `tokensOut`, `reasoningTokens`, `costUsdMicros`, `durationMs`). The adapter MUST honor the `AbortSignal` by aborting any in-flight work and rejecting with an `AbortError`. The adapter MUST NOT log, persist, or echo `apiKey` in any returned value. The interface extends `docs/spec.md` 6.1 by one field (`seedDate`), which is public information; real provider adapters ignore it.

#### Scenario: Interface shape is stable across adapters

- **WHEN** the project exposes a `ProviderAdapter` value
- **THEN** it has exactly the properties `id`, `models`, `call`, where `models` is a readonly array of `{ id, displayName, hasReasoning }` entries

#### Scenario: call honors AbortSignal

- **WHEN** `adapter.call(input, signal)` is invoked and `signal.abort(...)` is called before the promise resolves
- **THEN** the promise rejects with an `AbortError` and the adapter cleans up any timers or in-flight requests it created

### Requirement: Provider registry

The backend SHALL expose a `createProviderRegistry(adapters)` factory that accepts a record mapping provider ids to adapter instances and returns a registry with `get(providerId)` (returning the adapter or undefined) and `listIds()` (returning every registered id). The registry MUST NOT introspect adapters beyond the documented interface.

#### Scenario: Get returns registered adapter

- **WHEN** `registry.get("mock")` is invoked on a registry initialized with a `mock` adapter
- **THEN** it returns the exact adapter instance that was registered

#### Scenario: Get returns undefined for unknown provider

- **WHEN** `registry.get("unregistered")` is invoked
- **THEN** it returns `undefined`

### Requirement: Mock provider adapter with three model variants

The backend SHALL expose a `createMockProvider({ delayMs? }): ProviderAdapter` factory whose returned adapter has `id = "mock"` and exactly three models: `mock-happy`, `mock-misses`, `mock-schema-errors`. The adapter MUST be stateless: every call reconstructs per-run state from `priorShots` + `seedDate` alone. The adapter MUST await `delayMs` (default `MOCK_TURN_DELAY_MS_DEFAULT = 150`) before returning, and MUST abort the sleep promptly when the `AbortSignal` fires. On every call, the adapter MUST return `tokensIn = 0`, `tokensOut = 0`, `reasoningTokens = null`, `costUsdMicros = 0`, and `durationMs` equal to the measured wall-clock of its own work. This adapter is a dev/test-only fixture for the S2 benchmark surface: it MUST remain excluded from production-facing provider lists, docs, and default non-dev bootstrap paths, and SHOULD be removed or explicitly gated once real providers ship in S3.

#### Scenario: Three model ids are exposed

- **WHEN** a consumer reads `createMockProvider().models`
- **THEN** the array has length 3 with ids exactly `mock-happy`, `mock-misses`, `mock-schema-errors`

#### Scenario: Zero tokens and zero cost on every call

- **WHEN** the mock adapter resolves a call
- **THEN** the returned output has `tokensIn === 0`, `tokensOut === 0`, `reasoningTokens === null`, `costUsdMicros === 0`

#### Scenario: Pacing honors delayMs and aborts promptly

- **WHEN** `createMockProvider({ delayMs: 1000 }).call(input, signal)` is invoked and the signal is aborted before the delay elapses
- **THEN** the returned promise rejects with an `AbortError` within a small epsilon of the abort, not after the full delay

#### Scenario: Unknown modelId rejects

- **WHEN** the adapter is called with a `modelId` outside the three documented values
- **THEN** the returned promise rejects

### Requirement: `mock-happy` produces a winning run in at most 100 shots

The `mock-happy` variant MUST always return a JSON payload that `parseShot` classifies as `kind: "ok"` with in-range, non-duplicate coordinates reconstructed purely from `priorShots`. The variant MUST use a deterministic hunt-plus-target strategy (stride-2 checkerboard hunt; on the last `hit` in `priorShots`, target its orthogonal neighbors) so that, given a layout produced by `generateBoard(seedDate)`, the full game reaches a `won` state in no more than 100 shots.

#### Scenario: Every call returns a parse-clean shot

- **WHEN** `mock-happy` is called with any well-formed input
- **THEN** parsing the returned `rawText` via the shared `parseShot` yields `kind: "ok"` with an integer `row` in `[0,9]` and integer `col` in `[0,9]`

#### Scenario: Never duplicates a prior shot

- **WHEN** `mock-happy` is called with a non-empty `priorShots` array
- **THEN** the returned shot's `(row, col)` does not equal any `(row, col)` in `priorShots`

#### Scenario: Full game ends in `won` within 100 shots

- **WHEN** a test loops on `mock-happy`, resolves each returned shot against the real layout for `seedDate`, and appends each resolution to `priorShots`
- **THEN** after at most 100 iterations the cumulative number of ship cells hit equals 17

### Requirement: `mock-misses` fires 83 genuine misses then degrades to duplicate-shot

The `mock-misses` variant MUST call `generateBoard(input.seedDate)` to derive the layout, enumerate non-ship cells in row-major order, and return the first non-ship cell not already in `priorShots`. When all 83 non-ship cells have been shot, it MUST re-fire the first prior shot, which the game loop classifies as `invalid_coordinate` via the duplicate-shot rule (`docs/spec.md` 3.5). This produces the deterministic profile `shotsFired=100, hits=0, misses=83, invalidCoordinates=17`.

#### Scenario: Avoids every ship cell when unshot non-ship cells remain

- **WHEN** `mock-misses` is called and `priorShots` does not yet cover every non-ship cell for `seedDate`
- **THEN** the returned `(row, col)` belongs to a cell that is in-range, is not a ship cell for `seedDate`, and does not appear in `priorShots`

#### Scenario: Falls back to duplicate-shot after exhausting non-ship cells

- **WHEN** `mock-misses` is called after `priorShots` already contains every non-ship cell for `seedDate`
- **THEN** the returned `(row, col)` equals `priorShots[0].row, priorShots[0].col`

#### Scenario: End-to-end profile is 83 misses + 17 invalid_coordinates

- **WHEN** a test drives `mock-misses` through the game loop for `seedDate = "2026-04-21"`
- **THEN** the persisted run row has `shotsFired === 100`, `hits === 0`, `schemaErrors === 0`, `invalidCoordinates === 17`, and the run_shots table contains exactly 83 `miss` rows and 17 `invalid_coordinate` rows

### Requirement: `mock-schema-errors` always produces a parse-failing payload

The `mock-schema-errors` variant MUST return a `rawText` that causes the shared `parseShot` to return `kind: "schema_error"` on every call. The variant MUST NOT return a payload that would classify as `invalid_coordinate` (integer row/col out of range) or `ok`. The specific payload MAY be a single constant string or drawn from a fixed set. The variant MUST NOT depend on `priorShots` advancing to rotate payloads, because the engine hands the adapter a `priorShots` array filtered to `hit | miss | sunk` only - a schema-error-only run produces an empty filtered list every turn.

#### Scenario: Every call produces a schema_error

- **WHEN** `mock-schema-errors` is called for the first ten turns
- **THEN** each returned `rawText` parses via the shared `parseShot` to `kind: "schema_error"`

#### Scenario: Payload selection does not depend on priorShots

- **WHEN** `mock-schema-errors` is called repeatedly with `priorShots: []` (the realistic input during a schema-error-only run)
- **THEN** every call still returns a `rawText` whose `parseShot` result is `kind: "schema_error"`

#### Scenario: Full game ends in `dnf_schema_errors` at 5 consecutive schema errors

- **WHEN** a test drives `mock-schema-errors` through the game loop
- **THEN** the persisted outcome equals `dnf_schema_errors` and exactly 5 `run_shots` rows with `result = "schema_error"` are present
