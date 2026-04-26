## ADDED Requirements

### Requirement: POST /api/runs accepts reasoning state

`POST /api/runs` SHALL accept an optional boolean `reasoningEnabled` field. When omitted, the backend MUST default from the selected model's reasoning policy. When present for an optional model, the backend MUST persist the submitted value. When present for a forced model, the backend MUST persist the forced value.

#### Scenario: Optional reasoning value is accepted

- **WHEN** a client POSTs a valid run body with `reasoningEnabled: false` for an optional model
- **THEN** the response is successful and the inserted run row stores `reasoning_enabled = false`

#### Scenario: Non-boolean reasoning value rejects

- **WHEN** a client POSTs `reasoningEnabled: "true"`
- **THEN** the response status is 400 and the error detail field is `reasoningEnabled`

### Requirement: Run metadata exposes reasoning state

`GET /api/runs/:id` SHALL include `reasoningEnabled` in the returned `RunMeta` payload.

#### Scenario: Known run returns reasoning state

- **WHEN** a client GETs `/api/runs/<valid-id>`
- **THEN** the response body includes boolean `reasoningEnabled`
