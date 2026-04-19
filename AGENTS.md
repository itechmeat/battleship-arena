# AGENTS.md

This file is the rulebook for AI coding agents that operate on the BattleShipArena repository.

## Current Date Context

It is April 2026. When searching for tools, libraries, versions, or best practices, always search with this date context. Use queries like "best X in 2026", "X vs Y 2026", "latest X 2026". Do not rely on outdated knowledge — verify everything against current state before writing code.

## Project Overview

**BattleShipArena** is a mobile-first PWA benchmark for LLMs playing Battleship. A user picks a provider and a model, supplies their own API key, and watches the model play a fixed Battleship game against a deterministic board. Metrics (attempts, hit rate, cost, duration, reasoning usage, schema errors) are logged per game and aggregated into a leaderboard by `(providerId, modelId)`.

Non-goals for MVP: user authentication, multi-tenant infrastructure, Docker, message queues, web push, offline dynamic data.

See `docs/about.md` for the product description, `docs/spec.md` for the full spec, `docs/architecture.md` for system layout, `docs/plan.md` for story-level planning.

## Tech Stack

Minimum versions for every tool are pinned in `docs/spec.md`. Never install a version below the spec minimum. When in doubt, verify the latest stable release with official sources.

## Version Policy

Before adding or upgrading a dependency:

1. Read `docs/spec.md` → check the minimum version required.
2. Fetch the current latest stable release from the official source (npm registry, GitHub Releases, vendor documentation).
3. Pin to the latest stable that is ≥ the spec minimum. Never downgrade.
4. If the spec minimum is below the latest stable and the upgrade is safe, update the spec in the same PR.

## Execution Timeout Discipline

- No single waiting period for a command, build, install, test run, service startup, migration, or log observation may exceed 5 minutes.
- If the operation is still progressing, the agent may continue in additional 5-minute waiting periods, but no more than 3 consecutive periods total for the same operation.
- Every time an operation does not complete within a 5-minute period, the agent MUST treat that as an investigation trigger and report the current blocker, the most likely causes, and probable repair options before continuing.

### GIT Policy

Prohibited without explicit user permission:

- `git commit` / `git commit --amend`
- `git push` / `git push --force`
- `git add`
- `git reset`
- `git rebase`
- `git merge`
- `git checkout` (branch switching)
- `git branch -d` / `git branch -D`
- `git stash`
- `git tag`
- Any other commands that modify the git repository state

Allowed WITHOUT asking:

- `git status`
- `git log`
- `git diff`
- `git show`
- `git branch` (view only)
- `git remote -v`
- Any other read-only git commands

**Violating this rule is unacceptable under any circumstances.**

## Testing & TDD

- **TDD is mandatory from S2 onwards** (see `docs/plan.md`). S1 — Bootstrap — allows writing tests alongside or right after the code, but coverage is still required.
- **No test may write to the production database.** A guard in `backend/tests/setup.ts` asserts that `DATABASE_PATH` is `:memory:`, starts with `/tmp/`, or contains `-test-`; otherwise the test fails immediately.
- **Integration tests use `withTempDatabase(fn)`** which creates a unique temporary SQLite file, applies migrations, invokes the callback, and deletes the file.
- **Mock LLM provider** (`backend/src/providers/mock.ts`) is used for every CI test. No CI run spends real tokens.
- **E2E (Playwright) runs against staging only.** Staging is a separate systemd service on a different port with its own SQLite file (`project-staging.db`). It is never the production database.
- **Before claiming an implementation done**: run `bun test` in every affected package; if a UI surface changed, run the Playwright smoke locally or on staging.

## Skills Discovery

Skills stay project-local (`.agents/skills/`). They are never installed globally.

Resolution order for a task:

1. Check skills already loaded in the current agent session.
2. Check project-local `.agents/skills/`.
3. Check the user's global skill directory if one is configured.
4. Only if nothing fits, search externally via an external skill registry.

When installing, always use project-local scope (no `-g` flag).

## Delegation

When delegating to sub-agents, pass raw intent — what needs to happen and why — and let the sub-agent choose files, formats, and structure. Preserve the user's original words and scope; do not pre-specify file paths or APIs unless that is the actual ask.

## Skills & Docs Attribution

Every substantive final report or PR description SHOULD end with:

- `Skills used: <list>` — if any agent skills were consulted.
- `Docs used: <list>` — if any external documentation was fetched.

If a rule above names a skill explicitly, the agent MUST actually consult that skill in the current turn before claiming compliance.
