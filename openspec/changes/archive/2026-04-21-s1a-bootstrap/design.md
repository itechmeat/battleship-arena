## Context

BattleShipArena is pre-code. The canonical documents (`docs/about.md`, `docs/spec.md`, `docs/architecture.md`, `docs/plan.md`) define the product, the technical contract, the architecture, and the four-story delivery plan. Story S1 is "Bootstrap": it exists to lay down the repository skeleton, the toolchain, a trivial runnable backend with an applied database schema, a PWA shell, CI, and a set of checked-in infra files so every later story starts from a green pipeline.

Two design documents already exist in `docs/superpowers/`:

- `specs/2026-04-20-s1-bootstrap-design.md` - the approved scope, the split between S1a (code + CI + local verification) and S1b (VPS + first deploy + reboot drill), the toolchain and convention choices, the package-by-package skeleton, the CI contract, and the verification protocol. The reasoning behind each choice is preserved verbatim so later readers can see the tradeoffs.
- `plans/2026-04-20-s1a-bootstrap.md` - the bite-sized implementation plan covering Pre-task 0 through Task 21, with exact file contents, commands, and verification steps.

This OpenSpec change (`s1a-bootstrap`) formalizes those two documents into the repository's experimental OpenSpec workflow so archival, review, and cross-referencing become machine-checked. The proposal and specs in this change are derived from the two design documents above; nothing material here is new. The authoritative reasoning lives in `docs/superpowers/specs/2026-04-20-s1-bootstrap-design.md` and is not repeated; this `design.md` points at it and records only the OpenSpec-specific choices (capability boundaries, artifact layering, delta vs additive choices) plus a pared-down summary of the biggest cross-cutting decisions.

Current state: the `openspec/` directory exists with `config.yaml` configured for the `spec-driven` schema and empty `changes/` + `specs/` folders. This change is the first to land in `openspec/`. No prior capabilities exist, so every spec in this change uses `## ADDED Requirements` rather than a delta form.

## Goals / Non-Goals

**Goals:**

- Capture S1a's scope in OpenSpec form so CI, archival, and cross-artifact validation work on it.
- Partition the S1a work into capability-sized specs, each with testable requirements, so the implementation step can pick up one capability at a time.
- Preserve the approved brainstorm reasoning by reference (not by duplication); the source of truth for the "why" behind each decision stays in `docs/superpowers/specs/2026-04-20-s1-bootstrap-design.md`.
- Produce a tasks artifact aligned with the 21-task plan already written, with the same ordering and the same "one commit per task" discipline.
- Make the S1a -> S1b handover boundary a first-class capability (`s1b-handover`) so the next change (host provisioning) has a clear starting point.

**Non-Goals:**

- Re-deriving or re-debating the scope split, toolchain picks, or CI gating mechanism. Those were settled in the brainstorm and re-reviewed twice.
- Writing any code. This change produces only OpenSpec artifacts under `openspec/changes/s1a-bootstrap/`.
- Covering S1b (host provisioning, DNS, Let's Encrypt, first deploy, reboot drill). S1b is a separate change opened after a VPS is provisioned.
- Covering S2+ (game logic, providers, leaderboard, replay viewer, maintenance mode). Those are subsequent stories, each with its own OpenSpec change.
- Introducing dependencies or capabilities beyond what `docs/superpowers/specs/2026-04-20-s1-bootstrap-design.md` describes. The change is a 1:1 OpenSpec rendering of the approved design.

## Decisions

### D1. Partition S1a into 7 OpenSpec capabilities rather than one monolithic spec

**Decision:** Seven new capabilities, one spec per capability: `monorepo-foundation`, `shared-contract`, `backend-service`, `web-shell`, `infra-staging`, `ci-pipelines`, `s1b-handover`.

**Rationale:** S1a touches seven genuinely different surfaces. A single spec listing 50+ requirements under "S1a" would be a filing cabinet, not a contract. Partitioning along natural boundaries gives each capability a focused set of requirements that can be validated independently. It also makes the archive form of the OpenSpec change useful: later changes that modify only the backend or only CI can do delta specs against the right capability file.

**Alternatives considered:**

- _One spec per file_ (45+ capabilities). Too fine-grained; `shared/src/outcome.ts` and `shared/src/error-codes.ts` do not have independent lifecycles. Rejected.
- _Four capabilities along package lines_ (`shared`, `backend`, `web`, `infra-and-ops`). Too coarse: the CI contract, the S1b handover, and the toolchain all have requirements that do not fit cleanly into a single-package bucket. Rejected.
- _Six capabilities with `s1b-handover` folded into `infra-staging`_. Rejected because the handover is a documentation contract, not an infrastructure artifact, and its requirements (recording decisions, maintaining a version log, enforcing the placeholder rule) stand on their own.

### D2. All seven capabilities are additive; no `MODIFIED` or `REMOVED` sections

**Decision:** Every spec in this change uses `## ADDED Requirements` only.

**Rationale:** `openspec/specs/` is empty at the start of this change. There is no prior behavior to modify or remove. Using the additive form keeps the specs simple and makes the archive step trivial (the whole block becomes the initial capability spec under `openspec/specs/<capability>/spec.md` at archive time).

**Alternatives considered:**

- _Pre-populating placeholder specs under `openspec/specs/` with "initial empty" content, then landing `MODIFIED` sections in this change_. Rejected as ceremony with no benefit.

### D3. Design rationale is inline; the brainstorm document is historical enrichment

**Decision:** This `design.md` carries the load-bearing rationale for every decision inline (see D1 through D9). The brainstorm document `docs/superpowers/specs/2026-04-20-s1-bootstrap-design.md` - which lives in the same repository and ships in every git checkout - is optional historical enrichment for a reader who wants the full Q-and-A trace of the choices, not a required dependency for understanding the OpenSpec change.

Key inline rationale that lives in this document, not only externally: the scope-split motivation (D1, also proposal section), the partition argument (D1), the additive-only spec choice (D2), the step-level gating trade-off (D4), the `openDatabase`-single-primitive invariant (D5), the startup-order test argument (D6), the split SSH/public URL rationale (D7), the never-executed-in-S1a infra rule (D8), the task-list-is-a-pointer-not-a-how-to choice (D9).

**Rationale:** The previous phrasing of this decision treated the brainstorm doc as the source of truth for reasoning, which meant an OpenSpec-only reader had to chase an external file. After review, the change artifacts (proposal + design + specs + tasks) now stand alone: they contain sufficient reasoning to understand the WHY without leaving the `openspec/changes/s1a-bootstrap/` directory. The brainstorm remains as a richer trace for readers who want it.

**Alternatives considered:**

- _Copying every brainstorm paragraph verbatim into design.md_. Rejected: the brainstorm is structured as a Q-and-A with alternatives and rejection rationale; duplicating that full trace inflates design.md beyond useful size and creates two places where a later correction must land.
- _Keeping the previous "source of truth is external" framing_. Rejected after review: it pushed the burden of "understanding the change" outside the OpenSpec boundary, which is the exact property OpenSpec archival is meant to preserve.

### D4. The `ci-pipelines` capability spec describes step-level gating, not job-level

**Decision:** The `deploy` job in `deploy-staging.yml` runs unconditionally; a first step evaluates `vars.STAGING_DEPLOY_ENABLED` and writes `### Deploy gate: ENABLED|DISABLED` to `$GITHUB_STEP_SUMMARY`; every subsequent step is guarded by that output. Requirements in the spec describe the observable behavior, not the YAML syntax.

**Rationale:** A job-level `if:` skip is invisible to operators in the Actions UI and cannot write a step summary. The adopted design (settled in the second review round) achieves the visible-gate behavior the design demanded, at the cost of a single extra step in the job. The spec encodes the visibility property directly (`### Deploy gate: DISABLED` summary on every build through S1a) so any deviation in implementation is caught by an inspection rather than buried in YAML.

**Alternatives considered:**

- _Job-level `if: ${{ vars.STAGING_DEPLOY_ENABLED == 'true' }}`_. Rejected (first review round) because the job simply disappears from the UI and the design requires a visible message.
- _Separate `deploy-gate-notice` sibling job_. Rejected (second review round) because it is a different observable behavior than the design's `deploy` job wording.

### D5. `openDatabase` is the only runtime primitive that opens SQLite; `withTempDatabase` delegates to it

**Decision:** A single requirement in `backend-service` establishes that `openDatabase(path)` is the only runtime entrypoint that calls `new Database(...)`. A sibling requirement establishes that `withTempDatabase(callback)`, the test-only helper, delegates to `openDatabase` rather than constructing its own.

**Rationale:** DRY at a small scale, but more importantly: it guarantees that a future change to the opening semantics (e.g., adding a PRAGMA, wrapping in a retry) reaches both production and tests at once. Without this rule, the test helper silently diverges.

**Alternatives considered:**

- _Two parallel constructors with a comment reminding maintainers to update both_. Rejected; comments rot.

### D6. Startup-order guarantee is expressed as a bootstrap-level requirement with a test that exercises the real order

**Decision:** The `backend-service` spec contains a requirement that the backend's `bootstrap(config)` function has, when it returns, both (a) applied all pending migrations and (b) bound an HTTP listener that answers `/api/health` with `200`. The accompanying test in `backend/tests/bootstrap.test.ts` actually issues a `fetch` against the running listener and inspects the SQLite schema.

**Rationale:** The design's original wording ("migrations complete before the listener accepts connections") is a temporal invariant that a unit test of `openDatabase` alone cannot prove. Exercising the real `bootstrap(config)` with a temporary DB and a real port makes the invariant observable. Both review rounds flagged that the weaker version of this test would let the invariant slip.

**Alternatives considered:**

- _Testing `openDatabase` and `createApp` separately_. Rejected (second review round) because it does not prove the order.
- _Sub-process test that spawns `bun run src/index.ts`_. More faithful but much slower and flakier. Rejected as over-engineering for an invariant that an in-process `bootstrap` exposes just as clearly.

### D7. S1b secrets and variables are split into `STAGING_SSH_HOST` and `STAGING_PUBLIC_URL`

**Decision:** Two separate repository variables. `STAGING_SSH_HOST` is the rsync + SSH target (may be IP or domain). `STAGING_PUBLIC_URL` is the full URL for the TLS health check and must be a hostname.

**Rationale:** A single variable cannot serve both roles: rsync is happy with an IP; an HTTPS curl to an IP fails certificate validation. Keeping them separate makes each role's constraint explicit and lets S1b pick whichever SSH target is convenient without dragging the public URL along.

**Alternatives considered:**

- _Single `STAGING_HOST` variable_. Rejected (second review round) because HTTPS to an IP is broken out of the box and the design's wording "IP or domain" directly conflicted with the health-check requirement.

### D8. Infra files ship to the repo in S1a but are never executed until S1b

**Decision:** The `infra-staging` capability's requirements describe committed artifacts (Caddyfile, systemd units, scripts, `maintenance.html`, `host-bootstrap.sh`, `verify-s1a.sh`) and the invariants they must satisfy, plus an explicit "S1a does not run any of them on a live host" non-invariant.

**Rationale:** The scope split from the brainstorm (Section 1 of `docs/superpowers/specs/2026-04-20-s1-bootstrap-design.md`) makes this a defining property of S1a. Encoding it as a requirement lets a reviewer catch a future S1a PR that sneaks in a "run `ssh host ...`" step.

**Alternatives considered:**

- _Not checking in infra files until S1b_. Rejected in the brainstorm; the files need CI coverage (lint of shell, shellcheck, YAML validation) which is easier on the repo than on the host.

### D9. Task ordering in `tasks.md` mirrors Pre-task 0 + Tasks 1-21 of the plan; per-task file contents stay in the plan

**Decision:** `tasks.md` is a 22-item progress tracker with one short description per plan task. The exact file contents, exact commands, and exact expected outputs live in `docs/superpowers/plans/2026-04-20-s1a-bootstrap.md`, which is in the same repository and is a single `cat` away for any reader of the archive.

**Rationale:** The plan is the source of truth for the HOW because (a) duplicating ~2500 lines of file contents into `tasks.md` creates two synchronized sources that drift within a PR cycle, and (b) the plan ships in the same git history as this change, so an archive reader opening `openspec/changes/archive/s1a-bootstrap/` also has `docs/superpowers/plans/2026-04-20-s1a-bootstrap.md` on disk. The "self-contained OpenSpec" property is satisfied by the archive set, not by duplicating the entire plan into OpenSpec.

**Alternatives considered:**

- _Duplicating the full plan into `tasks.md`_. Rejected; maintenance burden and drift risk. If a file content changes during implementation (very common), two checked-in locations must both update.
- _Moving the plan file into `openspec/changes/s1a-bootstrap/plan.md`_. Rejected as cosmetic. The plan file is already under version control in this repo; copying it into the OpenSpec directory does not make it more "self-contained" - it just changes its path.
- _Omitting `tasks.md`_. The OpenSpec schema lists `tasks` as a required artifact; skipping it would leave the change incomplete.

## Risks / Trade-offs

- **Risk:** A future edit to `docs/superpowers/specs/2026-04-20-s1-bootstrap-design.md` could drift from the specs here. **Mitigation:** The proposal and design both call out the brainstorm document as the canonical reasoning; a review should treat any spec change without a corresponding brainstorm edit (or vice versa) as a red flag. Once this change archives, the specs themselves become the contract and the brainstorm becomes historical.
- **Risk:** Seven capabilities may look fragmented to a first-time reader. **Mitigation:** The proposal's "Capabilities" section maps each capability to a one-line purpose, and each spec file is short (under 150 lines). The partition is along natural seams, not arbitrary.
- **Trade-off:** Specs describe observable behavior but avoid encoding implementation details (no TypeScript snippets, no YAML). This keeps requirements stable under refactoring but means the specs alone are not sufficient to implement; the implementer must also read the plan. The plan is explicitly the HOW document, which is the trade we want.
- **Risk:** Subagents wrote six of the seven spec files in parallel with slightly different style; consistency may be uneven across files. **Mitigation:** A consistency pass is part of the self-review for this design. Any noted deviation is recorded under "Open Questions" below for optional cleanup before archive.
- **Risk:** The `STAGING_DEPLOY_ENABLED` gating mechanism depends on a human flipping a repository variable; if forgotten, S1b is not actually green. **Mitigation:** The `s1b-handover` runbook makes that flip an explicit ordered step and gates the DoD on a successful deploy after the flip.

## Migration Plan

Not applicable. This change lands no runtime code; there is nothing to migrate. The archive step for this change (after implementation and review) promotes each capability spec under `openspec/changes/s1a-bootstrap/specs/<cap>/spec.md` to `openspec/specs/<cap>/spec.md` as the first initialized capability spec in the repo. The `openspec archive` command handles this automatically once the change is marked complete.

Rollback for the artifacts themselves: revert the PR that introduces `openspec/changes/s1a-bootstrap/`. No cleanup outside that directory is required because the change never runs.

## Open Questions

- **Q1:** Should the version log (`docs/ops/version-log-2026-04-20.md`) become a living document spanning multiple S-stories, or a per-story dated snapshot? Current design: per-story dated. If the MVP spans more than a quarter, this decision should be revisited before S2's pre-task.

## Resolved Questions

- **R1** (was Q2, resolved 2026-04-21): `s1b-handover` archives at the end of S1a together with the other six capabilities. **Reason:** the runbook document `docs/ops/host-bootstrap.md` is complete at S1a, captures every decision S1b must record, and S1b's own OpenSpec change will only extend it (landing `MODIFIED` deltas that fill the decision blanks, append the reboot-drill log, and mark the final secrets populated). Archiving the capability at S1a gives S1b a baseline to delta against, which is the normal OpenSpec flow.

---

Authoritative reasoning for every choice in `docs/superpowers/specs/2026-04-20-s1-bootstrap-design.md`. The 21-task implementation sequence for this change is in `docs/superpowers/plans/2026-04-20-s1a-bootstrap.md`.
