# api-docs Specification

## Purpose

Defines the interactive Swagger UI and the machine-readable OpenAPI 3.1 document the backend exposes under `/api/docs` and `/api/openapi.json`. Intended audience: backend operators exercising endpoints from a browser, and external tooling (Postman, Stainless, IDE codegen, monitoring) consuming the schema. Scope is the full public HTTP surface of the backend - health, board, providers catalog, runs (POST + `:id` + `:id/shots` + `:id/events` SSE + `:id/abort`), leaderboard, and the two docs routes themselves. Out of scope: authenticated or admin-only endpoints, real-provider API keys (the page accepts them in-memory in the same shape `/play` does and never persists them).

## Requirements

### Requirement: Backend serves an OpenAPI 3.1 document describing every public route

The backend SHALL expose `GET /api/openapi.json` returning a valid OpenAPI 3.1 document whose `info.title` is `"BattleShipArena API"`. The document MUST include a `paths` entry for every route currently mounted under `/api`, specifically: `/health`, `/board`, `/providers`, `/runs`, `/runs/{id}`, `/runs/{id}/shots`, `/runs/{id}/events`, `/runs/{id}/abort`, `/leaderboard`, `/openapi.json`, and `/docs`. The document MUST include `components.schemas` entries for every request/response shape the routes use, including at minimum `ErrorEnvelope`, `HealthResponse`, `ShotResult`, `Outcome`, `ProvidersResponse`, `ProvidersResponseProvider`, `ProvidersResponseModel`, `ModelPricingView`, `ModelCostEstimate`, `BoardView`, `RunMeta`, `RunShotRow`, `StartRunRequest`, `StartRunResponse`, `RunShotsResponse`, `AbortRunResponse`, `LeaderboardRow`, `LeaderboardResponse`, and `SseEvent`. The response MUST set `Content-Type: application/json` and `Cache-Control: public, max-age=60`.

#### Scenario: openapi.json lists every mounted path

- **WHEN** a client issues `GET /api/openapi.json`
- **THEN** the response is `200`, `Content-Type: application/json`, and the parsed body's `openapi` field equals `"3.1.0"` AND `body.paths` has a key for each of `/health`, `/board`, `/providers`, `/runs`, `/runs/{id}`, `/runs/{id}/shots`, `/runs/{id}/events`, `/runs/{id}/abort`, `/leaderboard`, `/openapi.json`, `/docs`

#### Scenario: openapi.json declares every shared schema

- **WHEN** a client inspects the `components.schemas` object on `GET /api/openapi.json`
- **THEN** it contains at least the keys `ErrorEnvelope`, `HealthResponse`, `ShotResult`, `Outcome`, `ProvidersResponse`, `RunMeta`, `RunShotRow`, `LeaderboardResponse`, `SseEvent`, `StartRunRequest`, `StartRunResponse`, `AbortRunResponse`

#### Scenario: StartRunRequest carries the four body fields

- **WHEN** a client reads `components.schemas.StartRunRequest`
- **THEN** `required` includes `providerId`, `modelId`, and `apiKey`, and `properties` contains `providerId`, `modelId`, `apiKey`, and `budgetUsd`

### Requirement: Backend serves an interactive Swagger UI page at /api/docs

The backend SHALL expose `GET /api/docs` returning an HTML page rendered by `@hono/swagger-ui`. The HTML MUST reference the `GET /api/openapi.json` URL so the page loads the spec at runtime. The response MUST set a `Content-Type` that begins with `text/html`. The page MUST NOT require any form of authentication.

#### Scenario: /api/docs serves Swagger UI HTML

- **WHEN** a client issues `GET /api/docs`
- **THEN** the response status is `200`, the `Content-Type` starts with `text/html`, and the body contains the literal substring `/api/openapi.json` AND a case-insensitive match for `swagger`

### Requirement: OpenAPI document source lives in a single typed module

The OpenAPI document SHALL be exported as a typed constant from `backend/src/api/openapi.ts` (named export `OPENAPI_DOCUMENT`). Shared enums (`ERROR_CODES`, `OUTCOMES`) used inside the document MUST be imported from `@battleship-arena/shared` rather than duplicated, so that adding a new error code or outcome propagates into the spec without a manual edit to the document. The `docs.ts` router MUST import `OPENAPI_DOCUMENT` and serialise it verbatim on every request; it MUST NOT hand-craft JSON inside the handler.

#### Scenario: Adding a new ERROR_CODE in shared flows into the spec

- **WHEN** an engineer appends a new entry to `ERROR_CODES` in `shared/src/error-codes.ts`
- **THEN** the new entry appears in `components.schemas.ErrorEnvelope.properties.error.properties.code.enum` on the next build, without any edit to `backend/src/api/openapi.ts`
