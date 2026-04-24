export interface ProviderModel {
  id: string;
  displayName: string;
  hasReasoning: boolean;
}

export interface ProviderCallInput {
  modelId: string;
  apiKey: string;
  boardPng: Uint8Array;
  shipsRemaining: readonly string[];
  systemPrompt: string;
  mockCostUsd?: number;
  priorShots: readonly {
    row: number;
    col: number;
    result: "hit" | "miss" | "sunk";
  }[];
  seedDate: string;
}

export interface ProviderCallOutput {
  rawText: string;
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number | null;
  costUsdMicros: number;
  durationMs: number;
}

export interface ProviderAdapter {
  readonly id: string;
  readonly models: readonly ProviderModel[];
  /**
   * Performs exactly one provider round trip. Implementations throw ProviderError
   * with kind "transient" or "unreachable" for provider/auth/transport failures
   * and never include API keys in errors.
   */
  call(input: ProviderCallInput, signal: AbortSignal): Promise<ProviderCallOutput>;
}

export interface ProviderRegistry {
  get(providerId: string): ProviderAdapter | undefined;
  listIds(): string[];
}

export function createProviderRegistry(
  adapters: Record<string, ProviderAdapter>,
): ProviderRegistry {
  return {
    get(providerId) {
      return adapters[providerId];
    },
    listIds() {
      return Object.keys(adapters);
    },
  };
}
