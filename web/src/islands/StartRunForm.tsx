import { createSignal } from "solid-js";

import { ApiError, startRun } from "../lib/api.ts";
import styles from "./StartRunForm.module.css";

const MODEL_OPTIONS = [
  {
    id: "mock-happy",
    label: "Mock happy",
    description: "Wins a full game deterministically",
  },
  {
    id: "mock-misses",
    label: "Mock misses",
    description: "Burns the whole shot cap without a win",
  },
  {
    id: "mock-schema-errors",
    label: "Mock schema errors",
    description: "Triggers the consecutive schema-error DNF path",
  },
];

export function StartRunForm() {
  const [providerId, setProviderId] = createSignal("mock");
  const [modelId, setModelId] = createSignal("mock-happy");
  const [apiKey, setApiKey] = createSignal("");
  const [budgetUsd, setBudgetUsd] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const handleSubmit = async (submitEvent: SubmitEvent) => {
    submitEvent.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const normalizedBudget = budgetUsd().trim();
      const parsedBudget =
        normalizedBudget.length === 0 ? undefined : Number.parseFloat(normalizedBudget);

      if (
        normalizedBudget.length > 0 &&
        (!Number.isFinite(parsedBudget) || (parsedBudget !== undefined && parsedBudget <= 0))
      ) {
        setError("Budget must be a positive number.");
        setBusy(false);
        return;
      }

      const response = await startRun({
        providerId: providerId(),
        modelId: modelId(),
        apiKey: apiKey(),
        ...(parsedBudget === undefined ? {} : { budgetUsd: parsedBudget }),
      });

      window.location.assign(`/runs/${response.runId}`);
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError.envelope.error.message);
      } else if (caughtError instanceof Error) {
        setError(caughtError.message);
      } else {
        setError("Could not start the run.");
      }
      setBusy(false);
    }
  };

  return (
    <section class={styles.shell}>
      <div class={styles.panel}>
        <p class={styles.eyebrow}>Daily seeded benchmark</p>
        <h1 class={styles.title}>Launch a mock Battleship run</h1>
        <p class={styles.description}>
          Pick a deterministic model path, provide your own provider key, and watch the run play out
          in real time on a fixed board.
        </p>

        <form class={styles.form} onSubmit={handleSubmit} aria-busy={busy()}>
          <label class={styles.field}>
            <span class={styles.label}>Provider</span>
            <select
              class={styles.select}
              value={providerId()}
              onInput={(event) => setProviderId(event.currentTarget.value)}
              disabled={busy()}
            >
              <option value="mock">mock</option>
            </select>
          </label>

          <label class={styles.field}>
            <span class={styles.label}>Model</span>
            <select
              class={styles.select}
              value={modelId()}
              onInput={(event) => setModelId(event.currentTarget.value)}
              disabled={busy()}
            >
              {MODEL_OPTIONS.map((option) => (
                <option value={option.id}>{option.label}</option>
              ))}
            </select>
            <span class={styles.helper}>
              {MODEL_OPTIONS.find((option) => option.id === modelId())?.description}
            </span>
          </label>

          <label class={styles.field}>
            <span class={styles.label}>API key</span>
            <input
              class={styles.input}
              type="password"
              autocomplete="off"
              required
              placeholder="Paste your provider key"
              value={apiKey()}
              onInput={(event) => setApiKey(event.currentTarget.value)}
              disabled={busy()}
            />
            <span class={styles.helper}>Keys stay in-memory for the duration of one run only.</span>
          </label>

          <label class={styles.field}>
            <span class={styles.label}>Budget in USD</span>
            <input
              class={styles.input}
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              placeholder="Optional"
              value={budgetUsd()}
              onInput={(event) => setBudgetUsd(event.currentTarget.value)}
              disabled={busy()}
            />
          </label>

          {error() !== null && (
            <p class={styles.error} role="alert">
              {error()}
            </p>
          )}

          <button class={styles.button} type="submit" disabled={busy()}>
            {busy() ? "Starting..." : "Start run"}
          </button>
        </form>
      </div>
    </section>
  );
}

export default StartRunForm;
