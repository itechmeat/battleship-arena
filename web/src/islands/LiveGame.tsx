import type { Outcome, RunMeta, RunShotRow } from "@battleship-arena/shared";
import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";

import { abortRun, ApiError, getRun, getRunShots } from "../lib/api.ts";
import { subscribeToRun } from "../lib/sse.ts";
import styles from "./LiveGame.module.css";

import BoardView from "./BoardView.tsx";

type Phase = "loading" | "live" | "terminal" | "error";

interface LiveGameProps {
  runId: string;
}

function appendShot(previous: readonly RunShotRow[], nextShot: RunShotRow): RunShotRow[] {
  if (previous.some((shot) => shot.idx === nextShot.idx)) {
    return previous as RunShotRow[];
  }

  return [...previous, nextShot].sort((left, right) => left.idx - right.idx);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.envelope.error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function deriveMetrics(shots: readonly RunShotRow[]) {
  return {
    shotsFired: shots.filter((shot) => shot.result !== "schema_error").length,
    hits: shots.filter((shot) => shot.result === "hit" || shot.result === "sunk").length,
    schemaErrors: shots.filter((shot) => shot.result === "schema_error").length,
    invalidCoordinates: shots.filter((shot) => shot.result === "invalid_coordinate").length,
  };
}

function mergeOutcome(
  meta: RunMeta,
  outcome: {
    outcome: Outcome;
    endedAt: number;
    shotsFired: number;
    hits: number;
    schemaErrors: number;
    invalidCoordinates: number;
  },
): RunMeta {
  return {
    ...meta,
    outcome: outcome.outcome,
    endedAt: outcome.endedAt,
    shotsFired: outcome.shotsFired,
    hits: outcome.hits,
    schemaErrors: outcome.schemaErrors,
    invalidCoordinates: outcome.invalidCoordinates,
  };
}

export function LiveGame(props: LiveGameProps) {
  const [runId, setRunId] = createSignal(props.runId);
  const [phase, setPhase] = createSignal<Phase>("loading");
  const [meta, setMeta] = createSignal<RunMeta | null>(null);
  const [shots, setShots] = createSignal<RunShotRow[]>([]);
  const [error, setError] = createSignal<string | null>(null);
  let unsubscribe: (() => void) | undefined;
  let loadController: AbortController | undefined;

  const cancelLoad = () => {
    loadController?.abort();
    loadController = undefined;
  };

  const metrics = createMemo(() => {
    const currentMeta = meta();
    if (currentMeta !== null && currentMeta.outcome !== null) {
      return {
        shotsFired: currentMeta.shotsFired,
        hits: currentMeta.hits,
        schemaErrors: currentMeta.schemaErrors,
        invalidCoordinates: currentMeta.invalidCoordinates,
      };
    }

    return deriveMetrics(shots());
  });

  const load = async () => {
    unsubscribe?.();
    unsubscribe = undefined;
    cancelLoad();

    const controller = new AbortController();
    loadController = controller;
    setPhase("loading");
    setError(null);

    try {
      const nextMeta = await getRun(runId(), controller.signal);
      const nextShots = await getRunShots(runId(), controller.signal);
      if (controller.signal.aborted) {
        return;
      }

      setMeta(nextMeta);
      setShots(nextShots.shots);

      if (nextMeta.outcome !== null) {
        setPhase("terminal");
        return;
      }

      setPhase("live");
      const lastShot = nextShots.shots[nextShots.shots.length - 1];

      unsubscribe = subscribeToRun(runId(), {
        lastEventId: lastShot?.idx ?? null,
        onEvent(event) {
          switch (event.kind) {
            case "open":
              return;
            case "shot":
              setShots((previous) =>
                appendShot(previous, {
                  runId: runId(),
                  idx: event.idx,
                  row: event.row,
                  col: event.col,
                  result: event.result,
                  rawResponse: "",
                  reasoningText: event.reasoning,
                  llmError: null,
                  tokensIn: 0,
                  tokensOut: 0,
                  reasoningTokens: null,
                  costUsdMicros: 0,
                  durationMs: 0,
                  createdAt: Date.now(),
                }),
              );
              return;
            case "outcome":
              setMeta((previous) => (previous === null ? previous : mergeOutcome(previous, event)));
              setPhase("terminal");
              unsubscribe?.();
              unsubscribe = undefined;
              return;
          }
        },
        onResync() {
          cancelLoad();
          unsubscribe?.();
          unsubscribe = undefined;
          void load();
        },
        onError(caughtError) {
          if (controller.signal.aborted) {
            return;
          }

          setError(resolveErrorMessage(caughtError, "The live stream disconnected."));
          setPhase("error");
        },
      });
    } catch (caughtError) {
      if (controller.signal.aborted || isAbortError(caughtError)) {
        return;
      }

      setError(resolveErrorMessage(caughtError, "Could not load the run."));
      setPhase("error");
    }
  };

  const handleAbort = async () => {
    try {
      const response = await abortRun(runId());
      if (response.outcome !== null) {
        setMeta((previous) =>
          previous === null
            ? previous
            : {
                ...previous,
                outcome: response.outcome,
              },
        );
        setPhase("terminal");
      }
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError.envelope.error.message);
      } else if (caughtError instanceof Error) {
        setError(caughtError.message);
      } else {
        setError("Could not abort the run.");
      }
      setPhase("error");
    }
  };

  onMount(() => {
    if (props.runId === "__dynamic__") {
      const resolvedRunId = window.location.pathname.split("/").filter(Boolean).at(-1) ?? "";
      if (resolvedRunId.length === 0) {
        window.location.assign("/play");
        return;
      }

      setRunId(resolvedRunId);
    }

    void load();
  });

  onCleanup(() => {
    cancelLoad();
    unsubscribe?.();
    unsubscribe = undefined;
  });

  return (
    <section class={styles.shell}>
      <div class={styles.panel}>
        <div class={styles.header}>
          <div>
            <p class={styles.eyebrow}>Run {runId()}</p>
            <h1 class={styles.title}>Live Battleship telemetry</h1>
          </div>
          <Show when={phase() === "live"}>
            <button class={styles.abortButton} type="button" onClick={() => void handleAbort()}>
              Abort run
            </button>
          </Show>
        </div>

        <div class={styles.boardWrap}>
          <BoardView shots={shots()} />
        </div>

        <div class={styles.hudGrid}>
          <article class={styles.hudCard}>
            <span class={styles.hudLabel}>Shots fired</span>
            <strong class={styles.hudValue}>{metrics().shotsFired}</strong>
          </article>
          <article class={styles.hudCard}>
            <span class={styles.hudLabel}>Hits</span>
            <strong class={styles.hudValue}>{metrics().hits}</strong>
          </article>
          <article class={styles.hudCard}>
            <span class={styles.hudLabel}>Schema errors</span>
            <strong class={styles.hudValue}>{metrics().schemaErrors}</strong>
          </article>
          <article class={styles.hudCard}>
            <span class={styles.hudLabel}>Invalid coordinates</span>
            <strong class={styles.hudValue}>{metrics().invalidCoordinates}</strong>
          </article>
        </div>

        <Show when={meta()}>
          {(currentMeta) => (
            <dl class={styles.metaGrid}>
              <div>
                <dt class={styles.metaLabel}>Model</dt>
                <dd class={styles.metaValue}>{currentMeta().displayName}</dd>
              </div>
              <div>
                <dt class={styles.metaLabel}>Seed date</dt>
                <dd class={styles.metaValue}>{currentMeta().seedDate}</dd>
              </div>
              <Show when={phase() === "terminal" && currentMeta().outcome !== null}>
                <div>
                  <dt class={styles.metaLabel}>Outcome</dt>
                  <dd class={styles.metaValue}>{currentMeta().outcome}</dd>
                </div>
              </Show>
            </dl>
          )}
        </Show>

        <Show when={phase() === "loading"}>
          <p class={styles.phaseNote}>Loading run state...</p>
        </Show>
        <Show when={phase() === "live"}>
          <p class={styles.phaseNote}>Streaming new turns as they land.</p>
        </Show>
        <Show when={phase() === "terminal"}>
          <p class={styles.phaseNote}>
            Run complete. The board now reflects the terminal shot log.{" "}
            <a href={`/runs/${encodeURIComponent(runId())}/replay`}>Open replay</a>
          </p>
        </Show>
        <Show when={phase() === "error" && error() !== null}>
          <div class={styles.errorBlock} role="alert">
            <p class={styles.errorText}>{error()}</p>
            <button class={styles.retryButton} type="button" onClick={() => void load()}>
              Retry
            </button>
          </div>
        </Show>
      </div>
    </section>
  );
}

export default LiveGame;
