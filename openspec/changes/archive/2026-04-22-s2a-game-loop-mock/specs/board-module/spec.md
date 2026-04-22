## ADDED Requirements

### Requirement: Deterministic seeded board generator

The backend SHALL expose a `generateBoard(seedDate)` function that returns a full ship layout derived deterministically from a `YYYY-MM-DD` seed string. The returned layout MUST contain exactly five ships in fleet order (`carrier` length 5, `battleship` length 4, `cruiser` length 3, `submarine` length 3, `destroyer` length 2) matching the shared fleet constant. Every ship's cells MUST lie inside the 10x10 board. No two ships MUST occupy the same cell. No two distinct ships MUST occupy cells that are 8-neighborhood-adjacent (the "no touching" rule from `docs/spec.md` 3.1). The function MUST be a pure function of the seed: calling it twice with the same seed MUST produce structurally identical output. The underlying PRNG MUST be seeded from a deterministic transform of the seed string (SHA-256 prefix reduced to four u32 words feeding `xoshiro128**`) so output is byte-stable across Bun versions. Any internal helper that maps PRNG output into a bounded integer range MUST reject non-positive upper bounds with a `RangeError` rather than silently attempting modulo-by-zero.

#### Scenario: Same seed produces the same layout

- **WHEN** `generateBoard("2026-04-21")` is invoked twice in the same process or across separate processes
- **THEN** the two returned layouts are structurally identical (same ship order, same cells, same orientations)

#### Scenario: Fleet composition matches shared constant

- **WHEN** `generateBoard` returns a layout for any seed
- **THEN** the `ships` array has length 5 and, in order, contains entries whose `(name, length)` pairs are `(carrier, 5)`, `(battleship, 4)`, `(cruiser, 3)`, `(submarine, 3)`, `(destroyer, 2)`, each with a `cells` array whose length equals `length`

#### Scenario: Every ship cell is in range

- **WHEN** `generateBoard` returns a layout for any seed
- **THEN** for every cell `{row, col}` in every ship, `0 <= row < 10` and `0 <= col < 10`

#### Scenario: Ships do not overlap or touch across 50 consecutive seeds

- **WHEN** `generateBoard` is invoked for each of the 50 `YYYY-MM-DD` seeds starting at `2026-01-01`
- **THEN** for each layout, (a) every cell appears in at most one ship; (b) for every pair of distinct ships, no cell of the first ship is an 8-neighborhood neighbor of any cell of the second ship

#### Scenario: seedDate is round-tripped onto the layout

- **WHEN** `generateBoard("2026-04-21")` returns a layout
- **THEN** the layout's `seedDate` field equals the string `"2026-04-21"`

### Requirement: Shared SVG board template consumed by server and client

The `@battleship-arena/shared` package SHALL export a pure function `renderBoardSvg(view: BoardView): string` that maps a 100-cell `BoardView` (row-major, cells drawn from `"unknown" | "miss" | "hit" | "sunk"`) to a deterministic SVG string. The SVG MUST have a fixed viewBox of `0 0 640 640` with 64px cells, MUST NOT contain any `<text>` element (the model input never carries coordinate text per `docs/spec.md` 3.3), and MUST render each cell state with closed geometry only (rectangles, circles, rotated rectangles) so the downstream PNG converter produces byte-stable output. The same template MUST be imported and rendered directly by the web `BoardView` island to keep the server-facing model view and the user-facing viewer view byte-identical.

#### Scenario: SVG omits text nodes

- **WHEN** `renderBoardSvg` is called for any BoardView
- **THEN** the returned string does not contain the substring `<text`

#### Scenario: Same input renders identical output

- **WHEN** `renderBoardSvg` is called twice with the same BoardView
- **THEN** the two returned strings are byte-identical

#### Scenario: Cells are placed in row-major order

- **WHEN** `renderBoardSvg` is called with a BoardView whose cell at index 0 (row 0, col 0) is `hit` and whose cell at index 99 (row 9, col 9) is `miss`
- **THEN** the SVG contains a `data-cell="0-0"` attribute before a `data-cell="9-9"` attribute

### Requirement: Board PNG renderer via @resvg/resvg-js

The backend SHALL expose a `renderBoardPng(view: BoardView): Uint8Array` function that calls the shared `renderBoardSvg` to produce the SVG string and converts it to a PNG via `@resvg/resvg-js`. The returned bytes MUST begin with the PNG signature (`0x89 0x50 0x4E 0x47`). The renderer MUST produce byte-identical output for structurally identical inputs within a single process and across repeated process launches on the same runtime and platform. A 4-to-5 fixture suite of reference PNGs committed under `backend/tests/fixtures/board-png/` MUST be compared byte-for-byte against live output as part of the unit-test surface.

#### Scenario: Emits valid PNG signature

- **WHEN** `renderBoardPng(view)` is called for any BoardView
- **THEN** the first four bytes of the returned buffer are `0x89 0x50 0x4E 0x47`

#### Scenario: Same input produces byte-identical PNG

- **WHEN** `renderBoardPng` is called twice with the same BoardView in the same process
- **THEN** the two returned byte buffers compare equal

#### Scenario: Fixture snapshot guards against drift

- **WHEN** the unit test suite runs `renderBoardPng` against the 4-to-5 committed BoardView fixtures under `backend/tests/fixtures/board-png/`
- **THEN** the returned bytes compare equal to the committed fixture; a drift fails the test until the fixture is re-blessed in the same PR

### Requirement: No caching, no shared state in the renderer pipeline

Both `renderBoardSvg` and `renderBoardPng` MUST be stateless. They MUST NOT maintain module-level caches keyed by view hash, seed date, or any other input. They MUST NOT perform I/O. They MUST be safe to call concurrently from multiple async contexts.

#### Scenario: No observable module state

- **WHEN** either function is called after a long series of prior calls
- **THEN** its output depends only on its argument, not on the call history
