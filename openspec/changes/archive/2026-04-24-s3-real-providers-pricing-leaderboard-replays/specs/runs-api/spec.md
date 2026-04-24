## MODIFIED Requirements

### Requirement: POST /api/runs starts a run and returns its id

The backend SHALL expose `POST /api/runs` that accepts a JSON body `{ providerId, modelId, apiKey, budgetUsd? }` and responds with `{ runId }` on success. The handler MUST validate: `providerId` is a non-empty string and resolves in the provider registry; `modelId` is a non-empty string and exists in that provider's `models`; `apiKey` is a non-empty string; `budgetUsd`, when provided, is either `null`, `0`, or a finite strictly-positive number. The handler MUST persist the run's `runs.budget_usd_micros` as `NULL` when `budgetUsd` is absent, `null`, or `0`; when `budgetUsd` is strictly positive, the handler MUST persist `Math.floor(budgetUsd * 1_000_000)`. Any strictly-negative `budgetUsd`, non-finite `budgetUsd` (NaN, Infinity), or non-numeric `budgetUsd` MUST return status 400 with an `ErrorEnvelope` whose `code` is `invalid_input` and whose `detail.field` equals `"budgetUsd"`. Other validation failures MUST return status 400 with an `ErrorEnvelope` whose `code` is `invalid_input` and whose `detail.field` names the offending field. On success the handler MUST set `Cache-Control: no-store`, call the manager's `start` with `seedDate` set to today's UTC date (`YYYY-MM-DD`), attach the `client_session` read from the session cookie to the persisted row, and return status 200 with exactly `{ runId }`. The handler MUST NOT log or echo `apiKey` anywhere.

#### Scenario: Happy path returns runId

- **WHEN** a client POSTs `{"providerId":"mock","modelId":"mock-happy","apiKey":"k"}` to `/api/runs`
- **THEN** the response status is 200 and the body is exactly `{ runId: <string> }`

#### Scenario: Empty apiKey is rejected

- **WHEN** a client POSTs `{"providerId":"mock","modelId":"mock-happy","apiKey":""}` to `/api/runs`
- **THEN** the response status is 400, `body.error.code` equals `invalid_input`, and `body.error.detail.field` equals `"apiKey"`

#### Scenario: Unknown modelId is rejected

- **WHEN** a client POSTs `{"providerId":"mock","modelId":"nope","apiKey":"k"}` to `/api/runs`
- **THEN** the response status is 400, `body.error.code` equals `invalid_input`, and `body.error.detail.field` equals `"modelId"`

#### Scenario: Negative budgetUsd is rejected

- **WHEN** a client POSTs `{"providerId":"mock","modelId":"mock-happy","apiKey":"k","budgetUsd":-1}` to `/api/runs`
- **THEN** the response status is 400, `body.error.code` equals `invalid_input`, and `body.error.detail.field` equals `"budgetUsd"`

#### Scenario: budgetUsd of 0 is accepted and persisted as NULL

- **WHEN** a client POSTs `{"providerId":"mock","modelId":"mock-happy","apiKey":"k","budgetUsd":0}` to `/api/runs`
- **THEN** the response status is 200, the body is exactly `{ runId: <string> }`, and the inserted `runs` row has `budget_usd_micros IS NULL`

#### Scenario: budgetUsd of null is accepted and persisted as NULL

- **WHEN** a client POSTs `{"providerId":"mock","modelId":"mock-happy","apiKey":"k","budgetUsd":null}` to `/api/runs`
- **THEN** the response status is 200, the body is exactly `{ runId: <string> }`, and the inserted `runs` row has `budget_usd_micros IS NULL`

#### Scenario: Absent budgetUsd is accepted and persisted as NULL

- **WHEN** a client POSTs `{"providerId":"mock","modelId":"mock-happy","apiKey":"k"}` to `/api/runs` with no `budgetUsd` field
- **THEN** the response status is 200, the body is exactly `{ runId: <string> }`, and the inserted `runs` row has `budget_usd_micros IS NULL`

#### Scenario: Positive budgetUsd is persisted in integer micros

- **WHEN** a client POSTs `{"providerId":"mock","modelId":"mock-happy","apiKey":"k","budgetUsd":0.25}` to `/api/runs`
- **THEN** the response status is 200 and the inserted `runs` row has `budget_usd_micros === 250_000`

#### Scenario: Response is no-store and does not echo apiKey

- **WHEN** a client POSTs a valid body containing a distinctive `apiKey`
- **THEN** the response headers include `Cache-Control: no-store`, and no response field (header or body) contains the submitted `apiKey` substring

## ADDED Requirements

### Requirement: POST /api/runs staging-only mock cost hint

The `POST /api/runs` handler SHALL accept an optional body field `mockCost` (a finite non-negative number interpreted as USD per turn). The handler MUST honour `mockCost` only when BOTH of the following are true: the resolved `providerId` equals the literal string `"mock"` AND the backend is built for a staging or development environment (as signalled by the process-level build mode, typically `NODE_ENV !== "production"`). When honoured, the handler MUST thread `mockCost` into the mock adapter's `testHooks.costUsdMicros` by computing `Math.floor(mockCost * 1_000_000)` so that the mock reports that exact per-turn cost. When the build is for production, the handler MUST ignore the `mockCost` field entirely and MUST NOT pass it to any adapter. When `providerId` is not `"mock"`, the handler MUST ignore the `mockCost` field regardless of build mode. The client (`/play`) MUST NOT send `mockCost` in production builds.

#### Scenario: Staging build with mock provider honours mockCost

- **WHEN** a staging-build backend receives `POST /api/runs` with `{"providerId":"mock","modelId":"mock-happy","apiKey":"k","mockCost":0.004}`
- **THEN** the mock adapter is constructed for this run with `testHooks.costUsdMicros === 4_000` and the run's per-turn cost equals `4_000` micros per turn

#### Scenario: Production build strips mockCost even for the mock provider

- **WHEN** a production-build backend receives `POST /api/runs` with `{"providerId":"mock","modelId":"mock-happy","apiKey":"k","mockCost":0.004}`
- **THEN** the mock adapter is constructed without `testHooks.costUsdMicros`, the run's per-turn cost equals `0` micros, and the response status is still 200

#### Scenario: Non-mock provider ignores mockCost on any build

- **WHEN** a staging-build backend receives `POST /api/runs` with `{"providerId":"openrouter","modelId":"<real-model>","apiKey":"k","mockCost":0.004}`
- **THEN** the real adapter is invoked without any test-hook cost override and the per-turn cost derives from real usage

> The `/play` provider-and-model picker behaviour (populating from `GET /api/providers`, clearing `modelId` on provider change, staging-only `mock` injection, optional budget field) is specified in the `web-shell` capability delta of this change. The API surface is captured here; the UI surface is in `web-shell` so it stays with the base `/play` requirement rather than split across two capabilities.
