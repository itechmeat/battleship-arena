## ADDED Requirements

### Requirement: Run rows persist reasoning state

The `runs` table SHALL store a non-null boolean-compatible `reasoning_enabled` value for every run. Existing rows migrated into the new schema MUST receive a deterministic default.

#### Scenario: Run insert includes reasoning_enabled

- **WHEN** a new run row is inserted
- **THEN** the row stores the resolved reasoning state in `reasoning_enabled`

### Requirement: Run lifecycle threads reasoning into provider calls

The run engine SHALL receive the resolved reasoning state as part of its run input and SHALL thread it to provider adapters so request-shape logic can honor the selected or forced mode.

#### Scenario: Provider call input includes resolved reasoning state

- **WHEN** the engine calls a provider adapter for a run started with reasoning disabled
- **THEN** the provider call input exposes `reasoningEnabled === false`

### Requirement: Terminal outcome is displayed in timer area

The live game UI SHALL surface terminal outcome in place of the per-shot timer once a run finishes instead of rendering a separate bottom `Outcome: <value>` block.

#### Scenario: Won run updates timer status

- **WHEN** a live run transitions to outcome `won`
- **THEN** the timer row displays the completed outcome where the shot timer was and no separate bottom Outcome block is rendered
