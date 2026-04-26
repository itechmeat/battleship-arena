## 1. Dependency

- [x] 1.1 Add `@hono/swagger-ui` 0.6.1 to `backend/package.json` and install.

## 2. OpenAPI document module

- [x] 2.1 Create `backend/src/api/openapi.ts` exporting `OPENAPI_DOCUMENT` as a typed constant covering every mounted route and every shared schema.
- [x] 2.2 Reuse `ERROR_CODES` and `OUTCOMES` from `@battleship-arena/shared` as `enum` sources inside the document.

## 3. Docs router

- [x] 3.1 Create `backend/src/api/docs.ts` exposing `createDocsRouter()` that serves `GET /api/openapi.json` and `GET /api/docs` (via `@hono/swagger-ui`).
- [x] 3.2 Mount `createDocsRouter()` from `backend/src/app.ts` under `/api`, before the `notFound` handler.

## 4. Tests

- [x] 4.1 Add `backend/tests/integration/api-docs.test.ts` asserting: (a) the spec version is `3.1.0`; (b) every expected path key is present; (c) every expected `components.schemas` entry is present; (d) the `StartRunRequest` schema declares `providerId`, `modelId`, `apiKey`, `budgetUsd`; (e) `GET /api/docs` returns `text/html` that references `/api/openapi.json`.

## 5. Documentation

- [x] 5.1 Add `/api/openapi.json` and `/api/docs` to `docs/spec.md` section 5.2.
- [x] 5.2 Add an "API docs" section to `README.md` pointing at the local Swagger UI URL.
