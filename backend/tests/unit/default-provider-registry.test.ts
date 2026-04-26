import { describe, expect, test } from "bun:test";

import { createDefaultProviderRegistry } from "../../src/providers/registry.ts";

describe("createDefaultProviderRegistry", () => {
  test("includes real providers and dev mock outside production", () => {
    const registry = createDefaultProviderRegistry({
      environment: "development",
      mockTurnDelayMs: 0,
    });

    expect(registry.listIds()).toEqual(["openrouter", "opencode-go", "zai", "mock"]);
  });

  test("excludes mock in production", () => {
    const registry = createDefaultProviderRegistry({
      environment: "production",
      mockTurnDelayMs: 0,
    });

    expect(registry.listIds()).toEqual(["openrouter", "opencode-go", "zai"]);
  });
});
