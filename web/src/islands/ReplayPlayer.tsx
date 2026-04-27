import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";

import { getRun, getRunShots } from "../lib/api.ts";
import { DYNAMIC_ROUTE_ID } from "../lib/page-shell.ts";
import { resolveReplayRunIdFromPath } from "../lib/routes.ts";
import BoardView from "./BoardView.tsx";
import { createInitialReplayState, replayTickMs } from "./replayReducer.ts";
import {
  dispatchReplayAction,
  nextReplaySpeed,
  replayErrorMessage,
  replayProgressPercent,
  replayRun,
  replayShots,
} from "./replayViewModel.ts";
import styles from "./ReplayPlayer.module.css";

interface ReplayPlayerProps {
  runId: string;
}

export function ReplayPlayer(props: ReplayPlayerProps) {
  const [runId, setRunId] = createSignal(props.runId);
  const [state, setState] = createSignal(createInitialReplayState());
  const dispatch = dispatchReplayAction(state, setState);
  let timer: ReturnType<typeof setInterval> | undefined;

  const run = createMemo(() => replayRun(state()));
  const shots = createMemo(() => replayShots(state()));
  const visibleShots = createMemo(() => shots().slice(0, state().idx));
  const progressPercent = createMemo(() => replayProgressPercent(state().idx, shots().length));
  const errorMessage = createMemo(() => replayErrorMessage(state()));
  const nextSpeed = createMemo(() => nextReplaySpeed(state().speed));

  const clearTimer = () => {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };

  const playbackStatus = createMemo(() => state().status);
  const playbackSpeed = createMemo(() => state().speed);

  createEffect(() => {
    clearTimer();
    if (playbackStatus() !== "playing") {
      return;
    }

    timer = setInterval(() => {
      dispatch({ kind: "tick" });
    }, replayTickMs(playbackSpeed()));
  });

  onMount(() => {
    if (props.runId === DYNAMIC_ROUTE_ID) {
      const resolvedRunId = resolveReplayRunIdFromPath(window.location.pathname);
      if (resolvedRunId.length === 0) {
        window.location.assign("/");
        return;
      }

      setRunId(resolvedRunId);
    }

    void (async () => {
      try {
        const [nextMeta, nextShots] = await Promise.all([getRun(runId()), getRunShots(runId())]);
        dispatch({ kind: "loaded", run: nextMeta, shots: nextShots.shots });
      } catch (caughtError) {
        dispatch({
          kind: "loadFailed",
          message: caughtError instanceof Error ? caughtError.message : "Could not load replay.",
        });
      }
    })();
  });

  onCleanup(clearTimer);

  return (
    <section class={styles.shell}>
      <div class={styles.panel}>
        <div class={styles.header}>
          <div>
            <h1 class={styles.title}>Run replay</h1>
            <Show when={run()}>
              {(currentMeta) => (
                <p class={styles.meta}>
                  {currentMeta().displayName} · {currentMeta().seedDate} ·{" "}
                  {currentMeta().outcome ?? "in progress"}
                </p>
              )}
            </Show>
          </div>
        </div>

        <Show when={run()?.outcome === null}>
          <div class={styles.banner}>
            Run still in progress.{" "}
            <a href={`/runs/${encodeURIComponent(runId())}`}>Open live view</a>.
          </div>
        </Show>

        <Show when={errorMessage()}>
          {(message) => (
            <p class={styles.error} role="alert">
              {message()}
            </p>
          )}
        </Show>

        <Show when={state().status !== "loading"} fallback={<p>Loading replay...</p>}>
          <Show when={state().status !== "error"}>
            <div class={styles.boardWrap}>
              <BoardView shots={visibleShots()} />
            </div>

            <div class={styles.progress} aria-hidden="true">
              <span style={{ width: `${progressPercent()}%` }} />
            </div>

            <div class={styles.controls}>
              <button
                class={styles.button}
                type="button"
                onClick={() =>
                  dispatch(state().status === "playing" ? { kind: "pause" } : { kind: "play" })
                }
              >
                {state().status === "playing" ? "Pause" : "Play"}
              </button>
              <button
                class={`${styles.button} ${styles.secondary}`}
                type="button"
                onClick={() => dispatch({ kind: "stepBack" })}
                disabled={state().idx === 0}
              >
                Back
              </button>
              <button
                class={`${styles.button} ${styles.secondary}`}
                type="button"
                onClick={() => dispatch({ kind: "stepForward" })}
                disabled={state().idx === shots().length}
              >
                Forward
              </button>
              <button
                class={`${styles.button} ${styles.secondary}`}
                type="button"
                onClick={() => dispatch({ kind: "speed", speed: nextSpeed() })}
              >
                {state().speed}x
              </button>
              <input
                class={styles.range}
                type="range"
                min="0"
                max={shots().length}
                value={state().idx}
                aria-label="Seek replay position"
                aria-valuemin={0}
                aria-valuemax={shots().length}
                aria-valuenow={state().idx}
                aria-valuetext={`Shot ${state().idx} of ${shots().length}`}
                disabled={state().status === "playing"}
                onInput={(event) =>
                  dispatch({
                    kind: "seek",
                    idx: Number.parseInt(event.currentTarget.value, 10),
                  })
                }
              />
              <span>
                {state().idx}/{shots().length}
              </span>
            </div>
          </Show>
        </Show>
      </div>
    </section>
  );
}

export default ReplayPlayer;
