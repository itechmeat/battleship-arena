import { PRICING_TABLE, type PricingTable } from "../pricing/catalog.ts";

import { createOpenAiCompatibleAdapter } from "./openai-compatible.ts";

export interface CreateZaiAdapterOptions {
  fetch?: typeof globalThis.fetch;
  pricing?: PricingTable;
}

const ZAI_PROVIDER_ID = "zai";
const ZAI_CODING_CHAT_ENDPOINT = "https://api.z.ai/api/coding/paas/v4/chat/completions";
const ZAI_REASONING_MAX_TOKENS = 4_096;

export function createZaiAdapter(options: CreateZaiAdapterOptions = {}) {
  return createOpenAiCompatibleAdapter({
    id: ZAI_PROVIDER_ID,
    displayName: "Z.AI",
    fetch: options.fetch ?? globalThis.fetch,
    pricing: options.pricing ?? PRICING_TABLE,
    defaultEndpoint: ZAI_CODING_CHAT_ENDPOINT,
    includeVerbosity: false,
    reasoningModelMaxTokens: ZAI_REASONING_MAX_TOKENS,
    reasoningRequestFields() {
      return { thinking: { type: "enabled", clear_thinking: true } };
    },
    mapRequestModelId(modelId) {
      return modelId.startsWith("zai/") ? modelId.slice("zai/".length) : modelId;
    },
  });
}
