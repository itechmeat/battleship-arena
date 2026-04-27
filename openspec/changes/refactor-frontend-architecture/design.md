## Context

The web frontend is an Astro + SolidJS PWA. The current behavior is small and focused, but several frontend modules mix UI rendering with reusable client logic:

- `web/src/islands/StartRunForm.tsx` owns catalog loading, mock-provider injection, local-storage key persistence, budget parsing, reasoning-mode resolution, selection synchronization, and JSX rendering.
- `web/src/islands/LiveGame.tsx` owns run loading, live SSE lifecycle, stream event reduction, terminal diagnostics, title updates, timers, abort handling, and JSX rendering.
- `web/src/islands/Leaderboard.tsx` owns catalog loading, filter state, leaderboard request construction, table view-model ranking, and JSX rendering.
- `web/src/islands/ReplayPlayer.tsx` owns dynamic route resolution, replay loading, playback timer lifecycle, state reduction, and JSX rendering.
- Astro pages repeat the same document shell, theme basics, manifest link, and service-worker registration snippet.

The user requested a frontend refactor comparable to the backend refactor: apply SOLID, KISS, DRY, and YAGNI while keeping project logic unchanged and code easy to read.

## Goals / Non-Goals

**Goals:**

- Preserve current route paths, API calls, SSE behavior, replay behavior, local-storage keys, service-worker behavior, labels, and visual design.
- Move reusable frontend logic out of large islands into feature-local or shared helpers.
- Keep Solid islands as presentation/orchestration shells rather than containers for every detail.
- Add focused tests around extracted logic, especially where logic was only indirectly covered before.
- Keep abstractions simple: plain functions, small typed view models, and direct dependencies.

**Non-Goals:**

- No UI redesign, style overhaul, animation change, or component-library introduction.
- No new dependency, state-management framework, router, or build-tool change.
- No backend, database, API, or shared contract change unless a type import path update is required by frontend refactoring.
- No speculative design-system layer beyond constants/helpers already justified by duplication.

## Decisions

### Decision 1: Prefer feature-local helpers before global abstractions

Helpers that only support one island will live near that island, while cross-cutting browser/API helpers belong in `web/src/lib/`. This keeps ownership obvious and avoids creating a broad frontend utility folder.

Alternatives considered:

- Move every helper into a single `web/src/lib/` namespace: rejected because it hides feature ownership.
- Keep all logic inside islands: rejected because the largest islands are already hard to scan and test.

### Decision 2: Extract behavior-preserving view models and reducers

Pure transformations such as catalog selection, budget parsing, terminal diagnostic formatting, run-shot merging, leaderboard filter serialization, replay route-id resolution, and page metadata should be exported as small functions with unit tests. Components should call them rather than reimplementing logic inline.

Alternatives considered:

- Introduce classes/services for frontend state: rejected as unnecessary for the current Solid signal model.
- Rewrite islands around a new state library: rejected because current behavior is simple and already works.

### Decision 3: Centralize repeated page shell pieces without changing markup semantics

Astro pages repeat service-worker registration and base document styling. Extracting constants/snippets for shared shell values is acceptable if the rendered head/body behavior remains equivalent.

Alternatives considered:

- Build a full layout component now: rejected unless it can preserve the existing inline global styling and script behavior without broad churn.
- Leave duplication in pages: acceptable short term, but this refactor can remove low-risk repetition while keeping the pages readable.

### Decision 4: Let tests protect behavior during extraction

Existing web tests cover API client, board view, live metrics, replay reducer, SSE, and start form mode selection. New tests should cover extracted helpers instead of changing expectations to match new behavior.

Alternatives considered:

- Rely only on end-to-end/browser smoke: rejected because these logic extractions are cheap and better verified with unit tests.

## Risks / Trade-offs

- **Risk: Component refactor changes user-visible copy or form semantics** -> Mitigation: keep JSX changes minimal and preserve labels, input attributes, navigation paths, and CSS module class usage.
- **Risk: SSE or replay cleanup behavior regresses** -> Mitigation: extract pure event/state helpers first and keep lifecycle cleanup in the component with existing tests plus new helper tests.
- **Risk: Page shell extraction affects Astro output or service-worker registration** -> Mitigation: keep the inline registration script behavior equivalent and verify with web typecheck/build.
- **Risk: Current dirty worktree already contains staged backend refactor changes** -> Mitigation: do not revert or restage existing changes; keep frontend edits scoped to the new OpenSpec change and `web/` files.

## Migration Plan

1. Create and validate OpenSpec artifacts for `refactor-frontend-architecture`.
2. Extract pure frontend helpers and add focused unit tests.
3. Refactor Solid islands and Astro pages to use those helpers without changing behavior.
4. Run web-focused tests, typecheck/build if needed, formatting/lint checks, OpenSpec validation, and code checker.
5. No runtime migration is required because public routes and browser storage keys remain unchanged.

## Open Questions

None currently blocking. If extraction reveals an ambiguous behavior, preserve the current behavior and document the decision in tests.
