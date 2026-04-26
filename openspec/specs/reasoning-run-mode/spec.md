# reasoning-run-mode Specification

## Purpose

TBD - created by archiving change refine-game-ux-and-reasoning. Update Purpose after archive.

## Requirements

### Requirement: Runs capture executed reasoning state

Each started run SHALL persist whether reasoning was enabled for that run as a boolean `reasoningEnabled` data value. The value MUST be determined at start time from the submitted value when the selected model allows reasoning control, or from the selected model's forced reasoning policy when the model does not allow control.

#### Scenario: Optional model uses submitted reasoning value

- **WHEN** a user starts a run for a model whose reasoning mode is optional and submits `reasoningEnabled: false`
- **THEN** the persisted run and returned run metadata report `reasoningEnabled === false`

#### Scenario: Forced model ignores conflicting submitted value

- **WHEN** a user starts a run for a model whose reasoning mode is forced on and submits `reasoningEnabled: false`
- **THEN** the backend starts the run with reasoning enabled and persisted metadata reports `reasoningEnabled === true`

### Requirement: Reasoning state is a leaderboard cohort dimension

Leaderboard aggregation SHALL treat reasoning-enabled and reasoning-disabled runs as separate cohorts for the same provider and model.

#### Scenario: Same model appears twice when reasoning differs

- **WHEN** the database contains won runs for the same provider and model with both `reasoningEnabled === true` and `reasoningEnabled === false`
- **THEN** the leaderboard response contains separate rows for the two reasoning values

### Requirement: Reasoning UI communicates control policy

The start form SHALL render a Reasoning checkbox for every selected provider/model. When the selected model has optional reasoning, the checkbox MUST be enabled. When the selected model forces reasoning on or off, the checkbox MUST be preset to the forced value and disabled.

#### Scenario: Forced-off model disables unchecked checkbox

- **WHEN** the selected model has `reasoningMode === "forced_off"`
- **THEN** the Reasoning checkbox is unchecked and disabled
