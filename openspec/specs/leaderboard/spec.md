# leaderboard Specification

## Purpose

Defines the public leaderboard: the SQL queries and the `GET /api/leaderboard` endpoint that rank session-deduped `won` runs by exact `(providerId, modelId)`, for either today's UTC seed or across all seed dates, and the Solid `Leaderboard` island that renders them on the home page. Audience: home-page visitors, replay consumers, and tooling that wants a canonical ordered view of benchmark results. Scope: read-only aggregation over the existing `runs` table; partitioning and tiebreakers are specified so two callers always see the same ordering for the same data.

### Definition: current UTC seed date

"Today's seed" or "the current UTC seed date" refers to the UTC calendar date as a `YYYY-MM-DD` string computed from `new Date().toISOString().slice(0, 10)`. A run belongs to the seed whose UTC calendar day contains the run's `started_at`. The seed window rolls over exactly at `00:00:00.000Z`; a run that spans the rollover stays on the seed date it started on. Callers that want the day's leaderboard MUST derive the seed date from the server's current UTC clock, not from a client-side locale.

## Requirements

### Requirement: GET /api/leaderboard supports scope=today|all with optional filters

`GET /api/leaderboard` SHALL accept a required `scope` query parameter taking the values `today` or `all`, plus optional `providerId` and `modelId` parameters. Unknown or missing `scope` MUST reject with `400 { code: "invalid_input" }`. The response body MUST match the `LeaderboardResponse` shape (scope, `seedDate`, `rows[]`), with `rows` sorted according to scope-specific rules.

When `providerId` is present, the handler SHALL filter rows to exactly that provider id (string equality). When `modelId` is present, the handler SHALL filter rows to exactly that model id (string equality). When both are present, the handler SHALL apply them conjunctively (the row must match both). Missing filter parameters impose no restriction. Unknown `providerId` or `modelId` values MUST NOT produce an error; the handler MUST return `200` with `rows: []` and the same `scope` / `seedDate` envelope it would otherwise produce.

#### Scenario: Missing scope rejects

- **WHEN** a client issues `GET /api/leaderboard` with no `scope`
- **THEN** the response status is `400` and the body's `code` equals `"invalid_input"`

#### Scenario: scope=today with no filters returns the typed shape

- **WHEN** a client issues `GET /api/leaderboard?scope=today`
- **THEN** the response status is `200` and the body satisfies the `LeaderboardResponse` type exported from `shared/`

#### Scenario: providerId filters to exact matches

- **WHEN** a client issues `GET /api/leaderboard?scope=today&providerId=openrouter` against a database containing wins for both `openrouter` and `opencode-go`
- **THEN** every returned row has `providerId === "openrouter"`

#### Scenario: Both filters narrow conjunctively

- **WHEN** a client issues `GET /api/leaderboard?scope=all&providerId=openrouter&modelId=openai/gpt-5-nano`
- **THEN** every returned row has `providerId === "openrouter"` AND `modelId === "openai/gpt-5-nano"`

#### Scenario: Unknown providerId returns empty rows, not an error

- **WHEN** a client issues `GET /api/leaderboard?scope=today&providerId=does-not-exist`
- **THEN** the response status is `200`, the `scope` and `seedDate` envelope is populated, and `rows` equals `[]`

### Requirement: Today scope dedups within a session and returns best per model

For `scope=today` the backend SHALL, for the current UTC seed date, deduplicate wins within each `(client_session, provider_id, model_id)` partition by taking the lowest `shots_fired` (tiebreak `started_at ASC`), then across sessions take the lowest `shots_fired` per `(provider_id, model_id)` (tiebreak `started_at ASC`). Only `outcome = 'won'` rows for the current UTC seed MUST contribute. Rows MUST be ordered by `shots_to_win ASC, display_name ASC`.

#### Scenario: Two wins in one session collapse to the lower-shots row

- **WHEN** a single session has two `won` runs for the same model on today's seed with `shots_fired` 22 and 19
- **THEN** that session contributes a single row with `shots_to_win === 19`

#### Scenario: Cross-session best wins the day's model row

- **WHEN** two different sessions each win with the same model on today's seed, one at 19 shots and the other at 25 shots
- **THEN** the response contains one row for that model with `shots_to_win === 19`

#### Scenario: Yesterday wins are excluded

- **WHEN** a client has a `won` row for yesterday's seed and no runs today
- **THEN** `GET /api/leaderboard?scope=today` returns `rows: []`

### Requirement: All-time scope aggregates session-deduped wins and computes classical median

For `scope=all` the backend SHALL partition wins on `(client_session, provider_id, model_id, seed_date)` taking the lowest `shots_fired` per partition, then group the resulting rows by `(provider_id, model_id)`. The handler MUST compute the classical median of `shots_fired` per group in TypeScript: for an odd count the middle value; for an even count the mean of the two middle values. Rows MUST be ordered by median ascending, then `runsCount` descending, then `displayName` ascending, then `provider_id` ascending, then `model_id` ascending. The last two keys exist to guarantee byte-identical responses across repeat calls for unchanged data, even when earlier keys tie exactly.

#### Scenario: Median of even-count sample is mean of middle two

- **WHEN** a group's session-deduped `shots_fired` values are `[15, 20, 25, 30]`
- **THEN** the row's `shotsToWin` median equals `22.5`

#### Scenario: Median of odd-count sample is middle value

- **WHEN** a group's session-deduped `shots_fired` values are `[15, 20, 30]`
- **THEN** the row's `shotsToWin` median equals `20`

#### Scenario: Tiebreak on runsCount desc then displayName asc

- **WHEN** two groups have the same median, one with `runsCount = 5` and the other with `runsCount = 3`
- **THEN** the row with `runsCount === 5` sorts before the row with `runsCount === 3`

### Requirement: Only won runs feed the leaderboard

The leaderboard queries for both scopes SHALL filter on `outcome = 'won'`. Rows with outcomes `dnf_shot_cap`, `dnf_schema_errors`, `dnf_budget`, `llm_unreachable`, `aborted_viewer`, or `aborted_server_restart` MUST NOT appear in either scope's response.

#### Scenario: DNF rows never appear

- **WHEN** the database contains one `won` row and ten rows with various DNF outcomes for today's seed
- **THEN** `GET /api/leaderboard?scope=today` returns exactly one row

### Requirement: Leaderboard response uses Cache-Control: no-store

`GET /api/leaderboard` SHALL attach `Cache-Control: no-store` to every response. The response MUST NOT carry an `ETag`. Clients MUST re-fetch on every view to avoid UTC-rollover staleness.

#### Scenario: no-store header present

- **WHEN** a client issues `GET /api/leaderboard?scope=today`
- **THEN** the response carries `Cache-Control: no-store` and no `ETag` header

### Requirement: runs.display_name sources each row's displayName

Every row returned by `GET /api/leaderboard` SHALL carry `displayName` equal to the value of `runs.display_name` persisted at run creation. The backend MUST NOT cross-join the current pricing table to resolve a display name; historical rows keep the name they ran under even if a later pricing PR renames the model.

#### Scenario: Historical displayName preserved after pricing-table rename

- **WHEN** a `won` row was persisted with `display_name = "Old Name"` and the pricing table now carries `displayName = "New Name"` for the same `(provider_id, model_id)`
- **THEN** the leaderboard row reports `displayName === "Old Name"`

### Requirement: Partitioning keys on (client_session, provider_id, model_id)

The session-dedup window function SHALL partition on `(client_session, provider_id, model_id)` for the today scope and on `(client_session, provider_id, model_id, seed_date)` for the all scope. Two different providers offering a model id with the same raw string MUST remain on separate leaderboard rows.

#### Scenario: Same modelId across providers stays on separate rows

- **WHEN** provider `openrouter` and provider `opencode-go` each have a `won` row today with the same raw `model_id` value
- **THEN** `GET /api/leaderboard?scope=today` returns two rows, one per provider

#### Scenario: Determinism across repeat calls

- **WHEN** `GET /api/leaderboard?scope=all` is called twice in succession against an unchanged database
- **THEN** the two response bodies are byte-identical

### Requirement: Leaderboard supports reasoning filter

`GET /api/leaderboard` SHALL accept an optional `reasoningEnabled` query parameter. When present, the handler MUST filter rows to runs whose persisted reasoning value matches the boolean query value. Invalid boolean strings MUST reject with `400 { code: "invalid_input" }`.

#### Scenario: reasoningEnabled=true filters rows

- **WHEN** a client issues `GET /api/leaderboard?scope=today&reasoningEnabled=true`
- **THEN** every returned row has `reasoningEnabled === true`

#### Scenario: Invalid reasoning filter rejects

- **WHEN** a client issues `GET /api/leaderboard?scope=today&reasoningEnabled=maybe`
- **THEN** the response status is `400` with error code `invalid_input`

### Requirement: Leaderboard partitions by reasoning state

Today and all-time leaderboard aggregation SHALL include persisted reasoning state in their deduplication and grouping keys after provider and model.

#### Scenario: Same provider and model split by reasoning

- **WHEN** two won runs share providerId and modelId but differ in `reasoningEnabled`
- **THEN** the leaderboard response returns separate rows for those reasoning values

### Requirement: Leaderboard rows expose reasoning state

Every `LeaderboardRow` SHALL include a boolean `reasoningEnabled` field used by the home-page table column.

#### Scenario: Response row carries reasoningEnabled

- **WHEN** a client fetches a leaderboard with at least one row
- **THEN** each row contains a boolean `reasoningEnabled` value
