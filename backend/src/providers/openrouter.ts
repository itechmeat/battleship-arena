import { PRICING_TABLE, type PricingTable } from "../pricing/catalog.ts";

import { createOpenAiCompatibleAdapter } from "./openai-compatible.ts";

export interface CreateOpenRouterAdapterOptions {
  fetch?: typeof globalThis.fetch;
  pricing?: PricingTable;
}

export function createOpenRouterAdapter(options: CreateOpenRouterAdapterOptions = {}) {
  return createOpenAiCompatibleAdapter({
    id: "openrouter",
    displayName: "OpenRouter",
    fetch: options.fetch ?? globalThis.fetch,
    pricing: options.pricing ?? PRICING_TABLE,
    defaultEndpoint: "https://openrouter.ai/api/v1/chat/completions",
    headers: {
      "HTTP-Referer": "https://battleshiparena.local",
      "X-Title": "BattleShipArena",
    },
  });
}
