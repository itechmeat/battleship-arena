import { describe, expect, test } from "bun:test";

import { createProviderRegistry, type ProviderAdapter } from "../../src/providers/types.ts";

const fakeAdapter: ProviderAdapter = {
  id: "fake",
  models: [
    {
      id: "fake-model",
      displayName: "Fake model",
      hasReasoning: false,
      reasoningMode: "forced_off",
    },
  ],
  async call() {
    return {
      rawText: "{}",
      tokensIn: 0,
      tokensOut: 0,
      reasoningTokens: null,
      costUsdMicros: 0,
      durationMs: 1,
    };
  },
};

describe("createProviderRegistry", () => {
  test("returns the registered adapter", () => {
    const registry = createProviderRegistry({ fake: fakeAdapter });
    expect(registry.get("fake")).toBe(fakeAdapter);
  });

  test("returns undefined for an unknown provider", () => {
    const registry = createProviderRegistry({ fake: fakeAdapter });
    expect(registry.get("missing")).toBeUndefined();
  });

  test("lists every registered id", () => {
    const registry = createProviderRegistry({ fake: fakeAdapter });
    expect(registry.listIds()).toEqual(["fake"]);
  });
});
