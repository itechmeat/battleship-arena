import { describe, expect, test } from "bun:test";

import type { ProvidersResponseProvider } from "@battleship-arena/shared";

import {
  apiKeyStorageKey,
  readStoredApiKey,
  writeStoredApiKey,
} from "../../src/lib/browser-storage.ts";
import {
  defaultReasoningEnabled,
  parseBudgetUsdInput,
  parseMockCostFromSearch,
  reasoningControlText,
  resolveReasoningEnabled,
  shouldInjectMockProvider,
  syncCatalogSelection,
} from "../../src/islands/startRunFormModel.ts";

const LIVE_PROVIDERS: readonly ProvidersResponseProvider[] = [
  {
    id: "openrouter",
    displayName: "OpenRouter",
    models: [
      {
        id: "qwen/qwen3.5-plus-20260420",
        displayName: "Qwen3.5 Plus 2026-04-20",
        hasReasoning: false,
        reasoningMode: "forced_off",
        pricing: {
          inputUsdPerMtok: 1,
          outputUsdPerMtok: 2,
        },
        estimatedPromptTokens: 100,
        estimatedImageTokens: 0,
        estimatedOutputTokensPerShot: 10,
        estimatedCostRange: {
          minUsd: 0.01,
          maxUsd: 0.02,
        },
        priceSource: "test",
        lastReviewedAt: "2026-04-24",
      },
      {
        id: "qwen/qwen3.6-flash",
        displayName: "Qwen3.6 Flash",
        hasReasoning: false,
        reasoningMode: "forced_off",
        pricing: {
          inputUsdPerMtok: 1,
          outputUsdPerMtok: 2,
        },
        estimatedPromptTokens: 100,
        estimatedImageTokens: 0,
        estimatedOutputTokensPerShot: 10,
        estimatedCostRange: {
          minUsd: 0.01,
          maxUsd: 0.02,
        },
        priceSource: "test",
        lastReviewedAt: "2026-04-24",
      },
    ],
  },
  {
    id: "opencode-go",
    displayName: "OpenCode Go",
    models: [
      {
        id: "glm-5.1",
        displayName: "GLM-5.1",
        hasReasoning: false,
        reasoningMode: "forced_off",
        pricing: {
          inputUsdPerMtok: 1,
          outputUsdPerMtok: 2,
        },
        estimatedPromptTokens: 100,
        estimatedImageTokens: 0,
        estimatedOutputTokensPerShot: 10,
        estimatedCostRange: {
          minUsd: 0.01,
          maxUsd: 0.02,
        },
        priceSource: "test",
        lastReviewedAt: "2026-04-24",
      },
    ],
  },
];

describe("StartRunForm mock provider gate", () => {
  test("injects mock only for development, staging, and test modes", () => {
    expect(shouldInjectMockProvider("development")).toBe(true);
    expect(shouldInjectMockProvider("staging")).toBe(true);
    expect(shouldInjectMockProvider("test")).toBe(true);
    expect(shouldInjectMockProvider("production")).toBe(false);
    expect(shouldInjectMockProvider("preview")).toBe(false);
  });

  test("prefers the first live provider over the injected mock placeholder", () => {
    expect(syncCatalogSelection(LIVE_PROVIDERS, "mock", "mock-happy")).toEqual({
      providerId: "openrouter",
      modelId: "qwen/qwen3.5-plus-20260420",
    });
  });

  test("keeps an existing live provider and model when they still exist", () => {
    expect(syncCatalogSelection(LIVE_PROVIDERS, "openrouter", "qwen/qwen3.6-flash")).toEqual({
      providerId: "openrouter",
      modelId: "qwen/qwen3.6-flash",
    });
  });

  test("falls back to the first model when the selected model is missing", () => {
    expect(syncCatalogSelection(LIVE_PROVIDERS, "openrouter", "missing-model")).toEqual({
      providerId: "openrouter",
      modelId: "qwen/qwen3.5-plus-20260420",
    });
  });

  test("persists API keys per provider", () => {
    const values = new Map<string, string>();
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem(key: string) {
            return values.get(key) ?? null;
          },
          setItem(key: string, value: string) {
            values.set(key, value);
          },
          removeItem(key: string) {
            values.delete(key);
          },
        },
      },
    });

    try {
      writeStoredApiKey("openrouter", "sk-openrouter");
      writeStoredApiKey("zai", "sk-zai");

      expect(readStoredApiKey("openrouter")).toBe("sk-openrouter");
      expect(readStoredApiKey("zai")).toBe("sk-zai");
      expect(values.has(apiKeyStorageKey("opencode-go"))).toBe(false);

      writeStoredApiKey("openrouter", "");
      expect(readStoredApiKey("openrouter")).toBe("");
      expect(readStoredApiKey("zai")).toBe("sk-zai");
    } finally {
      if (previousWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        Object.defineProperty(globalThis, "window", previousWindow);
      }
    }
  });

  test("resolves reasoning checkbox policy from model metadata", () => {
    const baseModel = LIVE_PROVIDERS[0]?.models[0];
    if (baseModel === undefined) {
      throw new Error("test fixture must include a model");
    }

    const optionalModel = {
      ...baseModel,
      hasReasoning: true,
      reasoningMode: "optional" as const,
    };
    const forcedOffModel = baseModel;
    const forcedOnModel = {
      ...baseModel,
      hasReasoning: true,
      reasoningMode: "forced_on" as const,
    };

    expect(defaultReasoningEnabled(optionalModel)).toBe(true);
    expect(defaultReasoningEnabled(forcedOnModel)).toBe(true);
    expect(resolveReasoningEnabled(optionalModel, true)).toBe(true);
    expect(resolveReasoningEnabled(optionalModel, false)).toBe(false);
    expect(resolveReasoningEnabled(forcedOffModel, true)).toBe(false);
    expect(resolveReasoningEnabled(forcedOnModel, false)).toBe(true);
    expect(reasoningControlText(optionalModel, false)).toBe("Reasoning disabled");
    expect(reasoningControlText(optionalModel, true)).toBe("Reasoning enabled");
    expect(reasoningControlText(forcedOffModel, true)).toBe("Reasoning unavailable");
    expect(reasoningControlText(forcedOnModel, false)).toBe("Reasoning required");
  });

  test("parses optional budgets and mock cost query values", () => {
    expect(parseBudgetUsdInput("")).toEqual({ ok: true });
    expect(parseBudgetUsdInput("0")).toEqual({ ok: true });
    expect(parseBudgetUsdInput("0.25")).toEqual({ ok: true, budgetUsd: 0.25 });
    expect(parseBudgetUsdInput("-1")).toEqual(
      expect.objectContaining({ ok: false, error: expect.any(String) }),
    );
    expect(parseBudgetUsdInput("not-a-number")).toEqual(
      expect.objectContaining({ ok: false, error: expect.any(String) }),
    );

    expect(parseMockCostFromSearch("?mockCost=0.15")).toBe(0.15);
    expect(parseMockCostFromSearch("?mockCost=-1")).toBeUndefined();
    expect(parseMockCostFromSearch("")).toBeUndefined();
  });
});
