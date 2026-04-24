import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { StartRunInput } from "@battleship-arena/shared";

import { createQueries } from "../../src/db/queries.ts";
import { withTempDatabase } from "../../src/db/with-temp-database.ts";
import { createMockProvider } from "../../src/providers/mock.ts";
import { createProviderRegistry } from "../../src/providers/types.ts";
import { createRunsRouter } from "../../src/api/runs.ts";
import { sessionMiddleware } from "../../src/api/session.ts";

function createTestApp(
  db: Parameters<typeof createQueries>[0],
  overrides: Partial<{
    start(input: StartRunInput): string;
    abort(): boolean;
    getHandle(): null;
    shutdown(): Promise<void>;
  }> = {},
) {
  const started: StartRunInput[] = [];
  const manager = {
    start(input: StartRunInput) {
      started.push(input);
      return "run-1";
    },
    abort() {
      return false;
    },
    getHandle() {
      return null;
    },
    async shutdown() {},
    ...overrides,
  };

  const app = new Hono();
  app.use(sessionMiddleware);
  app.route(
    "/api",
    createRunsRouter({
      queries: createQueries(db),
      providers: createProviderRegistry({
        mock: createMockProvider({ delayMs: 0 }),
      }),
      manager,
    }),
  );

  return { app, started };
}

describe("POST /api/runs", () => {
  test("happy path returns runId and no-store without echoing apiKey", async () => {
    await withTempDatabase(async ({ db }) => {
      const { app, started } = createTestApp(db);

      const apiKey = "sk-test-happy";
      const response = await app.request("/api/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          providerId: "mock",
          modelId: "mock-happy",
          apiKey,
        }),
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(body).toEqual({ runId: "run-1" });
      expect(JSON.stringify(body)).not.toContain(apiKey);
      expect(started).toHaveLength(1);
      expect(started[0]).toMatchObject({
        providerId: "mock",
        modelId: "mock-happy",
        apiKey,
        seedDate: new Date().toISOString().slice(0, 10),
      });
      expect(started[0]?.clientSession).toEqual(expect.any(String));
      expect(started[0]?.clientSession.length).toBeGreaterThan(0);
    });
  });

  test("empty apiKey is rejected", async () => {
    await withTempDatabase(async ({ db }) => {
      const { app } = createTestApp(db, {
        start() {
          throw new Error("start should not be called");
        },
      });

      const response = await app.request("/api/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          providerId: "mock",
          modelId: "mock-happy",
          apiKey: "",
        }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: {
          code: "invalid_input",
          message: "Invalid input",
          detail: { field: "apiKey" },
        },
      });
    });
  });

  test("unknown modelId is rejected with detail.field = modelId", async () => {
    await withTempDatabase(async ({ db }) => {
      const { app } = createTestApp(db, {
        start() {
          throw new Error("start should not be called");
        },
      });

      const response = await app.request("/api/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          providerId: "mock",
          modelId: "unknown-model",
          apiKey: "test-key",
        }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: {
          code: "invalid_input",
          message: "Invalid input",
          detail: { field: "modelId" },
        },
      });
    });
  });

  test("negative budget is rejected", async () => {
    await withTempDatabase(async ({ db }) => {
      const { app } = createTestApp(db, {
        start() {
          throw new Error("start should not be called");
        },
      });

      const response = await app.request("/api/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          providerId: "mock",
          modelId: "mock-happy",
          apiKey: "test-key",
          budgetUsd: -1,
        }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: {
          code: "invalid_input",
          message: "Invalid input",
          detail: { field: "budgetUsd" },
        },
      });
    });
  });

  test("null and zero budgets are accepted as no cap", async () => {
    await withTempDatabase(async ({ db }) => {
      const { app, started } = createTestApp(db);

      for (const budgetUsd of [null, 0]) {
        const response = await app.request("/api/runs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            providerId: "mock",
            modelId: "mock-happy",
            apiKey: "test-key",
            budgetUsd,
          }),
        });

        expect(response.status).toBe(200);
      }

      expect(started[0]).not.toHaveProperty("budgetUsd");
      expect(started[1]).not.toHaveProperty("budgetUsd");
    });
  });

  test("positive budget and development mockCost are forwarded", async () => {
    await withTempDatabase(async ({ db }) => {
      const { app, started } = createTestApp(db);

      const response = await app.request("/api/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          providerId: "mock",
          modelId: "mock-happy",
          apiKey: "test-key",
          budgetUsd: 0.01,
          mockCost: 0.001,
        }),
      });

      expect(response.status).toBe(200);
      expect(started[0]).toMatchObject({
        budgetUsd: 0.01,
        mockCostUsd: 0.001,
      });
    });
  });

  test("production strips mockCost before starting a run", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      await withTempDatabase(async ({ db }) => {
        const { app, started } = createTestApp(db);

        const response = await app.request("/api/runs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            providerId: "mock",
            modelId: "mock-happy",
            apiKey: "test-key",
            mockCost: 0.001,
          }),
        });

        expect(response.status).toBe(200);
        expect(started[0]).not.toHaveProperty("mockCostUsd");
      });
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });
});
