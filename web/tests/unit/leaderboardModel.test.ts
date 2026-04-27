import { describe, expect, test } from "bun:test";

import type { LeaderboardResponse, ProvidersResponse } from "@battleship-arena/shared";

import {
  formatShots,
  leaderboardFilterOptions,
  modelOptionsForProvider,
  visibleLeaderboardRows,
} from "../../src/islands/leaderboardModel.ts";

const catalog: ProvidersResponse = {
  providers: [
    {
      id: "openrouter",
      displayName: "OpenRouter",
      models: [
        {
          id: "model-a",
          displayName: "Model A",
          hasReasoning: true,
          reasoningMode: "optional",
          pricing: { inputUsdPerMtok: 1, outputUsdPerMtok: 2 },
          estimatedPromptTokens: 1,
          estimatedImageTokens: 0,
          estimatedOutputTokensPerShot: 1,
          estimatedCostRange: { minUsd: 0.01, maxUsd: 0.02 },
          priceSource: "test",
          lastReviewedAt: "2026-04-24",
        },
      ],
    },
    {
      id: "zai",
      displayName: "Z.AI",
      models: [
        {
          id: "model-b",
          displayName: "Model B",
          hasReasoning: true,
          reasoningMode: "forced_on",
          pricing: { inputUsdPerMtok: 1, outputUsdPerMtok: 2 },
          estimatedPromptTokens: 1,
          estimatedImageTokens: 0,
          estimatedOutputTokensPerShot: 1,
          estimatedCostRange: { minUsd: 0.01, maxUsd: 0.02 },
          priceSource: "test",
          lastReviewedAt: "2026-04-24",
        },
      ],
    },
  ],
};

describe("leaderboard model helpers", () => {
  test("formats shots and resolves model options", () => {
    expect(formatShots(17)).toBe("17");
    expect(formatShots(17.5)).toBe("17.5");
    expect(modelOptionsForProvider(catalog, "openrouter").map((model) => model.id)).toEqual([
      "model-a",
    ]);
    expect(modelOptionsForProvider(catalog, "").map((model) => model.id)).toEqual([
      "model-a",
      "model-b",
    ]);
  });

  test("builds request filter options", () => {
    expect(
      leaderboardFilterOptions({
        providerId: "openrouter",
        modelId: "model-a",
        reasoningFilter: "false",
      }),
    ).toEqual({
      providerId: "openrouter",
      modelId: "model-a",
      reasoningEnabled: false,
    });
    expect(
      leaderboardFilterOptions({
        providerId: "",
        modelId: "",
        reasoningFilter: "",
      }),
    ).toEqual({});
  });

  test("derives visible rows with display rank", () => {
    const response: LeaderboardResponse = {
      scope: "today",
      seedDate: "2026-04-21",
      rows: [
        {
          rank: 99,
          providerId: "openrouter",
          modelId: "model-a",
          displayName: "Model A",
          reasoningEnabled: true,
          shotsToWin: 17,
          runsCount: 2,
          bestRunId: "run-1",
        },
      ],
    };

    expect(visibleLeaderboardRows(response)[0]?.rank).toBe(1);
    expect(visibleLeaderboardRows(null)).toEqual([]);
  });
});
