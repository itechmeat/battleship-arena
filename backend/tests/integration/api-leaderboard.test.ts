import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { DEFAULT_BENCHMARK_SEED_DATE } from "@battleship-arena/shared";

import { createLeaderboardRouter } from "../../src/api/leaderboard.ts";
import { createQueries } from "../../src/db/queries.ts";
import { withTempDatabase } from "../../src/db/with-temp-database.ts";

function insertCompletedRun(
  queries: ReturnType<typeof createQueries>,
  input: {
    id: string;
    seedDate: string;
    providerId: string;
    modelId: string;
    displayName: string;
    clientSession: string;
    outcome: "won" | "dnf_shot_cap";
    shotsFired: number;
    durationMs: number;
    costUsdMicros: number;
    reasoningEnabled?: boolean;
    startedAt?: number;
  },
) {
  queries.insertRun({
    id: input.id,
    seedDate: input.seedDate,
    providerId: input.providerId,
    modelId: input.modelId,
    displayName: input.displayName,
    reasoningEnabled: input.reasoningEnabled ?? false,
    startedAt: input.startedAt ?? 100,
    clientSession: input.clientSession,
    budgetUsdMicros: null,
  });
  queries.finalizeRun({
    id: input.id,
    endedAt: (input.startedAt ?? 100) + input.durationMs,
    outcome: input.outcome,
    shotsFired: input.shotsFired,
    hits: input.outcome === "won" ? 17 : 10,
    schemaErrors: 0,
    invalidCoordinates: 0,
    durationMs: input.durationMs,
    tokensIn: 0,
    tokensOut: 0,
    reasoningTokens: null,
    costUsdMicros: input.costUsdMicros,
  });
}

describe("GET /api/leaderboard", () => {
  test("today scope defaults to the fixed benchmark seed", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      insertCompletedRun(queries, {
        id: "fixed-seed-run",
        seedDate: DEFAULT_BENCHMARK_SEED_DATE,
        providerId: "openrouter",
        modelId: "fixed-model",
        displayName: "Fixed Model",
        clientSession: "session-1",
        outcome: "won",
        shotsFired: 22,
        durationMs: 1000,
        costUsdMicros: 10,
      });

      const app = new Hono();
      app.route("/api", createLeaderboardRouter({ queries }));

      const response = await app.request("/api/leaderboard?scope=today");
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.seedDate).toBe(DEFAULT_BENCHMARK_SEED_DATE);
      expect(body.rows).toHaveLength(1);
      expect(body.rows[0]).toMatchObject({ bestRunId: "fixed-seed-run" });
    });
  });

  test("missing scope rejects", async () => {
    await withTempDatabase(async ({ db }) => {
      const app = new Hono();
      app.route(
        "/api",
        createLeaderboardRouter({
          queries: createQueries(db),
          todayUtc: () => "2026-04-24",
        }),
      );

      const response = await app.request("/api/leaderboard");
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe("invalid_input");
      expect(response.headers.get("cache-control")).toBe("no-store");
    });
  });

  test("today dedupes per client session and separates same model id by provider", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      insertCompletedRun(queries, {
        id: "run-1",
        seedDate: "2026-04-24",
        providerId: "openrouter",
        modelId: "shared-model",
        displayName: "OpenRouter shared",
        clientSession: "session-1",
        outcome: "dnf_shot_cap",
        shotsFired: 100,
        durationMs: 3000,
        costUsdMicros: 30,
      });
      insertCompletedRun(queries, {
        id: "run-2",
        seedDate: "2026-04-24",
        providerId: "openrouter",
        modelId: "shared-model",
        displayName: "OpenRouter shared",
        clientSession: "session-1",
        outcome: "won",
        shotsFired: 20,
        durationMs: 1000,
        costUsdMicros: 10,
      });
      insertCompletedRun(queries, {
        id: "run-3",
        seedDate: "2026-04-24",
        providerId: "opencode-go",
        modelId: "shared-model",
        displayName: "OpenCode shared",
        clientSession: "session-2",
        outcome: "won",
        shotsFired: 30,
        durationMs: 2000,
        costUsdMicros: 20,
      });

      const app = new Hono();
      app.route("/api", createLeaderboardRouter({ queries, todayUtc: () => "2026-04-24" }));
      const response = await app.request("/api/leaderboard?scope=today");
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("etag")).toBeNull();
      expect(body.scope).toBe("today");
      expect(body.seedDate).toBe("2026-04-24");
      expect(body.rows).toHaveLength(2);
      expect(body.rows[0]).toMatchObject({
        rank: 1,
        providerId: "openrouter",
        modelId: "shared-model",
        runsCount: 1,
        shotsToWin: 20,
        bestRunId: "run-2",
      });
      expect(body.rows[1]).toMatchObject({
        rank: 2,
        providerId: "opencode-go",
        modelId: "shared-model",
        runsCount: 1,
        shotsToWin: 30,
      });

      const filtered = await app.request(
        "/api/leaderboard?scope=today&providerId=opencode-go&modelId=shared-model",
      );
      const filteredBody = await filtered.json();

      expect(filteredBody.rows).toHaveLength(1);
      expect(filteredBody.rows[0].rank).toBe(1);
      expect(filteredBody.rows[0].providerId).toBe("opencode-go");
    });
  });

  test("today separates and filters the same model by reasoning setting", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      insertCompletedRun(queries, {
        id: "reasoning-off",
        seedDate: "2026-04-24",
        providerId: "openrouter",
        modelId: "openai/gpt-5.4-nano",
        displayName: "OpenAI: GPT-5.4 Nano",
        clientSession: "session-1",
        outcome: "won",
        shotsFired: 21,
        durationMs: 1000,
        costUsdMicros: 10,
        reasoningEnabled: false,
      });
      insertCompletedRun(queries, {
        id: "reasoning-on",
        seedDate: "2026-04-24",
        providerId: "openrouter",
        modelId: "openai/gpt-5.4-nano",
        displayName: "OpenAI: GPT-5.4 Nano",
        clientSession: "session-1",
        outcome: "won",
        shotsFired: 19,
        durationMs: 1000,
        costUsdMicros: 20,
        reasoningEnabled: true,
      });

      const app = new Hono();
      app.route("/api", createLeaderboardRouter({ queries, todayUtc: () => "2026-04-24" }));
      const response = await app.request("/api/leaderboard?scope=today");
      const body = await response.json();

      expect(body.rows).toHaveLength(2);
      expect(body.rows.map((row: { reasoningEnabled: boolean }) => row.reasoningEnabled)).toEqual([
        true,
        false,
      ]);

      const filtered = await app.request("/api/leaderboard?scope=today&reasoningEnabled=false");
      const filteredBody = await filtered.json();
      expect(filteredBody.rows).toHaveLength(1);
      expect(filteredBody.rows[0]).toMatchObject({
        reasoningEnabled: false,
        bestRunId: "reasoning-off",
      });
    });
  });

  test("all-time dedupes per session, provider, model, and seed date", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      for (const seedDate of ["2026-04-23", "2026-04-24"]) {
        insertCompletedRun(queries, {
          id: `run-${seedDate}`,
          seedDate,
          providerId: "openrouter",
          modelId: "openai/gpt-5.4-nano",
          displayName: "OpenAI: GPT-5.4 Nano",
          clientSession: "session-1",
          outcome: "won",
          shotsFired: seedDate.endsWith("23") ? 17 : 19,
          durationMs: 1000,
          costUsdMicros: 10,
        });
      }

      const app = new Hono();
      app.route("/api", createLeaderboardRouter({ queries, todayUtc: () => "2026-04-24" }));
      const response = await app.request("/api/leaderboard?scope=all");
      const body = await response.json();

      expect(body.scope).toBe("all");
      expect(body.seedDate).toBeNull();
      expect(body.rows[0]).toMatchObject({
        runsCount: 2,
        shotsToWin: 18,
        bestRunId: null,
      });
    });
  });

  test("all-time median handles odd and even groups and preserves historical display names", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      for (const [index, shotsFired] of [15, 20, 25, 30].entries()) {
        insertCompletedRun(queries, {
          id: `even-${index}`,
          seedDate: `2026-04-${20 + index}`,
          providerId: "openrouter",
          modelId: "even-model",
          displayName: "Historical Even Name",
          clientSession: `session-even-${index}`,
          outcome: "won",
          shotsFired,
          durationMs: 1000,
          costUsdMicros: 10,
        });
      }
      for (const [index, shotsFired] of [15, 20, 30].entries()) {
        insertCompletedRun(queries, {
          id: `odd-${index}`,
          seedDate: `2026-04-${20 + index}`,
          providerId: "opencode-go",
          modelId: "odd-model",
          displayName: "Historical Odd Name",
          clientSession: `session-odd-${index}`,
          outcome: "won",
          shotsFired,
          durationMs: 1000,
          costUsdMicros: 10,
        });
      }

      const app = new Hono();
      app.route("/api", createLeaderboardRouter({ queries, todayUtc: () => "2026-04-24" }));
      const response = await app.request("/api/leaderboard?scope=all");
      const body = await response.json();

      expect(body.rows.map((row: { modelId: string }) => row.modelId)).toEqual([
        "odd-model",
        "even-model",
      ]);
      expect(body.rows[0]).toMatchObject({
        displayName: "Historical Odd Name",
        shotsToWin: 20,
        runsCount: 3,
      });
      expect(body.rows[1]).toMatchObject({
        displayName: "Historical Even Name",
        shotsToWin: 22.5,
        runsCount: 4,
      });
    });
  });

  test("repeat all-time calls are deterministic", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      for (const [index, shotsFired] of [20, 20, 22].entries()) {
        insertCompletedRun(queries, {
          id: `tie-${index}`,
          seedDate: `2026-04-${20 + index}`,
          providerId: index === 0 ? "openrouter" : "opencode-go",
          modelId: "tie-model",
          displayName: index === 0 ? "A Model" : "B Model",
          clientSession: `session-${index}`,
          outcome: "won",
          shotsFired,
          durationMs: 1000,
          costUsdMicros: 10,
          startedAt: 100 + index,
        });
      }

      const app = new Hono();
      app.route("/api", createLeaderboardRouter({ queries, todayUtc: () => "2026-04-24" }));
      const first = await (await app.request("/api/leaderboard?scope=all")).text();
      const second = await (await app.request("/api/leaderboard?scope=all")).text();

      expect(second).toBe(first);
    });
  });
});
