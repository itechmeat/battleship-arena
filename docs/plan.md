# BattleShipArena Development Plan

Product framing lives in `docs/about.md`. The technical contract lives in `docs/spec.md`. The architecture lives in `docs/architecture.md`. This document does not repeat any of them; it turns them into four sequential stories and the discipline that connects the stories.

## 0. Approach

Work is broken into **vertical slices**: each story cuts through every layer the feature needs (backend code, web code, database, infrastructure, tests) and ends with a **working, verifiable artifact that a human or CI can exercise end-to-end**. A story never leaves a dangling half-layer behind; a story never pre-builds scaffolding for a later story. If a feature cannot be shipped as a vertical slice, the slice is wrong and has to be rescoped.

The four stories in this plan are executed **strictly in sequence**. No story starts until the previous one has met every item in its acceptance criteria and its artifact has been verified. There is no parallel work across stories for a single operator; within a story, tasks may be parallelized if they are actually independent.

## 1. Testing strategy

The testing strategy is the one pinned by `spec.md` section 8 and `CLAUDE.md`. It is restated here so the plan is self-contained for a reader who is about to open a task and wants to know what "done" means.

- **Unit tests** cover pure functions: the board generator, the board renderer, the shot validator, the outcome FSM, the pricing math, the error envelope. Unit tests never open a database and never touch the network.
- **Integration tests** cover Hono route handlers and the game-loop engine against an in-memory or `/tmp/`-based SQLite file, using the mock provider. Integration tests use `withTempDatabase(fn)`, which creates a unique temporary SQLite file, applies the schema, invokes the callback, and deletes the file.
- **The database guard** in `backend/tests/setup.ts` asserts that `DATABASE_PATH` is `:memory:`, starts with `/tmp/`, or contains `-test-`. Any other value fails the suite before a single query runs. No test may write to the production database. No test may write to `project-staging.db`.
- **The mock provider** (`backend/src/providers/mock.ts`) is deterministic and is the only provider any CI run ever calls. No CI run spends real provider tokens.
- **End-to-end tests** run with Playwright against the **staging** environment only. Staging is a separate systemd service on a separate port with its own database file (`project-staging.db`). Production is never exercised by automated tests.
- **Before claiming an implementation done**, run `bun test` in every affected workspace. If a UI surface changed, run the Playwright smoke locally (dev server) or against staging.
- **Contract tests for provider adapters** run against captured HTTP fixtures so that a real provider's response shape does not regress our parser. Fixtures are checked in and redacted; they never contain a real API key.

## 2. TDD rule

TDD is **mandatory starting from story S2**. For every task in S2 onwards, the workflow is:

1. Write a failing test that expresses the acceptance criterion for the smallest next step.
2. Write the minimum code that makes the test pass.
3. Refactor while the tests stay green.
4. Commit. (Red, green, refactor commits may be separated; they must not be skipped.)

**Story S1 is the exception.** S1 is bootstrap: the repository does not yet have the harnesses, the workspaces, the test runner configuration, or the database guard that TDD depends on. Tests written in S1 may be written alongside or immediately after the code they cover. Coverage for code written in S1 is still required - the exception is about ordering, not about skipping tests.

From S2 onward: a commit that introduces production code without a corresponding test must not pass review.

## 3. Shared progress checklist

This checklist spans all four stories and is updated as work lands. A check mark means the item is both implemented and verified.

### S1 - Bootstrap

- [x] Monorepo initialized with Bun workspaces (`backend/`, `web/`, `shared/`, `infra/`).
- [x] TypeScript, oxlint, oxfmt configured at the root; per-workspace overrides only when required.
- [x] `shared/` exposes API types, outcome enum, error codes, shot schema, and board constants.
- [x] `backend/` has a Hono app with `/api/health` returning `200`.
- [x] `web/` has an Astro page at `/` with the PWA manifest and a trivial service worker caching only the static shell.
- [x] `backend/tests/setup.ts` installs the `DATABASE_PATH` guard; `withTempDatabase` is implemented and covered.
- [x] Drizzle Kit migrations are wired (`backend/db/schema.ts`, `backend/db/migrations/`); startup applies pending migrations inside a transaction before opening the HTTP listener.
- [x] CI workflow `pr.yml` runs lint, format check, typecheck, `bun test`, and build on every PR.
- [x] CI workflow `deploy-staging.yml` deploys on push to `main`, restarts the staging unit, and health-checks.
- [x] Caddy serves the static build and proxies `/api/*` on `staging.arena.example`.
- [x] Both systemd units (`battleship-arena-staging.service` and the backup timers) exist, are enabled, and survive a host reboot.
- [x] Off-host rsync timer is installed; first run succeeds (even with an empty snapshot).

### S2 - Game loop against the mock provider

- [x] `board/generator` produces deterministic fleets from a `YYYY-MM-DD` seed.
- [x] `board/renderer` produces a PNG for any board state.
- [x] `providers/mock` returns deterministic shots for tests and a configurable "bad model" variant.
- [x] `runs/outcome` FSM handles every terminal transition except `dnf_budget` (deferred to S3).
- [x] `runs/engine` runs a full game against the mock provider, persisting `run_shots` and updating `runs`.
- [x] `runs/manager` owns the active-run registry and the SSE ring, drops the API key at terminal state.
- [x] `POST /api/runs`, `GET /api/runs/:id`, `GET /api/runs/:id/shots`, `GET /api/runs/:id/events`, and `POST /api/runs/:id/abort` are implemented.
- [x] The `/play` and `/runs/:id` pages on `web/` drive a full mock-provider run and display live events.
- [x] Integration tests cover every terminal outcome reachable without pricing.
- [x] Playwright smoke on staging plays a mock run to `won`.

- [x] `providers/openrouter` and `providers/opencode-go` implement the adapter interface for the S3 scope. Direct `openai`, `anthropic`, `google`, and `zai` adapters are deferred.
- [x] `pricing/catalog` exposes a per-exact-model-ID pricing table; `cost_usd_micros` is computed server-side.
- [x] `dnf_budget` is reachable and covered by a mock-provider test that simulates cumulative cost crossing the cap.
- [x] Contract tests cover the adapter request/response/parser behavior without real API keys.
- [x] `GET /api/providers` returns the current list with `pricing`, source metadata, and cost estimates per priced model; `/play` shows the range.
- [x] `GET /api/leaderboard` supports `scope=today` and `scope=all` with session dedupe.
- [x] The home page shows today's board and the leaderboard.
- [x] `/runs/:id/replay` plays back any archived run at a user-controlled speed.
- [ ] Playwright smoke on staging runs the mock end-to-end, hits a budget DNF, and opens a replay.

### S4 - Seed rollover, maintenance, backup drill, production cutover

- [ ] UTC seed rollover behavior is covered by a test: a run started before 00:00 finishes on yesterday's seed; a run started after 00:00 uses today's.
- [ ] Hard maintenance (Caddy flag) is verified on staging: every request returns the static 503 page.
- [ ] Soft maintenance (`MAINTENANCE_SOFT=1` in the backend env) is verified on staging: mutating endpoints return `maintenance_soft`, reads and in-flight SSE keep working.
- [ ] On SIGTERM the backend waits up to `SHUTDOWN_GRACE_SEC` for active runs to finish. A test kicks off a mock run, sends SIGTERM, and asserts the run reaches a terminal state before the process exits.
- [ ] `POST /api/admin/maintenance { untilAt, message }` records an announcement, `GET /api/status` returns it, and the `MaintenanceBanner` appears on the frontend within 30 s of polling.
- [ ] `aborted_server_restart` is reachable in the unplanned case: killing the unit without a grace window (`systemctl kill -s SIGKILL`), restarting, and observing the outcome on the run's row.
- [ ] Hourly `VACUUM INTO` snapshots appear in `/var/backups/battleship-arena/`; daily off-host rsync succeeds.
- [ ] A restore drill is performed against staging and recorded in `infra/scripts/restore.sh`'s runbook.
- [ ] `deploy-production.yml` runs to completion from a tag push: touches the maintenance flag, rsyncs artifacts, restarts the unit, clears the flag, and passes the production health check.
- [ ] `arena.example` serves the production build; first real `won` run is recorded.

## 4. Story S1 - Bootstrap

### 4.1 Goal

Stand up the skeleton of the project: workspaces, toolchain, CI, a reverse proxy, a backend process with a health endpoint, a PWA shell, and the full deploy-to-staging pipeline. No game logic. No provider logic. No database tables beyond what the initial Drizzle schema and its first generated migration create, plus what the test guard needs. The point of S1 is that every subsequent story starts from a green pipeline and a running staging environment; it is not to deliver a user-visible feature.

### 4.2 Acceptance criteria

- Bun workspaces wire `backend`, `web`, `shared`, `infra` so cross-package imports resolve without a publish step.
- `oxlint` and `oxfmt` pass at the root. Pre-commit hooks run both and fail on violations.
- `bun test` runs successfully in every workspace (even if the only tests are trivial coverage of `shared` and of `withTempDatabase`).
- `GET https://staging.arena.example/api/health` returns HTTP `200` and a JSON body that includes the backend version.
- `GET https://staging.arena.example/` returns the Astro-built shell page with a valid manifest link and a service worker that caches only the shell.
- `pr.yml` runs on every PR with lint, format-check, typecheck, test, and build.
- `deploy-staging.yml` runs on push to `main`, deploys to the host, restarts the staging unit, and health-checks.
- The staging systemd unit, the Caddy vhost, the hourly backup timer, and the off-host rsync timer all exist, are enabled, and survive a host reboot.

### 4.3 Final artifact

A reachable staging URL (`staging.arena.example`) that serves the PWA shell and responds to `/api/health`; a green CI pipeline on `main`; a host on which `systemctl status battleship-arena-staging.service battleship-backup.timer battleship-offhost-rsync.timer` all report `active`.

### 4.4 Verification method

- **CI:** the most recent `deploy-staging.yml` run on `main` is green, including the post-deploy health check.
- **Manual:** `curl https://staging.arena.example/api/health` returns `200` from a machine outside the host.
- **Manual:** visit `https://staging.arena.example/` on a phone, confirm the shell renders and Lighthouse reports it as an installable PWA with no service-worker errors.
- **Host:** `systemctl list-timers battleship-backup.timer battleship-offhost-rsync.timer` shows scheduled runs; `journalctl -u battleship-arena-staging.service` shows the process up since the last deploy.
- **Reboot drill:** reboot the host once, confirm Caddy, the staging unit, and both timers come back without manual intervention.

### 4.5 Task list

1. Initialize the monorepo. Create `package.json` with workspaces, `tsconfig.base.json`, `bunfig.toml`, `oxlint.jsonc`, `oxfmt.toml`, a root `.editorconfig`, a root `README.md` pointing to the four documents under `docs/`.
2. Scaffold `shared/` with the types, enums, and constants listed in `architecture.md` section 2.3. Export them with explicit entry points so backend and web import from stable paths. Write unit tests that exercise the shot-schema validator against a handful of valid and invalid payloads.
3. Scaffold `backend/` with the Hono app factory, the `index.ts` entrypoint, the `config` module that parses env (including `DATABASE_PATH`, `PORT`, `MAINTENANCE_SOFT`, `SHUTDOWN_GRACE_SEC`), the `errors` module with the closed-set codes, the `health` route, and `backend/tests/setup.ts` with the `DATABASE_PATH` guard. Implement `withTempDatabase` and cover it with a test. Wire Drizzle ORM + Drizzle Kit: declare `runs` and `run_shots` in `backend/db/schema.ts`, generate the first migration into `backend/db/migrations/`, and apply pending migrations on startup from `db/client.ts` inside a transaction before the HTTP listener opens.
4. Scaffold `web/` with the Astro configuration, the PWA manifest, a minimal home page, and a shell-only service worker. Add the Solid integration and an empty `islands/` directory.
5. Author `infra/Caddyfile` with the prod and staging vhosts and the hard-maintenance matcher (even though prod is not live yet, the vhost stub is harmless). Author the systemd units for staging backend, hourly backup, and daily off-host rsync; author the backup and rsync shell scripts; author `maintenance-on.sh` and `maintenance-off.sh`.
6. Author `.github/workflows/pr.yml` and `.github/workflows/deploy-staging.yml`. Include the lint/fmt/typecheck/test/build pipeline in both. The deploy workflow rsyncs the built backend and web outputs, restarts the staging unit, and curls the health endpoint.
7. Provision the host: install Caddy, install Bun pinned to the spec floor (or higher), create the `battleship` user, create `/var/www/`, `/var/lib/`, `/var/backups/`, and `/etc/battleship-arena/` with the documented permissions, install the systemd units, enable Caddy and the timers.
8. Land the first deploy: open a PR, merge it, watch `deploy-staging.yml` succeed, curl the health endpoint from outside the host, open the shell in a phone browser.
9. Exercise the reboot drill and record the result in a short commit message.

## 5. Story S2 - Game loop end-to-end against the mock provider

### 5.1 Goal

Deliver a complete, playable run against the mock provider on staging. A user visits `/play`, picks `mock` as the provider and a mock model ID, pastes a placeholder key, presses start, and watches the run play out live via SSE until a terminal state. The run is persisted; the user can refresh and fetch `/api/runs/:id` and `/api/runs/:id/shots` for the same data. No real providers exist yet. No leaderboard, no replay viewer, no pricing.

### 5.2 Acceptance criteria

- The deterministic board generator produces the same layout for the same `YYYY-MM-DD` seed, and the layout obeys the fleet and adjacency rules in `spec.md` section 3.1.
- The board renderer produces a PNG that correctly reflects unknown / hit / miss / sunk-ship cells.
- The mock provider responds deterministically; a "bad model" variant emits a configurable sequence of schema errors.
- `runs/engine` drives a full game loop against the mock provider and updates `runs` and `run_shots` on every turn.
- `runs/outcome` FSM reaches every terminal state reachable without pricing (`won`, `dnf_shot_cap`, `dnf_schema_errors`, `aborted_viewer`, `aborted_server_restart`) in at least one test each.
- `runs/manager` holds the active-run registry and the SSE ring, and clears the API key from memory at terminal state (covered by a test that reads the closure via a debug hook, or more simply by asserting that `runs.api_key` does not exist anywhere in SQLite because the column does not exist).
- `POST /api/runs`, `GET /api/runs/:id`, `GET /api/runs/:id/shots`, `GET /api/runs/:id/events`, and `POST /api/runs/:id/abort` are implemented, typed against `shared/`, and documented in `spec.md` section 5.2.
- The `/play` page lets a user pick `mock`, paste any non-empty string as the API key, and press start.
- The `/runs/:id` page subscribes to SSE, updates the board on every shot, and transitions to a terminal display when the run ends.
- A Playwright smoke test runs the full mock flow against staging and asserts that `GET /api/runs/:id` returns `outcome: "won"` at the end.

### 5.3 Final artifact

On staging: a user clicks through `/play`, picks `mock`, starts a run, and watches it end. A row in `project-staging.db` records the run with a non-null outcome; the corresponding rows in `run_shots` reconstruct the game turn-by-turn.

### 5.4 Verification method

- `bun test` passes in every workspace, with new unit coverage for the generator, renderer, outcome FSM, and shot validator; new integration coverage for every endpoint introduced in this story; and every reachable terminal state covered by at least one test.
- Playwright smoke on staging walks the full flow and asserts on the terminal `outcome` via the API.
- Manual verification on a phone: the live feed updates smoothly, the board is legible at 375x812, the terminal display is shown without reloading.

### 5.5 Task list

1. Implement `board/generator.ts` and cover it with unit tests: deterministic output per seed, fleet composition, no overlaps, no adjacency.
2. Implement `board/renderer.ts` and cover it with unit tests that snapshot the PNG for a handful of states.
3. Implement `providers/mock.ts` (happy path) and `providers/mock.ts` "bad" variant (schema errors on demand). Cover both with unit tests.
4. Extend `db/schema.ts` with the final columns for `runs` and `run_shots` per `spec.md` section 5.1; run `drizzle-kit generate` to emit the corresponding migration into `backend/db/migrations/`. Add the typed query module `db/queries.ts`.
5. Implement `runs/outcome.ts` as a pure FSM. Cover every terminal state with unit tests.
6. Implement `runs/engine.ts`. Cover the full loop with integration tests against the mock provider and an in-memory database.
7. Implement `runs/manager.ts` (registry, SSE ring, key handling, cancel signal). Cover the ring semantics and the `aborted_viewer` path.
8. Wire the Hono routes: `POST /api/runs`, `GET /api/runs/:id`, `GET /api/runs/:id/shots`, `GET /api/runs/:id/events`, `POST /api/runs/:id/abort`. Each route has integration tests.
9. Add a small `/play` page in `web/` with a provider picker (initially just `mock`), a model picker, a key field, and a start button. Drive form state with a Solid island.
10. Add the `/runs/:id` page and the `LiveGame` Solid island that subscribes to the SSE feed and re-renders the board.
11. Ship a Playwright smoke test that walks the full flow against staging.
12. Merge to `main`, watch `deploy-staging.yml` deploy, run the smoke manually once, confirm `bun test` is green in CI.

## 6. Story S3 - Real providers, pricing, budget, leaderboard, replays

### 6.1 Goal

Make the product useful to anyone who owns a key for the S3 real-provider scope: `openrouter` and `opencode-go`. Introduce cost tracking, the budget DNF, the leaderboard, and the replay viewer. No CI run spends real tokens; adapter tests use redacted fixtures or in-test responses.

### 6.2 Acceptance criteria

- `providers/openrouter` and `providers/opencode-go` implement the adapter interface and are covered by contract tests against captured, redacted fixtures or equivalent in-test responses.
- `pricing/catalog.ts` contains a per-exact-model-ID table. Updating the table is a documented PR with an effective date in the commit message.
- `runs/engine` writes `cost_usd_micros` on every `run_shots` row and rolls it up to `runs.cost_usd_micros` at terminal state.
- `dnf_budget` is reachable when `budget_usd_micros` is non-null and cumulative cost would cross it on the next turn. A test simulates this against the mock provider by assigning a synthetic per-turn cost.
- `GET /api/providers` returns the live list with `pricing`, source metadata, and estimated cost range per priced model; the `/play` Start button renders the range.
- `GET /api/leaderboard?scope=today|all` returns ranked rows keyed by `(providerId, modelId)`, applying session dedupe before median aggregation.
- The home page renders today's board and the leaderboard.
- `/runs/:id/replay` plays back any archived run at 1x, 2x, and 4x speed; a playhead shows the current turn.
- Playwright smoke covers: start a mock run and finish it, hit a budget DNF in the mock, reach the leaderboard, open a replay.

### 6.3 Final artifact

On staging: `/play` offers OpenRouter and OpenCode Go options, a user with a real key can run a real model end-to-end (verified manually once), the home page shows a non-empty leaderboard populated from accumulated mock and real runs, and any archived run is replayable.

### 6.4 Verification method

- `bun test` passes; adapter suites validate parsing, token counting, error mapping, and cost math.
- Manual: one real-provider smoke per S3 provider, recorded as a note in the PR description (model ID, cost, outcome).
- Playwright smoke runs the four scenarios above against staging.

### 6.5 Task list

1. Capture or construct redacted provider response fixtures for OpenRouter and OpenCode Go. Store durable fixtures under `backend/tests/fixtures/providers/` when captured from live traffic.
2. Implement `providers/openrouter.ts` (primary adapter; its catalog reaches the widest surface). Cover parse, tokens, error mapping via contract tests.
3. Implement `providers/opencode-go.ts`. Cover the same.
4. Defer direct `openai`, `anthropic`, `google`, and `zai` adapters to a later change.
5. Implement `pricing/catalog.ts` with the per-model table, including `priceSource` and `lastReviewedAt`. Cover cost math with unit tests (including integer micros rounding).
6. Wire pricing into `runs/engine.ts`. Update integration tests to assert `cost_usd_micros` is non-zero when the mock reports a synthetic price.
7. Implement the `dnf_budget` path in `runs/outcome.ts`. Cover with an integration test that sets a tight budget.
8. Implement `GET /api/providers` returning the current table plus estimated cost range per priced model. Surface the range on the `/play` Start button. Test both.
9. Implement `GET /api/leaderboard` with both periods. Cover with integration tests over a seeded dataset.
10. Add the leaderboard and today's-board sections on the home page.
11. Add `/runs/:id/replay` with the `ReplayPlayer` island, playhead, and speed controls. Cover the replay state machine with a unit test.
12. Extend the Playwright smoke to cover the four scenarios.
13. Perform one real-run per S3 provider, record the result, and commit the pricing-table update if any prices have drifted since the last PR.

## 7. Story S4 - Seed rollover, maintenance, backup drill, production cutover

### 7.1 Goal

Everything operational: the daily UTC seed rollover, both maintenance tiers, the backup chain, the restore drill, and the production deployment. At the end of S4, `arena.example` is live with the full MVP feature set.

### 7.2 Acceptance criteria

- A run started at 23:55 UTC that finishes at 00:05 UTC stays on yesterday's seed; a run started at 00:05 UTC uses today's seed. Covered by a test that injects a controllable clock.
- Triggering hard maintenance on staging causes every request to return the static 503 page; removing the flag restores normal routing within the Caddy reload window. Covered by a Playwright test that toggles the flag via SSH in a before/after step.
- Triggering soft maintenance on staging causes `POST /api/runs` to return `maintenance_soft`, while `GET /api/leaderboard` and in-flight SSE keep working. Covered by an integration test that flips the env and a manual staging exercise.
- Killing the staging unit during an in-flight mock run and restarting it results in a run row with outcome `aborted_server_restart`. The API key has not been persisted anywhere.
- Hourly snapshots appear under `/var/backups/battleship-arena/`; the daily off-host rsync succeeds at least once between S3 and S4.
- A restore drill is performed on staging: the newest snapshot is copied over `project-staging.db` following `infra/scripts/restore.sh`, the unit is restarted, and the site serves the pre-drill state. The drill's log is committed as `docs/ops/restore-drill-<date>.md`.
- `deploy-production.yml` runs from a tag push: it touches the maintenance flag, rsyncs backend and web artifacts, restarts `battleship-arena.service`, clears the flag, and passes the production health check.
- The first production `won` run is recorded; the home page shows it.

### 7.3 Final artifact

`arena.example` serves the production build with the full MVP feature set. `/api/health` returns `200`. The leaderboard is live (initially showing whatever rows were promoted from the first real-key runs in production). The hourly and daily backup artifacts exist. The restore-drill log exists in `docs/ops/`.

### 7.4 Verification method

- **Automated:** Playwright smoke suite on staging covers hard and soft maintenance toggles, the server-restart abort path, and an end-to-end leaderboard+replay flow.
- **Automated:** `deploy-production.yml` runs green on the cutover tag.
- **Manual:** the restore drill is performed and its runbook output is pasted into `docs/ops/restore-drill-<date>.md`.
- **Manual:** a real-key production run is played to `won`, the leaderboard row appears, a replay plays back, and a phone screenshot is included in the cutover PR description.
- **Post-cutover:** `curl https://arena.example/api/health` from an external machine returns `200`, and `journalctl -u battleship-arena.service` shows a clean startup.

### 7.5 Task list

1. Introduce a `Clock` interface in `shared/` and thread it through `runs/engine` and `board/generator`. Cover the UTC rollover behavior with unit and integration tests.
2. Implement the hard-maintenance matcher in `Caddyfile` (flag-file check returning the static 503). Add `maintenance.html` to `web/public/`. Write a staging test that toggles the flag.
3. Implement soft maintenance in `backend/config.ts` and the route middleware. Cover with an integration test that flips the env and asserts the right status/error code per route.
4. Implement the `aborted_server_restart` path: on backend startup, scan `runs` for rows stuck in `running`, set `outcome = aborted_server_restart` and `ended_at = now()`. Cover with an integration test that seeds a stuck row and boots the app.
5. Install the backup `.service` and `.timer` if not yet enabled, confirm `journalctl -u battleship-backup.service` shows at least one successful run after S3's data accumulates.
6. Install the off-host rsync `.service` and `.timer`, confirm the first run copies a non-empty snapshot to the target.
7. Perform the restore drill on staging using `infra/scripts/restore.sh`. Record the timing and any friction in `docs/ops/restore-drill-<date>.md`.
8. Author `.github/workflows/deploy-production.yml`. Dry-run it against a test tag on a dedicated staging-prod-like hostname (not strictly required, but recommended) before the real tag.
9. Provision production: create the `/var/lib/battleship-arena/`, `/var/www/battleship-arena/`, and `/var/backups/` directories, the production systemd unit, and the Let's Encrypt certificate for `arena.example` in Caddy.
10. Cut a tag `v1.0.0` from `main`, watch `deploy-production.yml` run, clear the maintenance flag, and perform the first real-key run against production.
11. Announce. Close the MVP.

## 8. MVP completion criteria

The MVP is considered complete when **all** of the following are true:

1. The shared progress checklist in section 3 has every item checked.
2. `arena.example` serves the full production build and `/api/health` returns `200` from an external machine.
3. At least one `won` run exists in production for each of the five real providers (`openrouter`, `openai`, `anthropic`, `google`, `zai`), proving the adapters work with live keys.
4. The hourly local snapshot timer has produced at least 24 snapshots in production; the daily off-host rsync has produced at least 7 consecutive successful runs.
5. One restore drill has been executed on staging within the last 30 days and its log is committed under `docs/ops/`.
6. Both maintenance modes have been toggled at least once on staging; their runbooks (`maintenance-on.sh`, `maintenance-off.sh`) are referenced from the restore-drill log.
7. The Playwright smoke suite on staging passes on `main`; `pr.yml` is green on the latest PR.
8. No production artifact (binaries, static files, database, backups) is world-readable; permissions match `architecture.md` section 8.
9. No test suite in CI has ever spent a real provider token (audited by searching CI logs for any non-mock provider call).
10. A public announcement has been made and the first public visitor's run appears on the leaderboard.

When all ten are true, BattleShipArena MVP is done. Post-MVP work is out of scope for this plan.
