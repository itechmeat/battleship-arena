---
name: common
description: Common instructions for any agent
applyTo: **
---

## 1. Mandatory Protocols

### 1.1 Final Reporting (`ask_report`) — CRITICAL

**⚠️ VIOLATION = PROJECT FAILURE**

- **EVERY** response MUST end with `ask_report` — no exceptions
- Complete answer/report must be inside `ask_report`, not plain text
- Applies to: answers, clarifications, error reports, partial results, everything
- **Empty user reply handling**: if user response after `ask_report` is empty/blank — retry with restructured output (same content, different format/parameters)

### 1.3 Skills & Docs Attribution

Every final report MUST include at the end:

- `Skills used: <list>` — if any skills were consulted
- `Docs used: <list>` — if any external documentation was fetched, on the new line of the report

## 2. Task-Specific Workflows

### 2.1 Code Review Request

When user asks to review changed files:

1. Run `git diff` or `git status` to identify uncommitted changes
2. Use `coderabbit` skill and run the real CodeRabbit CLI flow, not a simulated/manual review
3. Before review, verify all prerequisites explicitly:

- CLI is installed
- CLI is authenticated
- repository has at least one commit
- base branch exists; detect `origin/HEAD` first, then fall back to `master`/`main`

4. Treat CodeRabbit review as a **long-running CLI task**:

- run it in a dedicated background terminal/session
- do **not** rely on shell redirection or wrapper scripts as proof of success
- exception for this repo/agent environment: if a direct `coderabbit review ...` run repeatedly exits with external `SIGINT` before findings are emitted, rerun the same CLI via a pseudo-TTY once using `script -q /dev/null coderabbit review ...` to obtain the real service response; treat this as an execution workaround, not as proof of success by itself
- observe progress and completion via terminal output/log inspection until a real report is produced

5. A CodeRabbit run counts as successful **only if** one of the following is true:

- terminal output contains actual findings/review summary, or
- the saved report file contains actual findings/review summary, or
- CodeRabbit explicitly reports that no issues were found

6. The following do **not** count as a successful review:

- output stops at progress-only lines such as `Connecting`, `Setting up`, `Analyzing`
- process exits or is interrupted with `SIGINT`, `KeyboardInterrupt`, or similar external interruption
- saved report contains only startup/progress lines and no findings

7. If the run is partial or interrupted:

- inspect the latest `~/.coderabbit/logs/*` log
- report the run as failed/incomplete
- do **not** present it to the user as a finished CodeRabbit review
- either retry once with a corrected execution strategy or ask the user to run it locally and share the full report

8. Present the actual CodeRabbit report to the user
9. Ask which issues to fix, provide recommendations
10. **Ignore** suggestions for archived changes (`openspec/changes/archive/`) or outdated documents

Operational note for this repo:

- If the agent environment shows that CodeRabbit starts normally, reaches review setup, and then gets interrupted externally before findings are emitted, classify that as an agent-runtime execution problem rather than a project-code failure.
- In that case, the agent must say that CodeRabbit did not complete and must not pretend that a partial log/report is a valid review result.
- If a pseudo-TTY rerun via `script -q /dev/null coderabbit review ...` produces a concrete service response such as rate limiting or a review summary, that response is the authoritative outcome for the attempt and should be reported instead of the earlier synthetic `SIGINT` path.

Agent run must NOT require git operations that modify the repository.
Human performs commit/push manually outside agent run.

### 2.2 Changelog Request

When user asks to write changelog (before commit):

1. Use `changelog` skill for format. Changelog content should be informative yet concise — find the right balance to reflect only what is truly useful to readers. Summarize minor changes as "refactoring/improvements/fixes" as appropriate. Write/update CHANGELOG.md with `[Unreleased]` section.
2. After that, propose text for Release notes, commit message, and Pull Request description considering all changes made in the project (use `commits` skill). Create a new RELEASE.md file in project root:
   - Brief confirmation: "Changelog is ready" if it's really ready (or error details)
   - 3 branch name options (conventional: `feat/`, `fix/`, `refactor/`, etc.)
   - 3 commit message variants (short/medium/detailed) following Conventional Commits
   - Pull Request description (summarized, not full changelog)
   - Release notes
