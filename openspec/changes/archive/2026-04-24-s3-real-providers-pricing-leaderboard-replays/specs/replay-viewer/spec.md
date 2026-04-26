# replay-viewer Specification

## ADDED Requirements

### Requirement: Replay page loads any archived run, even if still in-flight

`web/src/pages/runs/[id]/replay.astro` SHALL load any run by id and render the `ReplayPlayer` island. On mount the island MUST issue `GET /api/runs/:id` and `GET /api/runs/:id/shots` in parallel. If `outcome === null` (run still in flight), the page MUST display a banner linking to `/runs/:id` live view and still render the shots captured so far.

#### Scenario: Loading state on mount

- **WHEN** the replay page is rendered and the two fetch calls have not yet resolved
- **THEN** the `ReplayPlayer` state is `{ status: "loading", idx: 0, speed: 1 }`

#### Scenario: Idle after data loads

- **WHEN** both fetches resolve with a terminal run and its shots
- **THEN** the state is `{ status: "idle", ..., idx: 0 }`

#### Scenario: In-flight run shows banner and partial shots

- **WHEN** `GET /api/runs/:id` returns a row with `outcome === null` and `GET /api/runs/:id/shots` returns three captured shots
- **THEN** the page renders a banner linking to `/runs/:id` and the player renders those three shots

### Requirement: Replay uses a uniform-tick cadence of round(800 / speed) ms per advance

While the player state is `playing`, the island SHALL advance `idx` by one every `Math.round(800 / speed)` milliseconds: 800 ms at 1x, 400 ms at 2x, 200 ms at 4x. Original per-turn wall-clock durations MUST NOT be reproduced.

#### Scenario: Tick advances idx by 1

- **WHEN** the state is `playing` with `idx = 3` and the reducer receives `{ kind: "tick" }`
- **THEN** the resulting state has `idx === 4` and `status === "playing"` (assuming the run has more shots)

#### Scenario: Reaching shots.length flips to done

- **WHEN** the state is `playing` with `idx = shots.length - 1` and the reducer receives `{ kind: "tick" }`
- **THEN** the resulting state has `idx === shots.length` and `status === "done"`

#### Scenario: Tick on done is a no-op

- **WHEN** the state is `done` and the reducer receives `{ kind: "tick" }`
- **THEN** the state is unchanged

### Requirement: Speed toggle cycles 1x -> 2x -> 4x -> 1x

The speed toggle control SHALL cycle the `speed` field through the sequence `1 -> 2 -> 4 -> 1`. The reducer MUST accept `{ kind: "speed"; speed: 1 | 2 | 4 }` and update only the `speed` field.

#### Scenario: Speed cycles in order

- **WHEN** the UI invokes the toggle three times starting from `speed = 1`
- **THEN** the resulting speed values after each invocation are `2`, `4`, `1` in order

#### Scenario: Speed change preserves other state

- **WHEN** the state is `{ status: "playing", idx: 5, speed: 1, ... }` and the reducer receives `{ kind: "speed", speed: 2 }`
- **THEN** the resulting state has `status === "playing"`, `idx === 5`, and `speed === 2`

### Requirement: Scrubber supports random-access seeking clamped to [0, shots.length]

The reducer SHALL accept `{ kind: "seek"; idx: number }` and set the new `idx` to the clamped value `max(0, min(shots.length, idx))`. Seeks MUST preserve `status`, `speed`, `run`, and `shots`.

#### Scenario: Seek clamps below 0

- **WHEN** the state has `shots.length === 10` and the reducer receives `{ kind: "seek", idx: -5 }`
- **THEN** the resulting `idx` equals `0`

#### Scenario: Seek clamps above length

- **WHEN** the state has `shots.length === 10` and the reducer receives `{ kind: "seek", idx: 99 }`
- **THEN** the resulting `idx` equals `10`

#### Scenario: Seek inside range sets value exactly

- **WHEN** the state has `shots.length === 10` and the reducer receives `{ kind: "seek", idx: 4 }`
- **THEN** the resulting `idx` equals `4`

### Requirement: Play from done state auto-rewinds to idx=0

When the reducer receives `{ kind: "play" }` while the state is `done`, it SHALL set `idx = 0` and flip `status` to `playing`.

#### Scenario: Play from done rewinds to 0

- **WHEN** the state is `{ status: "done", idx: shots.length, speed: 2, ... }` and the reducer receives `{ kind: "play" }`
- **THEN** the resulting state has `status === "playing"`, `idx === 0`, and `speed === 2`

### Requirement: replayReducer is pure and timing is owned by the Solid island

`web/src/islands/replayReducer.ts` SHALL be a pure function with signature `(state, action) => state`. It MUST NOT call `setInterval`, `setTimeout`, `fetch`, or any other side-effecting API. All timing and network effects MUST be owned by the `ReplayPlayer` island.

#### Scenario: Reducer has no side effects

- **WHEN** the reducer is invoked with any valid state and action
- **THEN** no timer is scheduled, no network request is issued, and no global state is mutated

#### Scenario: StepForward at end is a no-op

- **WHEN** the state has `idx === shots.length` and the reducer receives `{ kind: "stepForward" }`
- **THEN** the state is unchanged

#### Scenario: StepBack at 0 is a no-op

- **WHEN** the state has `idx === 0` and the reducer receives `{ kind: "stepBack" }`
- **THEN** the state is unchanged
