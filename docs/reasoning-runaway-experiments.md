# Reasoning Runaway Experiments

Date: 2026-04-25

This document records the investigation into OpenCode Go models, especially
`opencode-go/deepseek-v4-flash`, spending most or all of a turn budget on
hidden reasoning and failing to emit a Battleship shot. It is intended as a
restart point for later experiments.

## Problem

BattleShipArena asks an LLM to play Battleship turn by turn. The benchmark is
only meaningful if the model chooses its own moves, keeps the output contract,
and finishes the game with as few shots as it can.

The observed failure mode is different from ordinary bad play:

- the provider returns a successful HTTP response;
- `completion_tokens` are almost entirely `reasoning_tokens`;
- `message.content` is empty or missing;
- the engine records a `schema_error`;
- repeated empty responses end the game as `dnf_schema_errors`, or a long turn
  can burn tokens for close to a minute before a shot appears.

Reasoning cannot simply be disabled. In earlier manual tests, disabling
reasoning made the model shoot worse. The goal is to keep reasoning available
while preventing it from swallowing the whole turn.

## Current Diff Context

This investigation happened on top of a broader uncommitted diff. The most
important context is that the benchmark originally planned to send the board to
the model as an image, but the active implementation moved to a text board
because not every target LLM/provider can accept images. The image path is not
deleted completely; it is kept as a future vision-track fallback.

Input modality changes visible in the current diff:

- `backend/src/board/text-renderer.ts` adds a text renderer for the board.
  It emits a header `ABCDEFGHIJ`, row labels `01` through `10`, and cell symbols:
  `.` for unknown, `o` for miss, `X` for an unsunk hit, and `S` for sunk cells.
- `ProviderCallInput` now carries `boardText`; `boardPng` is optional and marked
  as unused by the active path.
- `runEngine` now builds the current board view with `renderBoardText(...)`
  instead of `renderBoardPng(...)`.
- `openai-compatible.ts` sends plain text user content instead of a multipart
  text plus `image_url` message. The old `image_url` branch is left as a comment
  with instructions for re-enabling it later.

This matters for the reasoning problem because switching from image input to
text input also changed the prompt shape. The prompt now explains the grid text
format and asks for Battleship coordinates like `{"cell":"A1"}` instead of only
the original row/col object. `shared/src/shot-schema.ts` was updated to accept
that `cell` notation while still accepting legacy `{ "row": 0, "col": 0 }`
responses. This made the model's visible JSON easier to express, but did not
solve the hidden-reasoning runaway: when content is emitted it is usually valid;
the bad turns are mostly empty because reasoning consumed the whole output
budget.

Other supporting changes in the diff:

- a per-turn timeout was added in the engine so one provider call cannot hang a
  run indefinitely;
- provider request tests were updated to assert text-board content and absence
  of `data:image/png;base64`;
- prompt tests were added to guard against returning to exhaustive global
  optimization wording;
- OpenCode Go and OpenRouter catalog entries were expanded, including
  `opencode-go/deepseek-v4-flash`;
- the start form was adjusted so the loaded live provider/model catalog replaces
  the injected mock placeholder cleanly.

The main product/spec documentation now tracks the text-board provider path;
the PNG renderer remains only for board previews and the future vision-track
fallback.

## Constraints

- The model must choose the move. The backend must not recommend a specific
  coordinate, otherwise the benchmark no longer measures model play.
- Later emergency-fallback experiments intentionally relax that rule after a
  schema error. Those runs are marked as fallback-assisted and should not be
  compared directly with fully autonomous benchmark runs.
- The game can remove or compress move history if that helps.
- It is acceptable to change prompt shape, request parameters, and telemetry.
- Real runs use the user's OpenCode Go API key and spend real provider budget.
- For experiment scoring, `schema_error` is treated as a spent, unsuccessful
  shot.
- A provider turn longer than one minute is considered an unsuccessful turn and
  should trigger stopping or changing the experiment.
- No git commit was made during this investigation.

## Environment

- Local backend: `http://127.0.0.1:18083`
- Local browser/proxy: `http://127.0.0.1:18082`
- Seed dates used: `2026-04-25`, `2026-04-26`
- Provider: `opencode-go`
- Model: `opencode-go/deepseek-v4-flash`
- Main live run links use `/runs/<runId>` on port `18082`.

Browser HAR files saved during experiments:

- `/tmp/bsa-bounded-prompt-01KQ22W84JTCJTJWRZX7VWE1CD.har`
- `/tmp/bsa-fixed-policy-01KQ23G8G0M4BF309VYAMB16F1.har`
- `/tmp/bsa-512-autonomous-01KQ24353JGMMNF1DG1X0MCMF0.har`
- `/tmp/bsa-minimal-reasoning-01KQ24836SKQCHSFNKTEXEMA00.har`

## External Docs Checked

- OpenRouter reasoning docs say reasoning can be excluded from the returned
  message while still being used internally. They also note that reasoning
  tokens count as output tokens, and that `max_tokens` must leave room for the
  final answer after the reasoning budget.
  <https://openrouter.ai/docs/guides/best-practices/reasoning-tokens>
- OpenRouter parameter docs define `max_tokens`, `response_format`,
  `tool_choice`, and `verbosity`.
  <https://www.openrouter.ai/docs/api/reference/parameters>
- OpenCode Go docs list DeepSeek V4 Flash as an OpenCode Go model. The docs
  currently show DeepSeek V4 Pro/Flash on the `/zen/go/v1/messages` endpoint
  with `@ai-sdk/anthropic`, while some other models use
  `/zen/go/v1/chat/completions`.
  <https://opencode.ai/docs/go/>

The endpoint mismatch is an unresolved variable for OpenCode Go specifically.
It does not invalidate the broader finding that hidden reasoning can consume
the full completion budget, but it should be isolated later.

## Experiment Timeline

### 1. Text-board prompt baseline with large completion budget

Representative run:

- Run: `01KQ216DYWB5TEH6REGQW7BWQZ`
- Link: `http://127.0.0.1:18080/runs/01KQ216DYWB5TEH6REGQW7BWQZ`
- Observed failure: one turn took about `59005ms`, with `tokensOut=4346` and
  `reasoningTokens=4339`, then returned `{"cell":"F5"}`.
- Later, no new shot appeared for more than one minute, so the run was aborted.

Request shape at this point used a very high completion budget
(`max_tokens=16000`) with reasoning enabled. This allowed runaway thinking to
burn a lot of tokens before any visible output.

The board was already being sent as text, not as an image, in these experiments.
That means the runaway cannot be explained by vision input alone.

Conclusion: a guardrail is needed. The model can spend almost all generated
tokens in hidden reasoning before producing a tiny JSON response.

### 2. Bounded reasoning and timeout guard

Changes:

- reduced reasoning-model `max_tokens` from `16000` to `2048`;
- added a per-turn timeout around provider calls, defaulting to `30s`;
- recorded timeout as a transient provider error/schema error so the run can
  continue instead of hanging forever;
- continued using the text board as the active input;
- removed some global fleet-placement wording from the prompt;
- kept reasoning enabled.

Runs:

| Run ID                       | Result              | Notes                                                                                |
| ---------------------------- | ------------------- | ------------------------------------------------------------------------------------ |
| `01KQ229D7WDQV2Z8DT6V9SKTE1` | `dnf_schema_errors` | 5 valid shots, 0 hits, 10 schema errors, `tokensOut=16244`, `reasoningTokens=16205`. |
| `01KQ22JKFW84R2J9TJK6MX2T6T` | `dnf_schema_errors` | 4 valid shots, 3 hits, 6 schema errors, `tokensOut=15359`, `reasoningTokens=15331`.  |
| `01KQ22W84JTCJTJWRZX7VWE1CD` | `dnf_schema_errors` | 6 valid shots, 3 hits, 5 schema errors, `tokensOut=15595`, `reasoningTokens=15553`.  |

The cap protected against extremely long turns, but did not stop reasoning from
filling the whole completion. Several failures were empty responses with all
available output tokens used as reasoning.

Conclusion: `max_tokens=2048` is a budget guard, not a behavior fix.

### 3. Remove explicit shot history and use a fixed policy prompt

Hypothesis: recent-shot history and open-ended optimization language were
encouraging long planning. The board already encodes previous hits/misses, so
the separate recent-shot text could be removed.

Changes:

- removed `Your last ...` and `This is your first shot...` from provider user
  content;
- added `No separate shot history is provided; use only the current board symbols.`;
- changed the system prompt to a fixed policy:
  - if there is an `X`, fire at the first adjacent unknown in a fixed order;
  - otherwise scan unknown cells in a fixed pattern;
- kept `max_tokens=2048` and reasoning enabled.

Run:

- Run: `01KQ23G8G0M4BF309VYAMB16F1`
- Link: `http://127.0.0.1:18082/runs/01KQ23G8G0M4BF309VYAMB16F1`
- Outcome: `aborted_viewer`
- Metrics: 10 valid shots, 3 hits, 3 schema errors, `tokensOut=16907`,
  `reasoningTokens=16837`, cost `18223` micros.
- Pattern: after the first empty `2048/2048` reasoning response, the model
  recovered and made several valid shots. Later it again produced empty
  `2048/2048` responses.

Conclusion: removing history helped validity, but the fixed policy did not
control hidden reasoning. It also risks making the benchmark too much about
following our strategy rather than finding good moves.

The useful part of this experiment was the input-history change, not the fixed
policy. The board itself is enough to carry prior misses, hits, and sunk cells.
Keeping a separate prose history increases prompt surface area and may invite
the model to reconstruct a global plan.

### 4. Abandoned branch: backend-recommended shot

I briefly started a branch of tests where the backend would compute a
recommended legal shot and the model would only return it as JSON. This would
likely reduce reasoning usage, but it violates the benchmark goal because the
model would no longer choose its own move.

This branch was abandoned after clarification. It should not be resumed unless
the product goal changes from "model plays Battleship" to "model validates a
server strategy", which is a different benchmark.

### 5. Autonomous prompt with `max_tokens=512`

Hypothesis: a smaller completion cap would stop long thinking while preserving
autonomous move choice.

Changes:

- removed the fixed scan policy;
- kept the board as the only move history;
- used a short heuristic prompt:
  - `Use one short heuristic pass`;
  - `Do not enumerate possible boards`;
  - `Do not attempt exhaustive global optimization`;
  - `Return one JSON object immediately`;
- reduced reasoning-model `max_tokens` to `512`.

Run:

- Run: `01KQ24353JGMMNF1DG1X0MCMF0`
- Link: `http://127.0.0.1:18082/runs/01KQ24353JGMMNF1DG1X0MCMF0`
- Outcome: `dnf_schema_errors`
- Metrics: 1 valid shot, 0 hits, 5 schema errors, `tokensOut=2911`,
  `reasoningTokens=2904`, cost `4520` micros.
- Pattern: first shot was valid (`E5`), then every failed turn used
  `tokensOut=512` and `reasoningTokens=512` with empty `rawResponse`.

Conclusion: this made the problem worse. A smaller total output cap can starve
the final JSON because hidden reasoning consumes the entire cap.

### 6. Autonomous prompt with `reasoning.effort=minimal`

Hypothesis: keep enough total budget for a final answer, but request lower
reasoning intensity.

Changes:

- restored reasoning-model `max_tokens` to `2048`;
- sent `reasoning: { effort: "minimal", exclude: true }`;
- sent `verbosity: "low"`;
- kept the short autonomous heuristic prompt;
- kept separate shot history disabled.

Run:

- Run: `01KQ24836SKQCHSFNKTEXEMA00`
- Link: `http://127.0.0.1:18082/runs/01KQ24836SKQCHSFNKTEXEMA00`
- Outcome: `dnf_schema_errors`
- Metrics: 11 valid shots, 5 hits, 5 schema errors, `tokensOut=22089`,
  `reasoningTokens=22012`, cost `23031` micros, duration `299425ms`.
- Useful sequence:
  - `E5` miss: `371/364`, `6092ms`;
  - `F6` miss: `1033/1026`, `14755ms`;
  - `C5` hit: `1917/1910`, `25834ms`;
  - `C4` miss: `2024/2017`, `27953ms`;
  - `C6`, `C7`, `C8`, `C9` found and sank a ship;
  - after `C9` sunk, turns 11-15 were empty `2048/2048` reasoning-only
    schema errors.

Conclusion: `minimal` improved early validity compared with the `512` cap, but
it did not provide hard control. The model still repeatedly consumed the whole
`2048` token budget as hidden reasoning after a sunk ship.

### 7. OpenCode Go continuation: parser, endpoint, recovery, and post-sink tests

This continuation used the existing local ports `18082` and `18083`. No extra
server variants were started; stuck runs were aborted through the existing API.

Changes and probes:

- Added a shared provider user-prompt builder so OpenRouter and OpenCode Go use
  the same text-board prompt shape.
- Removed concrete coordinate examples from the prompt and kept the final shape
  as `{"cell":"<cell>"}` to reduce prompt-copying.
- Added a stricter per-turn final-answer reminder and a recovery reminder after
  schema errors.
- Added a post-sink reminder: after a `sunk`, treat `S` cells as finished and
  resume exploration among `.` cells.
- Updated `shared/src/shot-schema.ts` to accept zero-padded cell notation such
  as `F04`, `C06`, and `C09`, matching the board row labels `01` through `10`.
- Implemented an optional OpenCode Go `/zen/go/v1/messages` adapter path for
  docs-aligned DeepSeek experiments, but restored the active catalog route to
  `/zen/go/v1/chat/completions` because `/messages` did not improve the
  reasoning-only empty-response failure.
- Probed tool/function calling and JSON-schema structured output. In this
  provider/model route they were unavailable or ineffective for the goal.

Useful conclusions from this group:

- The endpoint mismatch was not the root cause. Both chat completions and the
  Anthropic-style messages route can return empty responses with all output
  tokens consumed by hidden reasoning.
- The zero-padded parser fix was high value. Several responses that previously
  became schema errors (`F04`, `C06`, `C09`, `F06`) are now valid shots.
- Removing the fleet list made recovery worse; keeping remaining ship lengths
  helped the model regain valid play after misses/hits.
- Post-sink wording helped partially. The model no longer always loops on the
  sunk ship, but it can still enter empty reasoning-only runs after returning to
  exploration.

Representative post-sink control run:

- Run: `01KQ28CCHPPHPSDQMB4K9D98MP`
- Link: `http://127.0.0.1:18082/runs/01KQ28CCHPPHPSDQMB4K9D98MP`
- Request shape: chat completions, `max_tokens=2048`, zero-padded parser,
  strict/recovery prompt, post-sink reminder.
- Outcome: `dnf_schema_errors`.
- Metrics: 17 recorded turns, 6 engine-counted shots, 11 schema-error turns,
  3 hits, 1 sunk, `tokensOut=29007`, `reasoningTokens=28965`, cost `29414`
  micros, 0 turns over one minute.
- Pattern: the model sank `F3`, then made one valid post-sink exploration shot
  (`A10`), then ended in five empty `2048/2048` schema-error turns.

Conclusion: with `2048`, the model can recover briefly, but the cap often still
starves final JSON after post-sink exploration.

### 8. OpenCode Go chat with `max_tokens=4096`

Change:

- Added a provider-specific OpenCode Go override so reasoning models on the
  chat-completions route use `max_tokens=4096`. OpenRouter kept the shared
  `2048` default.

Run:

- Run: `01KQ28TD8WHGB5G631MKEQSA3S`
- Link: `http://127.0.0.1:18082/runs/01KQ28TD8WHGB5G631MKEQSA3S`
- Outcome: `aborted_viewer`.
- Metrics: 14 recorded turns, 10 engine-counted shots, 4 schema-error turns,
  5 hits, 1 sunk, `tokensOut=30486`, `reasoningTokens=30416`, cost `29160`
  micros, 0 turns over one minute.
- Pattern: the larger budget immediately helped. Early turns that previously
  would have ended empty returned valid shots such as `F06`, `C05`, `C04`,
  `C6`, `C7`, `C8`, and the model sank `C9`. After `J10`, it produced three
  empty `4096/4096` turns in a row, so the run was stopped.

Conclusion: `4096` is materially better than `2048` for this model because some
valid turns need more than 2048 reasoning/output tokens. It is still not a hard
fix: empty `4096/4096` turns remain and are close to the one-minute cutoff.

### 9. Emergency fallback after repeated schema errors

Change:

- Added an emergency prompt after 2 consecutive schema errors. It computes the
  first `.` cell from the text board and asks the model to return that exact
  JSON object.

Run:

- Run: `01KQ299JBN2KE6GPB3PJQ60T3Y`
- Link: `http://127.0.0.1:18082/runs/01KQ299JBN2KE6GPB3PJQ60T3Y`
- Outcome: `aborted_viewer`.
- Metrics: 25 recorded turns, 15 engine-counted shots, 10 schema-error turns,
  2 invalid-coordinate turns, 3 hits, 1 sunk, `tokensOut=66308`,
  `reasoningTokens=66203`, cost `61197` micros, 0 turns over one minute.
- Pattern: the fallback could break schema-error series. For example, after two
  empty turns it returned `B1`, and later returned `C1`. However, the run
  degraded into slow scan-like play and duplicate-cell mistakes (`F4` after
  `F04`, `E6` repeated). It was stopped as too slow and too low-progress.

Conclusion: exact fallback after 2 schema errors prevents immediate
`dnf_schema_errors`, but it is too late and too expensive. It also changes the
benchmark semantics because the backend is now selecting fallback cells.

### 10. Emergency fallback after the first schema error

Changes:

- Emergency exact fallback now activates after the first schema error instead
  of waiting for two consecutive failures.
- The user prompt now explicitly says legal unknown cells are exactly `.` and
  cells marked `o`, `X`, or `S` are already used and illegal.

Run:

- Run: `01KQ2A6CZR7Q711ENYB0DJHH21`
- Link: `http://127.0.0.1:18082/runs/01KQ2A6CZR7Q711ENYB0DJHH21`
- Outcome: `aborted_viewer`.
- Metrics: 26 recorded turns, 18 engine-counted shots, 8 schema-error turns,
  0 invalid-coordinate turns, 3 hits, 1 sunk, `tokensOut=62346`,
  `reasoningTokens=62219`, cost `59155` micros, 0 turns over one minute.
- Pattern: this was the best fallback-assisted control so far. The model sank
  `F3`; post-sink exploration continued; every schema error counted as a spent
  bad turn, and the following fallback often returned a legal row-major cell
  (`B1`, `C1`, `D1`, `E1`, `F1`, `G1`, `H1`). The run still became too slow and
  low-progress: after 26 recorded turns only one ship was sunk.

Conclusion: first-error fallback is better than second-error fallback because it
prevents most consecutive empty runs, but it still does not produce a complete
game in an acceptable amount of time. It is a reliability shim, not a true
solution to the reasoning runaway.

### 11. Explicit timeout result and shot accounting update

Change:

- Added `timeout` as a distinct `run_shots.result` value for provider-call
  timeouts.
- Timeout turns still increment `schemaErrors` and the consecutive schema-error
  DNF streak, but are now distinguishable from malformed/empty model output in
  the shot log.
- `schema_error` and `timeout` attempts now increment `shotsFired`. This matches
  the experiment scoring rule that a failed model turn is still a spent shot.
- The live UI now derives in-progress `shotsFired` from all recorded shot rows,
  and counts `timeout` together with schema failures for the existing
  `schemaErrors` display.

Verification:

- `code_checker` - no issues found.
- `DATABASE_PATH=:memory: bun test shared/tests/shot-schema.test.ts shared/tests/sse-events.test.ts shared/tests/types.test.ts backend/tests/unit/runs-outcome.test.ts backend/tests/unit/prompt.test.ts backend/tests/unit/providers-opencode-go.test.ts backend/tests/unit/providers-openrouter.test.ts backend/tests/unit/pricing.test.ts backend/tests/integration/engine.test.ts web/tests/unit/boardViewFromShots.test.ts` - 65 pass, 0 fail.

Conclusion: this does not by itself improve DeepSeek V4 Flash behavior, but it
makes later runs easier to diagnose. Empty final output, provider-call timeout,
duplicate coordinates, and real misses are now separable in the timeline.

Follow-up run after this accounting change:

- Run: `01KQ2BBSP6YYJB0JMRMAH7C7YZ`
- Link: `http://127.0.0.1:18082/runs/01KQ2BBSP6YYJB0JMRMAH7C7YZ`
- Outcome: `aborted_server_restart` returned by the abort API after the local
  server stalled.
- Last observed progress before the stall: 5 recorded turns, 0 schema errors,
  0 invalid coordinates, no turn over one minute, 3 hits, 1 sunk. The model
  sank the first ship quickly with `E5`, `F05`, `G5`, `F04`, `F03`.
- Interpretation: promising model trajectory, but the run is not usable as a
  model-behavior result because the local server/process stalled. Start a fresh
  run on the same ports rather than spawning another server variant.

Second follow-up run:

- Run: `01KQ2BJFXCTQBSPPT8E9PAWD4C`
- Link: `http://127.0.0.1:18082/runs/01KQ2BJFXCTQBSPPT8E9PAWD4C`
- Outcome: `aborted_viewer` after the run degraded into the same schema/fallback
  scan pattern.
- Metrics: 23 recorded turns, `shotsFired=23` under the updated accounting,
  8 schema-error turns, 0 timeout turns, 0 invalid-coordinate turns, 3 hits,
  1 sunk, `tokensOut=49803`, `reasoningTokens=49698`, cost `48280` micros,
  0 turns over one minute.
- Pattern: the model started very well and sank `F3` on turn 3, then after
  post-sink exploration fell back into alternating empty `4096/4096` turns and
  row-major fallback cells (`B1`, `C1`, `D1`, ...). This confirmed that
  first-error fallback keeps the game alive but does not restore strategic
  progress.

Research note before changing direction:

- LLM Chess / OpenReview describes a proxy-loop design with actions such as
  `get_current_board`, `get_legal_moves`, and `make_move`, plus retry limits.
  One ablation provides board state and legal moves in the prompt and leaves
  `make_move` as the only action.
- Chessprogramming's move-generation material reinforces the same separation:
  a game engine generates legal moves, while the player/search chooses among
  them.
- New Battleship direction: generate a constrained candidate action list from
  the current board (target adjacent `X` cells first, otherwise a checkerboard
  exploration subset), then ask the model to choose a cell from that list. This
  keeps the model choosing the move while removing board-legality bookkeeping
  from hidden reasoning.

### 12. Constrained legal candidate list prompt

Change:

- Added a candidate-list generator to `backend/src/providers/prompt.ts`.
- If the current board has unsunk `X` hits, candidates are only adjacent unknown
  `.` cells around those hits.
- Otherwise candidates are a capped checkerboard exploration subset of legal
  unknown `.` cells, falling back to all unknown cells if needed.
- The prompt now asks the model to choose exactly one cell from this legal
  candidate list instead of choosing from the whole board.
- This follows the chess-agent pattern of separating legal action generation
  from model choice: the backend supplies legal candidate actions, the model
  still chooses among them.

Verification:

- `code_checker` - no issues found.
- `DATABASE_PATH=:memory: bun test shared/tests/shot-schema.test.ts shared/tests/sse-events.test.ts shared/tests/types.test.ts backend/tests/unit/runs-outcome.test.ts backend/tests/unit/prompt.test.ts backend/tests/unit/providers-opencode-go.test.ts backend/tests/unit/providers-openrouter.test.ts backend/tests/unit/pricing.test.ts backend/tests/integration/engine.test.ts web/tests/unit/boardViewFromShots.test.ts` - 65 pass, 0 fail.

Expected effect: fewer duplicate/illegal choices and less hidden reasoning spent
on reconstructing legal moves from the entire board. This is still more pure
than exact fallback because the model picks from several candidates, but it is
less pure than an unconstrained board-only prompt.

Run:

- Run: `01KQ2CCV17R94MPSH2RZZPW9FF`
- Link: `http://127.0.0.1:18082/runs/01KQ2CCV17R94MPSH2RZZPW9FF`
- Outcome: `aborted_viewer` after the run degraded into schema/fallback scan.
- Metrics: 16 recorded turns, 4 schema-error turns, 0 timeout turns,
  0 invalid-coordinate turns, 3 hits, 1 sunk, `tokensOut=32160`,
  `reasoningTokens=32076`, cost `32726` micros, 0 turns over one minute.
- Positive signal: after `F4` hit, the candidate list drove the model to choose
  adjacent cells `F5` and `F3`, sinking the first ship quickly. This validates
  the chess-style legal-action-list direction for target mode.
- Failure pattern: after the sunk ship, empty `4096/4096` schema errors returned.
  The first-error emergency fallback then chose row-major fallback cells such as
  `D1`, `E1`, and `F1`, undermining the new checkerboard/candidate strategy.

Conclusion: constrained candidates help when the model returns content, but the
old emergency fallback now conflicts with the new approach. The next change
should make fallback select from the same candidate list instead of the first
row-major unknown cell.

### 13. Candidate-aligned emergency fallback

Change:

- Emergency fallback after a schema error now uses the first cell from the same
  legal candidate list instead of the first row-major `.` cell.
- If there is an unsunk `X`, fallback points at an adjacent target-mode cell.
- If there is no `X`, fallback points at the first checkerboard exploration
  candidate rather than filling every unknown cell in row order.

Verification:

- `code_checker` - no issues found.
- `DATABASE_PATH=:memory: bun test shared/tests/shot-schema.test.ts shared/tests/sse-events.test.ts shared/tests/types.test.ts backend/tests/unit/runs-outcome.test.ts backend/tests/unit/prompt.test.ts backend/tests/unit/providers-opencode-go.test.ts backend/tests/unit/providers-openrouter.test.ts backend/tests/unit/pricing.test.ts backend/tests/integration/engine.test.ts web/tests/unit/boardViewFromShots.test.ts` - 66 pass, 0 fail.

Expected effect: if DeepSeek V4 Flash still emits empty content, the recovery
turn should no longer collapse into row-major scan. This keeps the fallback
semantics aligned with the chess-style legal action generator.

Run:

- Run: `01KQ2CXNTN1KM7DKY71621YM7T`
- Link: `http://127.0.0.1:18082/runs/01KQ2CXNTN1KM7DKY71621YM7T`
- Outcome: `aborted_viewer` after repeated near-timeout schema/fallback turns.
- Metrics: 13 recorded turns, 3 schema-error turns, 0 timeout turns,
  0 invalid-coordinate turns, 3 hits, 1 sunk, `tokensOut=30784`,
  `reasoningTokens=30714`, cost `30080` micros, 0 turns over one minute.
- Positive signal: the candidate list produced a clean first-ship target phase:
  `F4` hit, `E4` miss, `F3` hit, `F5` sunk, with no schema errors before the
  sunk transition.
- Failure pattern: after the sunk ship, the model again produced empty
  `4096/4096` turns around 53-56 seconds. Candidate-aligned fallback avoided
  the previous every-cell row-major scan, but the exploration candidate list was
  still large enough that the model spent heavy hidden reasoning.

Conclusion: target-mode candidate lists are promising; post-sink exploration is
still too broad. The next change should reduce the candidate list size and make
the prompt state that the engine already filtered/ranked the legal actions.

### 14. Smaller engine-ranked candidate list

Change:

- Reduced the candidate-list cap from 24 cells to 8 cells.
- Marked the list as `engine-ranked` in the prompt.
- Added prompt text that the game engine already filtered and ranked the list,
  and that the model should not recompute ship placements, legality, or cells
  outside the list.

Verification:

- `code_checker` - no issues found.
- `DATABASE_PATH=:memory: bun test shared/tests/shot-schema.test.ts shared/tests/sse-events.test.ts shared/tests/types.test.ts backend/tests/unit/runs-outcome.test.ts backend/tests/unit/prompt.test.ts backend/tests/unit/providers-opencode-go.test.ts backend/tests/unit/providers-openrouter.test.ts backend/tests/unit/pricing.test.ts backend/tests/integration/engine.test.ts web/tests/unit/boardViewFromShots.test.ts` - 66 pass, 0 fail.

Expected effect: reduce hidden reasoning during post-sink exploration by making
the action-choice surface closer to a chess `get_legal_moves` shortlist instead
of a broad board-analysis problem.

Run:

- Run: `01KQ2DCW7P123DV5EEW59V5FZR`
- Link: `http://127.0.0.1:18082/runs/01KQ2DCW7P123DV5EEW59V5FZR`
- Outcome: `won`.
- Metrics: 68 recorded turns, 13 schema-error turns, 0 timeout turns,
  0 invalid-coordinate turns, 17 hit/sunk cells, 5 sunk ships,
  `tokensOut=128635`, `reasoningTokens=128250`, cost `132704` micros,
  0 turns over one minute.
- Positive signal: this is the first successful DeepSeek V4 Flash completion in
  this experiment series. The short candidate list kept recovery turns legal
  and allowed the game to continue through schema errors instead of ending in
  `dnf_schema_errors`.
- Important sequences:
  - `H2`, `H3`, `H4`, `H5` sank one ship.
  - `A3`, `A4`, `A5` sank one ship.
  - `F4`, `F5`, `F3` sank one ship.
  - `C5`, `C6`, `C7`, `C8`, `C9` sank one ship.
  - `H10`, `H9` sank the final ship and produced `won`.

Conclusion: the best working approach so far is the chess-style split:
server-side legal action generation plus model-side choice, with a small
engine-ranked candidate list and candidate-aligned emergency fallback. Hidden
reasoning is still expensive and schema errors still occur, but they no longer
prevent full game completion on this run.

### 15. Distributed unordered hunt shortlist

Change:

- Kept target mode unchanged: when unsunk `X` cells exist, candidates are still
  adjacent legal `.` cells around those hits.
- Replaced row-major hunt candidate ordering with a seed-stable distributed
  order across board quadrants.
- Hunt-mode candidate text now labels the list as `engine-filtered unordered`
  and explicitly says that order is not a recommendation.
- Candidate cap remains 8 cells.
- Emergency fallback logic was not changed for this experiment. It still uses
  the first candidate-list cell after a schema error; this experiment only
  changes how hunt candidates are ordered before that fallback sees them.

Hypothesis: keep the reasoning surface small without forcing the model to hunt
from the top-left of the board. This borrows the chess-agent separation of legal
move generation from move choice, while reducing hidden move-order bias.

Verification before live run:

- `code_checker` - no issues found.
- `bunx tsc --pretty false --noEmit -p backend/tsconfig.json` - pass.
- `DATABASE_PATH=:memory: bun test shared/tests/shot-schema.test.ts shared/tests/sse-events.test.ts shared/tests/types.test.ts backend/tests/unit/runs-outcome.test.ts backend/tests/unit/prompt.test.ts backend/tests/unit/providers-opencode-go.test.ts backend/tests/unit/providers-openrouter.test.ts backend/tests/unit/pricing.test.ts backend/tests/integration/engine.test.ts web/tests/unit/boardViewFromShots.test.ts` - 67 pass, 0 fail.

Partial live run:

- Run: `01KQ4MBN5GNWB0WAQDZPFA2P20`
- Link: `http://127.0.0.1:18082/runs/01KQ4MBN5GNWB0WAQDZPFA2P20`
- Outcome: `aborted_server_restart` while moving to the next code revision.
- Observed before restart: 28 recorded shot rows, 7 hit/sunk cells, 2 sunk
  ships, 3 schema-error turns, 0 timeout turns, 0 invalid-coordinate turns.
- Positive signal: the first hunt cells were distributed instead of top-left
  row-major: `A5`, `B10`, `G3`, `I3`, `D10`, `A7`, `C9`, `J6`. The run found
  the lower `E9-E10` ship early instead of scanning the top-left first.
- Remaining issue: empty `4096/4096` schema errors still appeared when the run
  returned to hunt mode. The change removed the obvious top-left ordering bias,
  but did not solve hidden reasoning starvation.

Conclusion: distributed unordered hunt is better than row-major hunt for board
coverage, but target mode still used the word `engine-ranked`. That wording and
ordering can look like a hidden direction hint. The next change should make
target candidates unordered too, while still only listing legal adjacent cells.

### 16. Neutral unordered target shortlist and timeout UI split

Change:

- Target mode now orders adjacent-hit frontier cells with a seed-stable hash
  instead of preserving scan/direction order.
- Target-mode candidate text now uses the same `engine-filtered unordered` label
  as hunt mode.
- Target guidance explicitly says: order is not a recommendation, and the model
  must decide direction itself from the board.
- The target candidate set is still only legal adjacent `.` cells around current
  unsunk `X` hits; the backend does not infer vertical/horizontal orientation
  and does not prune candidates to a line.
- Emergency fallback was intentionally not changed in this experiment.
- Live UI metrics now display timeout rows separately from schema errors. Schema
  errors count only `schema_error`; timeout rows count under a separate
  `Timeouts` card.
- The Astro dev proxy now honors `BACKEND_PORT`, so the normal local frontend on
  `18082` can proxy API requests to the normal local backend on `18083` without
  starting a second backend on `8081`.

Verification:

- `code_checker` - no issues found.
- `bunx tsc --pretty false --noEmit -p backend/tsconfig.json` - pass.
- `bun run --cwd web typecheck` - 0 errors, 0 warnings, 0 hints.
- `DATABASE_PATH=:memory: bun test backend/tests/unit/prompt.test.ts backend/tests/unit/providers-opencode-go.test.ts backend/tests/unit/providers-openrouter.test.ts web/tests/unit/liveGameMetrics.test.ts web/tests/manifest.test.ts` - 16 pass, 0 fail.

Run:

- Run: `01KQ4NGY7MPK662Q0W3V46JKNX`
- Link: `http://127.0.0.1:18082/runs/01KQ4NGY7MPK662Q0W3V46JKNX`
- Outcome: `aborted_viewer` after the run became too slow/problematic in hunt
  and recovery phases.
- Metrics: 61 recorded shot rows, 12 hit/sunk cells, 3 sunk ships,
  17 schema-error turns, 0 timeout turns, 0 invalid-coordinate turns,
  `tokensOut=134708`, `reasoningTokens=134400`, cost `134705` micros,
  0 turns over one minute.
- Positive target signal: with unordered target cells, the model still inferred
  direction itself and sank ships:
  - `B2`, `B3`, `B1`, `B4`, `B5`, `B6` sank one vertical ship;
  - `E9`, `E8`, `E7`, `E6`, `E10` sank another vertical ship;
  - during abort handling, `E3`, `E4`, `E2` sank a third ship.
- Failure pattern: all schema errors were empty visible responses with
  `tokensOut=4096` and `reasoningTokens=4096`, mostly around 49-53 seconds.
  Slow valid hunt misses also approached the same boundary, for example `F6`
  at about 50.5 seconds and `F4` at about 52.1 seconds.
- Interpretation: neutral target mode did not harm target play and avoided an
  explicit direction hint. The remaining bottleneck is hunt/recovery when there
  is no active `X`, especially after a sunk ship. Emergency fallback kept the
  run alive, but that fallback remains benchmark-distorting and should be
  handled as a separate mode or separate leaderboard policy.

Conclusion: target mode can stay unordered and neutral. The next meaningful
experiment should focus on hunt/recovery rather than target direction. Good
candidate changes are capturing provider `finish_reason`, testing whether
`shipsRemaining` triggers global placement analysis, and deciding how to split
pure benchmark mode from fallback-assisted mode.

### 17. Hunt mode without remaining fleet lengths

Change:

- Hunt-mode prompts no longer include `Ships still afloat (lengths): ...`.
- Target-mode prompts still include the remaining fleet lengths, because target
  mode needs enough context to decide whether an adjacent `X` frontier could be
  part of a longer ship.
- Candidate generation, target ordering, hunt ordering, and emergency fallback
  behavior were otherwise unchanged from section 16.

Hypothesis: when there is no active `X`, showing the remaining fleet lengths may
invite DeepSeek V4 Flash to reconstruct global ship placements during hunt. If
that prose was a major trigger, removing it from hunt mode should reduce empty
reasoning-only turns after a sunk ship.

Verification before live run:

- `code_checker` - no issues found.
- `bunx tsc --pretty false --noEmit -p backend/tsconfig.json` - pass.
- `DATABASE_PATH=:memory: bun test backend/tests/unit/prompt.test.ts backend/tests/unit/providers-openrouter.test.ts backend/tests/unit/providers-opencode-go.test.ts` - 13 pass, 0 fail.

Run:

- Run: `01KQ4SEK3PSVJK88T2HTEMH1SH`
- Link: `http://127.0.0.1:18082/runs/01KQ4SEK3PSVJK88T2HTEMH1SH`
- Seed date: `2026-04-26`
- Outcome: `aborted_viewer` after post-sink hunt degraded into the same
  schema/fallback churn.
- Metrics: 61 recorded shot rows, 12 hit/sunk cells, 3 sunk ships,
  17 schema-error turns, 0 timeout turns, 0 invalid-coordinate turns,
  `tokensOut=124543`, `reasoningTokens=124235`, cost `126243` micros,
  0 turns over one minute.
- Positive signal: the run reached the third sunk ship earlier than the previous
  neutral-target control. By shot row 47 it had 3 sunk ships and 11 schema-error
  turns, compared with the previous run's 61 rows, 3 sunk ships, and 17 schema
  errors.
- Failure pattern: after sinking `E4`, the run returned to hunt mode and made no
  further hit. Rows 47-60 included six additional empty `4096/4096` schema-error
  turns plus low-progress misses such as `C1`, `E1`, `D2`, `J4`, `E5`, `D4`,
  `F8`, and `F10`.

Conclusion: removing remaining fleet lengths from hunt mode may slightly improve
early efficiency, but it does not solve the runaway. The dominant failure remains
post-sink hunt/recovery with no active `X`, where the model can still spend the
entire `4096` output budget on hidden reasoning and emit no visible shot.

### 18. Hunt shortlist reduced to 4 candidates

Change:

- Target mode kept up to 8 unordered adjacent-hit candidates.
- Hunt mode was reduced from 8 unordered distributed candidates to 4 unordered
  distributed candidates.
- Remaining fleet lengths still stayed out of hunt mode.
- Emergency fallback behavior was unchanged.

Hypothesis: after a sunk ship, DeepSeek V4 Flash may still overthink because the
hunt action surface is too broad. Reducing hunt from 8 to 4 candidates should
preserve model choice while lowering the hidden reasoning surface.

Verification before live run:

- `code_checker` - no issues found.
- `bunx tsc --pretty false --noEmit -p backend/tsconfig.json` - pass.
- `DATABASE_PATH=:memory: bun test backend/tests/unit/prompt.test.ts backend/tests/unit/providers-openrouter.test.ts backend/tests/unit/providers-opencode-go.test.ts` - 13 pass, 0 fail.

Partial run:

- Run: `01KQ4VKCC77MS550Y82XMMX9CN`
- Link: `http://127.0.0.1:18082/runs/01KQ4VKCC77MS550Y82XMMX9CN`
- Outcome: not a clean terminal result. The run was interrupted by the next code
  revision/server restart; a later abort request returned `run_not_found` under
  the restarted backend process.
- Last observed metrics before interruption: 22 recorded shot rows, 9 hit/sunk
  cells, 2 sunk ships, 1 schema-error turn, 0 timeout turns, 0 invalid-coordinate
  turns, 0 turns over one minute.
- Positive signal: this was much cleaner early play than the previous hunt
  variants. It reached 2 sunk ships with only 1 schema error. It sank the
  `E9/E8/E7/E10` ship and the `B2/B3/B4/B5/B6` ship.
- New issue surfaced: after `B2-B6` was sunk, the model shot `A5`, adjacent to
  the sunk ship. Because ships cannot touch in this ruleset, that cell is
  deterministically impossible. The backend had presented a shortlist, so
  including such cells in candidates can make a bad cell look legitimate.

Conclusion: reducing hunt to 4 candidates looks promising for reasoning
stability, but the candidate generator must not include cells adjacent to sunk
ships. Otherwise the shortlist itself introduces benchmark noise.

### 19. S-only no-touch pruning and live token/timer UI

Change:

- Candidate generation now excludes unknown `.` cells adjacent to sunk `S` cells,
  including diagonals.
- This pruning is intentionally limited to sunk ships. It does not infer target
  direction from active `X` hits and does not prune perpendicular cells around a
  partially found ship.
- Candidate prompt wording changed from `Legal candidate cells` to
  `Rule-filtered candidate cells` so the shortlist is not presented as the full
  legal move set.
- Hunt mode remains capped at 4 candidates; target mode remains capped at 8.
- Emergency fallback remains unchanged and still uses the first candidate only
  after a schema error.
- Live UI now shows two timers under the title: elapsed run time and time since
  the last shot. On terminal runs, elapsed time remains fixed and the since-shot
  timer is hidden.
- Live UI now displays saved token/cost telemetry: input tokens, output tokens,
  reasoning tokens, and cost. SSE shot events now carry these per-shot fields so
  current games can update without waiting for terminal metadata.

Hypothesis: removing cells around `S` from the shortlist should prevent the
engine from legitimizing deterministic misses, while keeping the model
responsible for target direction and hunt choice.

Verification before live run:

- `code_checker` - no issues found.
- `DATABASE_PATH=:memory: bun test backend/tests/unit/prompt.test.ts backend/tests/unit/providers-openrouter.test.ts backend/tests/unit/providers-opencode-go.test.ts shared/tests/sse-events.test.ts web/tests/unit/liveGameMetrics.test.ts` - 20 pass, 0 fail.
- `bunx tsc --pretty false --noEmit -p backend/tsconfig.json` - pass.
- `bun run --cwd web typecheck` - 0 errors, 0 warnings, 0 hints.
- `agent-browser snapshot` confirmed that elapsed/since-shot timers and
  token/cost cards render on the live run page.

Active run:

- Run: `01KQ4X26KDAW48FPES7V83BZK1`
- Link: `http://127.0.0.1:18082/runs/01KQ4X26KDAW48FPES7V83BZK1`
- Seed date: `2026-04-26`
- Outcome: `won`.
- Metrics: 45 recorded shot rows, 17 hit/sunk cells, 5 sunk ships,
  11 schema-error turns, 1 timeout turn, 0 invalid-coordinate turns,
  `tokensOut=78954`, `reasoningTokens=78723`, cost `83098` micros,
  1 turn at the one-minute timeout boundary.
- UI verification: initial `agent-browser snapshot` showed elapsed/since-shot
  timers and token/cost cards updating on the live run page.
- Positive signal: this is the best completion so far by recorded rows and cost.
  It improved on the previous 68-row successful fallback-assisted run and also
  avoided post-sink shots adjacent to the sunk `B2-B6` cluster.
- Remaining issue: this run still used the old exact emergency fallback after
  schema errors, so it is not a fully pure model-choice result. Schema errors
  and one timeout still indicate hidden reasoning runaway remains present.

Conclusion: S-only no-touch pruning plus a 4-cell hunt shortlist materially
improved completion quality. The next experiment should remove backend-selected
exact fallback whenever more than one candidate exists, so recovery turns remain
LLM-chosen.

### 20. Model-chosen recovery fallback

Change:

- Emergency recovery after schema errors no longer selects `candidateCells[0]`
  when multiple candidates remain.
- If more than one rule-filtered candidate exists, the prompt tells the model to
  choose exactly one candidate itself and return non-empty JSON.
- Exact fallback JSON remains only for the true single-candidate case, where the
  rule-filtered board has exactly one candidate.
- S-only no-touch pruning, hunt cap 4, target cap 8, and live timer/token UI all
  remain enabled.

Hypothesis: the previous winning run proved that S-only pruning and a shorter
hunt list can complete the game, but it was still fallback-assisted because
schema recovery selected concrete cells. This change tests whether completion is
still possible when every multi-option recovery shot is chosen by the LLM.

Verification before live run:

- `code_checker` - no issues found.
- `DATABASE_PATH=:memory: bun test backend/tests/unit/prompt.test.ts backend/tests/unit/providers-openrouter.test.ts backend/tests/unit/providers-opencode-go.test.ts shared/tests/sse-events.test.ts web/tests/unit/liveGameMetrics.test.ts` - 20 pass, 0 fail.
- `bunx tsc --pretty false --noEmit -p backend/tsconfig.json` - pass.
- `bun run --cwd web typecheck` - 0 errors, 0 warnings, 0 hints.

First attempted run:

- Run: `01KQ4YCETHGR3HYGR51H7V4Y6R`
- Link: `http://127.0.0.1:18082/runs/01KQ4YCETHGR3HYGR51H7V4Y6R`
- Outcome: `aborted_server_restart` after the local backend/frontend processes
  went down during the run.
- Saved rows before restart: 9 shot rows, 0 hit/sunk cells, 1 schema-error turn,
  0 timeout turns, 0 invalid-coordinate turns.
- Interpretation: not usable as a model-behavior result because it ended due to
  local service failure before meaningful progress. Start a clean replacement
  run with the same Section 20 configuration.

Replacement run:

- Run: `01KQ4YM40CM8QX02W8RB4PFARN`
- Link: `http://127.0.0.1:18082/runs/01KQ4YM40CM8QX02W8RB4PFARN`
- Outcome: `aborted_viewer` after post-sink hunt/recovery degraded into repeated
  empty reasoning-only responses.
- Metrics: 27 recorded shot rows, 9 hit/sunk cells, 2 sunk ships,
  6 schema-error turns, 0 timeout turns, 0 invalid-coordinate turns,
  `tokensOut=60605`, `reasoningTokens=60458`, cost `59950` micros,
  0 turns over one minute.
- Positive signal: model-chosen recovery can recover from at least some schema
  errors without backend-selected exact shots. After an empty response at row 16,
  the model chose `E7`, continued the target sequence, and sank the `E9-E10`
  ship.
- Failure pattern: after the second sunk ship, hunt mode returned `E1`, then
  entered four consecutive empty `4096/4096` schema-error turns before an
  in-flight recovery eventually produced `I3`. The run had already been stopped
  as degraded.

Conclusion: removing backend-selected fallback preserves benchmark semantics,
but it weakens recovery. The next experiment should reduce the post-schema hunt
reasoning surface without selecting a coordinate for the model.

### 21. Compact hunt recovery prompt

Change:

- In hunt mode after a schema error, keep the same rule-filtered candidate list
  and still require the LLM to choose one cell itself.
- Do not include the full board text or general board-analysis instructions in
  that hunt-recovery prompt. The prompt should only state the previous schema
  failure, the unordered rule-filtered candidate list, and the required final
  JSON shape.
- Target-mode recovery remains board-aware so the model can still infer active
  ship direction itself from visible `X` cells.
- Exact fallback remains allowed only for the true single-candidate case.

Hypothesis: Section 20 failed mostly in post-sink hunt mode, where there was no
active `X` and the full board prompt invited another global placement analysis.
A compact hunt-recovery prompt may leave enough output budget for visible JSON
while keeping the shot model-chosen.

Verification before live run:

- `code_checker` - no issues found.
- `DATABASE_PATH=:memory: bun test backend/tests/unit/prompt.test.ts backend/tests/unit/providers-openrouter.test.ts backend/tests/unit/providers-opencode-go.test.ts shared/tests/sse-events.test.ts web/tests/unit/liveGameMetrics.test.ts` - 21 pass, 0 fail.
- `bunx tsc --pretty false --noEmit -p backend/tsconfig.json` - pass.
- `bun run --cwd web typecheck` - 0 errors, 0 warnings, 0 hints.

Active run:

- Run: `01KQ4ZJ6ZQ828S7C7EQ2G57SZC`
- Link: `http://127.0.0.1:18082/runs/01KQ4ZJ6ZQ828S7C7EQ2G57SZC`
- Seed date: `2026-04-26`
- Outcome: `won`.
- Metrics: 49 recorded shot rows, 17 hit/sunk cells, 5 sunk ships,
  15 schema-error turns, 0 timeout turns, 0 invalid-coordinate turns,
  `tokensOut=112435`, `reasoningTokens=112197`, cost `109927` micros,
  0 turns over one minute.
- Positive signal: this is the first full completion in this series where
  multi-option recovery shots remained LLM-chosen rather than backend-selected.
  It was slightly longer and more expensive than the Section 19 exact-fallback
  win, but it preserved the stronger benchmark semantics.
- Compact hunt-recovery signal: after schema errors in hunt mode, recovery shots
  such as `A9`, `B8`, `E1`, `D2`, `E5`, `J6`, `J8`, and `H6` completed in about
  2.5-6.6 seconds with roughly 130-426 output tokens, instead of immediately
  repeating empty `4096/4096` turns.
- Remaining issue: target-mode recovery can still enter several consecutive
  empty full-budget turns. Around the `E3` hit, the run had three empty
  `4096/4096` schema-error turns before recovering with `E4` and then sinking
  the ship at `E2`.

Conclusion: compact hunt recovery is the best model-chosen recovery result so
far. It does not solve hidden reasoning globally, but it turns the specific
post-sink hunt failure mode from a DNF/degradation risk into a recoverable short
choice. A follow-up should either compact target recovery without removing the
board context needed for direction inference, or capture provider `finish_reason`
to confirm whether the empty responses are length stops.

## Current Working Interpretation

The root issue is not the visible response format. When the model emits content,
it usually emits valid JSON. The failure happens before visible content: hidden
reasoning consumes the entire completion allowance, leaving no final response.

Observed patterns:

- `reasoningTokens` are almost equal to `tokensOut` on both valid and invalid
  turns.
- Empty schema errors have `rawResponse=""` and `reasoningTokens=max_tokens`.
- Prompt wording can change how long the model stays valid, but does not create
  a hard bound.
- Lowering total `max_tokens` can increase failure rate by leaving no room for
  the final JSON.
- Raising OpenCode Go chat `max_tokens` from `2048` to `4096` reduces early
  starvation, but does not eliminate empty turns. Empty `4096/4096` turns still
  occur and often take about 52-56 seconds.
- The model appears especially prone to deep reasoning after state transitions,
  such as sinking a ship and returning to exploration.
- Exact fallback prompts after schema errors can prevent consecutive
  schema-error DNF, but they trade away benchmark purity and still leave the
  model spending heavy hidden reasoning on many turns.

## Current Code State After Experiments

The latest uncommitted experimental state is:

- active provider input is the text board, not the PNG board;
- the PNG renderer and `boardPng` field remain only as a disabled vision-track
  fallback;
- shot parsing accepts `{"cell":"A1"}`, zero-padded cells such as
  `{"cell":"F04"}`, and legacy row/col JSON;
- `backend/src/providers/openai-compatible.ts`
  - shared reasoning model `max_tokens=2048`;
  - non-reasoning model `max_tokens=200`;
  - sends `verbosity: "low"`;
  - sends `reasoning: { effort: "minimal", exclude: true }` for reasoning
    models;
  - removes explicit recent-shot history from user content.
- `backend/src/providers/opencode-go.ts`
  - OpenCode Go chat-completions reasoning models override `max_tokens=4096`;
  - an optional `/zen/go/v1/messages` path exists for pricing entries that opt
    into that endpoint, but the active DeepSeek V4 Flash catalog route is back
    on `/zen/go/v1/chat/completions`.
- `backend/src/providers/prompt.ts`
  - adds `No separate shot history is provided; use only the current board symbols.`;
  - says unknown cells are exactly `.` and that `o`, `X`, and `S` are already
    used and unavailable;
  - supplies a capped rule-filtered unordered candidate list: up to 8 adjacent
    `.` cells around unsunk `X` hits first, otherwise 4 distributed checkerboard
    hunt candidates;
  - excludes candidate cells adjacent to sunk `S` cells, including diagonals;
  - includes remaining fleet lengths only in target mode, not in hunt mode;
  - tells the model that candidate-list order is not a recommendation, including
    in target mode where the model must infer direction itself from the board;
  - asks for the final shape `{"cell":"<cell>"}` without concrete coordinate
    examples;
  - adds a post-sink exploration reminder;
  - after a schema error, asks the model to choose from the rule-filtered list
    itself; exact fallback JSON is used only when the rule-filtered board has a
    single candidate;
  - in hunt mode after schema errors, uses a compact recovery prompt containing
    only the failure notice, unordered rule-filtered candidates, and the final
    JSON shape. Target-mode recovery remains board-aware.
- `backend/src/runs/prompt.ts`
  - short autonomous heuristic prompt;
  - describes the text board format and symbols;
  - no fixed scan policy;
  - no backend-recommended coordinate;
  - no "ships never touch" or exhaustive placement rules in the prompt.
- `backend/src/runs/engine.ts`
  - per-turn timeout guard was added earlier in the investigation and is now
    `60s` by default.
- `shared/src/types.ts` and API/SSE schemas
  - `ShotResult` now includes `timeout` in addition to `hit`, `miss`, `sunk`,
    `schema_error`, and `invalid_coordinate`;
  - `schema_error` and `timeout` turns count toward `shotsFired`;
  - SSE shot events can carry saved token, cost, duration, and timestamp data.
- `web/src/islands/LiveGame.tsx`
  - live metrics derive schema errors and timeout rows separately from the shot
    log, so timeout failures are visible in their own HUD card;
  - live and terminal pages show elapsed time, live time since last shot, input
    tokens, output tokens, reasoning tokens, and cost.
- `web/astro.config.mjs`
  - local dev proxy target reads `BACKEND_PORT` and falls back to `8081`, making
    the existing `18082`/`18083` experiment ports usable without an extra backend.
- Tests were added or updated for prompt shape, provider request shape,
  zero-padded shot parsing, OpenCode Go `/messages`, emergency fallback,
  timeout shot rows, and engine timeout behavior.

Last verification run before this update:

- `code_checker` - no issues found.
- `bunx tsc --pretty false --noEmit -p backend/tsconfig.json` - pass.
- `bun run --cwd web typecheck` - 0 errors, 0 warnings, 0 hints.
- `DATABASE_PATH=:memory: bun test backend/tests/unit/prompt.test.ts backend/tests/unit/providers-openrouter.test.ts backend/tests/unit/providers-opencode-go.test.ts shared/tests/sse-events.test.ts web/tests/unit/liveGameMetrics.test.ts` - 21 pass, 0 fail.

## What Did Not Work

- A very high `max_tokens` value: allows long and expensive hidden reasoning.
- A hard low `max_tokens=512`: causes empty reasoning-only responses quickly.
- Removing explicit shot history alone: improves prompt size, but not enough.
- Fixed policy prompt: improves some turns, but still produces empty
  reasoning-only responses and risks distorting the benchmark.
- `reasoning.effort=minimal` plus `verbosity=low`: better than `512`, but still
  no hard guarantee.
- `max_tokens=4096`: better than `2048`, but still allows empty reasoning-only
  turns near the one-minute cutoff.
- Removing remaining fleet lengths from hunt mode: slightly better early
  efficiency in one run, but no fix for post-sink hunt/recovery runaway.
- Emergency exact fallback after schema errors: useful operationally, but
  fallback-assisted runs are not pure autonomous model play and remained too
  slow to finish.
- Backend-recommended move: likely useful operationally, but invalid for the
  original pure benchmark.

## Promising Next Experiments

1. Capture provider `finish_reason`.
   The adapter currently does not persist finish reason. Add it to logs or shot
   metadata so empty responses can be classified as `length`, provider error,
   or another finish type.

2. Test the native OpenCode Go endpoint for DeepSeek V4 Flash.
   OpenCode Go docs list DeepSeek V4 Flash under `/zen/go/v1/messages`, not
   `/zen/go/v1/chat/completions`. A provider-specific Anthropic-style adapter
   may expose different thinking controls.

3. Try tool/function calling without server-selected coordinates.
   The model would still choose `row` and `col`, but the provider would enforce
   an argument object instead of free text JSON. This may not stop hidden
   reasoning, but it can reduce final-channel schema failures.

4. Try structured outputs with JSON schema where supported.
   Same goal as tool calling: preserve autonomous choice while making final
   output easier for the provider to constrain.

5. Test a more explicit hunt-mode contract without backend direction hints.
   Removing `shipsRemaining` from hunt mode alone did not solve the issue. The
   next hunt experiment should isolate whether the model needs a smaller hunt
   candidate surface, a no-fleet-memory hunt prompt, or a separate pure/fallback
   policy split.

6. Try a separate fallback-assisted mode instead of mixing fallback behavior
   into the pure benchmark path.
   The first-error fallback can keep runs alive, but the result should be labeled
   separately from autonomous model play.

7. Compare against another provider/model with the same autonomous prompt.
   This separates "OpenCode Go DeepSeek V4 Flash issue" from "benchmark prompt
   shape triggers reasoning loops in many reasoning models".

8. Log prompt/request config per run.
   Add a compact experiment label or request-params snapshot so later run
   analysis does not depend on memory of the code state.

9. Consider a provider-side or engine-side one-minute cutoff metric.
   The current timeout prevents very long hangs, but the experiment scoring now
   treats any turn over one minute as unsuccessful even if it eventually returns
   JSON.

## Recommended Restart Point

Start from the latest autonomous prompt, not from the fixed policy or
backend-recommended move branch.

Recommended first next step:

1. Add `finish_reason` capture for provider responses.
2. Run one control game with the current `minimal + 2048` request.
3. Implement a provider-specific OpenCode Go `/messages` path for DeepSeek V4
   Flash if the docs still show that endpoint.
4. Compare one game on `/messages` with the same prompt and seed.

The success criterion should be stricter than "does not hang": the run should
avoid repeated empty reasoning-only responses and should not spend near the full
completion budget on most turns.
