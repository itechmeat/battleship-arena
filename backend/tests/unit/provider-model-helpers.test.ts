import { describe, expect, test } from "bun:test";

import { PRICING_TABLE, type PricingEntry } from "../../src/pricing/catalog.ts";
import {
  createProviderModelLookup,
  resolveProviderReasoningEnabled,
  supportsProviderResponseFormat,
} from "../../src/providers/model-helpers.ts";
import type { ProviderModel } from "../../src/providers/types.ts";

function model(overrides: Partial<ProviderModel>): ProviderModel {
  return {
    id: "test-model",
    displayName: "Test model",
    hasReasoning: true,
    reasoningMode: "optional",
    ...overrides,
  };
}

describe("provider model helpers", () => {
  test("builds model and entry lookup maps from pricing data", () => {
    const lookup = createProviderModelLookup("openrouter", PRICING_TABLE);
    const firstEntry = lookup.entries[0];

    if (firstEntry === undefined) {
      throw new Error("Expected OpenRouter pricing entries");
    }

    expect(lookup.entryById.get(firstEntry.modelId)).toBe(firstEntry);
    expect(lookup.modelById.get(firstEntry.modelId)).toEqual(
      expect.objectContaining({
        id: firstEntry.modelId,
        displayName: firstEntry.displayName,
        hasReasoning: firstEntry.hasReasoning,
      }),
    );
  });

  test("resolves forced and optional reasoning modes", () => {
    expect(resolveProviderReasoningEnabled(model({ hasReasoning: false }), true)).toBe(false);
    expect(resolveProviderReasoningEnabled(model({ reasoningMode: "forced_off" }), true)).toBe(
      false,
    );
    expect(resolveProviderReasoningEnabled(model({ reasoningMode: "forced_on" }), false)).toBe(
      true,
    );
    expect(resolveProviderReasoningEnabled(model({ reasoningMode: "optional" }), undefined)).toBe(
      true,
    );
    expect(resolveProviderReasoningEnabled(model({ reasoningMode: "optional" }), false)).toBe(
      false,
    );
  });

  test("defaults response_format support unless explicitly disabled", () => {
    expect(supportsProviderResponseFormat({} as PricingEntry)).toBe(true);
    expect(
      supportsProviderResponseFormat({
        supportsResponseFormat: false,
      } as PricingEntry),
    ).toBe(false);
  });
});
