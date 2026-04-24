## Why

Operators, reviewers, and contributors currently have no in-browser way to discover the backend's HTTP surface, try endpoints, or inspect request/response shapes. The canonical list lives in `docs/spec.md` section 5.2 as prose. An interactive Swagger UI closes that gap: one URL, every route, every schema, plus a "Try it out" affordance that reuses the user's own API key exactly like `/play` does.

## What Changes

- Add `@hono/swagger-ui` 0.6.1 to the backend workspace.
- Create `backend/src/api/openapi.ts` as the single source of truth for an OpenAPI 3.1 document describing every route currently mounted under `/api`: `health`, `board`, `providers`, `runs` (POST + `:id` + `:id/shots` + `:id/events` SSE + `:id/abort`), `leaderboard`, and the two new docs routes themselves.
- Create `backend/src/api/docs.ts` that serves `GET /api/openapi.json` (the raw document, cacheable 60 s) and mounts the `@hono/swagger-ui` middleware at `GET /api/docs`.
- Mount the docs router from `backend/src/app.ts` before the `notFound` handler.
- Add an integration test asserting (a) `GET /api/openapi.json` returns a valid 3.1 document with every expected path and the full set of component schemas, (b) `GET /api/docs` serves an HTML page that loads `/api/openapi.json`.
- Update `docs/spec.md` section 5.2 to list `/api/openapi.json` and `/api/docs` alongside the other endpoints.
- Update `README.md` with a short "API docs" section pointing at the local Swagger UI URL.

## Capabilities

### New Capabilities

- `api-docs`: interactive Swagger UI + raw OpenAPI 3.1 document served from the backend for the full public HTTP surface.

### Modified Capabilities

- `runs-api`: the spec's endpoint list gains `/api/openapi.json` and `/api/docs`; behaviour of every existing route is unchanged.

## Impact

- **Backend**: one new dependency (`@hono/swagger-ui`), two new files (`openapi.ts`, `docs.ts`), a one-line edit to `app.ts`, one new integration test, no database changes, no breaking changes.
- **Docs**: one new section in `README.md` and two new bullets in `docs/spec.md` section 5.2.
- **Web / shared**: no changes.
- **Security**: the docs page is public by design (matches the public-read nature of the API); the `POST /api/runs` "Try it out" flow accepts a user-supplied API key that is handled by the existing route (closure-only, never persisted or logged). No admin or maintenance endpoint is in scope because none are wired yet.
- **Non-goals**: no `@hono/zod-openapi` refactor (would rewrite every route to use zod schemas); no code generation from shared TS types (acceptable future work); no in-page auth flow (the user pastes a key per call just like the `/play` form does).
