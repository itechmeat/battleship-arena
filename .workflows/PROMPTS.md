# Prompts

## Short prompts

I have updated the documents - review them again.

Check linters and TypeScript errors. If you find any - fix them autonomously per the rules.

Based on GIT DIFF, suggest a branch name and a commit message, using the commits skill without exception.

Suggest a commit message for this fix, using the commits skill.
No deep analysis, no extra queries - you remember what you just fixed. Do it quickly.

## Prompts log

refactor/backend-architecture-provider-errors

feat(backend): refactor architecture and harden provider failures

Refactor the backend into focused API, run lifecycle, database, provider, pricing, and OpenAPI modules while preserving the existing public routes and core game flow.

Add fixed default benchmark seed handling, terminal provider error diagnostics, provider_rate_limited outcome support, safer provider diagnostic redaction, byte-aware text truncation, OpenRouter catalog updates, and focused coverage for newly extracted helpers.

Also update OpenSpec/docs/shared contracts, add the terminal error migration, and surface terminal provider errors in the live game UI.

---

refactor: modularize backend and frontend architecture

Refactor backend run lifecycle, API, database, provider, pricing, and OpenAPI code into focused helper modules while preserving existing behavior.

Refactor frontend islands, Astro pages, API routes, storage, route parsing, and view-model logic into smaller modules with focused unit coverage.

Add OpenSpec changes and tests for the extracted backend and frontend architecture layers.
