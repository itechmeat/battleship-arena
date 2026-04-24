import { createMockProvider } from "./mock.ts";
import { createOpenCodeGoAdapter } from "./opencode-go.ts";
import { createOpenRouterAdapter } from "./openrouter.ts";
import { createProviderRegistry, type ProviderRegistry } from "./types.ts";

interface CreateDefaultProviderRegistryOptions {
  environment?: string;
  mockTurnDelayMs: number;
  fetch?: typeof globalThis.fetch;
}

export function createDefaultProviderRegistry(
  options: CreateDefaultProviderRegistryOptions,
): ProviderRegistry {
  const fetch = options.fetch ?? globalThis.fetch;
  const adapters = {
    openrouter: createOpenRouterAdapter({ fetch }),
    "opencode-go": createOpenCodeGoAdapter({ fetch }),
    ...(options.environment === "production"
      ? {}
      : { mock: createMockProvider({ delayMs: options.mockTurnDelayMs }) }),
  };

  return createProviderRegistry(adapters);
}
