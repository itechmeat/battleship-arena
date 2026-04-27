## ADDED Requirements

### Requirement: Frontend Refactor Preserves Public Behavior

The web frontend SHALL be refactored without intentional changes to public routes, visible page copy, form input semantics, API request payloads, SSE subscription semantics, replay behavior, local-storage key format, service-worker registration behavior, or existing visual styling.

#### Scenario: Existing web tests remain valid

- **WHEN** the frontend refactor is complete
- **THEN** the existing web unit tests SHALL pass without rewriting expectations to a new user-visible contract

#### Scenario: Routes and navigation remain stable

- **WHEN** users navigate through the home page, play page, live run page, and replay page
- **THEN** the route paths and generated links SHALL remain compatible with the current application URLs

### Requirement: Frontend Modules Have Clear Responsibilities

The web frontend SHALL separate large mixed-responsibility islands and pages into cohesive helpers, state reducers, constants, and small rendering components while keeping module boundaries simple and discoverable.

#### Scenario: Start-run concerns are separated

- **WHEN** start-run form code is refactored
- **THEN** catalog selection, mock-provider metadata, local API-key storage, reasoning-mode resolution, budget parsing, and form rendering SHALL be represented by focused modules or functions instead of being concentrated in one large component body

#### Scenario: Live-run concerns are separated

- **WHEN** live game code is refactored
- **THEN** run loading, SSE event-to-shot mapping, shot list merging, terminal diagnostic formatting, page-state labeling, and rendering SHALL be separated enough that pure behavior can be tested without mounting the full component

#### Scenario: Leaderboard and replay concerns are separated

- **WHEN** leaderboard and replay code is refactored
- **THEN** filter serialization, row view-model creation, route-id resolution, replay state reduction, timer interval selection, and rendering SHALL be represented by focused helpers or reducers where they remove duplication or clarify ownership

#### Scenario: Shared browser shell behavior is centralized

- **WHEN** repeated page shell concerns are refactored
- **THEN** service-worker registration flags/scripts and shared document constants SHALL be centralized without changing the rendered route behavior

### Requirement: Refactor Adds Focused Coverage For Extracted Frontend Logic

The frontend refactor SHALL add or retain focused tests for extracted logic that was previously only covered indirectly inside Solid islands or Astro pages.

#### Scenario: Extracted pure helpers have unit coverage

- **WHEN** catalog, storage, error, route, SSE mapping, leaderboard, or replay helper logic is extracted
- **THEN** representative success and edge cases SHALL be covered by web unit tests

#### Scenario: Integration-facing contracts stay covered

- **WHEN** API and SSE client code is reorganized
- **THEN** existing tests for request paths, query parameters, error handling, and SSE payload validation SHALL continue to pass

### Requirement: Refactor Keeps Complexity Proportional

The frontend refactor SHALL prefer small pure functions, feature-local helpers, and direct Solid signals over speculative abstractions or framework-heavy state layers.

#### Scenario: No unnecessary frontend framework layer is introduced

- **WHEN** code is extracted from an island
- **THEN** the new module SHALL remove real complexity, reduce meaningful duplication, or clarify ownership without adding a new state-management framework, router, or unused extension point

#### Scenario: Components remain readable

- **WHEN** a developer opens a Solid island after the refactor
- **THEN** the component SHALL primarily show state wiring and JSX structure, with reusable calculations delegated to named helpers
