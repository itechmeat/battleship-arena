## REMOVED Requirements

### Requirement: Home page renders an inline empty-grid preview of today's board

**Reason**: The empty board preview does not communicate useful product or run state and competes with the leaderboard/start flow.
**Migration**: Remove the home-page board preview and seed caption. Keep board rendering on live and replay pages where it reflects actual run state.

## ADDED Requirements

### Requirement: Home page omits decorative board preview

The home page SHALL NOT render the empty game board preview. The first-load layout MUST focus on product entry and leaderboard information.

#### Scenario: Home page has no board preview

- **WHEN** a client renders `/`
- **THEN** the page does not contain the home-page empty board preview or its seed caption

### Requirement: Home leaderboard exposes reasoning controls

The home-page leaderboard UI SHALL expose a Reasoning filter control and a Reasoning column so users can see and filter reasoning-enabled versus reasoning-disabled cohorts.

#### Scenario: Reasoning filter and column are visible

- **WHEN** the leaderboard island is rendered on the home page
- **THEN** it shows a Reasoning filter control and each row includes a reasoning value column
