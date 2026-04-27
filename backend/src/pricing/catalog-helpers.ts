import type { PricingEntry } from "./catalog.ts";

export const REVIEWED_AT = "2026-04-27";
export const OPENCODE_GO_REVIEWED_AT = "2026-04-24";
export const ZAI_REVIEWED_AT = "2026-04-26";
export const OPENROUTER_SOURCE = "https://openrouter.ai/api/v1/models";
export const OPENCODE_GO_SOURCE = "https://opencode.ai/docs/go/";
export const ZAI_PRICING_SOURCE = "https://docs.z.ai/guides/overview/pricing";
export const OPENCODE_GO_CHAT_ENDPOINT = "https://opencode.ai/zen/go/v1/chat/completions";
export const ZAI_CODING_CHAT_ENDPOINT = "https://api.z.ai/api/coding/paas/v4/chat/completions";
// To refresh the OpenCode Go model list and per-model request limits, scrape the docs page:
//   curl -s https://opencode.ai/docs/go > /tmp/go-docs.html
// Then read the HTML table containing columns Model | requests-per-5h | requests-per-week |
// requests-per-month. The provider API id (used as `providerModelId`) appears in the same
// docs page in the section listing model endpoints, e.g. `kimi-k2.6`, `deepseek-v4-flash`.
// Note: the public endpoint at https://opencode.ai/zen/v1/models lists ZEN-tier (paid)
// models, NOT Go-tier; do not use it for the Go catalog.
export const ESTIMATED_PROMPT_TOKENS = 1200;
export const ESTIMATED_IMAGE_TOKENS = 800;
export const ESTIMATED_OUTPUT_TOKENS_PER_SHOT = 120;
// Current OpenCode Go docs describe the tier as USD 12 per rolling 5-hour request window.
export const OPENCODE_GO_COST_PER_5_HOURS_USD = 12;

export function usdPerMtokToMicros(usd: number): number {
  return Math.round(usd * 1_000_000);
}

export function opencodeGoLimitToUsdPerMtok(requestsPerFiveHours: number): number {
  if (!Number.isFinite(requestsPerFiveHours) || requestsPerFiveHours <= 0) {
    throw new RangeError("OpenCode Go requestsPerFiveHours must be a positive finite number");
  }

  const usdPerRequest = OPENCODE_GO_COST_PER_5_HOURS_USD / requestsPerFiveHours;
  const estimatedTokensPerTurn =
    ESTIMATED_PROMPT_TOKENS + ESTIMATED_IMAGE_TOKENS + ESTIMATED_OUTPUT_TOKENS_PER_SHOT;

  return usdPerRequest / (estimatedTokensPerTurn / 1_000_000);
}

export function withEstimatorFields(
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
