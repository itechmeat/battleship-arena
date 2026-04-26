## Context

The backend today runs on plain Hono handlers (no `@hono/zod-openapi` wrappers, no `hono-openapi` integration). S2 shipped the game loop; S3 adds the provider catalog, board preview, and leaderboard routes. Discoverability currently requires reading `docs/spec.md` section 5.2 in prose and cross-referencing the handlers. The requested outcome is an in-browser explorer that does not require the operator to read any prose, and that accepts real API keys for the one mutating endpoint (`POST /api/runs`) without introducing a second auth flow.

## Goals / Non-Goals

**Goals:**

- One URL (`/api/docs`) that renders interactive Swagger UI covering every route currently mounted under `/api`.
- One machine-readable URL (`/api/openapi.json`) so external tooling (Postman, Stainless, IDE codegen, monitoring) can consume the contract.
- Schema entries for every request body, response body, and error envelope drawn from the existing shared types; no drift between Swagger and the TypeScript types.
- Zero changes to existing route handler code.

**Non-Goals:**

- Not rewriting route handlers using `@hono/zod-openapi` (would invalidate the S3 change's integration tests and enlarge the review surface by ~60 files).
- Not autogenerating the OpenAPI document from the TypeScript types (requires an extra tooling layer; the hand-written document is small and the schemas are stable).
- Not adding admin or maintenance endpoints to the document (they are not wired; those ship in S4).
- Not adding authn/authz to the docs page (the API itself is public-read; `POST /api/runs` carries the user-supplied key in the request body, which the existing route already handles).

## Decisions

1. **Library: `@hono/swagger-ui` 0.6.1.**
   - Alternative considered: `@scalar/hono-api-reference` (nicer UI, more modern default theme, but heavier asset bundle and less familiar for operators coming from the wider Swagger ecosystem).
   - Alternative considered: `@hono/zod-openapi` (cleanest long-term story - compiles routes + schemas together - but requires rewriting every route handler, conflicting with the in-flight S3 change that those handlers already implement).
   - Chose `@hono/swagger-ui` because it layers cleanly on top of any OpenAPI document URL, adds a single 5-line middleware mount, and is the industry-standard surface a new contributor already knows how to read.

2. **Document source: hand-authored `backend/src/api/openapi.ts` as an `as const` JS object.**
   - Alternative considered: `zod` schemas in `shared/` plus `zod-to-openapi`. More DRY but requires introducing `zod` as a runtime dependency across the workspace; the types file today is plain TS.
   - Alternative considered: a YAML file served from disk. Harder to keep in sync with TypeScript; loses IDE navigation and compile-time coupling.
   - Chose a plain-TS const object because the schema set is small (~15 entries), the file compiles with the rest of `backend/` under existing `tsconfig`, and swagger-ui accepts the object unchanged.

3. **Schemas reuse shared enums (`ERROR_CODES`, `OUTCOMES`) via value imports.**
   - Shared enums are exported as `readonly string[]` constants plus TypeScript union types; the OpenAPI document binds its `enum` clauses to the same constants so adding a new error code in `shared/` automatically flows into Swagger.

4. **Two routes per capability: `/api/openapi.json` and `/api/docs`.**
   - Alternative considered: a single `/api/docs` route that inlines the JSON into the HTML. Saves one request but prevents external tooling from ingesting the spec without scraping HTML.
   - Chose two routes because `/api/openapi.json` is useful for codegen and for humans with `curl | jq`, while `/api/docs` stays focused on the browser explorer.

5. **Cache headers.**
   - `/api/openapi.json`: `Cache-Control: public, max-age=60`. The document is process-local and only changes on deploy; 60 s balances freshness against repeated requests from the Swagger page hitting it on each reload.
   - `/api/docs`: whatever `@hono/swagger-ui` sets by default (a short-lived HTML response). No custom headers needed.

6. **`POST /api/runs` "Try it out" behaviour.**
   - The OpenAPI document declares `apiKey` as a plain string field in the request body (no `securitySchemes`). This matches the existing route contract: the key arrives in the body, the server consumes it into the run task's closure, the key is never persisted or logged. Swagger's "Try it out" editor sends the body verbatim, which is exactly what `/play` does.

## Risks / Trade-offs

- [Schema drift between `shared/src/types.ts` and `backend/src/api/openapi.ts`] -> Mitigation: the integration test asserts that every schema the prose says exists actually exists; a future change that adds a new shared type gets a CI reminder when the test fails. A stricter long-term mitigation would be the `zod-to-openapi` route (future work).
- [Swagger UI exposes a "Try it out" form that lets a user paste their API key in the browser] -> This is intentional and mirrors `/play`'s behaviour. The docs page carries no additional security promise beyond what `/play` already makes.
- [Adding a public `/api/openapi.json` surface] -> The document describes routes that are already public; nothing new is leaked. The admin/maintenance endpoints are deliberately excluded because they are not wired.
- [Dependency surface grows by one package] -> `@hono/swagger-ui` is a thin wrapper around Swagger UI CDN assets; it does not pull a heavy transitive tree.

## Migration Plan

- No database migration. No schema change. No breaking change to any existing route.
- Rollback: revert the two new files and the one `app.ts` edit. No data has been written; the docs page simply disappears.
