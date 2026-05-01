# Workflow V2

Choreography for OpenSpec + Superpowers. Per-artifact rules, project context, and dependency order live in `openspec/config.yaml` and the `battleship-arena-v2` schema (`openspec/schemas/battleship-arena-v2/`). They are surfaced to every agent automatically through the `openspec instructions` command - this file does not repeat them.

## What lives where

- **Schema** (`openspec/schemas/battleship-arena-v2/schema.yaml`) - artifact dependency graph, per-artifact templates, per-artifact instruction text. Knows that `brainstorm` precedes `proposal`, `proposal` precedes `design` and `specs`, etc.
- **Project config** (`openspec/config.yaml`) - project context (tech stack, key docs, engineering rules) and per-artifact rules (constraints AI must follow when authoring).
- **This file** - phase order, agent assignments (Claude / Codex / human), and cross-phase discipline (`make fix`, `commits` skill, CodeRabbit). Things OpenSpec does not know about.

## Flow

1. Scaffold the change (OpenSpec creates folder; stops before any artifact).
2. Brainstorm the design (Superpowers, output to `brainstorm.md`).
3. Optional brainstorm review.
4. Draft proposal + specs + design.
5. Human checkpoint on direction.
6. Atomic plan (`tasks.md`).
7. Plan review.
8. Build with TDD + sub-agents + verification.
9. Implementation review.
10. Archive (sync delta specs, propose commit).
11. Optional CodeRabbit follow-up.
12. Merge the PR on GitHub.

Adaptive depth: routine stories run lean (skip phase 3, short brainstorm, skip phase 9 if the diff is trivial). Major work runs full.

## 1. Scaffold

- [ ] 🦊 Claude Code

_Open a fresh Claude Code session. Paste this prompt first, then paste your feature description right after it._

Use the `openspec-new-change` skill to scaffold a change based on the feature description I will paste after this prompt.
Derive a kebab-case slug from the description yourself.
Stop before drafting any artifact. Output the chosen slug and the change folder path so I can carry the slug into the next phases.

[your_feature_prompt]

## 2. Brainstorm

- [ ] 🦊 Claude Code

Read `openspec instructions brainstorm --change <slug>` and follow it.
Use the `superpowers:brainstorming` skill for the exploration itself.
Attach a well-argued recommendation to every question; record my answers in `brainstorm.md`, not just in chat.
Pick obvious options yourself, without asking me.
ultrathink

## 3. Brainstorm review (optional)

Skip for routine stories. Run for fuzzy / creative / major-design work.

- [ ] 🤖 Codex

Review `openspec/changes/<slug>/brainstorm.md`. Look for missing edge cases, weak architectural assumptions, decisions made too quickly. Review only - do not edit.

- [ ] 🦊 Claude Code

Apply (or reject) the review against `brainstorm.md`. The decision is yours.
ultrathink

## 4. Proposal, specs, design

- [ ] 🦊 Claude Code

Run these in order, following the output of each command:

1. `openspec instructions proposal --change <slug>`
2. `openspec instructions specs --change <slug>`
3. `openspec instructions design --change <slug>`

After each artifact, run `openspec validate <slug>` to catch format errors early.

## 5. Human checkpoint

- [ ] 👤 Human

_Open `openspec/changes/<slug>/proposal.md` and the delta specs in your editor. Read, edit by hand if needed._

Read `proposal.md` and the delta specs. Confirm direction and success criteria. Edit manually if needed; Claude Code will continue from the corrected files.
This is the cheap point of return.

## 6. Atomic plan

- [ ] 🦊 Claude Code

Read `openspec instructions tasks --change <slug>` and write `tasks.md`.
Use the `superpowers:writing-plans` skill to break the work into atomic units.
ultrathink

## 7. Plan review

- [ ] 🤖 Codex

Review `openspec/changes/<slug>/tasks.md` for atomicity, missing edges, untestable steps, tasks too coarse for sub-agent dispatch. Review only.

- [ ] 🦊 Claude Code

Apply (or reject) the review. The decision is yours.
ultrathink

## 8. Build

- [ ] 🤖 Codex

_Long-running phase. Open a fresh Codex session, paste the prompt, then check back periodically._

Implement the change. Use:

- `superpowers:test-driven-development` per task (tests first).
- `superpowers:subagent-driven-development` and `superpowers:dispatching-parallel-agents` for independent tasks.
- `superpowers:verification-before-completion` before marking any task done. Paste the actual command output, no `should work`.

If secrets or API keys are required, create `.env` and `.env.local` with placeholder values and document replacement in `readme.md`.
When done, run `make fix` and resolve every issue; fix anything left manually.

## 9. Implementation review

- [ ] 🤖 Codex

Self-review the diff for senior-level engineering, architectural correctness, and best practices. Fix issues you find autonomously, without extra questions.
When done, run `make fix` and resolve every issue.

- [ ] 🦊 Claude Code

Use `superpowers:requesting-code-review` to review the implementation against `proposal.md`, `brainstorm.md`, and `tasks.md`.
Split across sub-agents via `superpowers:dispatching-parallel-agents` if the diff is large.
Review only - changing code is forbidden.
ultrathink

- [ ] 🤖 Codex

Apply (or reject) the review. The decision is yours.
When done, run `make fix` and resolve every issue.

## 10. Archive

- [ ] 🦊 Claude Code

Archive the change with `openspec-archive-change`.
Sync delta specs into main specs via `openspec-sync-specs` if needed - decide autonomously.
Propose a branch name and a commit message using the `commits` skill. Without exception.
ultrathink

## 11. CodeRabbit (optional)

- [ ] 🤖 Codex

_Run only after CodeRabbit has posted its review on the PR._

Apply (or reject) the CodeRabbit review. The decision is yours.
When done, run `make fix` and resolve every issue.

## 12. Merge

- [ ] 👤 Human

_Merge the PR on GitHub once CI is green and reviews are addressed._

Use the squash-merge button if the project follows a linear history convention; otherwise merge as configured.
Delete the branch after merge.
