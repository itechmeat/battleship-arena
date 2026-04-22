## Context

S1a landed the project skeleton: workspaces, toolchain, CI (gated at the deploy step), Drizzle schema with all `spec.md` 5.1 columns, a health endpoint, and an Astro PWA shell. No game logic, no provider logic, no runs. S2a is the first vertical slice that produces a user-visible playable run, end-to-end, against the deterministic mock provider only. The canonical design document produced during brainstorming lives at `docs/superpowers/specs/2026-04-21-s2a-game-loop-mock-design.md`; this file is a condensed, decision-focused companion whose purpose is to justify the technical choices that shape the requirements and tasks.

Project constraints that shape the design:

- `CLAUDE.md` and `docs/plan.md` make TDD mandatory from S2 onwards.
- `docs/spec.md` 2 pins a floor of Bun 1.3.12, Hono 4.12, Drizzle ORM 0.45, `bun:sqlite`, Astro 6, Solid 1.9, CSS Modules.
- `docs/spec.md` 10 forbids Docker, message queues, containerization, and provider structured-output modes.
- The backend is one Bun process behind Caddy on a single VPS. No horizontal scaling. Runs are in-process async tasks; they do not survive a restart.
- API keys are user-supplied per run; `spec.md` 4.3 forbids persisting or logging them anywhere.

## Goals / Non-Goals

**Goals:**

- A complete vertical slice: user submits `/play` form, lands on `/runs/:id`, watches the run via SSE, reaches a terminal state, and can refetch via `/api/runs/:id` and `/api/runs/:id/shots`.
- The game loop exercises every terminal outcome reachable without pricing: `won`, `dnf_shot_cap`, `dnf_schema_errors`, `aborted_viewer`, `aborted_server_restart`.
- Every module is independently testable. Pure modules get unit tests; stateful modules get integration tests against `withTempDatabase` and the mock provider.
- Zero real-provider tokens are spent in CI.
- API keys do not appear anywhere in SQLite, logs, or SSE frames.

**Non-Goals:**

- Real provider adapters (S3).
- Pricing math, `dnf_budget`, `llm_unreachable` (S3).
- Leaderboard, replay viewer, filters (S3).
- `Clock` abstraction, 23:55-UTC seed rollover test (S4).
- Maintenance toggles, production cutover, off-host backup drill (S4).
- Playwright smoke suite on live staging (S2b - gated on S1b's VPS bring-up).
- Concurrent-run cap per session (hardening, post-S3).

## Decisions

### D1: Split S2 into S2a (in-repo) and S2b (staging Playwright)

**Decision.** Keep Playwright out of S2a. S2b is a separate change once `staging.arena.example` is reachable.

**Alternatives.** (A) Ship S2 as one slice requiring staging. (C) Drop Playwright entirely and rely on manual walkthrough. Chose B because task 11 of plan.md section 5.5 can only succeed once staging is live, and the current head of `main` is S1a-only. Bundling Playwright into S2a recreates the exact coupling that motivated splitting S1 - fast reversible code held hostage by slow operator decisions (DNS, Let's Encrypt, SSH identity).

### D2: PNG rendering via `@resvg/resvg-js`, not native Canvas

**Decision.** Author the board as a pure SVG template in `shared/` and render to PNG via Rust/WASM Resvg in the backend. The same SVG template is reused by the web island.

**Alternatives.** `@napi-rs/canvas` (fast but not byte-stable across minor version bumps, which would burn the snapshot suite on every renovate PR). Hand-rolled PNG encoder (zero deps, but re-invents SVG for 5 cell states + hit/sunk/miss markers). Chose Resvg because snapshot stability is required, the WASM package ships prebuilt binaries for all four targets (darwin-x64, darwin-arm64, linux-x64, linux-arm64), and one shared SVG template keeps the server view and the client view byte-equivalent.

### D3: SSE resume via ring + `resync` for active runs, full synthesized replay for terminal runs

**Decision.** The SSE handler has three code paths:

1. Active run, reconnect within ring horizon: replay `ring.since(Last-Event-ID)`, then attach live.
2. Active run, reconnect older than ring horizon: emit one `resync` event, close. Client re-fetches `/api/runs/:id/shots` and re-subscribes.
3. Terminal run (or unknown id with a persisted outcome): read `runs` + `run_shots`, synthesize the full stream (`open` + one `shot` per row in idx order + `outcome`), close. This matches `spec.md` 4.4 literal reading: "late subscribers to a finished run receive the full event list from the database".

**Alternatives.** Forward-only (no resume) was rejected because `spec.md` 4.1's SSE-over-WebSocket rationale explicitly cites `Last-Event-ID`. Full DB-backed replay on every reconnect (including mid-run horizon-miss) was rejected because it doubles the SSE handler's surface area and collapses the reason `resync` exists as a separate event.

### D4: Extend `ProviderCallInput` with `seedDate: string` (controlled spec drift)

**Decision.** Add `seedDate: string` to `ProviderCallInput`. `spec.md` 6.1 receives the matching one-line update in the same PR.

**Alternatives.** Keep the interface as spec.md pins it and force `mock-misses` to produce 100 out-of-range `invalid_coordinate` turns from turn 1. Rejected because a 10x10 board has 83 non-ship cells; with `seedDate`, the mock fires 83 genuine misses and degrades to duplicate-shot `invalid_coordinate` only for turns 84-100, which is a closer analogue to a real model stuck in a sweep. `seedDate` is not a secret: it is the run row's column, the URL of the board image in S3, and the public seed of the daily board.

### D5: Mock provider is stateless; behavior reconstructs from `priorShots` + `seedDate`

**Decision.** `createMockProvider({ delayMs? })` returns a single adapter with three model IDs (`mock-happy`, `mock-misses`, `mock-schema-errors`). Each call reconstructs any per-run state from `priorShots` alone; the adapter holds no state between calls.

**Alternatives.** An adapter per variant, or a per-run state object in the adapter. Stateless reconstruction makes the adapter's tests hermetic (give it a priorShots array, assert the response) and keeps provider semantics uniform with real providers in S3 which also cannot cache state across HTTP calls.

### D6: Outcome FSM is a pure reducer, not a stateful object

**Decision.** `reduceOutcome(state, event)` is a pure function returning `{ state, outcome: Outcome | null }`. State is immutable; engine holds the state and feeds events through the reducer each turn.

**Alternatives.** A stateful FSM object exposing `apply(event)`. Rejected because `architecture.md` 2.1 explicitly requires the outcome module to be pure, and the reducer pattern gives transition history for free in tests.

### D7: Startup reconciliation belongs in S2a, not S4

**Decision.** Implement `reconcileStuckRuns(queries, nowMs)` in S2a and wire it into `bootstrap(config)` before the HTTP listener binds. S4's task 4 becomes a staging runbook verification (SIGKILL and observe) rather than new implementation work.

**Alternatives.** Defer the reconciliation code to S4 and cover `aborted_server_restart` in S2a tests via direct FSM invocation. Rejected because plan.md 5.2 explicitly lists that outcome as reachable in S2a, and the cleanest reachable path writes the outcome to the DB on next boot; covering it only through the FSM would leave the code path untested.

### D8: Terminal-run SSE emits full replay, not just `outcome`

**Decision.** SSE handler for a terminal run queries `queries.listShots(id)` and synthesizes `open` + one `shot` per row + `outcome`, with event ids re-assigned 0, 1, 2, ... within the synthesized stream (the ring's former ids are long gone). Matches `spec.md` 4.4 literal reading.

**Alternatives.** Emit only a single `outcome` event and rely on the client to fetch `/shots` separately. Rejected after review - the spec's "receive the full event list from the database" is unambiguous that SSE is the delivery channel for the replay.

### D9: Session cookie is set lazily by middleware; concurrency cap deferred

**Decision.** Middleware issues a `bsa_session` ULID on any request that lacks it (`HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=1y`). The session value is written to `runs.client_session` on `POST /api/runs`. The 10-runs-per-session cap from `architecture.md` 8 is not wired in S2a.

**Alternatives.** Issue the cookie eagerly on every page or only on `POST /api/runs`. Lazy middleware issuance is the minimum surface; tests don't need a special setup; and populating `client_session` now means S3's leaderboard de-dup has the identifier it needs without a retrofit.

### D10: No database migration in S2a

**Decision.** S1a already declared every `spec.md` 5.1 column on `runs` and `run_shots` and their indexes. S2a only adds `backend/src/db/queries.ts` as a typed query façade. Plan.md task 4 reduces to this façade.

### D11: Static `/runs/:id` is served via generated shell + Caddy fallback rewrite

**Decision.** Keep Astro in static-output mode for S2a. The build copies the generated `/runs/__dynamic__/index.html` shell to `/runs/index.html`, and Caddy rewrites `/runs` and `/runs/*` to that shell. The browser then resolves the real run id from `window.location.pathname` and hydrates `LiveGame` client-side.

**Alternatives.** Rework S2a to Astro server output or SSR just for the run route; rejected because the project-wide hosting model remains static shell + Bun API behind Caddy. Move the run route to a query-string page like `/run?id=...`; rejected because the spec and plan already name `/runs/:id` as the canonical route. The chosen approach preserves the route contract with the smallest operational delta: one build-step copy and one Caddy fallback rewrite, with no runtime service-worker caching change.

## Risks / Trade-offs

- **Resvg cross-platform PNG determinism**: snapshot fixtures may differ byte-for-byte across macOS dev and Linux CI on the first run. **Mitigation:** first-run "bless from CI" workflow documented in the plan's Task 7; pin `@resvg/resvg-js` to an exact patch version and let Renovate surface upgrades as explicit PRs.
- **Bun test EventSource support**: integration tests may not be able to use a stable `EventSource` polyfill inside `app.request()`. **Mitigation:** SSE tests that need event-parsing go through `fetch` + a streaming text reader on the returned `ReadableStream`, not through `EventSource`. Logic-level SSE ring tests subscribe directly to the manager.
- **SIGTERM testing hostile to Bun's test runner**: real signals are not reliable in test harnesses. **Mitigation:** cover the same code path via `manager.shutdown(0)` while a slow mock-happy run is in flight. Because `manager.shutdown` aborts every active handle with reason `"server_restart"`, the engine deterministically reads that reason and exits without writing the terminal row; the test then invokes `reconcileStuckRuns(queries, now)` and asserts the persisted outcome equals `aborted_server_restart`. S4 covers the real signal drill on live staging.
- **`mock-misses` is a hybrid DNF scenario, not a pure 100-miss run**: 100 legal non-winning shots are geometrically impossible on a 10x10 board with 17 ship cells. **Mitigation:** document the hybrid shape (83 misses + 17 duplicate-shot `invalid_coordinate`) in both the spec's mock-provider requirements and the integration test assertions; treat it as fixture behavior, not a benchmark claim.
- **Spec drift: `ProviderCallInput.seedDate`**: extends `spec.md` 6.1 by one public field. **Mitigation:** the implementation PR updates `docs/spec.md` 6.1 in the same commit that adds the field to the type, so the spec and the code cannot drift.
- **Static run-route coupling**: direct hits to `/runs/:id` depend on the generated `/runs/index.html` shell plus the Caddy fallback rewrite. **Mitigation:** this decision is explicit in the change artifacts, the build step is confined to `web/scripts/build-sw.ts`, and the Caddy matcher is scoped to `/runs` so the rest of the static site remains unchanged.
- **Key-never-persists guarantee is defense-in-depth, not a single runtime proof**. The primary guarantee is structural: the `Manager` and `RunHandle` TypeScript types declare no field or retained closure parameter whose type includes `apiKey`; `Manager.start(input)` is the only entry point that takes the key and it passes the value directly to the engine call without copying it onto the registry, the handle, or a retained closure. Code review enforces this at each PR. Two runtime tests act as regression canaries, not proofs: (i) after a run, scan every column of `runs` and `run_shots` for a sentinel substring - covers persisted state; (ii) during and after a run, scan `JSON.stringify(manager)`, `JSON.stringify(handle)`, and the handle's enumerable collections (`ring`, `subscribers`) for the sentinel - covers enumerable in-memory state. Neither test proves absence: `JSON.stringify` omits non-enumerable properties, symbol-keyed fields, `WeakMap` entries, and closure-captured values; these gaps are accepted because the structural guarantee above is the load-bearing defense and the canaries merely detect regressions in what IS enumerable.

## Open Questions

None blocking implementation. Post-merge items that go into S2b's scope:

- Does the Playwright smoke cover all three mock variants or only the happy path? (Recommendation: only happy path; DNF variants are already covered by integration tests.)
- Does S1b land before S2a merges? If yes, the S2a deploy-staging gate auto-enables; if no, the gate stays off until S2b follows up.
