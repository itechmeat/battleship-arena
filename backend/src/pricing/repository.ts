import type { ProviderCatalogProvider } from "@battleship-arena/shared";

import { estimateGameCostRangeUsd, reasoningModeForEntry } from "./calculator.ts";
import type { PricingEntry, PricingTable } from "./catalog.ts";
import { openCodeGoEntries } from "./data/opencode-go.ts";
import { openRouterEntries } from "./data/openrouter.ts";
import { zaiEntries } from "./data/zai.ts";

function indexEntries(entries: readonly PricingEntry[]): Record<string, PricingEntry> {
  return Object.fromEntries(entries.map((entry) => [entry.modelId, entry]));
}

export const PRICING_TABLE: PricingTable = {
  openrouter: indexEntries(openRouterEntries),
  "opencode-go": indexEntries(openCodeGoEntries),
  zai: indexEntries(zaiEntries),
};

export function listProviderPricing(
  providerId: string,
  table: PricingTable = PRICING_TABLE,
): PricingEntry[] {
  return Object.values(table[providerId] ?? {}).sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );
}

export function listPricedModels(table: PricingTable = PRICING_TABLE): PricingEntry[] {
  return Object.values(table)
    .flatMap((models) => Object.values(models))
    .sort(
      (left, right) =>
        left.providerDisplayName.localeCompare(right.providerDisplayName) ||
        left.displayName.localeCompare(right.displayName),
    );
}

export function getPricingEntry(
  providerId: string,
  modelId: string,
  table: PricingTable = PRICING_TABLE,
): PricingEntry | undefined {
  return table[providerId]?.[modelId];
}

export function listProviderCatalog(
  table: PricingTable = PRICING_TABLE,
): ProviderCatalogProvider[] {
  return Object.entries(table).map(([providerId, entries]) => {
    const models = Object.values(entries).sort((left, right) =>
      left.displayName.localeCompare(right.displayName),
    );
    const first = models[0];

    return {
      id: providerId,
      displayName: first?.providerDisplayName ?? providerId,
      models: models.map((entry) => ({
        id: entry.modelId,
        displayName: entry.displayName,
        hasReasoning: entry.hasReasoning,
        reasoningMode: entry.reasoningMode ?? reasoningModeForEntry(entry),
        pricing: {
          inputUsdPerMtok: entry.inputMicrosPerMtok / 1_000_000,
          outputUsdPerMtok: entry.outputMicrosPerMtok / 1_000_000,
        },
        estimatedPromptTokens: entry.estimatedPromptTokens,
        estimatedImageTokens: entry.estimatedImageTokens,
        estimatedOutputTokensPerShot: entry.estimatedOutputTokensPerShot,
        estimatedCostRange: estimateGameCostRangeUsd(entry.providerId, entry.modelId, table),
        priceSource: entry.priceSource,
        lastReviewedAt: entry.lastReviewedAt,
      })),
    };
  });
}
