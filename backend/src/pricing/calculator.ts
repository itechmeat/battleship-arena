import type { ModelCostEstimate, ReasoningMode } from "@battleship-arena/shared";

import type { PricingEntry, PricingTable, TokenUsage } from "./catalog.ts";

export function reasoningModeForEntry(entry: PricingEntry): ReasoningMode {
  if (!entry.hasReasoning) {
    return "forced_off";
  }

  return entry.providerId === "openrouter" ? "optional" : "forced_on";
}

export function requirePricingEntry(
  providerId: string,
  modelId: string,
  table: PricingTable,
): PricingEntry {
  const entry = table[providerId]?.[modelId];
  if (entry === undefined) {
    throw new Error(`Missing pricing entry for ${providerId}/${modelId}`);
  }

  return entry;
}

export function computeCostMicros(
  entry: PricingEntry,
  tokensIn: number,
  tokensOut: number,
): number {
  return (
    Math.floor((tokensIn * entry.inputMicrosPerMtok) / 1_000_000) +
    Math.floor((tokensOut * entry.outputMicrosPerMtok) / 1_000_000)
  );
}

export function calculateCostUsdMicros(
  providerId: string,
  modelId: string,
  usage: TokenUsage,
  table: PricingTable,
): number {
  const entry = requirePricingEntry(providerId, modelId, table);

  return computeCostMicros(entry, usage.tokensIn, usage.tokensOut);
}

export function estimateCostRangeMicros(entry: PricingEntry): {
  minMicros: number;
  maxMicros: number;
} {
  const perTurnMicros = computeCostMicros(
    entry,
    entry.estimatedPromptTokens + entry.estimatedImageTokens,
    entry.estimatedOutputTokensPerShot,
  );

  return {
    minMicros: perTurnMicros * 17,
    maxMicros: perTurnMicros * 100,
  };
}

export function estimateGameCostRangeUsd(
  providerId: string,
  modelId: string,
  table: PricingTable,
): ModelCostEstimate {
  const range = estimateCostRangeMicros(requirePricingEntry(providerId, modelId, table));

  return {
    minUsd: range.minMicros / 1_000_000,
    maxUsd: range.maxMicros / 1_000_000,
  };
}
