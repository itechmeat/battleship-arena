## Why

The backend has grown through feature delivery and now mixes orchestration, validation, persistence mapping, provider integration, and documentation concerns inside a few large files. This makes errors harder to diagnose, increases duplication risk across providers and API handlers, and slows future changes even when behavior is meant to remain stable.

This change refactors the backend architecture end-to-end while preserving existing runtime behavior, API contracts, database schema, and benchmark logic.

## What Changes

- Refactor the run engine into smaller modules for shot classification, board analysis, turn execution support, state aggregation, and provider-failure handling.
- Refactor API routers by extracting request validation, response formatting, SSE replay/streaming helpers, and shared API utilities.
- Refactor database access by separating row mapping, leaderboard aggregation helpers, and query-facing DTO construction from raw query methods.
- Refactor provider integration by centralizing HTTP/provider error translation, request parsing helpers, reasoning-mode resolution, and adapter support utilities.
- Refactor pricing/catalog organization by separating data-heavy provider catalog entries from pricing calculation and lookup logic.
- Refactor OpenAPI document generation into domain-oriented schema modules while preserving the generated document shape.
- Add or adjust focused tests around extracted units so behavior remains covered after decomposition.
- No API response shape, endpoint path, database migration, provider request semantics, game rules, default board behavior, or leaderboard semantics should intentionally change.

## Capabilities

### New Capabilities

- `backend-architecture`: Backend maintainability and modularity requirements for preserving behavior while separating concerns across API, run lifecycle, database, provider, pricing, and OpenAPI modules.

### Modified Capabilities

- None. This is an implementation refactor; existing product and API requirements should remain behaviorally unchanged.

## Impact

- Affected code: `backend/src/api/`, `backend/src/runs/`, `backend/src/db/`, `backend/src/providers/`, `backend/src/pricing/`, and related backend tests.
- Affected tests: backend unit/integration tests, plus typecheck/format/OpenSpec validation/code checker.
- No intended changes to public API contracts, shared wire types, database schema, or frontend behavior.
- The previous narrow provider-error refactor is retained as one subtask inside this broader backend refactor.
