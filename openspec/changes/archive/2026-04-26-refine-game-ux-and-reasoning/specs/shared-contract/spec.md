## ADDED Requirements

### Requirement: Shared contracts expose reasoning fields

The shared package SHALL expose reasoning state on `RunMeta`, `StartRunInput`, and `LeaderboardRow`, and reasoning control policy on provider model response types.

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
