## ADDED Requirements

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

The shared package SHALL export a closed-set error-code enum that contains at minimum the values `invalid_input`, `not_found`, `run_terminal`, `provider_unavailable`, `budget_required`, `rate_limited`, `maintenance_soft`, `too_many_active_runs`, and `internal`, and SHALL export a TypeScript interface named `ErrorEnvelope` describing the wire shape `{ error: { code, message, detail? } }` where `code` is narrowed to the error-code enum, `message` is a string, and `detail` is an optional record of arbitrary key-value data. The envelope interface MUST be usable by the backend to type every JSON error response and by the web workspace to type every decoded error body without redeclaration.

#### Scenario: Error-code enum surfaces every required code

- **WHEN** a consumer reads the exported error-code set
- **THEN** it MUST include at minimum `invalid_input`, `not_found`, `run_terminal`, `provider_unavailable`, `budget_required`, `rate_limited`, `maintenance_soft`, `too_many_active_runs`, and `internal`

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

The shared package SHALL export a function `parseShot(rawText)` that accepts a single string and returns a discriminated union whose `kind` field is one of three literals: `ok`, `schema_error`, or `invalid_coordinate`. The `ok` variant carries the parsed shot with integer `row`, integer `col`, and an optional `reasoning` string that is present only when the input JSON object contained a `reasoning` property whose value is a string. The `schema_error` variant MUST be returned when the input is not valid JSON, is not a JSON object, is a JSON array, is a JSON `null`, lacks a `row` integer property, lacks a `col` integer property, has a non-integer `row` or `col` (including string, float, boolean, or `null`), or has a `reasoning` property that is present and not a string. The `invalid_coordinate` variant MUST be returned when `row` and `col` are both integers but at least one falls outside the half-open range `[0, BOARD_SIZE)`; the variant MUST carry the parsed `row` and `col` for logging. Extra top-level keys other than `row`, `col`, and `reasoning` MUST NOT cause a `schema_error`; they are silently dropped.

#### Scenario: Valid in-range shot with no reasoning

- **WHEN** `parseShot` is called with the string `{"row":3,"col":5}`
- **THEN** it returns `kind: "ok"` with `shot.row = 3`, `shot.col = 5`, and no `reasoning` property

#### Scenario: Valid in-range shot with reasoning

- **WHEN** `parseShot` is called with the string `{"row":0,"col":0,"reasoning":"corner probe"}`
- **THEN** it returns `kind: "ok"` with `shot.row = 0`, `shot.col = 0`, and `shot.reasoning = "corner probe"`

#### Scenario: Non-JSON input is a schema_error

- **WHEN** `parseShot` is called with a string that is not parseable as JSON (for example `A1`)
- **THEN** it returns `kind: "schema_error"`

#### Scenario: JSON value with the wrong top-level shape is a schema_error

- **WHEN** `parseShot` is called with a JSON array, a JSON `null`, a JSON string, or a JSON number
- **THEN** it returns `kind: "schema_error"`

#### Scenario: Missing row or col is a schema_error

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

The shared package MUST NOT declare any runtime dependency beyond the TypeScript-compiled output of its own source files; the `dependencies` field in its `package.json` is empty. The `backend` and `web` workspaces MUST depend on the shared package using the `workspace:*` protocol so Bun resolves it from the local monorepo rather than the npm registry. The shared package's published entry point MUST expose types, enums, constants, the `parseShot` validator, the `HealthResponse` type, and the `ErrorEnvelope` type as a single stable import surface usable from both backend and web.

#### Scenario: Shared package declares no runtime dependencies

- **WHEN** a reader inspects `shared/package.json`
- **THEN** the `dependencies` field is absent or empty

#### Scenario: Backend and web consume shared via workspace protocol

- **WHEN** a reader inspects `backend/package.json` and `web/package.json`
- **THEN** each declares `@battleship-arena/shared` with the version specifier `workspace:*`

#### Scenario: Full surface is importable from a single entry point

- **WHEN** a consumer imports from `@battleship-arena/shared`
- **THEN** the following names resolve without per-file deep imports: the outcome enum and its guard, the error-code enum, the `ErrorEnvelope` type, the `BOARD_SIZE` constant, the fleet definition, the total-ship-cells constant, the shot-cap constant, the consecutive-schema-error threshold, the `parseShot` function and its result type, and the `HealthResponse` type

### Requirement: parseShot is a pure function

`parseShot` MUST be a pure function: calling it with the same input string always produces a structurally identical result; it MUST NOT perform any I/O (no network, no file system, no database); it MUST NOT read or write mutable module-level state; it MUST NOT mutate global objects; it MUST NOT invoke time-dependent APIs (clock, random number generation) that would make its output non-deterministic. This purity is load-bearing because the validator is exercised on every model turn and is expected to be cheap, deterministic, and safe to call from any environment including test, SSR, and service-worker contexts.

#### Scenario: Repeated calls with the same input return the same result

- **WHEN** `parseShot` is called twice with the identical input string
- **THEN** both calls return results with the same `kind` and structurally equal payloads

#### Scenario: No observable side effect

- **WHEN** `parseShot` is called with any input
- **THEN** no network request is issued, no file or database handle is opened, no mutable module-level variable is written, and the global object is not altered
