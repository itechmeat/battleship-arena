# home-page Specification

## Purpose

Describes the mobile-first home page at `/` that anchors the public product: a primary "Start a run" CTA pointing at `/play` and a hydrated Solid `Leaderboard` island showing the day's top results and an all-time view. Audience: first-time visitors, returning spectators, and Playwright smoke coverage. The home page intentionally omits decorative board previews so first-load attention stays on starting a run and comparing leaderboard cohorts. Out of scope: provider pricing, run-start flow (lives on `/play`), and any per-run detail (lives on `/runs/:id` and `/runs/:id/replay`).

## Requirements

### Requirement: Home page includes a Start-a-run CTA linking to /play

The home page SHALL render a visible primary call-to-action linking to `/play`. The CTA MUST be present in the first-load HTML.

#### Scenario: CTA navigates to /play

- **WHEN** a client issues `GET /` and inspects the response body
- **THEN** it contains an anchor or button element whose target resolves to `/play`

### Requirement: Home page mounts the Leaderboard island with client:load

The home page SHALL mount `web/src/islands/Leaderboard.tsx` with `client:load` so leaderboard data fetches begin on hydration. The initial SSR output MUST include a skeleton placeholder for the leaderboard section so layout does not shift after hydration.

#### Scenario: Leaderboard island hydrates on load

- **WHEN** a client loads `/` with JavaScript enabled
- **THEN** the Leaderboard island mounts and issues `GET /api/leaderboard?scope=today` without any user interaction

#### Scenario: SSR skeleton present before hydration

- **WHEN** the first-load HTML of `/` is inspected
- **THEN** it contains a leaderboard-section placeholder element that occupies the same space the hydrated island will fill

### Requirement: Home page layout is a vertical stack at every width

The home page layout SHALL be a vertical stack at every viewport width: header, start-run CTA, leaderboard section. On desktop the stack MUST be constrained to a max-width column. No side-by-side layouts and no sticky columns are permitted.

#### Scenario: Vertical stack preserved at 375px width

- **WHEN** the home page is rendered at a viewport width of 375px
- **THEN** the three sections appear in document order stacked vertically with no horizontal overflow

#### Scenario: Vertical stack preserved at desktop width

- **WHEN** the home page is rendered at a viewport width of 1440px
- **THEN** the three sections remain stacked vertically inside a max-width column

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
