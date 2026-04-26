# leaderboard Specification

## ADDED Requirements

### Requirement: GET /api/leaderboard supports scope=today|all with optional filters

`GET /api/leaderboard` SHALL accept a required `scope` query parameter taking the values `today` or `all`, plus optional `providerId` and `modelId` parameters. Unknown or missing `scope` MUST reject with `400 { code: "invalid_input" }`. The response body MUST match the `LeaderboardResponse` shape (scope, `seedDate`, `rows[]`), with `rows` sorted according to scope-specific rules.

#### Scenario: Missing scope rejects

- **WHEN** a client issues `GET /api/leaderboard` with no `scope`
- **THEN** the response status is `400` and the body's `code` equals `"invalid_input"`

#### Scenario: scope=today with no filters returns the typed shape

- **WHEN** a client issues `GET /api/leaderboard?scope=today`
- **THEN** the response status is `200` and the body satisfies the `LeaderboardResponse` type exported from `shared/`

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

For `scope=all` the backend SHALL partition wins on `(client_session, provider_id, model_id, seed_date)` taking the lowest `shots_fired` per partition, then group the resulting rows by `(provider_id, model_id)`. The handler MUST compute the classical median of `shots_fired` per group in TypeScript: for an odd count the middle value; for an even count the mean of the two middle values. Rows MUST be ordered by median ascending, then `runsCount` descending, then `displayName` ascending.

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
