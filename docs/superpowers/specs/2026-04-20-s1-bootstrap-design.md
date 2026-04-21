# S1 - Bootstrap: Design

Date: 2026-04-20
Status: approved (brainstorm); awaiting user review before implementation plan.
Source story: `docs/plan.md` section 4 ("Story S1 - Bootstrap").
Related documents: `docs/about.md`, `docs/spec.md`, `docs/architecture.md`, `CLAUDE.md`, `AGENTS.md`.

This document records every decision taken during the S1 brainstorm together with the reasoning that produced it. The reasoning is part of the contract and must not be deleted on a later editorial pass. If a decision is overturned, the overturning decision is recorded next to it; the original is preserved.

## 0. Meta - why this document exists in this shape

The four canonical documents (`about.md`, `spec.md`, `architecture.md`, `plan.md`) specify the product, the contract, the architecture, and the four stories that land the MVP. They do not specify the choice points that only appear when a story is actually sequenced into an implementation: which pre-commit tool, which service-worker strategy, where the gate between "code is ready" and "host is provisioned" sits, how the CI deploy job behaves before a host exists, what "done" means on a specific weekday. This document picks those. It does not repeat what the canonical documents say.

## 1. Scope decision - S1 is split into S1a and S1b

### 1.1 The split

- **S1a** - repo, workspaces, shared package, backend skeleton, Drizzle schema + first migration applied on startup, web PWA shell, infra files checked in (not applied), CI workflow files including a gated staging deploy job, Dependabot, pre-commit hooks, full local verification.
- **S1b** - VPS provisioning, DNS, Caddy on the host, systemd units enabled, backup and off-host rsync timers enabled with one successful run each, CI secrets landed, first `deploy-staging.yml` run green on a merge, reboot drill, runbook committed.

S1a's task list is tasks 1-6 of the plan plus one addition: `.github/workflows/deploy-staging.yml` is authored now with its `deploy` job gated step-by-step on a repository variable (`vars.STAGING_DEPLOY_ENABLED`). Until S1b flips that variable, the `deploy` job runs but writes a `### Deploy gate: DISABLED` step summary and skips every actual deploy step.

S1b's task list is plan tasks 7-9 plus the runbook document (`docs/ops/host-bootstrap.md`) and the flipping of `vars.STAGING_DEPLOY_ENABLED` to `true`.

### 1.2 Why split - reasoning preserved

The plan enumerates S1 as a single vertical slice ending on a reachable staging URL, a green CI pipeline, and a host that survives a reboot. That goal bundles two risks of very different shapes:

1. Code skeleton compiles, lints, tests, builds. Feedback loop: seconds. Reversible: entirely.
2. A VPS is correctly configured, DNS resolves, Let's Encrypt issues a certificate on first try, systemd units boot on reboot, an off-host backup target is reachable, SSH deploy identity and sudoers are wired without room for privilege escalation. Feedback loop: minutes to hours. Irreversible decisions: cloud provider, region, domain registrar, DNS provider, deploy identity, off-host target.

Coupling them into a single "green or red" signal means the story's signal is meaningless: half the work finishes in an afternoon, the other half stalls on a DNS propagation or an LE rate limit, and the merge window for the code half is held hostage by the operator half. Splitting preserves the vertical-slice rule - each half has its own verifiable artifact - and moves the irreversible decisions into their own deliberation window instead of being made under the pressure of "finishing S1."

The alternative options considered at brainstorm time:

- **(A) Host + domain already provisioned.** A reachable VPS, DNS resolving, SSH working, Caddy able to issue LE certs on first try. S1 runs end-to-end in one pass.
- **(B) Nothing live yet.** Selected. Split as described.
- **(C) Host exists but no domain yet.** Use a real IP plus `nip.io` for TLS, rename later.

(B) was selected because the host half is not yet in hand, and because the host half carries all the irreversible operator decisions and all the slow feedback loops. The rationale recorded verbatim during the brainstorm:

> The host half carries all the irreversible operator decisions (cloud provider, region, domain, DNS, deploy identity, off-host target) and all the slow feedback loops (DNS propagation, LE issuance, reboot drill). Bundling that risk into the same slice as "does TypeScript compile" couples a 1-hour task with a 1-day task and makes the story's green/red signal meaningless. Splitting is the lesser of two deviations from the plan: it preserves the vertical-slice rule by giving each half a verifiable artifact of its own.

### 1.3 Definition of done - S1a

On a fresh clone:

- `bun install --frozen-lockfile` succeeds.
- `bun run lint`, `bun run fmt:check`, `bun run typecheck`, `bun test`, `bun run build` all pass at the root (and, where meaningful, in each workspace).
- `bun run dev:backend` binds locally; `curl http://127.0.0.1:8081/api/health` returns `200` with body `{ status: "ok", version, commitSha, startedAt }`.
- `bun run build:web && bun run preview:web` serves the Astro shell; the service worker registers in production builds; the manifest parses; Lighthouse reports the shell as installable locally.
- Startup applies pending Drizzle migrations inside a transaction before the HTTP listener opens. The guarantee is exercised by a test that spawns the migrator against a temp DB and a separately running unit test for the listener's init order.
- `backend/tests/setup.ts` rejects any `DATABASE_PATH` outside `:memory:`, `/tmp/...`, or a path containing `-test-`. A sub-process test proves the guard aborts the suite when misconfigured.
- `withTempDatabase(fn)` is covered by a test that runs a callback, asserts the callback saw a working DB, and asserts the file is unlinked after the callback returns.
- The PR carrying S1a merges to `main`; `pr.yml` is green; `deploy-staging.yml` runs its `build` job, then runs its `deploy` job which writes a `### Deploy gate: DISABLED` step summary and skips every actual deploy step.

### 1.4 Definition of done - S1b

- `curl https://<staging-domain>/api/health` from an external machine returns `200`.
- `https://<staging-domain>/` renders the PWA shell on a phone; Lighthouse reports installable; no service-worker errors in the console.
- `systemctl status battleship-arena-staging.service battleship-backup.timer battleship-offhost-rsync.timer` reports all `active` after a reboot drill.
- `/var/backups/battleship-arena/` contains at least one hourly snapshot; the off-host target contains at least one synced copy.
- `docs/ops/host-bootstrap.md` captures the VPS, domain, DNS provider, deploy identity, and off-host target chosen, in a form that allows a different operator to reproduce the bootstrap.
- `vars.STAGING_DEPLOY_ENABLED` is `true`; the next merge to `main` runs `deploy-staging.yml` end-to-end including the `deploy` job, and the job reports green.

### 1.5 Explicit non-goals inside S1

- No game logic of any kind (board generator, renderer, run engine, outcome FSM, providers). All reserved for S2 and later.
- No route beyond `/api/health`.
- No schema beyond `runs` and `run_shots`. Those two exist so the migrator and `withTempDatabase` exercise a real applied migration, which is the S1 contract; their columns include the fields needed at S2 because the columns are specified already in `spec.md` section 5.1 and splitting the table into two migrations would cost more than it earns.
- No Playwright (S2).
- No rate limiting, no maintenance-mode route middleware (S4).
- No real provider adapters (S3). The `providers/` directory does not exist yet.

## 2. Toolchain and convention choices

Every choice below is recorded with the alternatives considered so that a future reviewer can understand why the alternative was rejected.

### 2.1 Monorepo orchestrator: plain Bun workspaces

Decision: no Turbo, no Nx, no Lerna. The root `package.json` declares `workspaces`; scripts fan out with `bun --filter '*' run <script>` or call workspace scripts directly.

Why: Bun's workspace support handles install and script orchestration natively. Turbo's remote cache and task-graph wins pay off above a dozen packages with slow builds, not four. Adding Turbo now would put a second build tool between the developer and `bun run <script>` and introduce a second lockfile-adjacent surface.

### 2.2 Pre-commit hooks: lefthook

Decision: `lefthook.yml` at repo root, runs `oxlint`, `oxfmt --check`, and `bun run typecheck` in parallel on pre-commit.

Why: lefthook is a single Go binary, supports parallel hooks out of the box, and its YAML config is shorter than its alternatives. `simple-git-hooks` is lighter but serial; running three checks serially adds noticeable pre-commit latency. `husky` is Node-centric and installs an extra `prepare` script; lefthook avoids that shim.

### 2.3 TypeScript configuration

Root `tsconfig.base.json`:

- `strict: true`
- `noUncheckedIndexedAccess: true`
- `exactOptionalPropertyTypes: true`
- `noImplicitOverride: true`
- `verbatimModuleSyntax: true`
- `module: "nodenext"`, `moduleResolution: "nodenext"`
- `target: "es2023"`
- `skipLibCheck: true`

Each workspace extends this base with its own `rootDir`/`outDir`.

Why: the shared-contract code is load-bearing across backend and web; these are the flags that catch the bugs Drizzle and Hono type inference actually produce (array index misuse, optional-property drift between request types and handlers). No exotic flags that would require author-specific muscle memory.

### 2.4 Linter: oxlint (extend existing config)

The repo already ships `oxlint.json`. The S1a work keeps it and enables the `correctness`, `perf`, `suspicious`, and `typescript` categories. Rules that fight CSS-Modules side-effect imports or Solid's `createSignal` idioms are disabled with inline reasons.

Why: oxlint is already pinned in `docs/spec.md`; switching is out of scope. The selected categories are the ones that catch real bugs; `style`-only categories are deferred because oxfmt already handles layout.

### 2.5 Formatter: oxfmt

Decision: oxfmt at defaults with `lineWidth: 100`. Config in `.oxfmtrc.json`. No Prettier.

Why: oxfmt is pinned in `docs/spec.md`. Two formatters would fight.

### 2.6 Bun version pinning

- `.bun-version` file at repo root with the latest stable Bun version that is `>= 1.3.12` (per `docs/spec.md` floor).
- `packageManager` field in root `package.json` set to the same.
- CI uses `oven-sh/setup-bun@v2` with `bun-version-file: .bun-version`.
- Lockfile `bun.lockb` is committed; CI installs with `--frozen-lockfile`.

Why: single source of truth for the Bun version across local and CI. Exact pin (not `^`) because `--frozen-lockfile` relies on the lockfile agreeing with `package.json`.

### 2.7 Version-verification discipline at first install

Before the very first `bun add` in S1a, the exact latest stable for each dependency in `docs/spec.md` is looked up against npm and GitHub Releases, verified `>= floor`, and pinned. No `^`, no `~`. This discipline is repeated on every dependency addition or bump, per the CLAUDE.md version policy.

### 2.8 Dependency updates: Dependabot

`.github/dependabot.yml` with two update configurations:

- `package-ecosystem: github-actions`, weekly, grouped minor+patch, labels `dependencies` and `ci`.
- `package-ecosystem: npm`, directory `/`, weekly, grouped minor+patch, labels `dependencies`.

Why: the CLAUDE.md version policy says "pin to latest stable >= floor"; Dependabot turns that intention into a weekly PR stream that humans approve. Renovate is more configurable but adds a service-side decision we do not need yet.

### 2.9 Editor config and gitignore

`.editorconfig`: `indent_style=space`, `indent_size=2`, `end_of_line=lf`, `charset=utf-8`, `trim_trailing_whitespace=true`, `insert_final_newline=true`.

`.gitignore`: `node_modules/`, `.DS_Store`, `dist/`, `dev.db*`, `.env.local`, `*.log`. `backend/db/migrations/*.sql` is **not** ignored; migrations are checked in.

### 2.10 Root package.json scripts

- `dev:backend`, `dev:web`
- `build`, `build:backend`, `build:web`
- `typecheck`
- `lint`, `lint:fix`
- `fmt`, `fmt:check`
- `test`
- `preview:web`

Each script is a thin wrapper that either fans out via `bun --filter '*' run <script>` or invokes the workspace script directly.

## 3. Package-by-package skeleton

### 3.1 `shared/`

Full surface from `architecture.md` section 2.3. Every item below is load-bearing for S2 and trivially testable now.

- `src/types.ts` - API request/response types for S1 (only `/api/health`). Types for S2 endpoints are defined as opaque placeholders or omitted; the SSE event union is defined so S2 has a stable import.
- `src/outcome.ts` - seven-value outcome enum (`won | dnf_shot_cap | dnf_schema_errors | dnf_budget | llm_unreachable | aborted_viewer | aborted_server_restart`).
- `src/error-codes.ts` - closed-set error-code enum (`invalid_input`, `not_found`, `run_terminal`, `provider_unavailable`, `budget_required`, `rate_limited`, `maintenance_soft`, `too_many_active_runs`, `internal`).
- `src/shot-schema.ts` - JSON shape `{ row, col, reasoning? }` plus a pure validator returning a discriminated-union result (`ok` / `schema_error` / `invalid_coordinate`). Hand-rolled, not Zod.
- `src/constants.ts` - board size (10x10), fleet composition (5/4/3/3/2), shot cap (100), consecutive-schema-error threshold (5).
- `tests/shot-schema.test.ts` - a handful of valid and invalid payloads prove the validator distinguishes `schema_error` from `invalid_coordinate`.

Why hand-rolled validator, not Zod: the validator is roughly twelve lines of range checks and key presence. Dragging a runtime dep for that trades one line of `import` for a build-time bundle growth and a maintenance surface. The spec calls out schema validation as the benchmark's own responsibility; owning the code matches the ownership model.

### 3.2 `backend/`

Minimum that supports `/api/health`, the DB guard, `withTempDatabase`, and applied migrations.

- `src/index.ts` - entrypoint. Reads env, calls the migrator, then starts the Hono listener on `config.port`.
- `src/app.ts` - Hono factory. Mounts the `api/health` router, the 404 handler, and an error-envelope middleware that serializes errors into `{ error: { code, message, detail? } }` per `spec.md` section 5.3.
- `src/config.ts` - parses `DATABASE_PATH`, `PORT`, `MAINTENANCE_SOFT`, `SHUTDOWN_GRACE_SEC`, `VERSION`, `COMMIT_SHA` from `process.env`. Validates types; exits non-zero with a readable message on bad input.
- `src/errors.ts` - mirrors the shared error-code enum; `respondError(c, code, status, detail?)` helper.
- `src/api/health.ts` - `GET /api/health` returns `{ status: "ok", version, commitSha, startedAt }`. `version` from `package.json`; `commitSha` from env injected at build time (fallback `"unknown"` under `bun run dev`); `startedAt` captured at process boot.
- `src/db/schema.ts` - Drizzle declarations for `runs` and `run_shots` with every column in `spec.md` section 5.1.
- `src/db/client.ts` - opens the SQLite handle via `bun:sqlite`; enables WAL and `PRAGMA foreign_keys=ON`; runs pending migrations in a single transaction; returns a Drizzle client. Only place that calls `new Database(...)`.
- `src/db/migrator.ts` - reads SQL files from `src/db/migrations/`; applies anything past the last-applied version inside `BEGIN IMMEDIATE`; aborts on error with a non-zero exit before any HTTP work.
- `src/db/with-temp-database.ts` - creates `/tmp/bsa-test-<ulid>.db`; opens a client; runs migrations; invokes the callback; closes and unlinks. Returns whatever the callback returns.
- `src/db/migrations/0000_init.sql` - generated once via `bun run drizzle-kit generate`.
- `drizzle.config.ts` - points Drizzle Kit at `src/db/schema.ts` and `src/db/migrations/`.
- `tests/setup.ts` - `DATABASE_PATH` guard as a Bun preload; rejects anything outside `:memory:`, `/tmp/...`, or `-test-`.
- `tests/db-guard.test.ts` - asserts the guard aborts the suite with a spawned sub-process (the guard fires at preload, so a same-process test cannot register and trip it).
- `tests/with-temp-database.test.ts` - runs a callback against a temp DB, asserts the file exists inside the callback and is unlinked afterwards.
- `tests/health.test.ts` - fires `app.request('/api/health')` against the Hono test client; asserts shape and `200`.

Why `/tmp/` file and not `:memory:` for `withTempDatabase`: an in-memory DB does not share across connections; a file-backed DB under `/tmp/` is still fast, matches production semantics, and lets the same schema migrations apply in the test as in production without a second code path.

### 3.3 `web/`

Thin Astro shell ready for Solid islands in S2.

- `astro.config.mjs` - integrations: `@astrojs/solid-js` installed but with an empty `islands/`; CSS Modules enabled; `output: "static"`; `site` set to a placeholder staging URL.
- `public/manifest.webmanifest` - `name`, `short_name: "Arena"`, `start_url: "/"`, `display: "standalone"`, `background_color`, `theme_color`, `icons: [192, 512, maskable-512]`.
- `public/icons/` - three pre-made PNG icons (192, 512, maskable-512) plus a single 512x512 source SVG at `public/icons/source.svg` for future regeneration. No runtime or build-time icon-generator dep.
- `src/pages/index.astro` - minimal shell page: title, paragraph, `<link rel="manifest">`, a tiny inline registration script that registers the service worker only when `import.meta.env.PROD`.
- `src/pwa/sw.ts` - hand-rolled, roughly 40 lines: `install` caches an allowlist produced at build time; `fetch` serves from cache for allowlisted URLs and falls through to network for everything else; a version tag invalidates the old cache on bumps.
- `src/pwa/shell-manifest.ts` - generated at build time by a post-build step that writes the final fingerprinted filenames into a constant the service worker imports.
- `src/islands/` - empty directory with a `.gitkeep`. Solid is wired but no island exists yet.
- `src/styles/` - empty directory with a `.gitkeep`.
- `tests/manifest.test.ts` - parses the built `manifest.webmanifest`; asserts required fields.

Why hand-rolled SW, not Workbox or `@vite-pwa/astro`: the spec calls for "minimal, shell-only caching." Workbox brings route-matching and strategies that are useful in offline-rich apps; we have none of those needs. A 40-line SW is maintainable and easy to audit against the "never cache `/api/*`" requirement.

Why SW only in production builds: an SW in dev mode is a reliable source of cache-confusion bugs that look like stale code after a save. Registering only under `import.meta.env.PROD` avoids the whole class.

Why pre-made icons checked in (not a build-time generator): icons change rarely and the cost of regeneration is "run one command and commit the output." A build-time generator would be three dependencies we do not otherwise need.

### 3.4 `infra/`

All files are checked in during S1a. None are applied until S1b.

- `Caddyfile` - both vhosts (prod and staging); hard-maintenance matcher; `flush_interval -1` on the `/api/*` proxy block; long SSE timeouts; `Cache-Control: no-store` on `/api/*`; immutable cache on fingerprinted assets.
- `systemd/battleship-arena.service` - prod unit.
- `systemd/battleship-arena-staging.service` - staging unit.
- `systemd/battleship-backup.service` + `.timer` - hourly `VACUUM INTO`.
- `systemd/battleship-offhost-rsync.service` + `.timer` - daily rsync at 03:30 UTC.
- `scripts/backup.sh`, `scripts/offhost-rsync.sh`, `scripts/maintenance-on.sh`, `scripts/maintenance-off.sh`, `scripts/restore.sh` - short, audit-friendly bash; `set -euo pipefail`; a usage header.
- `scripts/host-bootstrap.sh` - added in S1a, executed in S1b. Creates the `battleship` user, the `/var/www/`, `/var/lib/`, `/var/backups/`, `/etc/battleship-arena/` directories with the documented permissions, installs the systemd units, enables them. Exists so S1b is reproducible, not invented on the host.
- `scripts/verify-s1a.sh` - runs the full S1a local verification protocol (see section 5.2). Called from `pr.yml` as a final step.
- `maintenance.html` - static 503 page Caddy returns when the flag file is present.

## 4. CI workflows

### 4.1 `.github/workflows/pr.yml`

Triggered on `pull_request` targeting `main`.

One job (`ci`) on `ubuntu-latest`. Steps:

1. `actions/checkout@v5`.
2. `oven-sh/setup-bun@v2` with `bun-version-file: .bun-version`.
3. `bun install --frozen-lockfile`.
4. `bun run lint`.
5. `bun run fmt:check`.
6. `bun run typecheck`.
7. `bun test` with `DATABASE_PATH=:memory:` in job env.
8. `bun run build`.
9. `bash infra/scripts/verify-s1a.sh` (same script developers run locally).

Why one job, not a matrix: the checks are fast enough that parallel Bun installs cost more in setup overhead than they save in wall time. When S2 adds Playwright, that earns its own job; S1a does not need one.

### 4.2 `.github/workflows/deploy-staging.yml`

Triggered on `push` to `main`.

Two jobs: `build` and `deploy`.

`build` is a carbon copy of the `pr.yml` job plus `actions/upload-artifact` packaging `backend/dist/` and `web/dist/` as a single tarball.

`deploy` depends on `build` and always runs; it is gated step-by-step rather than job-level so the workflow can write a visible step summary in both the enabled and disabled cases:

```yaml
deploy:
  needs: build
  runs-on: ubuntu-latest
  environment: staging
  steps:
    - id: gate
      run: |
        if [[ "${{ vars.STAGING_DEPLOY_ENABLED }}" == "true" ]]; then
            echo "enabled=true" >> "$GITHUB_OUTPUT"
            echo "### Deploy gate: ENABLED" >> "$GITHUB_STEP_SUMMARY"
        else
            echo "enabled=false" >> "$GITHUB_OUTPUT"
            echo "### Deploy gate: DISABLED" >> "$GITHUB_STEP_SUMMARY"
            echo "Deploy disabled until S1b (STAGING_DEPLOY_ENABLED is not true)." >> "$GITHUB_STEP_SUMMARY"
        fi
    # Every subsequent step is guarded by: if: steps.gate.outputs.enabled == 'true'
```

Steps that run when the gate is enabled:

1. Download the artifact.
2. Install SSH key from `secrets.STAGING_SSH_KEY`; strict `known_hosts` from `vars.STAGING_SSH_KNOWN_HOSTS`.
3. `rsync backend-dist/` to `battleship-deploy@${STAGING_SSH_HOST}:/opt/battleship-arena-staging/backend/dist/` and `web-dist/` to `battleship-deploy@${STAGING_SSH_HOST}:/var/www/battleship-arena-staging/web/`.
4. `ssh ... sudo systemctl restart battleship-arena-staging.service` (narrow sudoers entry on the host).
5. Poll `curl ${STAGING_PUBLIC_URL}/api/health` until `200`, max 60 s.
6. Fail loudly if health does not pass.

Why step-level gating rather than a job-level `if:`: a job-level skip hides the workflow from operators ("why didn't it run?") and cannot write a step summary. Running the job unconditionally with a first step that writes `### Deploy gate: ENABLED|DISABLED` to `$GITHUB_STEP_SUMMARY` makes the gate state observable on every run without polluting the logs when the gate is off. Why a repository variable rather than secret-existence: GitHub's secret-existence check inside `if:` is awkward and invisible in the Actions UI; a repository variable is one click to flip.

Why `STAGING_SSH_HOST` and `STAGING_PUBLIC_URL` are separate: `STAGING_SSH_HOST` may be an IP (rsync is happy with one), but the HTTPS health check requires a real hostname with a valid certificate. Keeping the two separate avoids tying TLS identity to SSH connectivity.

### 4.3 `.github/dependabot.yml`

Two update configurations:

1. `package-ecosystem: github-actions`, weekly, grouped minor+patch, labels `dependencies` and `ci`.
2. `package-ecosystem: npm`, directory `/`, weekly, grouped minor+patch, labels `dependencies`.

### 4.4 Secrets and variables inventory (handover to S1b)

- `secrets.STAGING_SSH_KEY` - private key, PEM body.
- `vars.STAGING_SSH_KNOWN_HOSTS` - one line, the staging host's SSH public key fingerprint.
- `vars.STAGING_SSH_HOST` - SSH host address for rsync + remote restart (IP or domain).
- `vars.STAGING_PUBLIC_URL` - full public URL (scheme + host, e.g. `https://staging.arena.example`) for the post-deploy health check. Kept separate from `STAGING_SSH_HOST` because the SSH target may be an IP while TLS requires a real hostname.
- `vars.STAGING_DEPLOY_ENABLED` - `false` (or unset) through S1a; `true` once S1b proves the deploy path works manually from the host side.

All five are listed in `docs/ops/host-bootstrap.md` so S1b has a checklist, not a scavenger hunt.

## 5. Verification protocol and task ordering

### 5.1 Task ordering inside S1a

One commit per step. Each step's `bun test` must be green before the next one starts.

1. **Repo chrome.** `package.json` with workspaces; `.bun-version`; `bunfig.toml`; `tsconfig.base.json`; `.editorconfig`; `.gitignore`; extend existing `oxlint.json`; add `.oxfmtrc.json`; add `lefthook.yml`; add `.github/dependabot.yml`.
2. **`shared/` package.** Types, enums, shot schema, constants, shot-schema test. `bun test --filter shared` green.
3. **`backend/` skeleton.** `config.ts`, `errors.ts`, `app.ts`, `index.ts`, `api/health.ts`, `tests/setup.ts` guard, guard sub-process test. `bun test --filter backend` green; `curl http://127.0.0.1:8081/api/health` green under `bun run dev:backend`.
4. **`backend/` database layer.** `db/schema.ts`, `drizzle.config.ts`, first generated migration, `db/client.ts` (WAL + FK pragma), `db/migrator.ts`, `db/with-temp-database.ts`, tests for the migrator and `withTempDatabase`. Wire the migrator into `index.ts` so it runs before the listener opens. Full `bun test` green.
5. **`web/` skeleton.** Astro config; Solid integration installed but unused; `public/manifest.webmanifest`; pre-made icons; `src/pages/index.astro` shell; hand-rolled `src/pwa/sw.ts`; post-build step that writes `shell-manifest.ts`; manifest parse test. `bun run build:web` green; `bun run preview:web` serves shell with SW registered.
6. **`infra/` files checked in (not executed).** Caddyfile, six systemd unit files, five runbook scripts, `maintenance.html`, `host-bootstrap.sh`, `verify-s1a.sh`.
7. **CI and automation.** `.github/workflows/pr.yml`, `.github/workflows/deploy-staging.yml` with gated `deploy` job, `.github/dependabot.yml`.
8. **PR open, green, merge.** Open the branch PR; watch `pr.yml` green; merge; watch `deploy-staging.yml` skip its `deploy` job cleanly with the expected step-summary. S1a is done.

One commit per step keeps bisect useful when something later breaks.

### 5.2 Local verification protocol for S1a done

Saved as `infra/scripts/verify-s1a.sh`; CI runs it as a final step so the local and CI definitions of done are the same artifact.

```
bun install --frozen-lockfile
bun run lint
bun run fmt:check
bun run typecheck
bun test
bun run build
DATABASE_PATH=./dev.db bun run dev:backend &
sleep 2
curl -fsS http://127.0.0.1:8081/api/health | jq .
kill %1
bun run build:web
bun run preview:web &
sleep 2
curl -fsSI http://127.0.0.1:4321/ | grep -i '200 OK'
curl -fsS http://127.0.0.1:4321/manifest.webmanifest | jq .
kill %1
```

Every command exits `0`; every JSON parse succeeds.

### 5.3 CI verification for S1a done

- `pr.yml` on the S1a PR is green end-to-end (lint, fmt, typecheck, test, build, verify).
- `deploy-staging.yml` on the merge commit runs `build` green; runs `deploy` green with a `### Deploy gate: DISABLED` step summary and every subsequent step skipped.
- Dependabot's first run opens at most one PR per ecosystem; both are closeable without action because S1a pinned to latest stable on day one.

### 5.4 S1b handover

S1a hands three things to S1b, and only three:

1. `docs/ops/host-bootstrap.md` - created and partially populated during S1a task 6, completed by S1b. Checklist of plan task 7 plus the secrets/variables inventory in section 4.4 above.
2. `infra/scripts/host-bootstrap.sh` - the executable half of that checklist.
3. `.github/workflows/deploy-staging.yml` - one repository-variable flip away from deploying to staging.

If any of these three is missing at the end of S1a, S1a is not done, because S1b would then begin with rediscovery.

### 5.5 Residual open items deferred to S1b

Items with real-world friction on a bad default are kept as named placeholders rather than guessed:

- The real staging domain. Left as `<staging-domain>` in Caddyfile and workflows.
- The off-host backup target. Left as a variable in `offhost-rsync.sh`.
- Let's Encrypt email for Caddy's ACME account. Left as `EMAIL_PLACEHOLDER` in Caddyfile.
- Sudoers entry wording on the host. Drafted in `docs/ops/host-bootstrap.md` but only applied in S1b.

Each is surfaced at the S1b boundary rather than committed to a wrong default that would be hard to undo (a wrong domain baked into a migration-locked file, a wrong email on an LE account that is hard to rotate).

## 6. Risks and how this design absorbs them

- **"S1a builds but a core design assumption is wrong."** Mitigated by exercising the full startup path in a test: migrations apply, listener opens, `/api/health` answers. If any of the three breaks, `bun test` fails at step 4.
- **"Deploy workflow is invisible until S1b, so S1b discovers it is broken."** Mitigated by running the `build` job on every push to `main` during S1a; only the `deploy` job is gated. If the workflow file itself is malformed, S1a catches it, not S1b.
- **"Version drift between local and CI."** Mitigated by `.bun-version` + `packageManager` + `bun-version-file:` in CI + `--frozen-lockfile`.
- **"Tests accidentally touch the production DB."** Mitigated twice: the `DATABASE_PATH` guard at preload; and the `withTempDatabase` pattern so integration tests never open `DATABASE_PATH` directly.
- **"PWA shell is broken on mobile but passes locally."** Partially mitigated by the manifest parse test and by Lighthouse at S1a exit. Fully mitigated only in S1b when a real phone visits the staging URL.
- **"Dependabot floods with PRs."** Mitigated by grouping minor+patch and by landing on latest stable at S1a, so the first weekly run has little to raise.

## 7. What is NOT decided here

- Choice of cloud provider, region, domain registrar, DNS provider, off-host backup target. All reserved for S1b.
- Logging strategy beyond "journald default" (left to S3/S4 as the system gains more to log).
- Exact wording of the `maintenance.html` static page (style and copy reserved for S4 when maintenance tooling is first exercised end-to-end).
- Playwright configuration (reserved for S2).
- Provider adapters, pricing, leaderboard (reserved for S3).
- Production host provisioning (reserved for S4's cutover).

---

Skills used: superpowers:brainstorming.
Docs used: `docs/about.md`, `docs/spec.md`, `docs/architecture.md`, `docs/plan.md`, `CLAUDE.md`, `AGENTS.md`.
