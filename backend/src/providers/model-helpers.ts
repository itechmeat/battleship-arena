import {
  listProviderPricing,
  reasoningModeForEntry,
  type PricingEntry,
  type PricingTable,
} from "../pricing/catalog.ts";

import type { ProviderModel } from "./types.ts";

export interface ProviderModelLookup {
  entries: PricingEntry[];
  models: ProviderModel[];
  entryById: Map<string, PricingEntry>;
  modelById: Map<string, ProviderModel>;
}

export function createProviderModelLookup(
  providerId: PricingEntry["providerId"],
  pricing: PricingTable,
): ProviderModelLookup {
  const entries = listProviderPricing(providerId, pricing);
  const models = entries.map((entry) => ({
    id: entry.modelId,
    displayName: entry.displayName,
    hasReasoning: entry.hasReasoning,
    reasoningMode: entry.reasoningMode ?? reasoningModeForEntry(entry),
  }));

  return {
    entries,
    models,
    entryById: new Map(entries.map((entry) => [entry.modelId, entry])),
    modelById: new Map(models.map((model) => [model.id, model])),
  };
}

export function resolveProviderReasoningEnabled(
  model: ProviderModel,
  requested: boolean | undefined,
): boolean {
  if (!model.hasReasoning || model.reasoningMode === "forced_off") {
    return false;
  }

  if (model.reasoningMode === "forced_on") {
    return true;
  }

  return requested ?? true;
}

export function supportsProviderResponseFormat(entry: PricingEntry): boolean {
  return entry.supportsResponseFormat !== false;
}
