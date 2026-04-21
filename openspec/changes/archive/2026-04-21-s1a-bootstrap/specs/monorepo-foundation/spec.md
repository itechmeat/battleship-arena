## ADDED Requirements

### Requirement: Bun workspaces wire the three packages

The repository SHALL declare Bun workspaces in the root `package.json` such that `shared`, `backend`, and `web` are discoverable as local workspaces. Cross-package imports from `backend` or `web` into `shared` MUST resolve through the workspace graph without any publish step, tarball, or file-protocol specifier; the Bun resolver MUST be the sole mechanism that links them.

#### Scenario: Fresh install links all three workspaces

- **WHEN** a contributor clones the repository and runs `bun install --frozen-lockfile` at the repo root
- **THEN** `bun pm ls` MUST report `shared`, `backend`, and `web` as workspace members and the backend MUST be able to import exported symbols from `shared` without any additional build or publish command

#### Scenario: Backend imports shared without a publish step

- **WHEN** backend source code imports a symbol from the shared package
- **THEN** `bun run typecheck` at the repo root MUST succeed and MUST NOT require any packaging, tarballing, or registry publication of `shared`

### Requirement: Bun version is pinned in a single source of truth

The repository SHALL pin the Bun runtime version in both `.bun-version` at the repo root and in the `packageManager` field of the root `package.json`, and the two values MUST agree exactly. CI workflows MUST read the version by passing `bun-version-file: .bun-version` to `oven-sh/setup-bun@v2`. The Bun lockfile `bun.lockb` MUST be committed, and every CI install step MUST pass `--frozen-lockfile` to prevent silent lockfile drift.

#### Scenario: CI uses the pinned Bun version

- **WHEN** a pull request triggers `.github/workflows/pr.yml`
- **THEN** the `setup-bun` step MUST be configured with `bun-version-file: .bun-version` and the install step MUST be `bun install --frozen-lockfile`

#### Scenario: Local and CI pins agree

- **WHEN** a reviewer compares the value in `.bun-version` to the `packageManager` field in root `package.json`
- **THEN** the two values MUST be identical and MUST be pinned at or above the floor recorded in `docs/spec.md`

### Requirement: Strict TypeScript base config

The repository SHALL publish a `tsconfig.base.json` at the repo root that every workspace `tsconfig.json` extends. The base config MUST enable `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`, and `allowImportingTsExtensions`. It MUST set `noEmit` to `true`, `module` and `moduleResolution` to `nodenext`, and `target` to `es2023`.

#### Scenario: Workspace tsconfig extends the base

- **WHEN** any workspace `tsconfig.json` is opened
- **THEN** it MUST `extends` `tsconfig.base.json` and MUST inherit the strict flags above without locally disabling any of them

#### Scenario: Typecheck catches unchecked index access

- **WHEN** source code reads `arr[i]` without a prior length guard and `bun run typecheck` is executed
- **THEN** the compiler MUST report the value as possibly `undefined` because `noUncheckedIndexedAccess` is enabled in the base config

### Requirement: oxlint is the sole linter with correctness categories enabled

The repository SHALL configure `oxlint.json` to enable the `correctness`, `perf`, `suspicious`, and `typescript` rule categories. The command `bun run lint` at the repo root MUST run `oxlint` across all workspaces. The same linter MUST be invoked by the pre-commit hook. No competing lint tool (for example ESLint) may be installed or configured alongside oxlint.

#### Scenario: Lint categories are active at the repo root

- **WHEN** `bun run lint` is executed at the repo root
- **THEN** oxlint MUST load `oxlint.json` and MUST enforce the `correctness`, `perf`, `suspicious`, and `typescript` categories across every workspace

#### Scenario: Pre-commit runs the same linter

- **WHEN** a contributor attempts `git commit` with a lint-failing change
- **THEN** the `lefthook` pre-commit hook MUST run oxlint and MUST block the commit until the lint failure is resolved

### Requirement: oxfmt is the sole formatter

The repository SHALL use `oxfmt` as the only formatter. `bun run fmt:check` at the repo root MUST run `oxfmt` in verification mode over the tracked source tree, and the pre-commit hook MUST invoke the same check. No second formatter (for example Prettier or `dprint`) may be installed, configured, or referenced by any npm script.

#### Scenario: Format check runs in CI

- **WHEN** CI runs `bun run fmt:check`
- **THEN** oxfmt MUST exit non-zero for any file that is not already formatted to the project's oxfmt configuration

#### Scenario: No competing formatter present

- **WHEN** a reviewer inspects `package.json` dependencies and devDependencies at every workspace
- **THEN** no package named `prettier`, `dprint`, or any other formatter besides `oxfmt` may be declared

### Requirement: Lefthook runs lint, format, and typecheck in parallel on pre-commit

The repository SHALL provide a `lefthook.yml` at the repo root that defines a `pre-commit` stage containing at least three commands: oxlint, oxfmt format check, and `bun run typecheck`. The three commands MUST be configured to execute in parallel. The hook MUST be installable via `lefthook install` and MUST be referenced by the project documentation as the supported pre-commit integration.

#### Scenario: Pre-commit runs the three checks in parallel

- **WHEN** a contributor runs `git commit` on a staged change
- **THEN** `lefthook` MUST invoke oxlint, oxfmt check, and `bun run typecheck` concurrently and MUST only allow the commit if all three exit zero

#### Scenario: Typecheck failure blocks the commit

- **WHEN** a staged change introduces a TypeScript compilation error
- **THEN** the `bun run typecheck` command inside the pre-commit hook MUST fail and the commit MUST be aborted

### Requirement: Dependabot weekly grouped updates for Actions and npm

The repository SHALL commit `.github/dependabot.yml` with exactly two update configurations: one for `package-ecosystem: github-actions` and one for `package-ecosystem: npm` rooted at `/`. Both configurations MUST run on a weekly schedule and MUST group minor and patch updates into a single grouped pull request per ecosystem.

#### Scenario: Dependabot configuration covers both ecosystems

- **WHEN** a reviewer opens `.github/dependabot.yml`
- **THEN** it MUST declare one entry for `github-actions` and one entry for `npm`, both with `schedule.interval` set to `weekly` and with grouping that consolidates minor and patch updates

#### Scenario: Weekly grouping reduces PR noise

- **WHEN** Dependabot's scheduled run fires for the npm ecosystem
- **THEN** it MUST open at most one pull request per ecosystem per week for the grouped minor+patch bumps rather than one PR per package

### Requirement: Root package scripts fan out to workspaces

The root `package.json` SHALL declare the scripts `dev:backend`, `dev:web`, `build`, `typecheck`, `lint`, `fmt`, `fmt:check`, `test`, and `preview:web`. Each script MUST fan out to the relevant workspaces either via `bun --filter` or by invoking a matching workspace-level script directly, and each script MUST be runnable from the repo root without `cd` into a workspace.

#### Scenario: Typecheck runs across all workspaces

- **WHEN** a contributor runs `bun run typecheck` from the repo root
- **THEN** TypeScript MUST be invoked for every workspace that ships TypeScript sources and the command MUST exit non-zero if any workspace reports a type error

#### Scenario: Dev scripts target specific workspaces

- **WHEN** a contributor runs `bun run dev:backend` or `bun run dev:web`
- **THEN** only the named workspace's dev server MUST start and the command MUST resolve without ambiguity between the two workspaces

### Requirement: Dependency versions are pinned exactly and logged before first install

Every dependency declared in any `package.json` in this repository SHALL be pinned to an exact version with no `^` or `~` prefix. Before the first `bun install` of S1a, the resolved exact versions MUST be recorded in `docs/ops/version-log-2026-04-20.md`, and each logged version MUST be at or above the corresponding floor listed in `docs/spec.md`.

#### Scenario: No caret or tilde ranges in manifests

- **WHEN** a reviewer greps every `package.json` in the repository for the characters `^` or `~` in dependency version fields
- **THEN** no matches MUST appear in `dependencies`, `devDependencies`, `peerDependencies`, or `optionalDependencies`

#### Scenario: Version log records each resolved pin

- **WHEN** a reviewer opens `docs/ops/version-log-2026-04-20.md`
- **THEN** every dependency added during S1a MUST be listed with its exact resolved version, and each entry MUST be marked as at or above the floor declared in `docs/spec.md`
