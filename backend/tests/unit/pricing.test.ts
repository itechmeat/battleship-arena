import { describe, expect, test } from "bun:test";

import {
  calculateCostUsdMicros,
  computeCostMicros,
  estimateCostRangeMicros,
  estimateGameCostRangeUsd,
  getPricingEntry,
  listPricedModels,
  listProviderPricing,
  reasoningModeForEntry,
  type PricingEntry,
} from "../../src/pricing/catalog.ts";
import { opencodeGoLimitToUsdPerMtok } from "../../src/pricing/catalog-helpers.ts";

describe("pricing catalog", () => {
  const expectedOpenRouterModelIds = [
    "openai/gpt-5.4-nano",
    "openai/gpt-5.4-mini",
    "google/gemma-4-26b-a4b-it:free",
    "google/gemma-4-31b-it:free",
    "google/gemini-3.1-flash-lite-preview",
    "x-ai/grok-4.20",
    "x-ai/grok-4.1-fast",
    "qwen/qwen3.5-plus-20260420",
    "qwen/qwen3.6-flash",
    "qwen/qwen3.6-35b-a3b",
    "qwen/qwen3.6-max-preview",
    "qwen/qwen3.6-27b",
    "mistralai/mistral-small-2603",
    "liquid/lfm-2-24b-a2b",
    "liquid/lfm-2.5-1.2b-thinking:free",
    "liquid/lfm-2.5-1.2b-instruct:free",
    "amazon/nova-2-lite-v1",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "tencent/hy3-preview:free",
    "baidu/qianfan-ocr-fast:free",
    "bytedance-seed/seed-2.0-mini",
    "bytedance-seed/seed-1.6-flash",
    "bytedance-seed/seed-1.6",
    "inclusionai/ling-2.6-1t:free",
    "inclusionai/ling-2.6-flash:free",
    "arcee-ai/trinity-large-thinking",
    "arcee-ai/trinity-large-preview",
    "kwaipilot/kat-coder-pro-v2",
    "rekaai/reka-edge",
    "inception/mercury-2",
    "aion-labs/aion-2.0",
    "stepfun/step-3.5-flash",
    "upstage/solar-pro-3",
    "writer/palmyra-x5",
    "allenai/olmo-3.1-32b-instruct",
  ].sort();

  test("lists real provider model catalogs", () => {
    expect(listProviderPricing("openrouter").length).toBe(35);
    expect(listProviderPricing("opencode-go").length).toBeGreaterThanOrEqual(5);
    expect(listProviderPricing("zai").length).toBeGreaterThanOrEqual(5);
  });

  test("openrouter catalog contains the requested model set", () => {
    expect(
      listProviderPricing("openrouter")
        .map((entry) => entry.modelId)
        .sort(),
    ).toEqual(expectedOpenRouterModelIds);
  });

  test("uses provider/model keys and reviewed source metadata", () => {
    const entry = getPricingEntry("openrouter", "openai/gpt-5.4-nano");
    const qwenEntry = getPricingEntry("openrouter", "qwen/qwen3.5-plus-20260420");

    expect(entry?.providerId).toBe("openrouter");
    expect(entry?.modelId).toBe("openai/gpt-5.4-nano");
    expect(entry?.priceSource).toContain("openrouter.ai");
    expect(entry?.lastReviewedAt).toBe("2026-04-27");
    expect(qwenEntry).toMatchObject({
      providerId: "openrouter",
      modelId: "qwen/qwen3.5-plus-20260420",
      hasReasoning: true,
      lastReviewedAt: "2026-04-27",
    });
    expect(qwenEntry === undefined ? null : reasoningModeForEntry(qwenEntry)).toBe("optional");
    expect(listPricedModels().every((row) => row.lastReviewedAt.match(/^\d{4}-\d{2}-\d{2}$/))).toBe(
      true,
    );
  });

  test("prices direct Z.AI GLM models from the official pricing table", () => {
    const entry = getPricingEntry("zai", "zai/glm-5.1");

    expect(entry).toEqual(
      expect.objectContaining({
        providerId: "zai",
        providerDisplayName: "Z.AI",
        modelId: "zai/glm-5.1",
        providerModelId: "glm-5.1",
        displayName: "GLM-5.1",
        hasReasoning: true,
        inputMicrosPerMtok: 1_400_000,
        outputMicrosPerMtok: 4_400_000,
        priceSource: "https://docs.z.ai/guides/overview/pricing",
        lastReviewedAt: "2026-04-26",
      }),
    );
    expect(entry === undefined ? null : reasoningModeForEntry(entry)).toBe("forced_on");
  });

  test("converts per-million-token prices to integer USD micros", () => {
    expect(
      calculateCostUsdMicros("openrouter", "openai/gpt-5.4-nano", {
        tokensIn: 1_000_000,
        tokensOut: 1_000_000,
        reasoningTokens: null,
      }),
    ).toBe(1_450_000);
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
    const withoutReasoning = calculateCostUsdMicros("openrouter", "openai/gpt-5.4-mini", {
      tokensIn: 1000,
      tokensOut: 1000,
      reasoningTokens: null,
    });
    const withReasoning = calculateCostUsdMicros("openrouter", "openai/gpt-5.4-mini", {
      tokensIn: 1000,
      tokensOut: 1000,
      reasoningTokens: 900,
    });

    expect(withReasoning).toBe(withoutReasoning);
  });

  test("estimates a 17 to 100 turn game range", () => {
    const estimate = estimateGameCostRangeUsd("openrouter", "openai/gpt-5.4-nano");

    expect(estimate.minUsd).toBeGreaterThan(0);
    expect(estimate.maxUsd).toBeGreaterThan(estimate.minUsd);
  });

  test("opencode-go blended estimates stay near official request-count limits", () => {
    const estimate = estimateGameCostRangeUsd("opencode-go", "opencode-go/glm-5.1");

    expect(estimate.minUsd).toBeGreaterThan(0);
    expect(estimate.maxUsd).toBeLessThan(2);
  });

  test("rejects invalid OpenCode Go request-count limits", () => {
    expect(() => opencodeGoLimitToUsdPerMtok(0)).toThrow(RangeError);
    expect(() => opencodeGoLimitToUsdPerMtok(-1)).toThrow(RangeError);
    expect(() => opencodeGoLimitToUsdPerMtok(Number.NaN)).toThrow(RangeError);
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
