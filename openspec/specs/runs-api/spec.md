# runs-api Specification

## Purpose

TBD - created by archiving change s2a-game-loop-mock. Update Purpose after archive.

## Requirements

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

### Requirement: GET /api/runs/:id returns the run metadata

The backend SHALL expose `GET /api/runs/:id` that returns the `RunMeta` row for the given id with `Cache-Control: no-store`. On unknown id the response MUST be status 404 with `ErrorEnvelope.code` equal to `run_not_found`. The response MUST NOT include `client_session`.

#### Scenario: Known id returns metadata

- **WHEN** a client GETs `/api/runs/<valid-id>` after a run has been started
- **THEN** the response status is 200 and the body satisfies the `RunMeta` shape

#### Scenario: Unknown id returns run_not_found

- **WHEN** a client GETs `/api/runs/does-not-exist`
- **THEN** the response status is 404 and `body.error.code` equals `run_not_found`

#### Scenario: client_session is not leaked

- **WHEN** a client GETs `/api/runs/<valid-id>`
- **THEN** the response body does not contain a top-level `clientSession` or `client_session` field

### Requirement: GET /api/runs/:id/shots returns the ordered shot list

The backend SHALL expose `GET /api/runs/:id/shots` that returns `{ runId, shots }` where `shots` is the `RunShotRow[]` in ascending `idx` order. On unknown id the response MUST be status 404 with `ErrorEnvelope.code` equal to `run_not_found`.

#### Scenario: Shots ordered by idx

- **WHEN** a run has appended shots with idx 0, 1, 2 and a client GETs `/api/runs/<id>/shots`
- **THEN** the response status is 200 and `body.shots` has length 3 with `shots[0].idx === 0`, `shots[1].idx === 1`, `shots[2].idx === 2`

#### Scenario: Unknown id returns run_not_found

- **WHEN** a client GETs `/api/runs/does-not-exist/shots`
- **THEN** the response status is 404 and `body.error.code` equals `run_not_found`

### Requirement: POST /api/runs/:id/abort is idempotent on terminal runs

The backend SHALL expose `POST /api/runs/:id/abort` that, on an active run, calls `manager.abort(id, "viewer")` and returns status 200 with the best current outcome snapshot. When the abort attaches to a live handle, that snapshot is `{ outcome: "aborted_viewer" }` after the engine settles. If the run settles or the handle disappears between the metadata check and the abort attempt, the handler MUST return status 200 with the latest persisted outcome snapshot (which MAY still be `{ outcome: null }` until the terminal row flush lands) rather than waiting on a stale handle reference. On a run already in a terminal state the handler MUST return status 200 with `{ outcome: <existing outcome> }` without calling `abort`. On unknown id the handler MUST return status 404 with `ErrorEnvelope.code` equal to `run_not_found`.

#### Scenario: Active run is aborted

- **WHEN** a client POSTs `/api/runs/<active-id>/abort` against a run whose mock is slow enough to observe
- **THEN** the response status is 200 with `body.outcome === "aborted_viewer"` and the engine promise resolves

#### Scenario: Terminal run returns its existing outcome, not 409

- **WHEN** a client POSTs `/api/runs/<id>/abort` after the run has already terminated with `won`
- **THEN** the response status is 200 and `body.outcome === "won"`

#### Scenario: Abort race returns the latest persisted snapshot without waiting on a stale handle

- **WHEN** a client POSTs `/api/runs/<id>/abort` while the run is simultaneously leaving the manager registry
- **THEN** the response status is 200 and the body contains the latest persisted `outcome` value, which MAY be `null` until the terminal row flush completes

#### Scenario: Unknown id returns run_not_found

- **WHEN** a client POSTs `/api/runs/does-not-exist/abort`
- **THEN** the response status is 404 and `body.error.code` equals `run_not_found`

### Requirement: GET /api/runs/:id/events (SSE) with Last-Event-ID resume

The backend SHALL expose `GET /api/runs/:id/events` as a Server-Sent Events stream whose `Content-Type` is `text/event-stream`. For an active run the handler MUST: (a) resolve `Last-Event-ID` from the header of that name or the `lastEventId` query parameter (header takes precedence); (b) replay ring entries whose `id > Last-Event-ID` when the requested id is within the ring horizon; (c) subscribe to live events for the remainder of the run; (d) emit a `:heartbeat` comment line every `SSE_HEARTBEAT_MS` (25_000) ms to keep intermediary proxies from idling the connection; (e) unsubscribe and clear the heartbeat on client disconnect. When the requested `Last-Event-ID` is older than the ring horizon, the handler MUST emit exactly one `event: resync` event and close. For a run that has no active handle but has a persisted terminal outcome, the handler MUST synthesize the full replay (`event: open`, one `event: shot` per persisted `run_shots` row in ascending idx, `event: outcome`) with event ids re-assigned as `0, 1, 2, ...` within the synthesized stream, and close. For an unknown id the handler MUST emit exactly one `event: resync` event and close.

#### Scenario: Active run delivers open + shots + outcome in order

- **WHEN** a client subscribes to `/api/runs/<active-id>/events` without a `Last-Event-ID`
- **THEN** the stream begins with `event: open`, followed by `event: shot` events as the run progresses, and ends with `event: outcome` followed by stream close

#### Scenario: Last-Event-ID within ring horizon delivers only missed events

- **WHEN** a client subscribes with `Last-Event-ID: 2` while the active run's ring contains ids 1 through 5
- **THEN** the stream delivers only the events with ids 3, 4, 5 before attaching to live, and does not re-emit ids 1 or 2

#### Scenario: Last-Event-ID older than ring horizon triggers resync

- **WHEN** a client subscribes with `Last-Event-ID: 0` while the ring has dropped ids 1 through 10 and currently holds 11 onwards
- **THEN** the server emits exactly one `event: resync` event and closes the stream; no `shot` or `outcome` events are emitted in this response

#### Scenario: Terminal run delivers full synthesized replay

- **WHEN** a client subscribes to `/api/runs/<terminal-id>/events` after the run has finished with `won`
- **THEN** the stream contains `event: open`, at least one `event: shot` whose count equals the number of persisted `run_shots` rows, and exactly one `event: outcome` carrying `outcome=won`, followed by stream close; the stream contains no `event: resync`

#### Scenario: Unknown id emits a single resync

- **WHEN** a client subscribes to `/api/runs/does-not-exist/events`
- **THEN** the stream emits exactly one `event: resync` event and closes; the response status is 200 (SSE cannot carry a 404)

### Requirement: Session cookie middleware issues bsa_session lazily

The backend SHALL mount middleware before the runs router that checks every incoming request for a `bsa_session` cookie. When the cookie is absent, the middleware MUST generate a fresh ULID token, store it in the request context, and set it on the response with attributes `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, `Max-Age=31536000`. When the cookie is present the middleware MUST read its value into the request context without rotating it. The `POST /api/runs` handler MUST read the value from the request context and persist it to `runs.client_session`.

#### Scenario: Absent cookie is issued on the response

- **WHEN** a client sends a request without a `bsa_session` cookie
- **THEN** the response carries a `Set-Cookie` header whose name is `bsa_session`, whose value is a non-empty token, and whose attributes include `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`

#### Scenario: Present cookie is not rotated

- **WHEN** a client sends a request with a `bsa_session=abc123` cookie header
- **THEN** the response does not carry a `Set-Cookie` for `bsa_session` and the request context resolves the session value to `"abc123"`

#### Scenario: Persisted runs.client_session equals the cookie value

- **WHEN** a client POSTs `/api/runs` with an existing `bsa_session` cookie
- **THEN** the inserted `runs` row has `client_session` equal to the cookie's value

### Requirement: Every runs-scoped response carries Cache-Control: no-store

The `/api/runs/*` routes MUST set `Cache-Control: no-store` on every response body that varies with database or stream state, so intermediaries never cache run-specific state. The SSE route's headers and the dynamic read routes' headers MUST include this directive.

#### Scenario: POST response is no-store

- **WHEN** `POST /api/runs` returns a success envelope
- **THEN** the response headers include `Cache-Control: no-store`

#### Scenario: GET meta response is no-store

- **WHEN** `GET /api/runs/<id>` returns a 200 meta
- **THEN** the response headers include `Cache-Control: no-store`

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

### Requirement: Documentation endpoints are part of the public API surface

The backend's HTTP API under `/api` SHALL additionally expose `GET /api/openapi.json` and `GET /api/docs` as part of its public surface. These two routes MUST be listed in `docs/spec.md` section 5.2 alongside the behaviour-carrying routes so that the prose reference and the machine-readable contract cannot drift.

#### Scenario: spec.md section 5.2 lists both documentation routes

- **WHEN** a reader opens `docs/spec.md` section 5.2
- **THEN** it contains bullet points for both `GET /api/openapi.json` (cacheable raw spec) and `GET /api/docs` (interactive Swagger UI)
