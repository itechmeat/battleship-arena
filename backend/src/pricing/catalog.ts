import type {
  ModelCostEstimate,
  ProviderCatalogProvider,
  ReasoningMode,
} from "@battleship-arena/shared";

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
}

export type PricingTable = Record<string, Record<string, PricingEntry>>;

const REVIEWED_AT = "2026-04-24";
const ZAI_REVIEWED_AT = "2026-04-26";
const OPENROUTER_SOURCE = "https://openrouter.ai/api/v1/models";
const OPENCODE_GO_SOURCE = "https://opencode.ai/docs/go/";
const ZAI_PRICING_SOURCE = "https://docs.z.ai/guides/overview/pricing";
const OPENCODE_GO_CHAT_ENDPOINT = "https://opencode.ai/zen/go/v1/chat/completions";
const ZAI_CODING_CHAT_ENDPOINT = "https://api.z.ai/api/coding/paas/v4/chat/completions";
// To refresh the OpenCode Go model list and per-model request limits, scrape the docs page:
//   curl -s https://opencode.ai/docs/go > /tmp/go-docs.html
// Then read the HTML table containing columns Model | requests-per-5h | requests-per-week |
// requests-per-month. The provider API id (used as `providerModelId`) appears in the same
// docs page in the section listing model endpoints, e.g. `kimi-k2.6`, `deepseek-v4-flash`.
// Note: the public endpoint at https://opencode.ai/zen/v1/models lists ZEN-tier (paid)
// models, NOT Go-tier; do not use it for the Go catalog.
const ESTIMATED_PROMPT_TOKENS = 1200;
const ESTIMATED_IMAGE_TOKENS = 800;
const ESTIMATED_OUTPUT_TOKENS_PER_SHOT = 120;

function usdPerMtokToMicros(usd: number): number {
  return Math.round(usd * 1_000_000);
}

function opencodeGoLimitToUsdPerMtok(requestsPerFiveHours: number): number {
  const usdPerRequest = 12 / requestsPerFiveHours;
  const estimatedTokensPerTurn =
    ESTIMATED_PROMPT_TOKENS + ESTIMATED_IMAGE_TOKENS + ESTIMATED_OUTPUT_TOKENS_PER_SHOT;

  return usdPerRequest / (estimatedTokensPerTurn / 1_000_000);
}

function withEstimatorFields(
  entry: Omit<
    PricingEntry,
    "estimatedPromptTokens" | "estimatedImageTokens" | "estimatedOutputTokensPerShot"
  >,
): PricingEntry {
  return {
    ...entry,
    estimatedPromptTokens: ESTIMATED_PROMPT_TOKENS,
    estimatedImageTokens: ESTIMATED_IMAGE_TOKENS,
    estimatedOutputTokensPerShot: ESTIMATED_OUTPUT_TOKENS_PER_SHOT,
  };
}

// OpenRouter prices are USD per token from the models API, converted to USD per 1M tokens.
const openRouterEntries: PricingEntry[] = [
  withEstimatorFields({
    providerId: "openrouter",
    providerDisplayName: "OpenRouter",
    modelId: "openai/gpt-5-nano",
    providerModelId: "openai/gpt-5-nano",
    displayName: "OpenAI: GPT-5 Nano",
    hasReasoning: true,
    inputMicrosPerMtok: usdPerMtokToMicros(0.05),
    outputMicrosPerMtok: usdPerMtokToMicros(0.4),
    priceSource: OPENROUTER_SOURCE,
    lastReviewedAt: REVIEWED_AT,
  }),
  withEstimatorFields({
    providerId: "openrouter",
    providerDisplayName: "OpenRouter",
    modelId: "openai/gpt-5-mini",
    providerModelId: "openai/gpt-5-mini",
    displayName: "OpenAI: GPT-5 Mini",
    hasReasoning: true,
    inputMicrosPerMtok: usdPerMtokToMicros(0.25),
    outputMicrosPerMtok: usdPerMtokToMicros(2),
    priceSource: OPENROUTER_SOURCE,
    lastReviewedAt: REVIEWED_AT,
  }),
  withEstimatorFields({
    providerId: "openrouter",
    providerDisplayName: "OpenRouter",
    modelId: "moonshotai/kimi-k2.6",
    providerModelId: "moonshotai/kimi-k2.6",
    displayName: "MoonshotAI: Kimi K2.6",
    hasReasoning: true,
    inputMicrosPerMtok: usdPerMtokToMicros(0.7448),
    outputMicrosPerMtok: usdPerMtokToMicros(4.655),
    priceSource: OPENROUTER_SOURCE,
    lastReviewedAt: REVIEWED_AT,
  }),
  withEstimatorFields({
    providerId: "openrouter",
    providerDisplayName: "OpenRouter",
    modelId: "anthropic/claude-haiku-4.5",
    providerModelId: "anthropic/claude-haiku-4.5",
    displayName: "Anthropic: Claude Haiku 4.5",
    hasReasoning: true,
    inputMicrosPerMtok: usdPerMtokToMicros(1),
    outputMicrosPerMtok: usdPerMtokToMicros(5),
    priceSource: OPENROUTER_SOURCE,
    lastReviewedAt: REVIEWED_AT,
  }),
  withEstimatorFields({
    providerId: "openrouter",
    providerDisplayName: "OpenRouter",
    modelId: "google/gemini-2.5-flash",
    providerModelId: "google/gemini-2.5-flash",
    displayName: "Google: Gemini 2.5 Flash",
    hasReasoning: true,
    inputMicrosPerMtok: usdPerMtokToMicros(0.3),
    outputMicrosPerMtok: usdPerMtokToMicros(2.5),
    priceSource: OPENROUTER_SOURCE,
    lastReviewedAt: REVIEWED_AT,
  }),
  withEstimatorFields({
    providerId: "openrouter",
    providerDisplayName: "OpenRouter",
    modelId: "mistralai/mistral-small-2603",
    providerModelId: "mistralai/mistral-small-2603",
    displayName: "Mistral: Mistral Small 4",
    hasReasoning: false,
    inputMicrosPerMtok: usdPerMtokToMicros(0.15),
    outputMicrosPerMtok: usdPerMtokToMicros(0.6),
    priceSource: OPENROUTER_SOURCE,
    lastReviewedAt: REVIEWED_AT,
  }),
  withEstimatorFields({
    providerId: "openrouter",
    providerDisplayName: "OpenRouter",
    modelId: "meta-llama/llama-4-scout",
    providerModelId: "meta-llama/llama-4-scout",
    displayName: "Meta: Llama 4 Scout",
    hasReasoning: false,
    inputMicrosPerMtok: usdPerMtokToMicros(0.08),
    outputMicrosPerMtok: usdPerMtokToMicros(0.3),
    priceSource: OPENROUTER_SOURCE,
    lastReviewedAt: REVIEWED_AT,
  }),
];

// OpenCode Go publishes dollar-denominated usage limits and request-count estimates rather
// than token tariffs. These blended rates divide the official Apr 24, 2026 five-hour $12
// allowance by the documented request count, then spread that request cost over this app's
// estimated per-turn tokens so the Start button reflects request-scale spend.
const openCodeGoEntries: PricingEntry[] = [
  withEstimatorFields({
    providerId: "opencode-go",
    providerDisplayName: "OpenCode Go",
    modelId: "opencode-go/glm-5.1",
    providerModelId: "glm-5.1",
    displayName: "GLM-5.1",
    hasReasoning: true,
    inputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(880)),
    outputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(880)),
    priceSource: OPENCODE_GO_SOURCE,
    lastReviewedAt: REVIEWED_AT,
    endpoint: OPENCODE_GO_CHAT_ENDPOINT,
  }),
  withEstimatorFields({
    providerId: "opencode-go",
    providerDisplayName: "OpenCode Go",
    modelId: "opencode-go/glm-5",
    providerModelId: "glm-5",
    displayName: "GLM-5",
    hasReasoning: true,
    inputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(1150)),
    outputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(1150)),
    priceSource: OPENCODE_GO_SOURCE,
    lastReviewedAt: REVIEWED_AT,
    endpoint: OPENCODE_GO_CHAT_ENDPOINT,
  }),
  withEstimatorFields({
    providerId: "opencode-go",
    providerDisplayName: "OpenCode Go",
    modelId: "opencode-go/kimi-k2.6",
    providerModelId: "kimi-k2.6",
    displayName: "Kimi K2.6",
    hasReasoning: true,
    inputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(1150)),
    outputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(1150)),
    priceSource: OPENCODE_GO_SOURCE,
    lastReviewedAt: REVIEWED_AT,
    endpoint: OPENCODE_GO_CHAT_ENDPOINT,
  }),
  withEstimatorFields({
    providerId: "opencode-go",
    providerDisplayName: "OpenCode Go",
    modelId: "opencode-go/kimi-k2.5",
    providerModelId: "kimi-k2.5",
    displayName: "Kimi K2.5",
    hasReasoning: true,
    inputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(1850)),
    outputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(1850)),
    priceSource: OPENCODE_GO_SOURCE,
    lastReviewedAt: REVIEWED_AT,
    endpoint: OPENCODE_GO_CHAT_ENDPOINT,
  }),
  withEstimatorFields({
    providerId: "opencode-go",
    providerDisplayName: "OpenCode Go",
    modelId: "opencode-go/mimo-v2-pro",
    providerModelId: "mimo-v2-pro",
    displayName: "MiMo-V2-Pro",
    hasReasoning: true,
    inputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(1290)),
    outputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(1290)),
    priceSource: OPENCODE_GO_SOURCE,
    lastReviewedAt: REVIEWED_AT,
    endpoint: OPENCODE_GO_CHAT_ENDPOINT,
  }),
  withEstimatorFields({
    providerId: "opencode-go",
    providerDisplayName: "OpenCode Go",
    modelId: "opencode-go/mimo-v2-omni",
    providerModelId: "mimo-v2-omni",
    displayName: "MiMo-V2-Omni",
    hasReasoning: true,
    inputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(2150)),
    outputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(2150)),
    priceSource: OPENCODE_GO_SOURCE,
    lastReviewedAt: REVIEWED_AT,
    endpoint: OPENCODE_GO_CHAT_ENDPOINT,
  }),
  withEstimatorFields({
    providerId: "opencode-go",
    providerDisplayName: "OpenCode Go",
    modelId: "opencode-go/mimo-v2.5-pro",
    providerModelId: "mimo-v2.5-pro",
    displayName: "MiMo-V2.5-Pro",
    hasReasoning: true,
    inputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(1290)),
    outputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(1290)),
    priceSource: OPENCODE_GO_SOURCE,
    lastReviewedAt: REVIEWED_AT,
    endpoint: OPENCODE_GO_CHAT_ENDPOINT,
  }),
  withEstimatorFields({
    providerId: "opencode-go",
    providerDisplayName: "OpenCode Go",
    modelId: "opencode-go/mimo-v2.5",
    providerModelId: "mimo-v2.5",
    displayName: "MiMo-V2.5",
    hasReasoning: true,
    inputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(2150)),
    outputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(2150)),
    priceSource: OPENCODE_GO_SOURCE,
    lastReviewedAt: REVIEWED_AT,
    endpoint: OPENCODE_GO_CHAT_ENDPOINT,
  }),
  withEstimatorFields({
    providerId: "opencode-go",
    providerDisplayName: "OpenCode Go",
    modelId: "opencode-go/minimax-m2.7",
    providerModelId: "minimax-m2.7",
    displayName: "MiniMax M2.7",
    hasReasoning: true,
    inputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(3400)),
    outputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(3400)),
    priceSource: OPENCODE_GO_SOURCE,
    lastReviewedAt: REVIEWED_AT,
    endpoint: OPENCODE_GO_CHAT_ENDPOINT,
  }),
  withEstimatorFields({
    providerId: "opencode-go",
    providerDisplayName: "OpenCode Go",
    modelId: "opencode-go/minimax-m2.5",
    providerModelId: "minimax-m2.5",
    displayName: "MiniMax M2.5",
    hasReasoning: true,
    inputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(6300)),
    outputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(6300)),
    priceSource: OPENCODE_GO_SOURCE,
    lastReviewedAt: REVIEWED_AT,
    endpoint: OPENCODE_GO_CHAT_ENDPOINT,
  }),
  withEstimatorFields({
    providerId: "opencode-go",
    providerDisplayName: "OpenCode Go",
    modelId: "opencode-go/qwen3.6-plus",
    providerModelId: "qwen3.6-plus",
    displayName: "Qwen3.6 Plus",
    hasReasoning: true,
    inputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(3300)),
    outputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(3300)),
    priceSource: OPENCODE_GO_SOURCE,
    lastReviewedAt: REVIEWED_AT,
    endpoint: OPENCODE_GO_CHAT_ENDPOINT,
  }),
  withEstimatorFields({
    providerId: "opencode-go",
    providerDisplayName: "OpenCode Go",
    modelId: "opencode-go/qwen3.5-plus",
    providerModelId: "qwen3.5-plus",
    displayName: "Qwen3.5 Plus",
    hasReasoning: true,
    inputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(10200)),
    outputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(10200)),
    priceSource: OPENCODE_GO_SOURCE,
    lastReviewedAt: REVIEWED_AT,
    endpoint: OPENCODE_GO_CHAT_ENDPOINT,
  }),
  withEstimatorFields({
    providerId: "opencode-go",
    providerDisplayName: "OpenCode Go",
    modelId: "opencode-go/deepseek-v4-pro",
    providerModelId: "deepseek-v4-pro",
    displayName: "DeepSeek V4 Pro",
    hasReasoning: true,
    inputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(1300)),
    outputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(1300)),
    priceSource: OPENCODE_GO_SOURCE,
    lastReviewedAt: REVIEWED_AT,
    endpoint: OPENCODE_GO_CHAT_ENDPOINT,
  }),
  withEstimatorFields({
    providerId: "opencode-go",
    providerDisplayName: "OpenCode Go",
    modelId: "opencode-go/deepseek-v4-flash",
    providerModelId: "deepseek-v4-flash",
    displayName: "DeepSeek V4 Flash",
    hasReasoning: true,
    inputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(7450)),
    outputMicrosPerMtok: usdPerMtokToMicros(opencodeGoLimitToUsdPerMtok(7450)),
    priceSource: OPENCODE_GO_SOURCE,
    lastReviewedAt: REVIEWED_AT,
    endpoint: OPENCODE_GO_CHAT_ENDPOINT,
  }),
];

const zaiEntries: PricingEntry[] = [
  withEstimatorFields({
    providerId: "zai",
    providerDisplayName: "Z.AI",
    modelId: "zai/glm-5.1",
    providerModelId: "glm-5.1",
    displayName: "GLM-5.1",
    hasReasoning: true,
    inputMicrosPerMtok: usdPerMtokToMicros(1.4),
    outputMicrosPerMtok: usdPerMtokToMicros(4.4),
    priceSource: ZAI_PRICING_SOURCE,
    lastReviewedAt: ZAI_REVIEWED_AT,
    endpoint: ZAI_CODING_CHAT_ENDPOINT,
  }),
  withEstimatorFields({
    providerId: "zai",
    providerDisplayName: "Z.AI",
    modelId: "zai/glm-5",
    providerModelId: "glm-5",
    displayName: "GLM-5",
    hasReasoning: true,
    inputMicrosPerMtok: usdPerMtokToMicros(1),
    outputMicrosPerMtok: usdPerMtokToMicros(3.2),
    priceSource: ZAI_PRICING_SOURCE,
    lastReviewedAt: ZAI_REVIEWED_AT,
    endpoint: ZAI_CODING_CHAT_ENDPOINT,
  }),
  withEstimatorFields({
    providerId: "zai",
    providerDisplayName: "Z.AI",
    modelId: "zai/glm-5-turbo",
    providerModelId: "glm-5-turbo",
    displayName: "GLM-5-Turbo",
    hasReasoning: true,
    inputMicrosPerMtok: usdPerMtokToMicros(1.2),
    outputMicrosPerMtok: usdPerMtokToMicros(4),
    priceSource: ZAI_PRICING_SOURCE,
    lastReviewedAt: ZAI_REVIEWED_AT,
    endpoint: ZAI_CODING_CHAT_ENDPOINT,
  }),
  withEstimatorFields({
    providerId: "zai",
    providerDisplayName: "Z.AI",
    modelId: "zai/glm-4.7",
    providerModelId: "glm-4.7",
    displayName: "GLM-4.7",
    hasReasoning: true,
    inputMicrosPerMtok: usdPerMtokToMicros(0.6),
    outputMicrosPerMtok: usdPerMtokToMicros(2.2),
    priceSource: ZAI_PRICING_SOURCE,
    lastReviewedAt: ZAI_REVIEWED_AT,
    endpoint: ZAI_CODING_CHAT_ENDPOINT,
  }),
  withEstimatorFields({
    providerId: "zai",
    providerDisplayName: "Z.AI",
    modelId: "zai/glm-4.5-air",
    providerModelId: "glm-4.5-air",
    displayName: "GLM-4.5-Air",
    hasReasoning: true,
    inputMicrosPerMtok: usdPerMtokToMicros(0.2),
    outputMicrosPerMtok: usdPerMtokToMicros(1.1),
    priceSource: ZAI_PRICING_SOURCE,
    lastReviewedAt: ZAI_REVIEWED_AT,
    endpoint: ZAI_CODING_CHAT_ENDPOINT,
  }),
];

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

export function reasoningModeForEntry(entry: PricingEntry): ReasoningMode {
  if (!entry.hasReasoning) {
    return "forced_off";
  }

  return entry.providerId === "openrouter" ? "optional" : "forced_on";
}

function requirePricingEntry(
  providerId: string,
  modelId: string,
  table: PricingTable = PRICING_TABLE,
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
  table: PricingTable = PRICING_TABLE,
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
  table: PricingTable = PRICING_TABLE,
): ModelCostEstimate {
  const range = estimateCostRangeMicros(requirePricingEntry(providerId, modelId, table));

  return {
    minUsd: range.minMicros / 1_000_000,
    maxUsd: range.maxMicros / 1_000_000,
  };
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
