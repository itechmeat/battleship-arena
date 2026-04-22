## ADDED Requirements

### Requirement: BoardView and CellState types

The shared package SHALL export `CellState` as a union of exactly the string literals `"unknown"`, `"miss"`, `"hit"`, `"sunk"`, and `BoardView` as an interface `{ size: 10; cells: readonly CellState[] }`. Every producer of a `BoardView` value (the game engine, the board-view derivation helper on the web side, and every test fixture) MUST satisfy the documented runtime invariant that `cells.length === 100` with the cells stored in row-major order (cell at index `row * 10 + col`). The invariant is enforced at runtime by the producers and by a fixture-level check in tests, not by the TypeScript type system; a fixed-length tuple type was considered and rejected because any transformation through `.map` or `.filter` would collapse to an ordinary array in practice.

#### Scenario: CellState union has four members

- **WHEN** a consumer inspects the exported `CellState` union
- **THEN** it contains exactly `"unknown"`, `"miss"`, `"hit"`, `"sunk"` and no other members

#### Scenario: BoardView type shape

- **WHEN** a consumer assigns a value to `BoardView`
- **THEN** the TypeScript compiler requires `size === 10` (numeric literal narrowed) and `cells` typed as `readonly CellState[]`

#### Scenario: Producers of BoardView satisfy the 100-cell row-major runtime invariant

- **WHEN** any production code path or committed test fixture constructs a `BoardView`
- **THEN** the resulting value has `cells.length === 100` with the cells indexed in row-major order (cell at index `row * 10 + col` corresponds to board position `(row, col)`)

### Requirement: RunMeta, RunShotRow, and StartRunInput types

The shared package SHALL export `RunMeta`, `RunShotRow`, and `StartRunInput` TypeScript interfaces matching the public wire shape returned by the runs API. `RunMeta` MUST mirror the `runs` row minus `client_session` and MUST carry a nullable `outcome` narrowed to the `Outcome` union. `RunShotRow` MUST mirror the `run_shots` row with `result` narrowed to the union `"hit" | "miss" | "sunk" | "schema_error" | "invalid_coordinate"`. `StartRunInput` MUST carry `providerId`, `modelId`, `apiKey`, optional `budgetUsd`, `clientSession`, and `seedDate`.

#### Scenario: RunMeta omits client_session

- **WHEN** a consumer declares a value of type `RunMeta`
- **THEN** the TypeScript type does not include a `clientSession` or `client_session` property

#### Scenario: RunShotRow.result is a closed union

- **WHEN** a consumer declares a value of type `RunShotRow`
- **THEN** assigning `result` to any string outside `"hit" | "miss" | "sunk" | "schema_error" | "invalid_coordinate"` fails TypeScript compilation

### Requirement: SSE event union with discriminator guard

The shared package SHALL export an `SseEvent` discriminated union with four variants keyed on `kind`: `"open"`, `"shot"`, `"resync"`, `"outcome"`. Every variant MUST carry a numeric `id`. The `shot` variant MUST carry `idx`, nullable `row` and `col`, a `result` drawn from `ShotResult`, and a nullable `reasoning`. The `open` variant MUST carry `runId`, `startedAt`, `seedDate`. The `outcome` variant MUST carry `outcome`, `shotsFired`, `hits`, `schemaErrors`, `invalidCoordinates`, `endedAt`. The `"open"` variant is a custom server-emitted SSE payload event; consumers MUST NOT confuse it with the browser's native `EventSource` connection `open` event, which carries no JSON payload. A runtime guard `isSseEvent(value)` MUST narrow `unknown` to `SseEvent` by requiring a numeric `id` and a `kind` drawn from the four permitted values.

#### Scenario: Guard accepts a well-shaped shot event

- **WHEN** `isSseEvent` is called with `{ kind: "shot", id: 1, idx: 0, row: 0, col: 0, result: "miss", reasoning: null }`
- **THEN** it returns `true` and narrows the argument

#### Scenario: Guard rejects unknown kind

- **WHEN** `isSseEvent` is called with `{ kind: "weird", id: 1 }`
- **THEN** it returns `false`

#### Scenario: Guard rejects missing id

- **WHEN** `isSseEvent` is called with `{ kind: "resync" }`
- **THEN** it returns `false`

### Requirement: Shared SVG board template for server and client

The shared package SHALL export a pure function `renderBoardSvg(view: BoardView): string` that returns a deterministic SVG string with a fixed viewBox `0 0 640 640` (64px per cell), no `<text>` elements, and closed-geometry markers for each cell state. This same function MUST be imported by both the backend PNG renderer and the web `BoardView` island so the model-facing and user-facing board renderings are byte-equivalent (modulo the downstream PNG vs DOM delivery).

#### Scenario: Output is deterministic

- **WHEN** `renderBoardSvg` is called twice with the same view
- **THEN** the two returned strings are byte-identical

#### Scenario: No text elements

- **WHEN** `renderBoardSvg` is called for any view
- **THEN** the returned string does not contain `<text`

### Requirement: S2a constants for ring capacity, heartbeat, schema-error threshold, mock delay

The shared package SHALL export four new constants: `RING_CAPACITY = 200`, `SSE_HEARTBEAT_MS = 25_000`, `SCHEMA_ERROR_DNF_THRESHOLD = 5`, `MOCK_TURN_DELAY_MS_DEFAULT = 150`. These constants SHALL be consumed by the backend's event ring, SSE handler, outcome FSM, and mock provider adapter respectively. The existing `CONSECUTIVE_SCHEMA_ERROR_LIMIT` MAY remain as an alias of `SCHEMA_ERROR_DNF_THRESHOLD`.

#### Scenario: All four constants resolve to the documented values

- **WHEN** a consumer imports the four constants
- **THEN** they equal exactly `200`, `25_000`, `5`, `150`

## MODIFIED Requirements

### Requirement: Error-code enum and typed error envelope

The shared package SHALL export a closed-set error-code enum that contains at minimum the values `invalid_input`, `not_found`, `run_not_found`, `run_terminal`, `already_aborted`, `provider_unavailable`, `budget_required`, `rate_limited`, `maintenance_soft`, `too_many_active_runs`, and `internal`, and SHALL export a TypeScript interface named `ErrorEnvelope` describing the wire shape `{ error: { code, message, detail? } }` where `code` is narrowed to the error-code enum, `message` is a string, and `detail` is an optional record of arbitrary key-value data. The envelope interface MUST be usable by the backend to type every JSON error response and by the web workspace to type every decoded error body without redeclaration.

#### Scenario: Error-code enum surfaces every required code

- **WHEN** a consumer reads the exported error-code set
- **THEN** it MUST include at minimum `invalid_input`, `not_found`, `run_not_found`, `run_terminal`, `already_aborted`, `provider_unavailable`, `budget_required`, `rate_limited`, `maintenance_soft`, `too_many_active_runs`, and `internal`

#### Scenario: ErrorEnvelope shape is typed and closed

- **WHEN** a consumer types a value as `ErrorEnvelope`
- **THEN** the TypeScript compiler MUST require `error.code` to be one of the exported error-code enum members, `error.message` to be a string, and `error.detail` to be optional

### Requirement: Zero-runtime-dependency package consumable via workspace protocol

The shared package MUST NOT declare any runtime dependency beyond the TypeScript-compiled output of its own source files; the `dependencies` field in its `package.json` is empty. The `backend` and `web` workspaces MUST depend on the shared package using the `workspace:*` protocol so Bun resolves it from the local monorepo rather than the npm registry. The shared package's published entry point MUST expose types, enums, constants, the `parseShot` validator, the `HealthResponse` type, the `ErrorEnvelope` type, the board view types, the SSE event union plus its guard, and the SVG board template as a single stable import surface usable from both backend and web.

#### Scenario: Shared package declares no runtime dependencies

- **WHEN** a reader inspects `shared/package.json`
- **THEN** the `dependencies` field is absent or empty

#### Scenario: Backend and web consume shared via workspace protocol

- **WHEN** a reader inspects `backend/package.json` and `web/package.json`
- **THEN** each declares `@battleship-arena/shared` with the version specifier `workspace:*`

#### Scenario: Full surface is importable from a single entry point

- **WHEN** a consumer imports from `@battleship-arena/shared`
- **THEN** the following names resolve without per-file deep imports: the outcome enum and its guard, the error-code enum (including `run_not_found` and `already_aborted`), the `ErrorEnvelope` type, the `BOARD_SIZE` constant, the fleet definition, the total-ship-cells constant, the shot-cap constant, the consecutive-schema-error threshold, the `RING_CAPACITY`, `SSE_HEARTBEAT_MS`, `SCHEMA_ERROR_DNF_THRESHOLD`, `MOCK_TURN_DELAY_MS_DEFAULT` constants, the `parseShot` function and its result type, the `HealthResponse` type, the `BoardView` and `CellState` types, the `RunMeta`, `RunShotRow`, `ShotResult`, and `StartRunInput` types, the `SseEvent` union and `isSseEvent` guard, and the `renderBoardSvg` function
