import { PRICING_TABLE, type PricingTable } from "../pricing/catalog.ts";

import { createOpenAiCompatibleAdapter } from "./openai-compatible.ts";

export interface CreateOpenCodeGoAdapterOptions {
  fetch?: typeof globalThis.fetch;
  pricing?: PricingTable;
}

export function createOpenCodeGoAdapter(options: CreateOpenCodeGoAdapterOptions = {}) {
  return createOpenAiCompatibleAdapter({
    id: "opencode-go",
    displayName: "OpenCode Go",
    fetch: options.fetch ?? globalThis.fetch,
    pricing: options.pricing ?? PRICING_TABLE,
    defaultEndpoint: "https://opencode.ai/zen/go/v1/chat/completions",
    mapRequestModelId(modelId) {
      return modelId.startsWith("opencode-go/") ? modelId.slice("opencode-go/".length) : modelId;
    },
  });
}
