# shared-contract Specification

## Purpose

TBD - created by archiving change s1a-bootstrap. Update Purpose after archive.

## Requirements

### Requirement: Outcome enum with type-narrowing guard

The `@battleship-arena/shared` package SHALL export a closed-set outcome enum whose members are exactly the seven values `won`, `dnf_shot_cap`, `dnf_schema_errors`, `dnf_budget`, `llm_unreachable`, `aborted_viewer`, and `aborted_server_restart`, together with a TypeScript type alias derived from that set and a runtime type-narrowing guard that returns a boolean indicating whether an arbitrary value is a member of the enum. The enum members MUST match `docs/spec.md` section 4.2 terminal outcomes exactly; no synonym, no additional value, no omission. Consumers MUST be able to use the guard to narrow `unknown` to the outcome type without additional runtime checks.

#### Scenario: All seven outcome values are exported

- **WHEN** a consumer imports the outcome enum from the shared package
- **THEN** it MUST contain exactly the strings `won`, `dnf_shot_cap`, `dnf_schema_errors`, `dnf_budget`, `llm_unreachable`, `aborted_viewer`, `aborted_server_restart` and nothing else

#### Scenario: Guard accepts a known outcome string

- **WHEN** the guard is called with a string that is a member of the outcome enum
- **THEN** it returns `true` and narrows the argument's TypeScript type to the outcome type

#### Scenario: Guard rejects a non-outcome value

- **WHEN** the guard is called with a value that is not a member of the outcome enum (arbitrary string, number, object, `null`, `undefined`)
- **THEN** it returns `false` and does not narrow the argument

### Requirement: Error-code enum and typed error envelope

The shared package SHALL export a closed-set error-code enum that contains at minimum the values `invalid_input`, `not_found`, `run_not_found`, `run_terminal`, `already_aborted`, `provider_unavailable`, `budget_required`, `rate_limited`, `maintenance_soft`, `too_many_active_runs`, and `internal`, and SHALL export a TypeScript interface named `ErrorEnvelope` describing the wire shape `{ error: { code, message, detail? } }` where `code` is narrowed to the error-code enum, `message` is a string, and `detail` is an optional record of arbitrary key-value data. The envelope interface MUST be usable by the backend to type every JSON error response and by the web workspace to type every decoded error body without redeclaration.

#### Scenario: Error-code enum surfaces every required code

- **WHEN** a consumer reads the exported error-code set
- **THEN** it MUST include at minimum `invalid_input`, `not_found`, `run_not_found`, `run_terminal`, `already_aborted`, `provider_unavailable`, `budget_required`, `rate_limited`, `maintenance_soft`, `too_many_active_runs`, and `internal`

#### Scenario: ErrorEnvelope shape is typed and closed

- **WHEN** a consumer types a value as `ErrorEnvelope`
- **THEN** the TypeScript compiler MUST require `error.code` to be one of the exported error-code enum members, `error.message` to be a string, and `error.detail` to be optional

### Requirement: Board and game constants

The shared package SHALL export a constant `BOARD_SIZE` with value `10`, a fleet definition that enumerates the five ships with their lengths (`carrier` length `5`, `battleship` length `4`, `cruiser` length `3`, `submarine` length `3`, `destroyer` length `2`), a derived constant representing the total number of ship cells equal to `17`, a constant representing the shot cap equal to `100`, and a constant representing the consecutive schema-error threshold equal to `5`. The fleet definition MUST enumerate exactly five ships and MUST NOT include any ship outside the five listed. The total ship-cells constant MUST be derivable from the fleet definition rather than hand-entered independently.

#### Scenario: BOARD_SIZE equals 10

- **WHEN** a consumer reads the exported `BOARD_SIZE`
- **THEN** its value is the integer `10`

#### Scenario: Fleet composition matches the five-ship specification

- **WHEN** a consumer iterates the exported fleet
- **THEN** it yields exactly five entries whose `(name, length)` pairs are `(carrier, 5)`, `(battleship, 4)`, `(cruiser, 3)`, `(submarine, 3)`, `(destroyer, 2)`

#### Scenario: Derived total ship cells equals 17

- **WHEN** a consumer reads the exported total-ship-cells constant
- **THEN** its value is the integer `17` and equals the sum of the lengths in the fleet

#### Scenario: Shot cap and schema-error threshold are exported

- **WHEN** a consumer reads the exported shot-cap constant and the exported consecutive-schema-error threshold
- **THEN** their values are the integers `100` and `5` respectively

### Requirement: parseShot validator with discriminated result

The shared package SHALL export a function `parseShot(rawText)` that accepts a single string and returns a discriminated union whose `kind` field is one of three literals: `ok`, `schema_error`, or `invalid_coordinate`. The canonical `ok` input shape is `{ "cell": "A1" }`, where `cell` is a column letter `A` through `J` plus a row number `1` through `10`; optional zero padding (`A01`) MUST be accepted. The legacy `{ "row": 0, "col": 0 }` shape MUST also be accepted for older adapters and fixtures. The `ok` variant carries the parsed shot with integer `row`, integer `col`, and an optional `reasoning` string that is present only when the input JSON object contained a `reasoning` property whose value is a string. The `schema_error` variant MUST be returned when the input is not valid JSON, is not a JSON object, is a JSON array, is a JSON `null`, has an invalid `cell`, lacks both a valid `cell` and valid integer `row`/`col`, has non-integer legacy `row` or `col`, or has a `reasoning` property that is present and not a string. The `invalid_coordinate` variant MUST be returned when legacy `row` and `col` are both integers but at least one falls outside the half-open range `[0, BOARD_SIZE)`; the variant MUST carry the parsed `row` and `col` for logging. Extra top-level keys other than `cell`, `row`, `col`, and `reasoning` MUST NOT cause a `schema_error`; they are silently dropped.

#### Scenario: Valid in-range shot with no reasoning

- **WHEN** `parseShot` is called with the string `{"row":3,"col":5}`
- **THEN** it returns `kind: "ok"` with `shot.row = 3`, `shot.col = 5`, and no `reasoning` property

#### Scenario: Valid cell notation with optional zero-padded rows

- **WHEN** `parseShot` is called with the string `{"cell":"F04"}` or `{"cell":"J10"}`
- **THEN** it returns `kind: "ok"` with zero-based numeric `row` and `col` values matching those cells

#### Scenario: Valid in-range shot with reasoning

- **WHEN** `parseShot` is called with the string `{"row":0,"col":0,"reasoning":"corner probe"}`
- **THEN** it returns `kind: "ok"` with `shot.row = 0`, `shot.col = 0`, and `shot.reasoning = "corner probe"`

#### Scenario: Non-JSON input is a schema_error

- **WHEN** `parseShot` is called with a string that is not parseable as JSON (for example `A1`)
- **THEN** it returns `kind: "schema_error"`

#### Scenario: JSON value with the wrong top-level shape is a schema_error

- **WHEN** `parseShot` is called with a JSON array, a JSON `null`, a JSON string, or a JSON number
- **THEN** it returns `kind: "schema_error"`

#### Scenario: Missing cell and row/col is a schema_error

- **WHEN** `parseShot` is called with `{"row":3}` or `{"col":5}`
- **THEN** it returns `kind: "schema_error"`

#### Scenario: Non-integer row or col is a schema_error

- **WHEN** `parseShot` is called with a payload whose `row` or `col` is a string, float, boolean, or `null` (for example `{"row":"3","col":5}` or `{"row":3,"col":5.5}`)
- **THEN** it returns `kind: "schema_error"`

#### Scenario: Non-string reasoning is a schema_error

- **WHEN** `parseShot` is called with a payload whose `reasoning` is present and not a string (for example `{"row":3,"col":5,"reasoning":42}`)
- **THEN** it returns `kind: "schema_error"`

#### Scenario: Out-of-range row or col is an invalid_coordinate

- **WHEN** `parseShot` is called with `{"row":10,"col":0}` or `{"row":0,"col":-1}` where at least one of `row` or `col` falls outside `[0, BOARD_SIZE)`
- **THEN** it returns `kind: "invalid_coordinate"` and exposes the parsed `row` and `col`

#### Scenario: Extra top-level keys are ignored

- **WHEN** `parseShot` is called with `{"row":1,"col":2,"extra":"nope"}`
- **THEN** it returns `kind: "ok"` with `shot.row = 1` and `shot.col = 2`, and the `extra` key is dropped

### Requirement: HealthResponse type for /api/health

The shared package SHALL export a TypeScript interface describing the JSON body of the backend's `GET /api/health` endpoint with exactly the four fields `status`, `version`, `commitSha`, and `startedAt`. The `status` field MUST be typed as the string literal `"ok"` (not `string`) so a drift between the backend response and a client decoder is caught at compile time. The `version` and `commitSha` fields MUST be typed as `string`. The `startedAt` field MUST be typed as a number representing a Unix timestamp captured at process boot.

#### Scenario: HealthResponse shape is available to both workspaces

- **WHEN** the backend constructs a health-endpoint response body and the web workspace decodes a health-endpoint response
- **THEN** both import the same `HealthResponse` type from the shared package and the compiler enforces the four fields `status: "ok"`, `version: string`, `commitSha: string`, `startedAt: number`

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

### Requirement: parseShot is a pure function

`parseShot` MUST be a pure function: calling it with the same input string always produces a structurally identical result; it MUST NOT perform any I/O (no network, no file system, no database); it MUST NOT read or write mutable module-level state; it MUST NOT mutate global objects; it MUST NOT invoke time-dependent APIs (clock, random number generation) that would make its output non-deterministic. This purity is load-bearing because the validator is exercised on every model turn and is expected to be cheap, deterministic, and safe to call from any environment including test, SSR, and service-worker contexts.

#### Scenario: Repeated calls with the same input return the same result

- **WHEN** `parseShot` is called twice with the identical input string
- **THEN** both calls return results with the same `kind` and structurally equal payloads

#### Scenario: No observable side effect

- **WHEN** `parseShot` is called with any input
- **THEN** no network request is issued, no file or database handle is opened, no mutable module-level variable is written, and the global object is not altered

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

The shared package SHALL export `RunMeta`, `RunShotRow`, and `StartRunInput` TypeScript interfaces matching the public wire shape returned by the runs API. `RunMeta` MUST mirror the `runs` row minus `client_session`, MUST carry `reasoningEnabled: boolean`, and MUST carry a nullable `outcome` narrowed to the `Outcome` union. `RunShotRow` MUST mirror the `run_shots` row with `result` narrowed to the union `"hit" | "miss" | "sunk" | "schema_error" | "invalid_coordinate" | "timeout"`. `StartRunInput` MUST carry `providerId`, `modelId`, `apiKey`, `reasoningEnabled: boolean`, optional `budgetUsd`, `clientSession`, and `seedDate`.

#### Scenario: RunMeta omits client_session

- **WHEN** a consumer declares a value of type `RunMeta`
- **THEN** the TypeScript type does not include a `clientSession` or `client_session` property

#### Scenario: RunShotRow.result is a closed union

- **WHEN** a consumer declares a value of type `RunShotRow`
- **THEN** assigning `result` to any string outside `"hit" | "miss" | "sunk" | "schema_error" | "invalid_coordinate" | "timeout"` fails TypeScript compilation

### Requirement: SSE event union with discriminator guard

The shared package SHALL export an `SseEvent` discriminated union with four variants keyed on `kind`: `"open"`, `"shot"`, `"resync"`, `"outcome"`. Every variant MUST carry a numeric `id`. The `shot` variant MUST carry `idx`, nullable `row` and `col`, a `result` drawn from `ShotResult`, and a nullable `reasoning`; it MAY also carry finite numeric `tokensIn`, `tokensOut`, `reasoningTokens`, `costUsdMicros`, `durationMs`, and `createdAt` fields, with `reasoningTokens` also allowed to be `null`. The `open` variant MUST carry `runId`, `startedAt`, `seedDate`. The `outcome` variant MUST carry `outcome`, `shotsFired`, `hits`, `schemaErrors`, `invalidCoordinates`, `endedAt`. The `"open"` variant is a custom server-emitted SSE payload event; consumers MUST NOT confuse it with the browser's native `EventSource` connection `open` event, which carries no JSON payload. A runtime guard `isSseEvent(value)` MUST narrow `unknown` to `SseEvent` by requiring a numeric `id` and a `kind` drawn from the four permitted values and by validating optional shot telemetry when present.

#### Scenario: Guard accepts a well-shaped shot event

- **WHEN** `isSseEvent` is called with `{ kind: "shot", id: 1, idx: 0, row: 0, col: 0, result: "miss", reasoning: null }`
- **THEN** it returns `true` and narrows the argument

#### Scenario: Guard accepts timeout shot and optional telemetry

- **WHEN** `isSseEvent` is called with a `shot` event whose `result` is `"timeout"` and whose telemetry fields are finite numbers or `null` for `reasoningTokens`
- **THEN** it returns `true` and narrows the argument

#### Scenario: Guard rejects unknown kind

- **WHEN** `isSseEvent` is called with `{ kind: "weird", id: 1 }`
- **THEN** it returns `false`

#### Scenario: Guard rejects missing id

- **WHEN** `isSseEvent` is called with `{ kind: "resync" }`
- **THEN** it returns `false`

### Requirement: Shared SVG board template for server and client

The shared package SHALL export a pure function `renderBoardSvg(view: BoardView): string` that returns a deterministic SVG string with a fixed viewBox `0 0 640 640` (64px per cell), no `<text>` elements, and closed-geometry markers for each cell state. This same function MUST be imported by both the backend PNG renderer and the web `BoardView` island so the user-facing board and public PNG preview render consistently (modulo the downstream PNG vs DOM delivery).

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

### Requirement: ProviderError discriminated union

The `@battleship-arena/shared` package SHALL export a `ProviderError` type as a TypeScript discriminated union with the shape `{ kind: "transient"; cause: string } | { kind: "unreachable"; cause: string; status: number }`. The `kind` field MUST be the sole discriminator. The `transient` variant MUST carry only `kind` and `cause`. The `unreachable` variant MUST carry `kind`, `cause`, and a numeric `status`. The type MUST be importable from the shared package's single stable entry point and MUST be consumable by the backend engine to branch on `kind` without additional runtime introspection beyond a narrowing switch.

#### Scenario: Both variants compile and narrow by kind

- **WHEN** a consumer imports `ProviderError` and writes a `switch (err.kind)` block with cases for `"transient"` and `"unreachable"`
- **THEN** the TypeScript compiler narrows `err` to the respective variant inside each case, accepts access to `err.cause` in both, and accepts access to `err.status` only inside the `"unreachable"` case

#### Scenario: Engine consumes the union to map to outcomes

- **WHEN** the engine receives a value typed as `ProviderError` and branches on `kind`
- **THEN** the compiler permits the engine to classify the `transient` branch as a `schema_error` turn and the `unreachable` branch as the `llm_unreachable` outcome without any `as` cast

### Requirement: ProvidersResponse wire shape

The shared package SHALL export a `ProvidersResponse` TypeScript type along with its nested `ProvidersResponseProvider` and `ProvidersResponseModel` types describing the JSON body of `GET /api/providers`. `ProvidersResponse` MUST be the shape `{ providers: readonly ProvidersResponseProvider[] }`. `ProvidersResponseProvider` MUST carry `id: string`, `displayName: string`, and `models: readonly ProvidersResponseModel[]`. `ProvidersResponseModel` MUST carry `id: string`, `displayName: string`, `hasReasoning: boolean`, `reasoningMode: "optional" | "forced_on" | "forced_off"`, `pricing: { inputUsdPerMtok: number; outputUsdPerMtok: number }`, `estimatedPromptTokens: number`, `estimatedImageTokens: number`, `estimatedOutputTokensPerShot: number`, `estimatedCostRange: { minUsd: number; maxUsd: number }`, `priceSource: string`, and `lastReviewedAt: string`. The shape MUST round-trip losslessly through `JSON.stringify` and `JSON.parse`.

#### Scenario: Shape round-trips through JSON serialization

- **WHEN** a `ProvidersResponse` value containing at least one provider with at least one model is serialized via `JSON.stringify` and parsed back via `JSON.parse`
- **THEN** the parsed value is structurally equal to the original and can be reassigned to a `ProvidersResponse`-typed variable without compiler error

#### Scenario: Nested types are independently importable

- **WHEN** a consumer imports `ProvidersResponseProvider` and `ProvidersResponseModel` from the shared package
- **THEN** both names resolve, and declaring values of those types enforces the documented fields at compile time

### Requirement: LeaderboardResponse wire shape

The shared package SHALL export a `LeaderboardResponse` TypeScript type along with its nested `LeaderboardRow` type describing the JSON body of `GET /api/leaderboard`. `LeaderboardResponse` MUST carry `scope: "today" | "all"`, `seedDate: string | null`, and `rows: readonly LeaderboardRow[]`. `LeaderboardRow` MUST carry `rank: number`, `providerId: string`, `modelId: string`, `displayName: string`, `reasoningEnabled: boolean`, `shotsToWin: number`, `runsCount: number`, and `bestRunId: string | null`. The `shotsToWin` field MUST be typed as `number` so the all-time scope can carry a fractional median. The `bestRunId` field MUST be nullable so the all-time scope rows (which represent a median, not a single run) can omit a replay link.

#### Scenario: Today row includes bestRunId

- **WHEN** a `LeaderboardResponse` value is constructed with `scope: "today"` and a row carrying `bestRunId: "01HXY..."` and integer `shotsToWin: 42`
- **THEN** the value type-checks as `LeaderboardResponse` and the row satisfies `LeaderboardRow`

#### Scenario: All-time row may carry null bestRunId and a fractional shotsToWin

- **WHEN** a `LeaderboardResponse` value is constructed with `scope: "all"` and a row carrying `bestRunId: null` and fractional `shotsToWin: 22.5`
- **THEN** the value type-checks as `LeaderboardResponse` without any compiler error on the `null` or the non-integer number

### Requirement: Shared contracts expose reasoning fields

The shared package SHALL expose `reasoningEnabled: boolean` on `RunMeta`, `StartRunInput`, and `LeaderboardRow`, and `reasoningMode: "optional" | "forced_on" | "forced_off"` on `ProvidersResponseModel`.

#### Scenario: RunMeta includes reasoningEnabled

- **WHEN** a consumer declares a `RunMeta` value
- **THEN** TypeScript requires a boolean `reasoningEnabled` field

#### Scenario: StartRunInput accepts reasoningEnabled

- **WHEN** a consumer calls the typed `startRun` helper with `reasoningEnabled: true`
- **THEN** the value satisfies `StartRunInput`

#### Scenario: Provider model includes reasoningMode

- **WHEN** a consumer declares a `ProvidersResponseModel`
- **THEN** TypeScript requires `reasoningMode: "optional" | "forced_on" | "forced_off"`

#### Scenario: LeaderboardRow includes reasoningEnabled

- **WHEN** a consumer declares a `LeaderboardRow`
- **THEN** TypeScript requires a boolean `reasoningEnabled` field
