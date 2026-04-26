import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

import { createRunsRouter } from "../../src/api/runs.ts";
import { createQueries } from "../../src/db/queries.ts";
import { withTempDatabase } from "../../src/db/with-temp-database.ts";
import { createMockProvider } from "../../src/providers/mock.ts";
import { createProviderRegistry } from "../../src/providers/types.ts";
import { createManager } from "../../src/runs/manager.ts";

function buildApp(options: {
  queries: ReturnType<typeof createQueries>;
  manager: ReturnType<typeof createManager>;
}) {
  const app = new Hono();
  app.route(
    "/api",
    createRunsRouter({
      queries: options.queries,
      manager: options.manager,
      providers: createProviderRegistry({
        mock: createMockProvider({ delayMs: 0 }),
      }),
    }),
  );

  return app;
}

describe("GET/POST /api/runs/:id", () => {
  test("GET /runs/:id returns the RunMeta row", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      queries.insertRun({
        id: "run-1",
        seedDate: "2026-04-21",
        providerId: "mock",
        modelId: "mock-happy",
        displayName: "Mock happy",
        reasoningEnabled: false,
        startedAt: 100,
        clientSession: "session-1",
        budgetUsdMicros: null,
      });
      queries.finalizeRun({
        id: "run-1",
        endedAt: 200,
        outcome: "won",
        shotsFired: 17,
        hits: 17,
        schemaErrors: 0,
        invalidCoordinates: 0,
        durationMs: 100,
        tokensIn: 0,
        tokensOut: 0,
        reasoningTokens: null,
        costUsdMicros: 0,
      });

      const app = buildApp({
        queries,
        manager: createManager({
          queries,
          providers: createProviderRegistry({
            mock: createMockProvider({ delayMs: 0 }),
          }),
        }),
      });

      const response = await app.request("/api/runs/run-1");

      expect(response.status).toBe(200);
      expect((await response.json()).id).toBe("run-1");
    });
  });

  test("GET /runs/:id/shots returns ordered shots", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      queries.insertRun({
        id: "run-1",
        seedDate: "2026-04-21",
        providerId: "mock",
        modelId: "mock-happy",
        displayName: "Mock happy",
        reasoningEnabled: false,
        startedAt: 100,
        clientSession: "session-1",
        budgetUsdMicros: null,
      });
      queries.appendShot({
        runId: "run-1",
        idx: 0,
        row: 0,
        col: 0,
        result: "miss",
        rawResponse: "{}",
        reasoningText: null,
        tokensIn: 0,
        tokensOut: 0,
        reasoningTokens: null,
        costUsdMicros: 0,
        durationMs: 1,
        createdAt: 101,
      });
      queries.appendShot({
        runId: "run-1",
        idx: 1,
        row: 1,
        col: 1,
        result: "hit",
        rawResponse: "{}",
        reasoningText: null,
        tokensIn: 0,
        tokensOut: 0,
        reasoningTokens: null,
        costUsdMicros: 0,
        durationMs: 1,
        createdAt: 102,
      });

      const app = buildApp({
        queries,
        manager: createManager({
          queries,
          providers: createProviderRegistry({
            mock: createMockProvider({ delayMs: 0 }),
          }),
        }),
      });

      const response = await app.request("/api/runs/run-1/shots");
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.runId).toBe("run-1");
      expect(body.shots.map((shot: { idx: number }) => shot.idx)).toEqual([0, 1]);
    });
  });

  test("POST /runs/:id/abort on a terminal run is idempotent", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      queries.insertRun({
        id: "run-1",
        seedDate: "2026-04-21",
        providerId: "mock",
        modelId: "mock-happy",
        displayName: "Mock happy",
        reasoningEnabled: false,
        startedAt: 100,
        clientSession: "session-1",
        budgetUsdMicros: null,
      });
      queries.finalizeRun({
        id: "run-1",
        endedAt: 200,
        outcome: "won",
        shotsFired: 17,
        hits: 17,
        schemaErrors: 0,
        invalidCoordinates: 0,
        durationMs: 100,
        tokensIn: 0,
        tokensOut: 0,
        reasoningTokens: null,
        costUsdMicros: 0,
      });

      const app = buildApp({
        queries,
        manager: createManager({
          queries,
          providers: createProviderRegistry({
            mock: createMockProvider({ delayMs: 0 }),
          }),
        }),
      });

      const response = await app.request("/api/runs/run-1/abort", {
        method: "POST",
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ outcome: "won" });
    });
  });

  test("POST /runs/:id/abort on an active run delegates to manager.abort", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      const manager = createManager({
        queries,
        providers: createProviderRegistry({
          mock: createMockProvider({ delayMs: 50 }),
        }),
      });
      const app = buildApp({ queries, manager });
      const runId = manager.start({
        providerId: "mock",
        modelId: "mock-happy",
        apiKey: "test-key",
        reasoningEnabled: false,
        clientSession: "session-1",
        seedDate: "2026-04-21",
      });
      const handle = manager.getHandle(runId);
      if (handle === null) {
        throw new Error("manager handle should exist");
      }

      const response = await app.request(`/api/runs/${runId}/abort`, {
        method: "POST",
      });
      await handle.taskPromise;

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ outcome: "aborted_viewer" });
      expect(queries.getRunMeta(runId)?.outcome).toBe("aborted_viewer");
    });
  });

  test("unknown ids return run_not_found", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      const app = buildApp({
        queries,
        manager: createManager({
          queries,
          providers: createProviderRegistry({
            mock: createMockProvider({ delayMs: 0 }),
          }),
        }),
      });

      const metaResponse = await app.request("/api/runs/missing");
      const shotsResponse = await app.request("/api/runs/missing/shots");
      const abortResponse = await app.request("/api/runs/missing/abort", {
        method: "POST",
      });

      expect(metaResponse.status).toBe(404);
      expect(await metaResponse.json()).toEqual({
        error: {
          code: "run_not_found",
          message: "Run not found",
        },
      });
      expect(shotsResponse.status).toBe(404);
      expect(await shotsResponse.json()).toEqual({
        error: {
          code: "run_not_found",
          message: "Run not found",
        },
      });
      expect(abortResponse.status).toBe(404);
      expect(await abortResponse.json()).toEqual({
        error: {
          code: "run_not_found",
          message: "Run not found",
        },
      });
    });
  });

  test("POST /runs/:id/abort returns the latest persisted outcome when abort loses the race", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      queries.insertRun({
        id: "run-1",
        seedDate: "2026-04-21",
        providerId: "mock",
        modelId: "mock-happy",
        displayName: "Mock happy",
        reasoningEnabled: false,
        startedAt: 100,
        clientSession: "session-1",
        budgetUsdMicros: null,
      });

      const app = buildApp({
        queries,
        manager: {
          start() {
            throw new Error("start should not be called");
          },
          abort() {
            return false;
          },
          getHandle() {
            throw new Error("getHandle should not be called after abort returns false");
          },
          async shutdown() {},
        } as ReturnType<typeof createManager>,
      });

      const response = await app.request("/api/runs/run-1/abort", {
        method: "POST",
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ outcome: null });
    });
  });
});
