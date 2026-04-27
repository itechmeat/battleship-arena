## Context

The backend is a Bun/Hono TypeScript service with feature areas for API routes, run lifecycle, database queries, provider adapters, pricing, board rendering, and OpenAPI generation. Current behavior is well covered by integration tests, but several files have accumulated mixed responsibilities:

- `backend/src/runs/engine.ts` combines game loop orchestration, shot classification, board-view calculation, provider failure handling, state totals, database writes, and event emission.
- `backend/src/api/runs.ts` combines route validation, response formatting, SSE terminal replay, live stream queueing, and manager orchestration.
- `backend/src/db/queries.ts` combines raw SQL/query methods, row mapping, leaderboard aggregation, and persistence DTO construction.
- `backend/src/providers/*` contains common patterns for HTTP failure translation, response parsing, reasoning-mode decisions, and model lookup that should be shared where appropriate.
- `backend/src/pricing/catalog.ts` and `backend/src/api/openapi.ts` are data/schema-heavy files that are correct but hard to scan.

The user explicitly requested a full backend refactor through a new OpenSpec change, preserving project logic while improving readability, organization, and maintainability.

## Goals / Non-Goals

**Goals:**

- Refactor the whole backend surface area, not only one bug path or provider detail.
- Preserve existing behavior, API contracts, DB schema, benchmark determinism, provider semantics, and tests.
- Extract cohesive modules around real responsibilities: run lifecycle, API validation/formatting/streaming, database mapping/aggregation, provider support, pricing, and OpenAPI schemas.
- Keep changes incremental enough that tests identify regressions quickly.
- Add focused unit tests for newly extracted pure logic where useful.
- Keep abstractions plain and local: functions, simple services, small DTOs, and explicit dependencies.

**Non-Goals:**

- No new product behavior, UI changes, database migrations, external dependencies, auth system, queue system, or provider capability expansion.
- No rewrite to another framework or architectural style.
- No speculative interfaces that are not exercised by the current codebase.
- No changes to real-token spending behavior or benchmark shot policy.

## Decisions

### Decision 1: Use a behavior-preserving modular extraction, not a rewrite

The refactor will extract existing logic into smaller modules while keeping current exported entry points stable where other packages/tests consume them. This keeps the blast radius manageable and allows each step to be checked by existing tests.

Alternatives considered:

- Full rewrite of run/API/database layers: rejected because it risks behavior drift and would make regression diagnosis harder.
- Only formatting and file splitting: rejected because it would not address mixed responsibilities.

### Decision 2: Keep feature-folder ownership

New modules will live beside the code they support:

- `backend/src/runs/*` for run lifecycle services.
- `backend/src/api/*` and `backend/src/api/openapi/*` or `backend/src/api/schemas/*` for API helpers and schemas.
- `backend/src/db/*` for row mappers and query aggregation helpers.
- `backend/src/providers/*` for provider adapter support utilities.
- `backend/src/pricing/*` and `backend/src/pricing/data/*` for pricing logic and provider catalog data.

Alternatives considered:

- A global `lib/` or `utils/` folder for everything: rejected because it tends to hide ownership and become a dumping ground.
- Deep class-based service layers: rejected unless a class already clarifies lifecycle or dependency ownership.

### Decision 3: Extract pure logic before orchestration

For each large module, pure logic will be extracted first because it is easiest to test and least likely to change behavior. Orchestration code will then delegate to those helpers while keeping control flow recognizable.

Expected order:

1. Provider support utilities already started with provider HTTP error translation.
2. Runs engine helpers: board analysis, shot classification, provider error finalization, state/totals helpers.
3. API helpers: request validation, response formatting, SSE replay/stream utilities.
4. Database helpers: row mapping and leaderboard aggregation support.
5. Pricing catalog split and calculator/repository helpers.
6. OpenAPI schema/domain split.

### Decision 4: Treat tests as the behavior contract

Existing tests remain the primary contract. New tests will be added when extraction creates pure units that were only indirectly tested before, especially shot classification, API validation, provider error translation, row mapping, and leaderboard aggregation helpers.

Alternatives considered:

- Rely only on integration tests: rejected because extraction should make formerly hidden logic easier to test directly.
- Rewrite broad tests around new internals: rejected because internals should not become the public contract.

### Decision 5: Keep previous provider error work as part of this broader refactor

The provider error translation utility already created is valid backend refactor work, but it is only one part of the full scope. The new change absorbs it as the provider-support slice rather than treating it as the completed refactor.

## Risks / Trade-offs

- **Risk: Behavior drift in game loop or SSE streaming** -> Mitigation: extract pure helpers first, keep integration tests running frequently, and avoid changing event payload construction semantics.
- **Risk: Over-abstraction** -> Mitigation: introduce a module only when it removes duplication or isolates a responsibility already present in the code.
- **Risk: Large diff becomes hard to review** -> Mitigation: implement in phases and keep task checkboxes aligned with each feature area.
- **Risk: Formatting churn obscures logic changes** -> Mitigation: use existing formatter, keep edits localized, and summarize changed areas clearly.
- **Risk: Existing dirty worktree includes prior unrelated changes** -> Mitigation: record the starting `git status`, leave unrelated uncommitted files untouched, and keep each refactor edit scoped to the files required by this change.

## Migration Plan

1. Validate current baseline with focused/backend tests where needed.
2. Implement refactor tasks area by area.
3. After each area, run focused tests for that area and mark tasks complete.
4. At the end, run full backend tests, format, typecheck, OpenSpec validation, and code checker.
5. No deployment migration or database rollout is required because public contracts and schema are preserved.

## Open Questions

None currently blocking. If an extraction reveals that behavior is ambiguous or under-tested, add focused tests before continuing that extraction.
