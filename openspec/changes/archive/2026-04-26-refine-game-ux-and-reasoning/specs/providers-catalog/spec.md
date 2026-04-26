## ADDED Requirements

### Requirement: Provider catalog exposes reasoning control policy

Every provider model returned by `GET /api/providers` SHALL include `reasoningMode` with one of the string values `optional`, `forced_on`, or `forced_off`. `optional` means the user can choose the Reasoning checkbox value; forced modes mean the checkbox must be disabled and preset.

#### Scenario: Model response includes reasoningMode

- **WHEN** a client issues `GET /api/providers`
- **THEN** every returned model contains a valid `reasoningMode` string

#### Scenario: hasReasoning remains compatible

- **WHEN** a model has `reasoningMode === "forced_off"`
- **THEN** clients can still read `hasReasoning` for compatibility, but MUST use `reasoningMode` to render the checkbox state
