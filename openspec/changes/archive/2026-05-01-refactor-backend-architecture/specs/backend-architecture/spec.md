## ADDED Requirements

### Requirement: Backend Refactor Preserves Public Behavior

The backend SHALL be refactored without intentional changes to HTTP routes, response shapes, SSE event payloads, database schema, provider request semantics, run outcomes, leaderboard semantics, or board generation behavior.

#### Scenario: Existing backend tests remain valid

- **WHEN** the backend refactor is complete
- **THEN** the existing backend unit and integration tests SHALL pass without rewriting expected behavior to match a new contract

#### Scenario: No incidental API or database contract changes

- **WHEN** backend modules are reorganized
- **THEN** shared wire types, OpenAPI schemas, migrations, and API handlers SHALL continue to describe the same external contract unless a separate behavior change is explicitly specified

### Requirement: Backend Modules Have Clear Responsibilities

The backend SHALL separate large mixed-responsibility modules into cohesive services, utilities, mappers, and constants while keeping module boundaries simple and discoverable.

#### Scenario: Run lifecycle concerns are separated

- **WHEN** run lifecycle code is refactored
- **THEN** shot classification, board analysis, provider error handling, state aggregation, turn support, and persistence orchestration SHALL be represented by focused modules instead of being concentrated in one large engine file

#### Scenario: API concerns are separated

- **WHEN** API router code is refactored
- **THEN** request validation, response formatting, SSE event streaming/replay, and route registration SHALL be represented by focused modules instead of being embedded directly in route handlers

#### Scenario: Database concerns are separated

- **WHEN** database query code is refactored
- **THEN** row mapping, leaderboard aggregation, and query methods SHALL be separated enough that mapping and aggregation logic can be tested or reasoned about without reading every SQL call site

#### Scenario: Provider concerns are separated

- **WHEN** provider adapter code is refactored
- **THEN** HTTP transport error translation, response parsing, model/reasoning resolution, and provider-specific request construction SHALL use shared helpers where behavior is common and provider-local code where behavior is genuinely provider-specific

#### Scenario: Pricing and OpenAPI maintenance concerns are separated

- **WHEN** pricing catalog and OpenAPI code are refactored
- **THEN** large data/schema definitions SHALL be organized by domain while preserving existing exported API surfaces needed by consumers

### Requirement: Refactor Adds Focused Coverage For Extracted Logic

The backend refactor SHALL add or retain focused tests for newly extracted logic where behavior was previously only covered indirectly.

#### Scenario: Extracted pure logic has unit coverage

- **WHEN** logic is extracted from large modules into pure helpers or services
- **THEN** tests SHALL cover representative success and error cases for that extracted logic

#### Scenario: Integration coverage still protects workflows

- **WHEN** internal module boundaries change
- **THEN** existing integration tests for runs, API routes, provider adapters, database queries, and leaderboard behavior SHALL continue to pass

### Requirement: Refactor Keeps Complexity Proportional

The backend refactor SHALL prefer small functions, plain data objects, and direct dependencies over framework-heavy abstractions or speculative interfaces.

#### Scenario: No unnecessary abstractions are introduced

- **WHEN** code is extracted
- **THEN** the new module SHALL remove real complexity, reduce meaningful duplication, or clarify ownership without adding unused extension points

#### Scenario: Existing imports remain understandable

- **WHEN** a developer opens a backend feature area
- **THEN** related logic SHALL be grouped in predictable feature folders and named by responsibility rather than implementation novelty
