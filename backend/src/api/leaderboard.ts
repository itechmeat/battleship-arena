import { Hono } from "hono";

import { DEFAULT_BENCHMARK_SEED_DATE, type LeaderboardRow } from "@battleship-arena/shared";

import type { Queries } from "../db/queries.ts";

import { respondInvalidInput } from "./responses.ts";
import { readLeaderboardScope, readOptionalBooleanQuery } from "./validation.ts";

interface LeaderboardRouterOptions {
  queries: Queries;
  benchmarkSeedDate?: () => string;
  todayUtc?: () => string;
}

function defaultBenchmarkSeedDate(): string {
  return DEFAULT_BENCHMARK_SEED_DATE;
}

function rerankRows(rows: readonly LeaderboardRow[]): LeaderboardRow[] {
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

export function createLeaderboardRouter(options: LeaderboardRouterOptions) {
  const router = new Hono();
  const readBenchmarkSeedDate =
    options.benchmarkSeedDate ?? options.todayUtc ?? defaultBenchmarkSeedDate;

  router.get("/leaderboard", (context) => {
    context.header("Cache-Control", "no-store");

    const scope = readLeaderboardScope(context.req.query("scope"));
    if (scope === null) {
      return respondInvalidInput(context, {
        field: "scope",
      });
    }

    const providerId = context.req.query("providerId");
    const modelId = context.req.query("modelId");
    const reasoningEnabled = readOptionalBooleanQuery(context.req.query("reasoningEnabled"));
    if (reasoningEnabled === null) {
      return respondInvalidInput(context, {
        field: "reasoningEnabled",
      });
    }

    const response = options.queries.getLeaderboard(scope, readBenchmarkSeedDate());
    const rows = rerankRows(
      response.rows.filter(
        (row) =>
          (providerId === undefined || row.providerId === providerId) &&
          (modelId === undefined || row.modelId === modelId) &&
          (reasoningEnabled === undefined || row.reasoningEnabled === reasoningEnabled),
      ),
    );

    return context.json(
      {
        ...response,
        rows,
      },
      200,
    );
  });

  return router;
}
