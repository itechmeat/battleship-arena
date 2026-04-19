# BattleShipArena

A public, reproducible benchmark that watches LLMs play Battleship under identical conditions, and compares the results honestly over time.

The model is the player. The human is the spectator who brings an API key, picks a provider and an exact model, presses start, and watches the run land shot by shot. Every run is a persistent, shareable replay; the leaderboard is a gallery of those replays.

## Why this exists

Most public LLM benchmarks grade one-shot trivia against a static answer key, leak into training data, and hide the part that actually matters: how a model behaves over many turns, with imperfect information, a visual input, and a strict output contract it must keep honoring or lose the game.

Battleship exposes exactly those behaviors. Spatial reasoning from an image, long-horizon state tracking, calibration under uncertainty, and instruction-following discipline, all in a game anyone can read at a glance. One board is generated per UTC day and is identical for every player in the world that day; scores are pinned to the provider's exact model ID so historical numbers stay meaningful when a model is silently updated behind the same display name.

Full product framing: see [`docs/about.md`](./docs/about.md).

## Status

Pre-implementation. The foundation is done - the product is fully specified, the architecture and the story-level plan are written, and the repository is ready for the first vertical slice of work. No application code has been committed yet.

## Documentation

The four documents below are the source of truth for the project. Read them in this order if you are new to the codebase:

| Document                                         | What it covers                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| [`docs/about.md`](./docs/about.md)               | Product definition: the problem, what the product is and is not, how it is used, key properties |
| [`docs/spec.md`](./docs/spec.md)                 | Technical contract: topology, game rules, data model, HTTP API, provider adapters, testing      |
| [`docs/architecture.md`](./docs/architecture.md) | System architecture: C4-style Mermaid diagrams, module layout, data flow, deployment            |
| [`docs/plan.md`](./docs/plan.md)                 | Development plan: four sequential vertical-slice stories with acceptance criteria and tasks     |

## Tech stack (at a glance)

Runtime and backend: **Bun**, **Hono**, **Drizzle ORM** over **`bun:sqlite`**, **TypeScript**. Frontend: **Astro** with **Solid.js** islands, CSS Modules, no UI-kit dependency. Quality: **oxlint** and **oxfmt**. Infrastructure: single host, **Caddy** reverse proxy, **systemd** units for production and staging. E2E on **Playwright**, staging only.

Minimum versions are floors, not pins - see [`docs/spec.md` §2](./docs/spec.md). Downgrading is forbidden; the project always pins to the latest stable that is greater than or equal to the floor.

## Repository layout

```
.
├── docs/               Project documentation (product, spec, architecture, plan)
├── openspec/           OpenSpec change artifacts (will accumulate as features land)
├── .agents/            Project-local agent skills (installed via `npx skills add ...`)
├── .github/            CI workflows and agent presets
├── oxlint.json         Lint rules
└── .oxfmtrc.json       Formatter config
```

## How this project is built

BattleShipArena is built with AI coding agents (Claude Code and GitHub Copilot) under a deliberately slow, documentation-first process:

1. Product, spec, architecture, and plan documents are authored first, one brainstorm at a time.
2. Each story in [`docs/plan.md`](./docs/plan.md) is turned into an **OpenSpec change**, reviewed by a second model, implemented, self-reviewed, cross-reviewed with superpowers, reviewed by CodeRabbit, and archived.
