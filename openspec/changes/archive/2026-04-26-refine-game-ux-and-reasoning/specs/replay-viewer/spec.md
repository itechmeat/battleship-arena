## ADDED Requirements

### Requirement: Replay layout matches live game width

The replay page SHALL use the same maximum content width as the main live game page so both views feel like the same surface.

#### Scenario: Replay and live page share width

- **WHEN** live and replay pages are rendered at the same viewport width
- **THEN** their main content columns have the same computed max width

### Requirement: Replay progress sits above controls and disables while playing

The replay progress bar SHALL be rendered above the playback controls. While replay status is `playing`, the progress input MUST be disabled.

#### Scenario: Progress before controls

- **WHEN** the replay player is rendered
- **THEN** the progress bar appears before the Play/Step/Speed controls in document order

#### Scenario: Progress disabled during playback

- **WHEN** the user presses Play and replay status becomes `playing`
- **THEN** the progress bar is disabled until playback is paused or completed

### Requirement: Replay reuses live-game UI primitives

Replay SHALL reuse the live game screen's board, metrics, and layout primitives where practical so replay and live game screens remain visually consistent.

#### Scenario: Replay board and metric styling match live

- **WHEN** a user compares `/runs/:id` and `/runs/:id/replay`
- **THEN** board and metric surfaces use the same component styling patterns
