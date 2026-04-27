import type {
  LeaderboardResponse,
  LeaderboardScope,
  ProvidersResponse,
} from "@battleship-arena/shared";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";

import { getLeaderboard, getProviders } from "../lib/api.ts";
import {
  formatShots,
  leaderboardFilterOptions,
  modelOptionsForProvider,
  visibleLeaderboardRows,
  type ReasoningFilterValue,
} from "./leaderboardModel.ts";
import styles from "./Leaderboard.module.css";

export function Leaderboard() {
  const [scope, setScope] = createSignal<LeaderboardScope>("today");
  const [providerFilter, setProviderFilter] = createSignal("");
  const [modelFilter, setModelFilter] = createSignal("");
  const [reasoningFilter, setReasoningFilter] = createSignal<ReasoningFilterValue>("");
  const [catalog, setCatalog] = createSignal<ProvidersResponse>({
    providers: [],
  });
  const [leaderboard, setLeaderboard] = createSignal<LeaderboardResponse | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  const modelOptions = createMemo(() => modelOptionsForProvider(catalog(), providerFilter()));
  const visibleRows = createMemo(() => visibleLeaderboardRows(leaderboard()));

  onMount(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        setCatalog(await getProviders(controller.signal));
      } catch (caughtError) {
        if (!controller.signal.aborted) {
          setError(
            caughtError instanceof Error ? caughtError.message : "Could not load providers.",
          );
        }
      }
    })();

    onCleanup(() => controller.abort());
  });

  createEffect(() => {
    const controller = new AbortController();
    const currentScope = scope();
    const providerId = providerFilter();
    const modelId = modelFilter();
    const reasoningEnabled = reasoningFilter();

    setLoading(true);
    setError(null);
    void (async () => {
      try {
        setLeaderboard(
          await getLeaderboard(currentScope, {
            ...leaderboardFilterOptions({
              providerId,
              modelId,
              reasoningFilter: reasoningEnabled,
            }),
            signal: controller.signal,
          }),
        );
      } catch (caughtError) {
        if (!controller.signal.aborted) {
          setError(
            caughtError instanceof Error ? caughtError.message : "Could not load leaderboard.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    onCleanup(() => controller.abort());
  });

  return (
    <section class={styles.root} aria-label="Leaderboard">
      <div class={styles.tabs} role="tablist" aria-label="Leaderboard period">
        <button
          class={`${styles.tab} ${scope() === "today" ? styles.tabActive : ""}`}
          type="button"
          onClick={() => setScope("today")}
        >
          Today
        </button>
        <button
          class={`${styles.tab} ${scope() === "all" ? styles.tabActive : ""}`}
          type="button"
          onClick={() => setScope("all")}
        >
          All time
        </button>
      </div>

      <Show when={error() !== null}>
        <p class={styles.error} role="alert">
          {error()}
        </p>
      </Show>

      <div class={styles.filters}>
        <label class={styles.filter}>
          <span>Provider</span>
          <select
            value={providerFilter()}
            onInput={(event) => {
              setProviderFilter(event.currentTarget.value);
              setModelFilter("");
            }}
          >
            <option value="">All</option>
            <For each={catalog().providers}>
              {(provider) => <option value={provider.id}>{provider.displayName}</option>}
            </For>
          </select>
        </label>
        <label class={styles.filter}>
          <span>Model</span>
          <select
            value={modelFilter()}
            onInput={(event) => setModelFilter(event.currentTarget.value)}
          >
            <option value="">All</option>
            <For each={modelOptions()}>
              {(model) => <option value={model.id}>{model.displayName}</option>}
            </For>
          </select>
        </label>
        <label class={styles.filter}>
          <span>Reasoning</span>
          <select
            value={reasoningFilter()}
            onInput={(event) =>
              setReasoningFilter(event.currentTarget.value as ReasoningFilterValue)
            }
          >
            <option value="">All</option>
            <option value="true">On</option>
            <option value="false">Off</option>
          </select>
        </label>
      </div>

      <Show when={!loading()} fallback={<p class={styles.note}>Loading leaderboard...</p>}>
        <Show when={visibleRows().length > 0} fallback={<p class={styles.note}>No runs yet.</p>}>
          <div class={styles.tableWrap}>
            <table class={styles.table}>
              <thead>
                <tr>
                  <th class={styles.numeric}>Rank</th>
                  <th>Model</th>
                  <th>Provider</th>
                  <th>Reasoning</th>
                  <th class={styles.numeric}>Runs</th>
                  <th class={styles.numeric}>Shots</th>
                  {scope() === "today" ? <th>Replay</th> : null}
                </tr>
              </thead>
              <tbody>
                <For each={visibleRows()}>
                  {(entry) => (
                    <tr>
                      <td class={styles.numeric}>{entry.rank}</td>
                      <td>{entry.displayName}</td>
                      <td>{entry.providerId}</td>
                      <td>{entry.reasoningEnabled ? "On" : "Off"}</td>
                      <td class={styles.numeric}>{entry.runsCount}</td>
                      <td class={styles.numeric}>{formatShots(entry.shotsToWin)}</td>
                      {scope() === "today" ? (
                        <td>
                          <Show
                            when={entry.bestRunId}
                            fallback={<span class={styles.note}>-</span>}
                          >
                            {(runId) => (
                              <a href={`/runs/${encodeURIComponent(runId())}/replay`}>Replay</a>
                            )}
                          </Show>
                        </td>
                      ) : null}
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>
    </section>
  );
}

export default Leaderboard;
