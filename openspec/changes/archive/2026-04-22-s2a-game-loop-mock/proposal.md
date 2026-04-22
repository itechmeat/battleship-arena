## Why

S1a bootstrap landed the monorepo, toolchain, database schema, health endpoint, and PWA shell but deliberately shipped no game logic. S2a completes a single working vertical slice: a user visits `/play`, picks `mock` as the provider, watches a full Battleship run play out via Server-Sent Events on `/runs/:id`, and sees a terminal state persisted to SQLite. This proves the game loop, the mock provider, the run lifecycle (engine, manager, outcome FSM, SSE ring, abort, reconciliation on startup), the five runs-scoped HTTP endpoints, and the two web pages hold together end-to-end, and it unlocks S3 where real provider adapters and pricing slot into the same interfaces.

## What Changes

- Add a deterministic seeded board generator (`xoshiro128**` + rejection sampling) and a PNG renderer built on a shared SVG template (`@resvg/resvg-js` as a new runtime dep).
- Add a mock provider with three model IDs (`mock-happy`, `mock-misses`, `mock-schema-errors`) driving the happy path, `dnf_shot_cap`, and `dnf_schema_errors` deterministically from the seed + `priorShots`.
- Add the run lifecycle: a pure outcome reducer, an event ring bounded at 200, a per-turn engine that owns the API key in its closure, a manager that owns the active-run registry and SSE fan-out, reconciliation of stuck rows on startup, and SIGTERM drain with grace window.
- Add five HTTP endpoints: `POST /api/runs`, `GET /api/runs/:id`, `GET /api/runs/:id/shots`, `GET /api/runs/:id/events` (SSE), `POST /api/runs/:id/abort`. Terminal-run SSE subscribers receive a full synthesized replay (`open` + one `shot` per persisted row + `outcome`) per `spec.md` 4.4.
- Add a session cookie middleware (`bsa_session`, `HttpOnly; Secure; SameSite=Strict`) so `runs.client_session` is populated for future leaderboard de-dup.
- Extend `shared/` with new types (`BoardView`, `CellState`, `ShotResult`, `RunMeta`, `RunShotRow`, `StartRunInput`), new constants (`RING_CAPACITY`, `SSE_HEARTBEAT_MS`, `SCHEMA_ERROR_DNF_THRESHOLD`, `MOCK_TURN_DELAY_MS_DEFAULT`), new error codes (`run_not_found`, `already_aborted`), a pure SVG board template reused by server and client, and the `SseEvent` discriminated union.
- Add two web pages (`/play`, `/runs/:id`) backed by three Solid islands (`StartRunForm`, `LiveGame`, `BoardView`) plus typed `lib/api.ts` and `lib/sse.ts`. The client hydrates via meta + archive + SSE with `Last-Event-ID`; `resync` triggers a re-fetch. Because Astro stays in static-output mode for S2a, the build copies the generated run shell to `/runs/index.html` and Caddy rewrites `/runs/*` to that shell so direct hits to `/runs/:id` resolve in production.
- **BREAKING (internal only)**: extend `ProviderCallInput` (currently unimplemented) with a `seedDate: string` field. `seedDate` is public information (returned on the run row, targeted by `GET /api/board?date=...` in S3); real provider adapters ignore it. It is load-bearing for `mock-misses` which needs the layout to fire as many genuine misses as possible before degrading to duplicate-shot `invalid_coordinate` turns. Update `spec.md` 6.1 in the same PR.
- Deferred (not in this change): Playwright smoke (goes to S2b after staging is live), real provider adapters, pricing, `dnf_budget`, `llm_unreachable`, leaderboard, replay viewer, `/api/providers`, `/api/board`, `/api/status`, `/api/admin/maintenance`, `Clock` abstraction, concurrent-run cap.

## Capabilities

### New Capabilities

- `board-module`: deterministic seeded board generator and SVG-to-PNG renderer. Pure functions, no I/O, no state.
- `mock-provider`: stateless mock LLM provider adapter with three model-id variants covering the game-loop outcomes reachable without pricing.
- `run-lifecycle`: per-turn game engine, manager-owned active-run registry and SSE event ring, outcome FSM reducer, startup reconciliation for stuck `running` rows, SIGTERM drain with grace window.
- `runs-api`: `POST /api/runs`, `GET /api/runs/:id`, `GET /api/runs/:id/shots`, `GET /api/runs/:id/events` (SSE with `Last-Event-ID` resume and terminal-run replay), `POST /api/runs/:id/abort`, plus the session cookie middleware that populates `client_session`.

### Modified Capabilities

- `shared-contract`: add new run/shot/board types, SSE event union, SVG board template, three new constants, two new error codes (`run_not_found`, `already_aborted`).
- `web-shell`: add `/play` and `/runs/:id` pages, three Solid islands (`StartRunForm`, `LiveGame`, `BoardView`), and client libs (`lib/api.ts`, `lib/sse.ts`). No change to the PWA manifest or runtime service-worker caching policy; the build pipeline gains a minimal run-shell copy step so the static output can serve `/runs/:id` through a Caddy fallback rewrite.

## Impact

- **New runtime dependency**: `@resvg/resvg-js` (backend workspace only). Prebuilt binaries cover `darwin-x64`, `darwin-arm64`, `linux-x64`, `linux-arm64`.
- **Backend source tree**: new directories `backend/src/board/`, `backend/src/providers/`, `backend/src/runs/`, `backend/src/api/runs.ts`, `backend/src/api/session.ts`, `backend/src/db/queries.ts`. Edits to `backend/src/app.ts`, `backend/src/index.ts`, `backend/src/config.ts` (add optional `MOCK_TURN_DELAY_MS`).
- **Shared source tree**: new files `shared/src/board-svg.ts`, `shared/src/sse-events.ts`; edits to `shared/src/types.ts`, `shared/src/constants.ts`, `shared/src/error-codes.ts`, `shared/src/index.ts`.
- **Web source tree**: new pages `web/src/pages/play.astro`, `web/src/pages/runs/[id].astro`; new islands `web/src/islands/StartRunForm.tsx`, `web/src/islands/LiveGame.tsx`, `web/src/islands/BoardView.tsx`, plus `web/src/islands/boardViewFromShots.ts`; new libs `web/src/lib/api.ts`, `web/src/lib/sse.ts`; new styles `web/src/styles/play.module.css`, `web/src/styles/live-game.module.css`; a build-step update in `web/scripts/build-sw.ts` that materializes `/runs/index.html` from the generated shell.
- **Infra surface**: `infra/Caddyfile` adds a `/runs` fallback rewrite to `/runs/index.html` for both prod and staging so direct hits to `/runs/:id` work under Astro static output.
- **No database migration**. S1a already declared every `spec.md` 5.1 column on `runs` and `run_shots`; S2a only adds typed query helpers.
- **Documentation drift**: `docs/spec.md` 6.1 gets a one-line update to add `seedDate` to `ProviderCallInput` in the same implementation PR.
- **Test surface**: unit tests for every pure module, integration tests against `withTempDatabase` for queries, reconcile, engine (all five terminal outcomes reachable without pricing: `won`, `dnf_shot_cap`, `dnf_schema_errors`, `aborted_viewer`, `aborted_server_restart`), manager, session middleware, every HTTP route, SSE backlog / resync / terminal-replay semantics, a "key never persists" DB scan, and a manager-reachability canary on enumerable in-memory state.
- **CI**: `pr.yml` already runs lint, format, typecheck, `bun test`, and build; no workflow changes. `deploy-staging.yml` continues to short-circuit per S1a's deploy-gate flag until S1b lands.
- **Deferred work that lands outside this change**: Playwright smoke on staging (S2b), real provider adapters and pricing (S3), maintenance toggles and production cutover (S4).
