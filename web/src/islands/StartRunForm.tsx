import type { ProvidersResponseProvider } from "@battleship-arena/shared";
import { createEffect, createMemo, createSignal, onMount, Show } from "solid-js";

import { ApiError, getProviders, startRun } from "../lib/api.ts";
import { readStoredApiKey, writeStoredApiKey } from "../lib/browser-storage.ts";
import {
  defaultReasoningEnabled,
  formatUsdRange,
  MOCK_PROVIDER,
  parseBudgetUsdInput,
  parseMockCostFromSearch,
  reasoningControlText,
  reasoningHelperText,
  resolveReasoningEnabled,
  shouldInjectMockProvider,
  syncCatalogSelection,
} from "./startRunFormModel.ts";
import styles from "./StartRunForm.module.css";

const SHOULD_INJECT_MOCK = shouldInjectMockProvider(import.meta.env.MODE);

export function StartRunForm() {
  const [providers, setProviders] = createSignal<readonly ProvidersResponseProvider[]>(
    SHOULD_INJECT_MOCK ? [MOCK_PROVIDER] : [],
  );
  const [providerId, setProviderId] = createSignal(SHOULD_INJECT_MOCK ? "mock" : "");
  const [modelId, setModelId] = createSignal(SHOULD_INJECT_MOCK ? "mock-happy" : "");
  const [apiKey, setApiKey] = createSignal("");
  const [reasoningEnabled, setReasoningEnabled] = createSignal(false);
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

    return `Start ${selectedProvider()?.displayName ?? "run"} · ${formatUsdRange(
      model.estimatedCostRange.minUsd,
      model.estimatedCostRange.maxUsd,
    )}${model.hasReasoning ? " · Reasoning models may cost more" : ""}`;
  });
  const effectiveReasoningEnabled = createMemo(() =>
    resolveReasoningEnabled(selectedModel(), reasoningEnabled()),
  );
  const reasoningDescriptionId = "reasoning-mode-helper";

  createEffect((previousSelectionKey: string | undefined) => {
    const model = selectedModel();
    const selectionKey = `${providerId()}:${model?.id ?? ""}:${model?.reasoningMode ?? ""}`;
    if (selectionKey !== previousSelectionKey) {
      setReasoningEnabled(defaultReasoningEnabled(model));
    }

    return selectionKey;
  });

  onMount(() => {
    if (SHOULD_INJECT_MOCK) {
      setMockCost(parseMockCostFromSearch(window.location.search));
    }

    void (async () => {
      try {
        const catalog = await getProviders();
        const nextProviders = SHOULD_INJECT_MOCK
          ? [...catalog.providers, MOCK_PROVIDER]
          : catalog.providers;
        const nextSelection = syncCatalogSelection(nextProviders, providerId(), modelId());

        setProviders(nextProviders);
        setProviderId(nextSelection.providerId);
        setModelId(nextSelection.modelId);
        setApiKey(readStoredApiKey(nextSelection.providerId));
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
      const parsedBudget = parseBudgetUsdInput(budgetUsd());

      if (!parsedBudget.ok) {
        setError(parsedBudget.error ?? "Budget must be zero or a positive number.");
        setBusy(false);
        return;
      }

      if (selectedProvider() === null || selectedModel() === null) {
        setError("Choose a provider and model.");
        setBusy(false);
        return;
      }

      const selectedMockCost = mockCost();
      writeStoredApiKey(providerId(), apiKey());
      const response = await startRun({
        providerId: providerId(),
        modelId: modelId(),
        apiKey: apiKey(),
        reasoningEnabled: effectiveReasoningEnabled(),
        ...(parsedBudget.budgetUsd === undefined ? {} : { budgetUsd: parsedBudget.budgetUsd }),
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
                const nextModelId = nextProvider?.models[0]?.id ?? "";
                setModelId(nextModelId);
                setApiKey(readStoredApiKey(event.currentTarget.value));
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
              onInput={(event) => {
                setModelId(event.currentTarget.value);
              }}
              disabled={busy() || loadingCatalog()}
            >
              {modelOptions().map((option) => (
                <option value={option.id}>{option.displayName}</option>
              ))}
            </select>
            <Show when={selectedModel()}>
              {(model) => (
                <span class={styles.helper}>
                  Estimated game cost:{" "}
                  {formatUsdRange(
                    model().estimatedCostRange.minUsd,
                    model().estimatedCostRange.maxUsd,
                  )}
                  {model().hasReasoning ? ". Reasoning-capable models may cost more." : ""}
                </span>
              )}
            </Show>
          </label>

          <Show when={selectedModel()}>
            {(model) => (
              <div class={styles.checkboxGroup}>
                <label class={styles.checkboxField}>
                  <input
                    type="checkbox"
                    checked={effectiveReasoningEnabled()}
                    disabled={busy() || model().reasoningMode !== "optional"}
                    aria-describedby={reasoningDescriptionId}
                    title={reasoningHelperText(model())}
                    onInput={(event) => setReasoningEnabled(event.currentTarget.checked)}
                  />
                  <span>{reasoningControlText(model(), effectiveReasoningEnabled())}</span>
                </label>
                <span id={reasoningDescriptionId} class={styles.helper}>
                  {reasoningHelperText(model())}
                </span>
              </div>
            )}
          </Show>

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
              onChange={(event) => writeStoredApiKey(providerId(), event.currentTarget.value)}
              disabled={busy()}
            />
            <span class={styles.helper}>
              Stored locally for this provider and sent only when starting a run.
            </span>
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
