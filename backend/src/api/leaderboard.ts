import { Hono } from "hono";

import type { LeaderboardRow, LeaderboardScope } from "@battleship-arena/shared";

import type { Queries } from "../db/queries.ts";
import { respondError } from "../errors.ts";

interface LeaderboardRouterOptions {
  queries: Queries;
  todayUtc?: () => string;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function readScope(value: string | undefined): LeaderboardScope | null {
  if (value === "today" || value === "all") {
    return value;
  }

  return null;
}

function readOptionalBoolean(value: string | undefined): boolean | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

function rerankRows(rows: readonly LeaderboardRow[]): LeaderboardRow[] {
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

export function createLeaderboardRouter(options: LeaderboardRouterOptions) {
  const router = new Hono();
  const readToday = options.todayUtc ?? todayUtc;

  router.get("/leaderboard", (context) => {
    context.header("Cache-Control", "no-store");

    const scope = readScope(context.req.query("scope"));
    if (scope === null) {
      return respondError(context, "invalid_input", 400, "Invalid input", {
        field: "scope",
      });
    }

    const providerId = context.req.query("providerId");
    const modelId = context.req.query("modelId");
    const reasoningEnabled = readOptionalBoolean(context.req.query("reasoningEnabled"));
    if (reasoningEnabled === null) {
      return respondError(context, "invalid_input", 400, "Invalid input", {
        field: "reasoningEnabled",
      });
    }

    const response = options.queries.getLeaderboard(scope, readToday());
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
