# real-token-smoke Specification

## Purpose

Defines `backend/scripts/smoke-real-keys.ts`, the operator-run CLI that exercises each shipped real provider against a live API key. Intended audience: engineers probing upstream drift before a pricing-table PR, before a production cutover, or when a contract-test failure suggests the captured response shape is out of date. Scope: scripted, repeatable per-turn adapter calls with full game-state progression, client-side budget cap, key redaction from all output, production safety rail, and a single summary JSON line suitable for PR descriptions. Excluded from CI by location (never discovered by `bun test`) because a single accidental run would spend money.

## Requirements

### Requirement: backend/scripts/smoke-real-keys.ts is not discovered by bun test and never invoked from CI

`backend/scripts/smoke-real-keys.ts` SHALL live under `backend/scripts/` so it is not discovered by `bun test`. It MUST NOT be referenced by any CI workflow in `.github/workflows/`. Its runbook page under `docs/ops/` MUST state that the script is operated by humans on demand only.

#### Scenario: Location excludes it from bun test discovery

- **WHEN** `bun test` is executed in the backend package
- **THEN** no test file is loaded from `backend/scripts/` and the smoke script is not executed

#### Scenario: Not referenced by CI workflows

- **WHEN** every file in `.github/workflows/` is scanned for the substring `smoke-real-keys`
- **THEN** no workflow references the script

### Requirement: CLI supports the flags documented in the runbook

The script SHALL accept the following flags: `--provider <id>`, `--all`, `--key <value>`, `--openrouter-key <value>`, `--opencode-go-key <value>`, `--model <id>`, `--turns <n>`, `--budget <usd>`, `--dry-run`, `--force-prod`. Missing required flags MUST produce an exit code of `2` with a usage message printed to stderr.

#### Scenario: Missing --provider and --all rejects with exit code 2

- **WHEN** the script is invoked with neither `--provider` nor `--all`
- **THEN** the process exits with code `2` and stderr contains a usage message

#### Scenario: Per-provider key flag overrides --key for --all

- **WHEN** the script is invoked with `--all --openrouter-key K1 --opencode-go-key K2`
- **THEN** the openrouter adapter sees `K1` in its auth header and the opencode-go adapter sees `K2`

### Requirement: Script parses each response, resolves the shot, and advances game state

For each turn the script SHALL: parse the provider's response via the real adapter; run `parseShot` against `rawText`; resolve the parsed shot against the generated board layout; classify the turn as `hit`, `miss`, `sunk`, `schema_error`, or `invalid_coordinate`; and append the shot to `priorShots` so the next turn's input reflects the advanced game state.

#### Scenario: Game advances turn-by-turn against mock layout

- **WHEN** the script is invoked with a mock adapter configured to emit a sequence of coordinates and the board's layout is known
- **THEN** after three turns the recorded `priorShots` contains exactly the three coordinates in order and the classification of each matches the layout

#### Scenario: Schema error does not advance priorShots

- **WHEN** a turn returns unparseable `rawText`
- **THEN** the turn is recorded as `schema_error` and `priorShots` is unchanged for that turn

### Requirement: Script stops on any terminal outcome

The script SHALL terminate its game loop as soon as any of the following terminal outcomes is reached: `won`, `dnf_shot_cap`, `dnf_schema_errors`, `dnf_budget`, or `llm_unreachable`. On termination it MUST print the final outcome label and exit with code `0` (success) on every outcome, including DNFs, because the script's goal is to probe the adapter, not to win.

#### Scenario: Terminal outcome stops the loop

- **WHEN** the mock adapter is configured to emit five consecutive schema errors
- **THEN** the script stops after the fifth turn with outcome `dnf_schema_errors` and does not issue a sixth call

### Requirement: Script refuses to run against production without --force-prod

The script SHALL refuse to proceed when `NODE_ENV === "production"` unless `--force-prod` is supplied. In the refusal case it MUST print a clear error message and exit with a non-zero code.

#### Scenario: Production refused without --force-prod

- **WHEN** the script is invoked with `NODE_ENV=production` and no `--force-prod`
- **THEN** the script prints an error containing the substring `production` and exits with a non-zero code

#### Scenario: --force-prod allows production

- **WHEN** the script is invoked with `NODE_ENV=production` and `--force-prod`
- **THEN** the script proceeds past the safety check

### Requirement: Script redacts the API key from all printed output

The script SHALL redact every occurrence of the API key from stdout and stderr via the same allowlist the server's log middleware uses. No printed line may contain the raw API key value verbatim.

#### Scenario: Sentinel key absent from stdout and stderr

- **WHEN** the script is invoked with a distinctive sentinel API key against a mock adapter and all stdout and stderr are captured
- **THEN** neither capture contains the sentinel substring

### Requirement: Script emits a summary JSON line at exit

On loop termination (for any outcome) the script SHALL print a single JSON line containing at least `providerId`, `modelId`, `outcome`, `shotsFired`, `costUsdMicros`, `tokensIn`, and `tokensOut`. The line MUST be printed to stdout so a human can paste it into a PR description.

#### Scenario: Summary JSON at exit

- **WHEN** the script completes a short run against a mock adapter
- **THEN** stdout contains exactly one line parseable as JSON whose object has the seven required fields

### Requirement: --dry-run prints the request and exits without network

When invoked with `--dry-run` the script SHALL print the HTTP request that would be issued (URL, method, headers with API key redacted, body) and exit with code `0` without issuing any network call.

#### Scenario: Dry-run exits 0 without network

- **WHEN** the script is invoked with `--dry-run` and a spy installed on `globalThis.fetch`
- **THEN** the spy records zero calls and the process exits with code `0`
