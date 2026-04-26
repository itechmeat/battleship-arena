## ADDED Requirements

### Requirement: ProviderError discriminated union

The `@battleship-arena/shared` package SHALL export a `ProviderError` type as a TypeScript discriminated union with the shape `{ kind: "transient"; cause: string } | { kind: "unreachable"; cause: string; status: number }`. The `kind` field MUST be the sole discriminator. The `transient` variant MUST carry only `kind` and `cause`. The `unreachable` variant MUST carry `kind`, `cause`, and a numeric `status`. The type MUST be importable from the shared package's single stable entry point and MUST be consumable by the backend engine to branch on `kind` without additional runtime introspection beyond a narrowing switch.

#### Scenario: Both variants compile and narrow by kind

- **WHEN** a consumer imports `ProviderError` and writes a `switch (err.kind)` block with cases for `"transient"` and `"unreachable"`
- **THEN** the TypeScript compiler narrows `err` to the respective variant inside each case, accepts access to `err.cause` in both, and accepts access to `err.status` only inside the `"unreachable"` case

#### Scenario: Engine consumes the union to map to outcomes

- **WHEN** the engine receives a value typed as `ProviderError` and branches on `kind`
- **THEN** the compiler permits the engine to classify the `transient` branch as a `schema_error` turn and the `unreachable` branch as the `llm_unreachable` outcome without any `as` cast

### Requirement: ProvidersResponse wire shape

The shared package SHALL export a `ProvidersResponse` TypeScript type along with its nested `ProvidersResponseProvider` and `ProvidersResponseModel` types describing the JSON body of `GET /api/providers`. `ProvidersResponse` MUST be the shape `{ providers: readonly ProvidersResponseProvider[] }`. `ProvidersResponseProvider` MUST carry `id: string`, `displayName: string`, and `models: readonly ProvidersResponseModel[]`. `ProvidersResponseModel` MUST carry `id: string`, `displayName: string`, `hasReasoning: boolean`, `pricing: { inputUsdPerMtok: number; outputUsdPerMtok: number }`, `estimatedPromptTokens: number`, `estimatedImageTokens: number`, `estimatedOutputTokensPerShot: number`, `estimatedCostRange: { minUsd: number; maxUsd: number }`, `priceSource: string`, and `lastReviewedAt: string`. The shape MUST round-trip losslessly through `JSON.stringify` and `JSON.parse`.

#### Scenario: Shape round-trips through JSON serialization

- **WHEN** a `ProvidersResponse` value containing at least one provider with at least one model is serialized via `JSON.stringify` and parsed back via `JSON.parse`
- **THEN** the parsed value is structurally equal to the original and can be reassigned to a `ProvidersResponse`-typed variable without compiler error

#### Scenario: Nested types are independently importable

- **WHEN** a consumer imports `ProvidersResponseProvider` and `ProvidersResponseModel` from the shared package
- **THEN** both names resolve, and declaring values of those types enforces the documented fields at compile time

### Requirement: LeaderboardResponse wire shape

The shared package SHALL export a `LeaderboardResponse` TypeScript type along with its nested `LeaderboardRow` type describing the JSON body of `GET /api/leaderboard`. `LeaderboardResponse` MUST carry `scope: "today" | "all"`, `seedDate: string | null`, and `rows: readonly LeaderboardRow[]`. `LeaderboardRow` MUST carry `rank: number`, `providerId: string`, `modelId: string`, `displayName: string`, `shotsToWin: number`, `runsCount: number`, and `bestRunId: string | null`. The `shotsToWin` field MUST be typed as `number` so the all-time scope can carry a fractional median. The `bestRunId` field MUST be nullable so the all-time scope rows (which represent a median, not a single run) can omit a replay link.

#### Scenario: Today row includes bestRunId

- **WHEN** a `LeaderboardResponse` value is constructed with `scope: "today"` and a row carrying `bestRunId: "01HXY..."` and integer `shotsToWin: 42`
- **THEN** the value type-checks as `LeaderboardResponse` and the row satisfies `LeaderboardRow`

#### Scenario: All-time row may carry null bestRunId and a fractional shotsToWin

- **WHEN** a `LeaderboardResponse` value is constructed with `scope: "all"` and a row carrying `bestRunId: null` and fractional `shotsToWin: 22.5`
- **THEN** the value type-checks as `LeaderboardResponse` without any compiler error on the `null` or the non-integer number
