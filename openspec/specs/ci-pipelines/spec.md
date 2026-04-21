# ci-pipelines Specification

## Purpose

TBD - created by archiving change s1a-bootstrap. Update Purpose after archive.

## Requirements

### Requirement: PR workflow runs the full local verification pipeline

The repository SHALL commit `.github/workflows/pr.yml` that triggers on `pull_request` events targeting the `main` branch. The workflow MUST run a single job on `ubuntu-latest` that, in order, checks out the code, sets up Bun via `oven-sh/setup-bun@v2` with `bun-version-file: .bun-version`, installs dependencies with `bun install --frozen-lockfile`, runs `bun run lint`, `bun run fmt:check`, `bun run typecheck`, runs `bun test` under an environment with `DATABASE_PATH=:memory:`, runs `bun run build`, and finally runs `bash infra/scripts/verify-s1a.sh`. Every step MUST exit zero for the job to be reported green; a non-zero exit on any single step MUST fail the job.

#### Scenario: Pull request against main triggers the pipeline

- **WHEN** a contributor opens or updates a pull request whose base branch is `main`
- **THEN** GitHub Actions MUST dispatch `.github/workflows/pr.yml` and the single job MUST execute checkout, setup-bun, `bun install --frozen-lockfile`, `bun run lint`, `bun run fmt:check`, `bun run typecheck`, `bun test` with `DATABASE_PATH=:memory:` in the job env, `bun run build`, and `bash infra/scripts/verify-s1a.sh` in that exact order

#### Scenario: Failure of any step fails the job

- **WHEN** any one of the lint, format-check, typecheck, test, build, or `verify-s1a.sh` steps exits non-zero on a PR run
- **THEN** the `ci` job MUST be reported as failed and the remaining steps MUST NOT cause the job to be reported as passing

#### Scenario: Tests are forbidden from touching persistent databases

- **WHEN** the PR workflow runs `bun test`
- **THEN** the step env MUST set `DATABASE_PATH=:memory:` so the backend test-setup guard accepts the suite rather than aborting it

### Requirement: Staging deploy workflow has separate build and deploy jobs on push to main

The repository SHALL commit `.github/workflows/deploy-staging.yml` that triggers on `push` events to the `main` branch. The workflow MUST declare exactly two jobs named `build` and `deploy`. The `build` job MUST replicate every step of the PR job (checkout, setup-bun, frozen install, lint, fmt:check, typecheck, test under `DATABASE_PATH=:memory:`, build) and then MUST package the compiled `backend/dist/` and `web/dist/` into an artifact uploaded via `actions/upload-artifact`. The `deploy` job MUST declare `needs: build` and MUST download that artifact as its first data step when the deploy gate is enabled.

#### Scenario: Push to main fans out into build then deploy

- **WHEN** a merge or direct push lands on `main`
- **THEN** GitHub Actions MUST dispatch `deploy-staging.yml` and MUST schedule the `deploy` job only after the `build` job has completed successfully, because `deploy` declares `needs: build`

#### Scenario: Build job uploads the compiled artifact

- **WHEN** the `build` job finishes its compile steps
- **THEN** it MUST upload a single artifact containing both `backend-dist/` (the compiled backend) and `web-dist/` (the compiled web `dist/`) so that the `deploy` job can reconstruct the deployable tree without re-running any build step

### Requirement: Deploy job runs unconditionally and publishes a gate status to the step summary

The `deploy` job in `deploy-staging.yml` SHALL NOT use a job-level `if:` condition. Instead, its first step MUST be a shell step that evaluates `vars.STAGING_DEPLOY_ENABLED`. If the value equals the literal string `"true"`, the step MUST write `### Deploy gate: ENABLED` to `$GITHUB_STEP_SUMMARY` and MUST set a step output `enabled=true`. Otherwise, the step MUST write `### Deploy gate: DISABLED` followed by a human-readable reason line (naming `STAGING_DEPLOY_ENABLED` as the control variable) to `$GITHUB_STEP_SUMMARY` and MUST set `enabled=false`.

#### Scenario: Gate enabled publishes an ENABLED summary

- **WHEN** `vars.STAGING_DEPLOY_ENABLED` is `"true"` at the time the `deploy` job runs
- **THEN** the gate step MUST append `### Deploy gate: ENABLED` to `$GITHUB_STEP_SUMMARY` and MUST set the step output `enabled` to the string `true`

#### Scenario: Gate disabled publishes a DISABLED summary with reason

- **WHEN** `vars.STAGING_DEPLOY_ENABLED` is unset, empty, or any value other than `"true"`
- **THEN** the gate step MUST append `### Deploy gate: DISABLED` plus a human-readable reason line referencing `STAGING_DEPLOY_ENABLED` to `$GITHUB_STEP_SUMMARY` and MUST set the step output `enabled` to the string `false`

#### Scenario: Deploy job itself is never skipped at the job level

- **WHEN** a reviewer inspects the `deploy` job definition in `.github/workflows/deploy-staging.yml`
- **THEN** the job MUST NOT declare a job-level `if:` expression that could hide it from the Actions UI; the gate MUST be expressed at the step level on every subsequent step

### Requirement: Every post-gate deploy step is guarded by the gate output

Every step in the `deploy` job that follows the gate-evaluation step SHALL carry the condition `if: steps.gate.outputs.enabled == 'true'`. When the gate resolves to `false`, those guarded steps MUST be reported as skipped in the Actions UI, and the `deploy` job itself MUST still complete with a green (successful) status because no step exited non-zero.

#### Scenario: Gate disabled leaves all deploy steps skipped

- **WHEN** the `deploy` job runs with the gate evaluated to `false`
- **THEN** every step after the gate step MUST show as skipped in the Actions UI and the job MUST be reported as successful overall

#### Scenario: Gate enabled runs every deploy step

- **WHEN** the `deploy` job runs with the gate evaluated to `true`
- **THEN** every subsequent step MUST execute, and a non-zero exit on any of them MUST fail the job so that broken deploys cannot be silently ignored

### Requirement: Enabled deploy pushes artifacts by rsync, restarts the unit, and polls the public health endpoint

When the gate is enabled, the `deploy` job SHALL install an SSH key from `secrets.STAGING_SSH_KEY` into a private-permissions key file, SHALL write `vars.STAGING_SSH_KNOWN_HOSTS` into `~/.ssh/known_hosts`, SHALL rsync the unpacked `backend-dist/` tree to `battleship-deploy@${STAGING_SSH_HOST}:/opt/battleship-arena-staging/backend/dist/`, SHALL rsync the unpacked `web-dist/` tree to `battleship-deploy@${STAGING_SSH_HOST}:/var/www/battleship-arena-staging/web/`, SHALL invoke `sudo systemctl restart battleship-arena-staging.service` over SSH as the `battleship-deploy` user, and SHALL poll `${STAGING_PUBLIC_URL}/api/health` until the endpoint returns HTTP `200` or the polling budget of approximately 60 seconds is exhausted. The job MUST fail loudly if the health poll never observes a `200` within that budget.

#### Scenario: Enabled deploy rsyncs backend and web trees to the configured paths

- **WHEN** the gate is enabled and the deploy proceeds
- **THEN** rsync MUST send `backend-dist/` to `battleship-deploy@${STAGING_SSH_HOST}:/opt/battleship-arena-staging/backend/dist/` and `web-dist/` to `battleship-deploy@${STAGING_SSH_HOST}:/var/www/battleship-arena-staging/web/`, using the SSH key written from `secrets.STAGING_SSH_KEY` and the known-hosts line written from `vars.STAGING_SSH_KNOWN_HOSTS`

#### Scenario: Service restart uses the narrow sudoers entry

- **WHEN** the rsync steps complete
- **THEN** the workflow MUST connect as `battleship-deploy` over SSH and MUST run `sudo systemctl restart battleship-arena-staging.service` so the newly rsynced artifact is picked up by the systemd unit

#### Scenario: Health check polls the public URL for up to 60 seconds

- **WHEN** the service restart step finishes
- **THEN** the workflow MUST poll `${STAGING_PUBLIC_URL}/api/health` with curl on a short retry cadence for a total budget of roughly 60 seconds, MUST exit zero as soon as any attempt returns HTTP `200`, and MUST exit non-zero (failing the job) if no attempt returns `200` within the budget

### Requirement: Staging SSH host and public URL are distinct repository variables

The repository SHALL define `STAGING_SSH_HOST` and `STAGING_PUBLIC_URL` as two separate repository variables referenced by the deploy workflow. `STAGING_SSH_HOST` is used as the rsync and SSH target and MAY be a bare IP address; `STAGING_PUBLIC_URL` is used only for the post-deploy HTTPS health check and MUST be a full URL with scheme and a real hostname that carries a valid TLS certificate. The workflow MUST NOT derive one from the other.

#### Scenario: SSH target may be an IP while the health URL stays a hostname

- **WHEN** the operator configures the staging environment variables
- **THEN** `STAGING_SSH_HOST` MAY be set to an IP address (so rsync works without DNS resolution) while `STAGING_PUBLIC_URL` MUST be set to a full URL such as `https://staging.arena.example` so the TLS handshake on the health check validates a real certificate

#### Scenario: Workflow references each variable only where appropriate

- **WHEN** a reviewer inspects `deploy-staging.yml`
- **THEN** rsync and SSH steps MUST reference `vars.STAGING_SSH_HOST` and MUST NOT use `vars.STAGING_PUBLIC_URL`, and the health-check step MUST reference `vars.STAGING_PUBLIC_URL` and MUST NOT use `vars.STAGING_SSH_HOST`

### Requirement: Dependabot config covers github-actions and npm with weekly grouped updates

The repository SHALL commit `.github/dependabot.yml` with exactly two update entries: one for `package-ecosystem: github-actions` and one for `package-ecosystem: npm` at directory `/`. Both entries MUST run on a weekly schedule and MUST group minor and patch updates into a single grouped pull request per ecosystem per week. The `github-actions` entry MUST be labeled `dependencies` and `ci`; the `npm` entry MUST be labeled `dependencies`.

#### Scenario: Both ecosystems update weekly with grouped minor and patch

- **WHEN** a reviewer opens `.github/dependabot.yml`
- **THEN** it MUST declare one `package-ecosystem: github-actions` entry and one `package-ecosystem: npm` entry rooted at `/`, each with `schedule.interval: weekly` and a group that consolidates `minor` and `patch` update types

#### Scenario: Labels distinguish CI bumps from app bumps

- **WHEN** Dependabot opens a grouped PR
- **THEN** a grouped github-actions PR MUST carry both the `dependencies` and `ci` labels, while a grouped npm PR MUST carry the `dependencies` label

### Requirement: CI never spends real LLM-provider tokens

No workflow in `.github/workflows/` SHALL invoke a real, billed LLM provider at any point during any CI run. In S1a this invariant is satisfied vacuously because no `providers/` directory and no provider adapters exist yet; from S2 onwards only the mock provider is permitted to be exercised by CI. Any workflow step that would otherwise require real provider credentials MUST be structured to call the mock provider instead.

#### Scenario: S1a workflows contain no real-provider invocation

- **WHEN** a reviewer inspects the repository during S1a
- **THEN** no `providers/` directory of real adapters MUST exist, and neither `pr.yml` nor `deploy-staging.yml` MUST reference any real provider API key, endpoint, or secret

#### Scenario: Forward invariant for later stories

- **WHEN** a later change introduces provider adapters
- **THEN** CI MUST continue to call only the mock provider and MUST NOT consume real LLM-provider tokens during any workflow run

### Requirement: Staging deploy workflow serializes overlapping runs via a concurrency group

`deploy-staging.yml` SHALL declare a workflow-level `concurrency` block with `group: deploy-staging` and `cancel-in-progress: false`. Under this configuration, when a second push to `main` lands while an earlier deploy is still running, the second run MUST queue behind the first rather than cancel it or race it, and the workflow MUST NOT leave the staging host in a half-deployed state produced by two simultaneous rsync streams.

#### Scenario: Overlapping merges to main serialize

- **WHEN** two pushes to `main` trigger `deploy-staging.yml` in quick succession
- **THEN** the second workflow run MUST wait for the first run to complete before its own `deploy` job executes, because `concurrency.group` is `deploy-staging` and `cancel-in-progress` is `false`

#### Scenario: No in-progress run is cancelled

- **WHEN** a new push arrives while a deploy is mid-rsync or mid-health-poll
- **THEN** the in-progress run MUST be allowed to finish (the newer run MUST NOT cancel it), because `cancel-in-progress: false` is set at the workflow level
