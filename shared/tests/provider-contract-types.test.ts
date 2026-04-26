import { describe, expect, test } from "bun:test";

import type {
  LeaderboardResponse,
  ProviderError,
  ProvidersResponse,
  ProvidersResponseModel,
  ProvidersResponseProvider,
} from "../src/types.ts";

type IsReadonlyArray<T> = T extends readonly unknown[]
  ? T extends unknown[]
    ? false
    : true
  : false;

describe("S3 shared provider contracts", () => {
  test("ProviderError is discriminated by transient vs unreachable failures", () => {
    const unreachable: ProviderError = {
      kind: "unreachable",
      status: 401,
      cause: "Unauthorized",
    };
    const transient: ProviderError = {
      kind: "transient",
      cause: "503 upstream",
    };

    expect(unreachable.kind).toBe("unreachable");
    expect(unreachable.status).toBe(401);
    expect(transient.kind).toBe("transient");
    // Exhaustive narrowing compiles: the switch statement must cover both variants.
    const label = ((error: ProviderError): string => {
      switch (error.kind) {
        case "transient":
          return "transient";
        case "unreachable":
          return "unreachable";
      }
    })(unreachable);
    expect(label).toBe("unreachable");
  });

  test("ProvidersResponse carries real-provider catalog data and pricing estimates", () => {
    const providersAreReadonly: IsReadonlyArray<ProvidersResponse["providers"]> = true;
    const modelsAreReadonly: IsReadonlyArray<ProvidersResponseProvider["models"]> = true;
    const response: ProvidersResponse = {
      providers: [
        {
          id: "openrouter",
          displayName: "OpenRouter",
          models: [
            {
              id: "openai/gpt-5-nano",
              displayName: "OpenAI: GPT-5 Nano",
              hasReasoning: true,
              reasoningMode: "optional",
              pricing: {
                inputUsdPerMtok: 0.05,
                outputUsdPerMtok: 0.4,
              },
              estimatedPromptTokens: 1200,
              estimatedImageTokens: 800,
              estimatedOutputTokensPerShot: 120,
              estimatedCostRange: {
                minUsd: 0.00001,
                maxUsd: 0.0002,
              },
              priceSource: "https://openrouter.ai/api/v1/models",
              lastReviewedAt: "2026-04-24",
            },
          ],
        },
      ],
    };
    const model: ProvidersResponseModel | undefined = response.providers[0]?.models[0];

    expect(providersAreReadonly).toBe(true);
    expect(modelsAreReadonly).toBe(true);
    expect(model?.id).toBe("openai/gpt-5-nano");
    expect(response.providers[0]?.models[0]?.estimatedCostRange.maxUsd).toBeGreaterThan(0);
  });

  test("LeaderboardResponse separates scope metadata from provider-model rows", () => {
    const rowsAreReadonly: IsReadonlyArray<LeaderboardResponse["rows"]> = true;
    const response: LeaderboardResponse = {
      scope: "today",
      seedDate: "2026-04-24",
      rows: [
        {
          rank: 1,
          providerId: "openrouter",
          modelId: "openai/gpt-5-nano",
          displayName: "OpenAI: GPT-5 Nano",
          reasoningEnabled: true,
          runsCount: 2,
          shotsToWin: 17,
          bestRunId: "run-1",
        },
      ],
    };

    expect(rowsAreReadonly).toBe(true);
    expect(response.rows[0]?.providerId).toBe("openrouter");
    expect(response.rows[0]?.shotsToWin).toBe(17);
  });
});
