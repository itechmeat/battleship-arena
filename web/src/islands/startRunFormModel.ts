import type { ProvidersResponseModel, ProvidersResponseProvider } from "@battleship-arena/shared";

import { formatUsd } from "../lib/format.ts";

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

export const MOCK_PROVIDER: ProvidersResponseProvider = {
  id: "mock",
  displayName: "Mock",
  models: [
    {
      id: "mock-happy",
      displayName: "Mock - winning run",
      hasReasoning: false,
      reasoningMode: "forced_off",
      ...MOCK_MODEL_METADATA,
    },
    {
      id: "mock-misses",
      displayName: "Mock - always misses",
      hasReasoning: false,
      reasoningMode: "forced_off",
      ...MOCK_MODEL_METADATA,
    },
    {
      id: "mock-schema-errors",
      displayName: "Mock - schema errors",
      hasReasoning: false,
      reasoningMode: "forced_off",
      ...MOCK_MODEL_METADATA,
    },
  ],
};

export const MOCK_ENABLED_MODES = new Set(["development", "staging", "test"]);
export const BUDGET_VALIDATION_MESSAGE = "Budget must be zero or a positive number.";

export interface ParsedBudget {
  ok: boolean;
  budgetUsd?: number;
  error?: string;
}

export function shouldInjectMockProvider(mode: string): boolean {
  return MOCK_ENABLED_MODES.has(mode);
}

export function formatUsdRange(minUsd: number, maxUsd: number): string {
  const minLabel = formatUsd(minUsd);
  const maxLabel = formatUsd(maxUsd);
  return minLabel === maxLabel ? minLabel : `${minLabel}-${maxLabel}`;
}

export function syncCatalogSelection(
  nextProviders: readonly ProvidersResponseProvider[],
  currentProviderId: string,
  currentModelId: string,
): { providerId: string; modelId: string } {
  const firstProvider = nextProviders[0];
  if (firstProvider === undefined) {
    return { providerId: currentProviderId, modelId: currentModelId };
  }

  const nextProvider =
    currentProviderId === MOCK_PROVIDER.id && firstProvider.id !== MOCK_PROVIDER.id
      ? firstProvider
      : (nextProviders.find((provider) => provider.id === currentProviderId) ?? firstProvider);
  const nextModel =
    nextProvider.models.find((model) => model.id === currentModelId) ?? nextProvider.models[0];

  return {
    providerId: nextProvider.id,
    modelId: nextModel?.id ?? "",
  };
}

export function defaultReasoningEnabled(model: ProvidersResponseModel | null): boolean {
  return model?.reasoningMode === "forced_on" || model?.reasoningMode === "optional";
}

export function resolveReasoningEnabled(
  model: ProvidersResponseModel | null,
  requested: boolean,
): boolean {
  if (model?.reasoningMode === "forced_on") {
    return true;
  }

  if (model?.reasoningMode === "forced_off") {
    return false;
  }

  return requested;
}

export function reasoningControlText(
  model: ProvidersResponseModel | null,
  enabled: boolean,
): string {
  if (model?.reasoningMode === "forced_on") {
    return "Reasoning required";
  }

  if (model?.reasoningMode === "forced_off") {
    return "Reasoning unavailable";
  }

  return enabled ? "Reasoning enabled" : "Reasoning disabled";
}

export function reasoningHelperText(model: ProvidersResponseModel): string {
  if (model.reasoningMode === "forced_on") {
    return "This model always uses reasoning.";
  }

  if (model.reasoningMode === "forced_off") {
    return "This model does not support reasoning controls.";
  }

  return "Toggle reasoning for this optional model.";
}

export function parseBudgetUsdInput(rawBudget: string): ParsedBudget {
  const normalizedBudget = rawBudget.trim();
  const parsedBudget =
    normalizedBudget.length === 0 ? undefined : Number.parseFloat(normalizedBudget);

  if (
    normalizedBudget.length > 0 &&
    (!Number.isFinite(parsedBudget) || (parsedBudget !== undefined && parsedBudget < 0))
  ) {
    return { ok: false, error: BUDGET_VALIDATION_MESSAGE };
  }

  return parsedBudget === undefined || parsedBudget === 0
    ? { ok: true }
    : { ok: true, budgetUsd: parsedBudget };
}

export function parseMockCostFromSearch(search: string): number | undefined {
  const rawMockCost = new URLSearchParams(search).get("mockCost");
  const parsedMockCost = rawMockCost === null ? undefined : Number.parseFloat(rawMockCost);

  return parsedMockCost !== undefined && Number.isFinite(parsedMockCost) && parsedMockCost >= 0
    ? parsedMockCost
    : undefined;
}
