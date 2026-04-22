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
