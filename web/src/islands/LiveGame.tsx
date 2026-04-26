import type { Outcome, RunMeta, RunShotRow } from "@battleship-arena/shared";
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";

import { abortRun, ApiError, getRun, getRunShots } from "../lib/api.ts";
import { formatUsdMicros } from "../lib/format.ts";
import { subscribeToRun } from "../lib/sse.ts";
import { deriveMetrics, formatDurationMs } from "./liveGameMetrics.ts";
import styles from "./LiveGame.module.css";

import BoardView from "./BoardView.tsx";

type Phase = "loading" | "live" | "terminal" | "error" | "notFound";

const integerFormatter = new Intl.NumberFormat("en-US");

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

function isRunNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
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
  const [nowMs, setNowMs] = createSignal(Date.now());
  const [error, setError] = createSignal<string | null>(null);
  let unsubscribe: (() => void) | undefined;
  let loadController: AbortController | undefined;
  let clockInterval: ReturnType<typeof setInterval> | undefined;

  const cancelLoad = () => {
    loadController?.abort();
    loadController = undefined;
  };

  const metrics = createMemo(() => {
    return deriveMetrics(shots());
  });

  const elapsedMs = createMemo(() => {
    const currentMeta = meta();
    if (currentMeta === null) {
      return 0;
    }

    const endMs = currentMeta.endedAt ?? nowMs();
    return Math.max(0, endMs - currentMeta.startedAt);
  });

  const lastShotElapsedMs = createMemo(() => {
    const currentMeta = meta();
    if (currentMeta === null || phase() === "terminal") {
      return null;
    }

    const lastShot = shots().at(-1);
    return Math.max(0, nowMs() - (lastShot?.createdAt ?? currentMeta.startedAt));
  });
  const modelTitle = createMemo(() => {
    const currentMeta = meta();
    return currentMeta?.displayName ?? "Loading run";
  });
  const pageStateLabel = createMemo(() => {
    switch (phase()) {
      case "live":
        return "In progress";
      case "terminal":
        return "Finished";
      case "error":
        return "Interrupted";
      case "notFound":
        return "Run not found";
      case "loading":
        return "Loading";
    }
  });
  const reasoningStatus = createMemo(() => (meta()?.reasoningEnabled ? "On" : "Off"));

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
                  tokensIn: event.tokensIn ?? 0,
                  tokensOut: event.tokensOut ?? 0,
                  reasoningTokens: event.reasoningTokens ?? null,
                  costUsdMicros: event.costUsdMicros ?? 0,
                  durationMs: event.durationMs ?? 0,
                  createdAt: event.createdAt ?? Date.now(),
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

      if (isRunNotFound(caughtError)) {
        setError(null);
        setPhase("notFound");
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
        setMeta(await getRun(runId()));
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
    clockInterval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

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

  createEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const currentMeta = meta();
    const name = currentMeta?.displayName ?? `Run ${runId()}`;
    document.title = `${pageStateLabel()}: ${name} | BattleShipArena`;
  });

  onCleanup(() => {
    if (clockInterval !== undefined) {
      clearInterval(clockInterval);
    }

    cancelLoad();
    unsubscribe?.();
    unsubscribe = undefined;
  });

  return (
    <section class={styles.shell}>
      <Show
        when={phase() !== "notFound"}
        fallback={
          <div class={styles.panel}>
            <p class={styles.eyebrow}>404</p>
            <h1 class={styles.title}>Run not found</h1>
            <p class={styles.phaseNote}>This run does not exist or is no longer available.</p>
            <a class={styles.primaryLink} href="/play">
              Start run
            </a>
          </div>
        }
      >
        <div class={styles.panel}>
          <div class={styles.header}>
            <div>
              <p class={styles.eyebrow}>Run {runId()}</p>
              <h1 class={styles.title}>
                <span>Battleship</span>
                <span class={styles.modelTitle}>{modelTitle()}</span>
              </h1>
              <Show when={meta()}>
                <p class={styles.reasoningLine}>Reasoning: {reasoningStatus()}</p>
              </Show>
              <Show when={meta()}>
                <div class={styles.timerRow} aria-label="Run timers">
                  <span class={styles.timerPill}>
                    <span class={styles.timerLabel}>Elapsed</span>
                    <strong>{formatDurationMs(elapsedMs())}</strong>
                  </span>
                  <Show
                    when={phase() === "terminal" && meta()?.outcome !== null}
                    fallback={
                      <Show when={lastShotElapsedMs() !== null}>
                        <span class={styles.timerPill}>
                          <span class={styles.timerLabel}>Since shot</span>
                          <strong>{formatDurationMs(lastShotElapsedMs() ?? 0)}</strong>
                        </span>
                      </Show>
                    }
                  >
                    <span class={styles.timerPill}>
                      <span class={styles.timerLabel}>Result</span>
                      <strong>{meta()?.outcome}</strong>
                    </span>
                  </Show>
                  <Show when={phase() === "live"}>
                    <button
                      class={styles.abortButton}
                      type="button"
                      onClick={() => void handleAbort()}
                    >
                      Abort
                    </button>
                  </Show>
                </div>
              </Show>
            </div>
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
              <span class={styles.hudLabel}>Timeouts</span>
              <strong class={styles.hudValue}>{metrics().timeoutErrors}</strong>
            </article>
            <article class={styles.hudCard}>
              <span class={styles.hudLabel}>Invalid coordinates</span>
              <strong class={styles.hudValue}>{metrics().invalidCoordinates}</strong>
            </article>
          </div>

          <div class={styles.resourceGrid}>
            <article class={styles.hudCard}>
              <span class={styles.hudLabel}>Tokens in</span>
              <strong class={styles.resourceValue}>
                {integerFormatter.format(metrics().tokensIn)}
              </strong>
            </article>
            <article class={styles.hudCard}>
              <span class={styles.hudLabel}>Tokens out</span>
              <strong class={styles.resourceValue}>
                {integerFormatter.format(metrics().tokensOut)}
              </strong>
            </article>
            <article class={styles.hudCard}>
              <span class={styles.hudLabel}>Reasoning tokens</span>
              <strong class={styles.resourceValue}>
                {integerFormatter.format(metrics().reasoningTokens)}
              </strong>
            </article>
            <article class={styles.hudCard}>
              <span class={styles.hudLabel}>Cost</span>
              <strong class={styles.resourceValue}>
                {formatUsdMicros(metrics().costUsdMicros)}
              </strong>
            </article>
          </div>

          <Show when={meta()}>
            {(currentMeta) => (
              <dl class={styles.metaGrid}>
                <div>
                  <dt class={styles.metaLabel}>Seed date</dt>
                  <dd class={styles.metaValue}>{currentMeta().seedDate}</dd>
                </div>
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
              Finished. <a href={`/runs/${encodeURIComponent(runId())}/replay`}>Replay</a>
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
      </Show>
    </section>
  );
}

export default LiveGame;
