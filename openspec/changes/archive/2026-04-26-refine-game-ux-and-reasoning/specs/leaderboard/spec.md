## ADDED Requirements

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
