import type {
  ModelCostEstimate,
  ProviderCatalogProvider,
  ReasoningMode,
} from "@battleship-arena/shared";

import {
  calculateCostUsdMicros as calculateCostUsdMicrosWithTable,
  estimateGameCostRangeUsd as estimateGameCostRangeUsdWithTable,
} from "./calculator.ts";
import { PRICING_TABLE } from "./repository.ts";

export interface TokenUsage {
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number | null;
}

export interface PricingEntry {
  providerId: "openrouter" | "opencode-go" | "zai";
  providerDisplayName: string;
  modelId: string;
  providerModelId: string;
  displayName: string;
  hasReasoning: boolean;
  reasoningMode?: ReasoningMode;
  inputMicrosPerMtok: number;
  outputMicrosPerMtok: number;
  estimatedPromptTokens: number;
  estimatedImageTokens: number;
  estimatedOutputTokensPerShot: number;
  priceSource: string;
  lastReviewedAt: string;
  endpoint?: string;
  supportsResponseFormat?: boolean;
}

export type PricingTable = Record<string, Record<string, PricingEntry>>;

export type { ModelCostEstimate, ProviderCatalogProvider, ReasoningMode };
export {
  computeCostMicros,
  estimateCostRangeMicros,
  reasoningModeForEntry,
  requirePricingEntry,
} from "./calculator.ts";
export {
  PRICING_TABLE,
  getPricingEntry,
  listPricedModels,
  listProviderCatalog,
  listProviderPricing,
} from "./repository.ts";

export function calculateCostUsdMicros(
  providerId: string,
  modelId: string,
  usage: TokenUsage,
  table: PricingTable = PRICING_TABLE,
): number {
  return calculateCostUsdMicrosWithTable(providerId, modelId, usage, table);
}

export function estimateGameCostRangeUsd(
  providerId: string,
  modelId: string,
  table: PricingTable = PRICING_TABLE,
): ModelCostEstimate {
  return estimateGameCostRangeUsdWithTable(providerId, modelId, table);
}
