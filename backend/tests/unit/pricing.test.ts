import { describe, expect, test } from "bun:test";

import {
  calculateCostUsdMicros,
  computeCostMicros,
  estimateCostRangeMicros,
  estimateGameCostRangeUsd,
  getPricingEntry,
  listPricedModels,
  listProviderPricing,
  type PricingEntry,
} from "../../src/pricing/catalog.ts";

describe("pricing catalog", () => {
  test("lists at least five OpenRouter and five OpenCode Go models", () => {
    expect(listProviderPricing("openrouter").length).toBeGreaterThanOrEqual(5);
    expect(listProviderPricing("opencode-go").length).toBeGreaterThanOrEqual(5);
  });

  test("uses provider/model keys and reviewed source metadata", () => {
    const entry = getPricingEntry("openrouter", "openai/gpt-5-nano");

    expect(entry?.providerId).toBe("openrouter");
    expect(entry?.modelId).toBe("openai/gpt-5-nano");
    expect(entry?.priceSource).toContain("openrouter.ai");
    expect(entry?.lastReviewedAt).toBe("2026-04-24");
    expect(listPricedModels().every((row) => row.lastReviewedAt.match(/^\d{4}-\d{2}-\d{2}$/))).toBe(
      true,
    );
  });

  test("converts per-million-token prices to integer USD micros", () => {
    expect(
      calculateCostUsdMicros("openrouter", "openai/gpt-5-nano", {
        tokensIn: 1_000_000,
        tokensOut: 1_000_000,
        reasoningTokens: null,
      }),
    ).toBe(450_000);
  });

  test("computeCostMicros floors input and output halves before adding", () => {
    const entry: PricingEntry = {
      providerId: "openrouter",
      providerDisplayName: "OpenRouter",
      modelId: "fractional",
      providerModelId: "fractional",
      displayName: "Fractional",
      hasReasoning: false,
      inputMicrosPerMtok: 600_000,
      outputMicrosPerMtok: 600_000,
      estimatedPromptTokens: 1,
      estimatedImageTokens: 0,
      estimatedOutputTokensPerShot: 1,
      priceSource: "https://example.test",
      lastReviewedAt: "2026-04-24",
    };

    expect(computeCostMicros(entry, 1, 1)).toBe(0);
  });

  test("does not double-price reasoning tokens when no reasoning rate is listed", () => {
    const withoutReasoning = calculateCostUsdMicros("openrouter", "openai/gpt-5-mini", {
      tokensIn: 1000,
      tokensOut: 1000,
      reasoningTokens: null,
    });
    const withReasoning = calculateCostUsdMicros("openrouter", "openai/gpt-5-mini", {
      tokensIn: 1000,
      tokensOut: 1000,
      reasoningTokens: 900,
    });

    expect(withReasoning).toBe(withoutReasoning);
  });

  test("estimates a 17 to 100 turn game range", () => {
    const estimate = estimateGameCostRangeUsd("openrouter", "openai/gpt-5-nano");

    expect(estimate.minUsd).toBeGreaterThan(0);
    expect(estimate.maxUsd).toBeGreaterThan(estimate.minUsd);
  });

  test("opencode-go blended estimates stay near official request-count limits", () => {
    const estimate = estimateGameCostRangeUsd("opencode-go", "opencode-go/glm-5.1");

    expect(estimate.minUsd).toBeGreaterThan(0);
    expect(estimate.maxUsd).toBeLessThan(2);
  });

  test("estimateCostRangeMicros returns exact multiples of per-turn cost", () => {
    const entry: PricingEntry = {
      providerId: "openrouter",
      providerDisplayName: "OpenRouter",
      modelId: "known",
      providerModelId: "known",
      displayName: "Known",
      hasReasoning: true,
      inputMicrosPerMtok: 4_000_000,
      outputMicrosPerMtok: 15_000_000,
      estimatedPromptTokens: 800,
      estimatedImageTokens: 200,
      estimatedOutputTokensPerShot: 200,
      priceSource: "https://example.test",
      lastReviewedAt: "2026-04-24",
    };

    expect(estimateCostRangeMicros(entry)).toEqual({
      minMicros: 119_000,
      maxMicros: 700_000,
    });
  });
});
