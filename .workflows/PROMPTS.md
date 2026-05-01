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

---

Think like a senior interface designer leading an application redesign.

This is the kickoff for a major redesign, paired with the V2 phase-1 scaffold prompt. The change runs through Workflow V2 (`.workflows/WORKFLOW-V2.md`); this feature description only adds the `impeccable` orchestration that V2 does not know about.

Impeccable orchestration:

- Before V2 phase 2 (brainstorm), if `PRODUCT.md` or `DESIGN.md` are missing, empty, or placeholder, run `$impeccable teach` FIRST. That is an interactive interview - 2-3 questions per round, real user answers, never synthesized from this prompt.
- Drive the V2 phase-2 brainstorm via `$impeccable shape`. Record per-page UX/UI decisions into `openspec/changes/[slug]/brainstorm.md` so the openspec proposal in phase 4 derives from a confirmed design brief.
- In V2 phase 8 (build), follow `$impeccable craft` discipline: explicit color strategy, theme reasoning, the AI-slop test, the absolute bans.

Layout changes:

1. The project must be mobile-first. The spec already declares it, but in practice it isn't - the layout just clamps page width. Build mobile-first from the ground up and reflow for desktop or landscape orientation. Per-page details below.

2. Overall visual style: pixel art with bright 16-bit console-era colors.

3. Active game page:
   - Remove the game ID at the top.
   - Render the `Battleship` title smaller as a link to the home page. On the same line, pin an `Abort` button to the right edge.
   - Show the reasoning indicator on the same line as the model name, to the right of the text but not pinned to the page edge - immediately after the text as a clickable icon. Bright when reasoning is enabled, muted when not. Click opens a tooltip explaining what reasoning is and which mode is active.
   - Merge the timers into a single tournament-style scoreboard stretched to the full available width. Lay sections horizontally to save vertical space - the scoreboard is horizontally wide, vertically compact. Rename `Elapsed` to `Game` and `Since shot` to `Shot`. Move shot count and hits into the same scoreboard as `{Hits}/{Shots}/{Errors}` with labels above, matching the timer styling. `Errors` here is the sum of Schema errors, Timeouts, and Invalid coordinates.
   - Place the individual Schema errors, Timeouts, and Invalid coordinates values below the game board as a list `{label}.......{num}` - label on the left, value on the right, dots between them. Title the list `Errors`.
   - Below it, a similar list titled `Cost` with token counts and price.
   - Move the game start date and time to the very bottom of the page as plain text in a regular font, horizontally centered, in the format `2026/04/21 18:23`. Remove the existing date block at the bottom. Remove the `Streaming new turns as they land.` line.
   - In portrait (mobile) orientation the page takes 100% width with no outer margins or shadows. In desktop or landscape orientation the game board sits in the left half and nothing else - everything else goes to the right column in the same order.

4. Finished game page - same as the active game page except:
   - The `Abort` button becomes a `Replay` button with a different color.
   - In the scoreboard, `Shot` becomes `Result` with the corresponding status.

5. Replay page - identical to the game page with the same data; values in the scoreboard update as playback progresses. Differences:
   - Title is `Battleship Replay` where `Battleship` is a link and `Replay` is not. To the right of the title, a `Play`/`Pause` button.
   - Below the game board add a player row with buttons and a progress bar. Buttons are pictogram-only, not text. Layout: `[>][<<]====::=======[>>][x2]`. The progress bar is draggable.

6. Game setup page (`play`) - similar layout to the game page. Details:
   - Remove `Daily seeded benchmark`.
   - Change `Launch a Battleship run` to `Launch a Battle`.
   - Style selectors in the site's overall design.
   - Style the checkbox too, and do not wrap it in an outlined block.
   - Style the inputs as well.
   - Move the `Reasoning models may cost more` text out of the button and place it as a hint next to the reasoning checkbox.
   - Above the launch button add a dynamic note saying that the launch will cost approximately X, with the price depending on token cost for model X at provider Y, and that reasoning is enabled and also affects the cost. The text is computed client-side from the provider/model pricing endpoint.
   - The button label is just `Start`.
   - In landscape orientation a two-column layout is acceptable.

7. The home page needs a full rebuild in the same overall style as the rest of the site.
   - No wide tables - they don't fit on mobile screens. This rule applies project-wide.
   - `BattleShipArena` is rendered as a centered logo.
   - Below it, a `Launch New Battle` button replacing `Start run`.
   - Below that, a table of the 10 most recent games, ideally refreshed dynamically - polling the API every 10 seconds is acceptable (add a new endpoint if needed). Each row shows the model name with a reasoning indicator (same as on the game page), efficiency as `{hits} / {shots}`, and status (playing/finished). The whole row is clickable and links to the game page. Do not wrap the table in a bordered block.
   - Below that, the `Leaderboard` table - up to 10 rows, by default built from all games in the database. Temporarily hide the `Today/All time` filter. Hide the other filters too for now. Columns: `#` (renamed from `Rank`), `Model` with a reasoning indicator, efficiency (same format as the previous table), `Runs`. Rows are not clickable.

Make components reusable to honor DRY. Package the suitable ones as a small internal UI library.
