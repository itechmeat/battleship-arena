# INIT the project

## Envorinment

### [Claude Code](https://code.claude.com/docs/en/quickstart)

```sh
curl -fsSL https://claude.ai/install.sh | bash
```

### [Github Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot)

Just install it to your VSCode

### [Relief Copilot](https://marketplace.visualstudio.com/items?itemName=ivan-mezentsev.reliefpilot)

Install for productivity and the cost optimisation

### [Superpowers](https://github.com/obra/superpowers)

For Claude Code, right inside the Claude Code chat:

```sh
/plugin install superpowers@claude-plugins-official
```

For Github Copilot:

```sh
copilot plugin marketplace add obra/superpowers-marketplace
copilot plugin install superpowers@superpowers-marketplace
```

### [Openspec](https://github.com/Fission-AI/OpenSpec)

```sh
npm install -g @fission-ai/openspec@latest
```

### [CodeRabbit](https://marketplace.visualstudio.com/items?itemName=CodeRabbit.coderabbit-vscode)

```sh
curl -fsSL https://cli.coderabbit.ai/install.sh | sh && npx skills add https://github.com/coderabbitai/skills -s code-review -g
```

### [Bun](https://bun.sh/)

```sh
curl -fsSL https://bun.sh/install | bash
```

## Global kills

- `npx skills add https://github.com/itechmeat/llm-code -s makefile -s changelog -s commits -g`
- `npx skills add https://github.com/chromedevtools/chrome-devtools-mcp -s chrome-devtools -s chrome-devtools-cli -s memory-leak-debugging -s debug-optimize-lcp -s a11y-debugging -g`
- `npx skills add https://github.com/softaworks/agent-toolkit -s mermaid-diagrams`

## Project's kills

- `npx skills add https://github.com/withastro/astro -s astro-developer`
- `npx skills add https://github.com/secondsky/claude-skills -s bun-sqlite`
- `npx skills add https://github.com/itechmeat/llm-code -s vite -s bun -s changelog -s commits -s makefile`
- `npx skills add https://github.com/vercel-labs/agent-skills -s web-design-guidelines`
- `npx skills add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill -s ui-ux-pro-max`
- `npx skills add https://github.com/martinholovsky/claude-skills-generator -s 'SQLite Database Expert'`
- `npx skills add https://github.com/erayack/sqlite-best-practices -s sqlite-best-practices`
- `npx skills add https://github.com/yusukebe/hono-skill -s hono`
- `npx skills add https://github.com/bobmatnyc/claude-mpm-skills -s hono-cloudflare -s hono-testing -s hono-core`
- `npx skills add https://github.com/mindrally/skills -s hono-typescript`
- `npx skills add https://github.com/softaworks/agent-toolkit -s c4-architecture`

## Prompts for project's docs

### about.md

Let's run a short, quick brainstorming session - 3 to 5 questions total, fewer is better - to shape my idea into the file ./docs/about.md. When you ask questions, always attach well-argued recommendations. After I pick an option, record the reasoning in the resulting file as well: it must stay in the document. Here is the gist of my idea: I want to build a mobile-first PWA benchmark for LLMs that plays Battleship. The user picks a provider and a model, enters their own API key, starts a game, and watches the model try to sink the fleet on a game board. In a loop, the backend sends the model an image of the current board state, receives the shot coordinate back as structured output, applies it, and logs everything - attempts, hits, tokens, cost, duration, format errors. The board is the same for all models so the comparison stays fair. When a game ends, the result goes into a shared leaderboard keyed by (provider, model). User keys are never persisted anywhere, there is no registration, and there is no multiplayer - the model is always the player, the human just watches. Expand this into a full about.md: the problem, what it is, what it is not, how it is used, key properties. The file must describe only the product idea - do not include any technical implementation details such as specific languages, frameworks, libraries, databases, hosting, file layout, API schemas, or code-level choices; those belong in other documents.

### spec.md

Let's run a short, quick brainstorming session - 3 to 5 questions total, fewer is better - and use its result to produce the file ./docs/spec.md - the technical specification of the project. When you ask questions, always attach well-argued recommendations. After I pick an option, record the reasoning in the resulting file as well: it must stay in the document. The product context is already captured in ./docs/about.md, rely on it. Tools and minimum versions I plan to use: Bun 1.3.12, Hono 4.12.14, TypeScript 6.0.2, Astro 6.1.7, Solid.js 1.9.12, CSS Modules, oxlint 1.60.0, oxfmt 0.45.0, Caddy 2.x. The listed versions are minimums: the specification must not lower them, it may only pin the current stable version that is greater than or equal to the minimum. The document must cover the following sections: system overview and its surfaces, a table of tools and their minimum versions, game rules and data formats, lifecycle policies, the database data model together with endpoints and error format, LLM provider integration, frontend, testing strategy, project rules (secrets, commit policy), and an explicit list of what is not included in the MVP.

### architecture.md

Let's run a short, quick brainstorming session - 3 to 5 questions total, fewer is better - and use its result to produce the file ./docs/architecture.md - the architecture document of the project. When you ask questions, always attach well-argued recommendations. After I pick an option, record the reasoning in the resulting file as well: it must stay in the document. While working, use the c4-architecture skill and rely on its terminology and its approach to describing system levels. The product context lives in ./docs/about.md, the technical specification lives in ./docs/spec.md; rely on both documents and do not duplicate them - expand them to the level of architectural decisions: how exactly the modules are laid out in code, how data flows through the system, where processes and artifacts live. The document must cover the following sections: system overview, logical modules with their responsibilities, single-game data flow from the user's request to the final event, data stores, maintenance mode scenario, repository structure, hosting and infrastructure (reverse proxy, systemd units, CI/CD workflows), security model, backup and restore, and an explicit list of what is intentionally not included in the MVP. Diagrams are mandatory - all diagrams are built with mermaid: architectural graphs via graph TB or graph LR, data flows via sequenceDiagram, and where appropriate - state or flowchart. No ASCII-art diagrams.

### plan.md

Produce the file ./docs/plan.md - the project development plan shaped as a set of stories. The product context is captured in ./docs/about.md, the technical specification in ./docs/spec.md, and the architecture in ./docs/architecture.md; rely on all three documents and expand them into vertical slices of work where every story ends with a working, verifiable artifact. For the current stage of the project it is enough to produce 4 stories, executed strictly in sequence; choose them yourself based on a reasonable scope breakdown. The document must cover the following sections: a short intro explaining the approach (vertical slices, sequential execution), a testing strategy grounded in the rules from spec.md, the TDD rule (TDD is mandatory starting from the second story; the first bootstrap story is the exception), a shared progress checklist across all stories, and for each story: goal, acceptance criteria, final artifact, verification method, and task list. At the end - MVP completion criteria.

### AGENTS.md && CLAUDE.md

Generate CLAUDE.md in Claude Code:

```sh
/init
```

And copy it as AGENTS.md

### Openspec

```sh
openspec init
```
