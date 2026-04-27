## 1. OpenSpec And Baseline

- [x] 1.1 Replace the too-narrow provider-error change with the broader `refactor-backend-architecture` OpenSpec change.
- [x] 1.2 Map backend refactor targets across runs, API, DB, providers, pricing, and OpenAPI.
- [x] 1.3 Validate the completed OpenSpec artifacts before implementation.

## 2. Provider Support Refactor

- [x] 2.1 Centralize provider HTTP error cause formatting and code classification in a shared provider utility.
- [x] 2.2 Add focused unit tests for provider HTTP error translation and sanitization.
- [x] 2.3 Extract shared provider reasoning-mode and model lookup helpers where they reduce duplication.
- [x] 2.4 Extract shared provider response parsing helpers for OpenAI-compatible response content and usage handling.
- [x] 2.5 Refactor OpenRouter, OpenCode Go, and Z.AI adapters to use the shared provider helpers without changing request/response semantics.

## 3. Run Lifecycle Refactor

- [x] 3.1 Extract board analysis helpers from the run engine for board view construction, ship lookup, and remaining ship calculation.
- [x] 3.2 Extract shot classification into a focused run module with unit coverage for hits, misses, invalid coordinates, duplicate shots, and sunk ships.
- [x] 3.3 Extract provider/run error handling helpers for abort detection, rate-limit detection, terminal provider diagnostics, and provider error serialization.
- [x] 3.4 Extract run state/totals/finalization helpers for token totals, reasoning token accumulation, cost totals, and terminal run summaries.
- [x] 3.5 Refactor `runEngine` to orchestrate extracted services while preserving event order, persistence calls, and outcomes.

## 4. API Refactor

- [x] 4.1 Extract request body/query validation helpers from API route handlers with focused unit coverage.
- [x] 4.2 Extract run/API response formatting helpers for run metadata, shots, SSE event payloads, and error responses where applicable.
- [x] 4.3 Extract SSE terminal replay and live stream queueing helpers from the runs router while preserving streaming behavior.
- [x] 4.4 Refactor runs, board, providers, leaderboard, docs, and health routers to use shared API helpers where it clarifies ownership.

## 5. Database Refactor

- [x] 5.1 Extract database row mappers and type guards from `queries.ts` with focused tests for run metadata, shots, and terminal error fields.
- [x] 5.2 Extract leaderboard aggregation/ranking helpers from `queries.ts` with focused tests for dedupe, median, ranking, and seed/reasoning grouping semantics.
- [x] 5.3 Refactor query methods to delegate to row mappers and aggregation helpers without changing SQL result semantics.

## 6. Pricing And OpenAPI Refactor

- [x] 6.1 Split provider pricing catalog data into provider-specific data modules while preserving existing pricing exports.
- [x] 6.2 Extract pricing calculation and lookup helpers into focused modules with existing pricing tests passing.
- [x] 6.3 Split OpenAPI schemas into domain-oriented modules and keep the generated OpenAPI document behaviorally identical.

## 7. Verification

- [x] 7.1 Run focused tests after each refactored backend area.
- [x] 7.2 Run full backend tests with safe `DATABASE_PATH`.
- [x] 7.3 Run formatting, typecheck, OpenSpec validation, and code checker.
- [x] 7.4 Review changed files for accidental behavior, API, DB, or benchmark policy changes.
