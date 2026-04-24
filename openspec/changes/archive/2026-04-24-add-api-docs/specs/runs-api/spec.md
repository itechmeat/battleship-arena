## ADDED Requirements

### Requirement: Documentation endpoints are part of the public API surface

The backend's HTTP API under `/api` SHALL additionally expose `GET /api/openapi.json` and `GET /api/docs` as part of its public surface. These two routes MUST be listed in `docs/spec.md` section 5.2 alongside the behaviour-carrying routes so that the prose reference and the machine-readable contract cannot drift.

#### Scenario: spec.md section 5.2 lists both documentation routes

- **WHEN** a reader opens `docs/spec.md` section 5.2
- **THEN** it contains bullet points for both `GET /api/openapi.json` (cacheable raw spec) and `GET /api/docs` (interactive Swagger UI)
