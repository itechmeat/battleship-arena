# Workflow

## Init story

- [ ] 🦊 Claude Code

Let's run a brainstorm for implementing story S2 from the plan in docs/plan.md.
The project information is described in sufficient detail in the documents inside the docs folder.
When you ask questions, always attach well-argued recommendations. After I pick an option, record the reasoning in the resulting brainstorm file as well: it must stay in the document.
Remember: right now we are not writing code, we are planning.
Pick the most obvious options yourself, without asking me.
ultrathink

## Review

- [ ] 🤖 Github Copilot

docs/superpowers/specs/2026-04-21-s2a-game-loop-mock-design.md
docs/superpowers/plans/2026-04-21-s2a-game-loop-mock.md
Review this plan; if you have criticism or improvement ideas - tell me.
Do not propose fixes and do not fix anything yourself, your job is review only.
If ask_report returns an empty response - just repeat your report again, up to 3 times. Always answer in English.

- [ ] 🦊 Claude Code

I have a review of our brainstorm. Inside curly braces I wrote my comments on how to treat each review item; where there are no braces - decide yourself whether to apply changes or ignore them. If you have questions - ask; if not - apply changes wherever you find it necessary. The reviewer does not know what you and I discussed, they only had access to the documents, so the decision to follow the reviewer's recommendations or not is yours.
ultrathink

- [ ] 🦊 Claude Code

docs/superpowers/specs/2026-04-21-s2a-game-loop-mock-design.md
docs/superpowers/plans/2026-04-21-s2a-game-loop-mock.md
Based on this plan, let's start a new change following the openspec workflow.
Produce all artifacts autonomously.
If needed, spawn a dedicated agent per file to speed things up.
ultrathink

- [ ] 🤖 Github Copilot

Review the current openspec plan for the feature.
This refers only to the contents of the openspec folder, nothing else.
If ask_report returns an empty response - just repeat your report again, up to 3 times.

- [ ] 🦊 Claude Code

I have a review of the current openspec change; the decision to follow the reviewer's recommendations or not is yours.
ultrathink

## Implement

- [ ] 🤖 Github Copilot

Start implementing the current openspec change following the openspec workflow.
Work autonomously: you have all the documentation, so do not ask me about details. Your job is to implement the feature end-to-end.
If ask_report returns an empty response - just keep going and pick your own path.

## Review

- [ ] 🤖 Github Copilot

Run a self-review (without CodeRabbit) of the changes introduced to the project (diff) to check whether everything matches a senior level of development, the correctness of the architectural decisions taken, and best practices. If you see something that should be fixed - fix it yourself, autonomously, without extra questions.
ask_report is required.

- [ ] 🦊 Claude Code

Use superpowers to review the implementation of the current openspec change.
If the diff is large, you may split it across several sub-agents.
Changing code is forbidden - I expect review only!
Also, extra work was done beyond what was planned - it must be covered too.
ultrathink

- [ ] 🤖 Github Copilot

I have a review of the implementation of the current openspec change; the decision to follow the reviewer's recommendations or not is yours.
ask_report is required.

- [ ] 🦊 Claude Code

Archive the current openspec change.
If needed, without asking me, sync delta specs into main specs.
At the end, do not forget to propose a branch name and a commit message, using the commits skill without exception. Do not forget about this!
ultrathink

## CodeRabbit

- [ ] 🤖 Github Copilot

I have a review from CodeRabbit; the decision to follow the reviewer's recommendations or not is yours.
If ask_report returns an empty response - just keep going and pick your own path.
