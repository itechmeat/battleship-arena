## Why

The frontend has accumulated UI orchestration, API state handling, catalog selection logic, browser storage, replay/live-run state, and page-shell boilerplate inside a few large components and Astro pages. This makes the user-facing behavior harder to verify and slows future changes even when the intended behavior should stay the same.

This change refactors the web frontend end-to-end for clearer ownership, smaller modules, and focused tests while preserving the current UI flows and runtime behavior.

## What Changes

- Refactor large Solid islands into thinner view components backed by focused helpers for catalog selection, run loading, live stream state, replay loading, terminal diagnostics, and formatting.
- Move reusable browser concerns such as local API-key storage, dynamic route id resolution, service-worker registration, and request error handling into small frontend libraries.
- Organize shared constants and view-model helpers so UI components read as UI rather than mixed business logic.
- Keep all routes, API calls, navigation paths, local-storage key format, SSE behavior, replay behavior, visible labels, and current visual design behaviorally unchanged.
- Add or adjust focused unit tests for extracted frontend logic.
- No new dependencies, no UI redesign, no API contract change, and no backend/schema change are intended.

## Capabilities

### New Capabilities

- `frontend-architecture`: Frontend maintainability and modularity requirements for preserving behavior while separating concerns across pages, Solid islands, client libraries, state helpers, and tests.

### Modified Capabilities

- None. This is an implementation refactor; existing product and API requirements should remain behaviorally unchanged.

## Impact

- Affected code: `web/src/pages/`, `web/src/islands/`, `web/src/lib/`, and related `web/tests/` files.
- Affected tests: web unit tests, web typecheck/build as needed, root lint/format checks, and OpenSpec validation.
- No intended changes to public routes, rendered copy, API payloads, SSE event semantics, local-storage keys, PWA manifest, or backend behavior.
