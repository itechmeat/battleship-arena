import type { ProvidersResponseProvider } from "@battleship-arena/shared";
import { createMemo, createSignal, onMount, Show } from "solid-js";

import { ApiError, getProviders, startRun } from "../lib/api.ts";
import styles from "./StartRunForm.module.css";

const MOCK_MODEL_METADATA = {
  pricing: {
    inputUsdPerMtok: 0,
    outputUsdPerMtok: 0,
  },
  estimatedPromptTokens: 0,
  estimatedImageTokens: 0,
  estimatedOutputTokensPerShot: 0,
  estimatedCostRange: { minUsd: 0, maxUsd: 0 },
  priceSource: "local",
  lastReviewedAt: "2026-04-24",
} as const;

const MOCK_PROVIDER: ProvidersResponseProvider = {
  id: "mock",
  displayName: "Mock",
  models: [
    {
      id: "mock-happy",
      displayName: "Mock - winning run",
      hasReasoning: false,
      ...MOCK_MODEL_METADATA,
    },
    {
      id: "mock-misses",
      displayName: "Mock - always misses",
      hasReasoning: false,
      ...MOCK_MODEL_METADATA,
    },
    {
      id: "mock-schema-errors",
      displayName: "Mock - schema errors",
      hasReasoning: false,
      ...MOCK_MODEL_METADATA,
    },
  ],
};

const MOCK_ENABLED_MODES = new Set(["development", "staging", "test"]);

export function shouldInjectMockProvider(mode: string): boolean {
  return MOCK_ENABLED_MODES.has(mode);
}

const SHOULD_INJECT_MOCK = shouldInjectMockProvider(import.meta.env.MODE);

export function StartRunForm() {
  const [providers, setProviders] = createSignal<readonly ProvidersResponseProvider[]>(
    SHOULD_INJECT_MOCK ? [MOCK_PROVIDER] : [],
  );
  const [providerId, setProviderId] = createSignal(SHOULD_INJECT_MOCK ? "mock" : "");
  const [modelId, setModelId] = createSignal(SHOULD_INJECT_MOCK ? "mock-happy" : "");
  const [apiKey, setApiKey] = createSignal("");
  const [budgetUsd, setBudgetUsd] = createSignal("");
  const [mockCost, setMockCost] = createSignal<number | undefined>(undefined);
  const [busy, setBusy] = createSignal(false);
  const [loadingCatalog, setLoadingCatalog] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  const selectedProvider = createMemo(
    () => providers().find((provider) => provider.id === providerId()) ?? providers()[0] ?? null,
  );
  const modelOptions = createMemo(() => selectedProvider()?.models ?? []);
  const selectedModel = createMemo(
    () => modelOptions().find((model) => model.id === modelId()) ?? modelOptions()[0] ?? null,
  );
  const startButtonLabel = createMemo(() => {
    if (busy()) {
      return "Starting...";
    }

    const model = selectedModel();
    if (model === null) {
      return `Start ${selectedProvider()?.displayName ?? "run"}`;
    }

    return `Start ${selectedProvider()?.displayName ?? "run"} · $${model.estimatedCostRange.minUsd.toFixed(6)}-${model.estimatedCostRange.maxUsd.toFixed(6)}${model.hasReasoning ? " · Reasoning models may cost more" : ""}`;
  });

  onMount(() => {
    if (SHOULD_INJECT_MOCK) {
      const rawMockCost = new URLSearchParams(window.location.search).get("mockCost");
      const parsedMockCost = rawMockCost === null ? undefined : Number.parseFloat(rawMockCost);

      if (parsedMockCost !== undefined && Number.isFinite(parsedMockCost) && parsedMockCost >= 0) {
        setMockCost(parsedMockCost);
      }
    }

    void (async () => {
      try {
        const catalog = await getProviders();
        const nextProviders = SHOULD_INJECT_MOCK
          ? [...catalog.providers, MOCK_PROVIDER]
          : catalog.providers;
        const firstProvider = nextProviders[0];
        const firstModel = firstProvider?.models[0];

        setProviders(nextProviders);
        if (firstProvider !== undefined && providerId().length === 0) {
          setProviderId(firstProvider.id);
        }
        if (firstModel !== undefined && modelId().length === 0) {
          setModelId(firstModel.id);
        }
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Could not load providers.");
      } finally {
        setLoadingCatalog(false);
      }
    })();
  });

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
        (!Number.isFinite(parsedBudget) || (parsedBudget !== undefined && parsedBudget < 0))
      ) {
        setError("Budget must be zero or a positive number.");
        setBusy(false);
        return;
      }

      if (selectedProvider() === null || selectedModel() === null) {
        setError("Choose a provider and model.");
        setBusy(false);
        return;
      }

      const selectedMockCost = mockCost();
      const response = await startRun({
        providerId: providerId(),
        modelId: modelId(),
        apiKey: apiKey(),
        ...(parsedBudget === undefined || parsedBudget === 0 ? {} : { budgetUsd: parsedBudget }),
        ...(selectedMockCost === undefined || providerId() !== "mock"
          ? {}
          : { mockCost: selectedMockCost }),
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
        <h1 class={styles.title}>Launch a Battleship run</h1>
        <p class={styles.description}>
          Pick a provider model, provide your own provider key, and watch the run play out in real
          time on a fixed board.
        </p>

        <form class={styles.form} onSubmit={handleSubmit} aria-busy={busy()}>
          <label class={styles.field}>
            <span class={styles.label}>Provider</span>
            <select
              class={styles.select}
              value={providerId()}
              onInput={(event) => {
                const nextProvider = providers().find(
                  (provider) => provider.id === event.currentTarget.value,
                );
                setProviderId(event.currentTarget.value);
                setModelId(nextProvider?.models[0]?.id ?? "");
              }}
              disabled={busy() || loadingCatalog()}
            >
              {providers().map((provider) => (
                <option value={provider.id}>{provider.displayName}</option>
              ))}
            </select>
          </label>

          <label class={styles.field}>
            <span class={styles.label}>Model</span>
            <select
              class={styles.select}
              value={modelId()}
              onInput={(event) => setModelId(event.currentTarget.value)}
              disabled={busy() || loadingCatalog()}
            >
              {modelOptions().map((option) => (
                <option value={option.id}>{option.displayName}</option>
              ))}
            </select>
            <Show when={selectedModel()}>
              {(model) => (
                <span class={styles.helper}>
                  Estimated game cost: ${model().estimatedCostRange.minUsd.toFixed(6)}-
                  {model().estimatedCostRange.maxUsd.toFixed(6)}
                  {model().hasReasoning ? ". Reasoning models may cost more." : ""}
                </span>
              )}
            </Show>
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
              min="0"
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
            {startButtonLabel()}
          </button>
        </form>
      </div>
    </section>
  );
}

export default StartRunForm;
