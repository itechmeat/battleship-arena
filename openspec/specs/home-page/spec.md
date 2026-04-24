# home-page Specification

## Purpose

Describes the mobile-first home page at `/` that anchors the public product: an inline SVG preview of today's empty board, a primary "Start a run" CTA pointing at `/play`, and a hydrated Solid `Leaderboard` island showing the day's top results and an all-time view. Audience: first-time visitors, returning spectators, and Playwright smoke coverage. The preview never leaks ship positions, never issues a network request for the SVG, and preserves the shared `renderBoardSvg` "no-text-children" invariant by placing axis labels as HTML siblings. Out of scope: provider pricing, run-start flow (lives on `/play`), and any per-run detail (lives on `/runs/:id` and `/runs/:id/replay`).

## Requirements

### Requirement: Home page renders an inline empty-grid preview of today's board

`web/src/pages/index.astro` SHALL render the today's-board preview as an inline 10x10 empty grid. The grid cells MUST be produced by the shared `renderBoardSvg` helper (whose output is a text-less SVG per `shared-contract`). Axis labels (A-J for columns, 1-10 for rows) MUST be rendered as HTML siblings of the SVG (for example `<span>` elements in flanking rows and columns), not as `<text>` elements inside the SVG, so the shared helper's "no `<text>` elements" invariant is preserved. The first-load HTML MUST contain both the SVG element and the label siblings before any client-side hydration. The preview MUST NOT issue any network request and MUST NOT render an `<img>` element pointing at `/api/board`.

#### Scenario: First-load HTML contains the grid SVG plus HTML axis labels before hydration

- **WHEN** a client issues `GET /` and inspects the response body before any JavaScript runs
- **THEN** the HTML contains an `<svg>` element rendering a 10x10 empty grid AND separate HTML elements (not `<text>` inside the SVG) carrying the axis labels A-J for columns and 1-10 for rows

#### Scenario: SVG element contains no text children

- **WHEN** the inline SVG produced for the preview is inspected
- **THEN** it contains no `<text>` child element, preserving the shared-contract invariant for `renderBoardSvg`

#### Scenario: No img pointing at /api/board

- **WHEN** the first-load HTML of `/` is inspected
- **THEN** it contains no `<img>` element whose `src` attribute references `/api/board`

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

The home page layout SHALL be a vertical stack at every viewport width: header, today's board preview, leaderboard section. On desktop the stack MUST be constrained to a max-width column. No side-by-side layouts and no sticky columns are permitted.

#### Scenario: Vertical stack preserved at 375px width

- **WHEN** the home page is rendered at a viewport width of 375px
- **THEN** the three sections appear in document order stacked vertically with no horizontal overflow

#### Scenario: Vertical stack preserved at desktop width

- **WHEN** the home page is rendered at a viewport width of 1440px
- **THEN** the three sections remain stacked vertically inside a max-width column

### Requirement: Seed date caption shows today's UTC date

The today's-board preview SHALL display a caption in the form `Seed <YYYY-MM-DD> UTC` where `<YYYY-MM-DD>` matches the current UTC date at the time of render.

#### Scenario: Caption matches UTC date

- **WHEN** the home page is rendered on `2026-04-24` UTC
- **THEN** the caption text contains `2026-04-24` and the literal substring `UTC`
