import { describe, expect, test } from "bun:test";

import {
  aggregateAllLeaderboardRows,
  aggregateTodayLeaderboardRows,
  dedupeBestWins,
  median,
  type LeaderboardRunRow,
} from "../../src/db/leaderboard-aggregator.ts";

function row(overrides: Partial<LeaderboardRunRow>): LeaderboardRunRow {
  return {
    id: "run-1",
    seedDate: "2026-04-21",
    providerId: "mock",
    modelId: "mock-happy",
    displayName: "Mock Happy",
    reasoningEnabled: 1,
    shotsFired: 20,
    clientSession: "session-1",
    startedAt: 100,
    ...overrides,
  };
}

describe("leaderboard aggregation", () => {
  test("computes medians and dedupes best wins by key", () => {
    expect(median([])).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 2])).toBe(3);

    expect(
      dedupeBestWins(
        [
          row({ id: "slow", shotsFired: 30, startedAt: 1 }),
          row({ id: "fast", shotsFired: 20, startedAt: 2 }),
        ],
        (candidate) => candidate.clientSession,
      ).map((candidate) => candidate.id),
    ).toEqual(["fast"]);
  });

  test("aggregates today rows by best session win and ranks by shots", () => {
    expect(
      aggregateTodayLeaderboardRows([
        row({ id: "a1", clientSession: "a", shotsFired: 30 }),
        row({ id: "a2", clientSession: "a", shotsFired: 20 }),
        row({ id: "b1", clientSession: "b", shotsFired: 25 }),
        row({
          id: "c1",
          clientSession: "c",
          modelId: "other",
          displayName: "Other",
          shotsFired: 10,
        }),
      ]),
    ).toEqual([
      expect.objectContaining({
        rank: 1,
        modelId: "other",
        shotsToWin: 10,
        runsCount: 1,
        bestRunId: "c1",
      }),
      expect.objectContaining({
        rank: 2,
        modelId: "mock-happy",
        shotsToWin: 20,
        runsCount: 2,
        bestRunId: "a2",
      }),
    ]);
  });

  test("aggregates all-time rows by session, seed, and median shots", () => {
    expect(
      aggregateAllLeaderboardRows([
        row({
          id: "a1",
          clientSession: "a",
          seedDate: "2026-04-21",
          shotsFired: 30,
        }),
        row({
          id: "a2",
          clientSession: "a",
          seedDate: "2026-04-21",
          shotsFired: 20,
        }),
        row({
          id: "a3",
          clientSession: "a",
          seedDate: "2026-04-22",
          shotsFired: 10,
        }),
        row({
          id: "b1",
          clientSession: "b",
          seedDate: "2026-04-21",
          shotsFired: 40,
        }),
      ]),
    ).toEqual([
      expect.objectContaining({
        rank: 1,
        modelId: "mock-happy",
        shotsToWin: 20,
        runsCount: 3,
        bestRunId: null,
      }),
    ]);
  });
});
