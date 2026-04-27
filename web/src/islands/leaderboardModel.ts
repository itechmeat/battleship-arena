import type {
  LeaderboardResponse,
  LeaderboardRow,
  ProvidersResponse,
} from "@battleship-arena/shared";

import type { GetLeaderboardOptions } from "../lib/api.ts";

export type ReasoningFilterValue = "" | "true" | "false";

export function formatShots(shots: number): string {
  return Number.isInteger(shots) ? String(shots) : shots.toFixed(1);
}

export function modelOptionsForProvider(
  catalog: ProvidersResponse,
  providerId: string,
): ProvidersResponse["providers"][number]["models"] {
  const provider = catalog.providers.find((candidate) => candidate.id === providerId);
  return provider === undefined
    ? catalog.providers.flatMap((candidate) => candidate.models)
    : provider.models;
}

export function visibleLeaderboardRows(
  leaderboard: LeaderboardResponse | null,
): Array<LeaderboardRow & { rank: number }> {
  return (leaderboard?.rows ?? []).map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
}

export function leaderboardFilterOptions(input: {
  providerId: string;
  modelId: string;
  reasoningFilter: ReasoningFilterValue;
}): Omit<GetLeaderboardOptions, "signal"> {
  return {
    ...(input.providerId.length === 0 ? {} : { providerId: input.providerId }),
    ...(input.modelId.length === 0 ? {} : { modelId: input.modelId }),
    ...(input.reasoningFilter.length === 0
      ? {}
      : { reasoningEnabled: input.reasoningFilter === "true" }),
  };
}
