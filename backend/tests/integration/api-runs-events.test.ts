import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

import { createRunsRouter } from "../../src/api/runs.ts";
import { createQueries } from "../../src/db/queries.ts";
import { withTempDatabase } from "../../src/db/with-temp-database.ts";
import { createMockProvider } from "../../src/providers/mock.ts";
import { createProviderRegistry } from "../../src/providers/types.ts";
import { EventRing } from "../../src/runs/event-ring.ts";
import { createManager } from "../../src/runs/manager.ts";

interface ParsedSseEvent {
  id: string | null;
  event: string | null;
  data: string | null;
}

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

function parseSse(text: string): ParsedSseEvent[] {
  return text
    .trim()
    .split("\n\n")
    .filter((chunk) => chunk.length > 0 && !chunk.startsWith(":"))
    .map((chunk) => {
      const event: ParsedSseEvent = { id: null, event: null, data: null };

      for (const line of chunk.split("\n")) {
        if (line.startsWith("id: ")) {
          event.id = line.slice(4);
        } else if (line.startsWith("event: ")) {
          event.event = line.slice(7);
        } else if (line.startsWith("data: ")) {
          event.data = line.slice(6);
        }
      }

      return event;
    });
}

describe("GET /api/runs/:id/events", () => {
  test("active mock-happy run streams open, shot events, and final outcome", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      const manager = createManager({
        queries,
        providers: createProviderRegistry({
          mock: createMockProvider({ delayMs: 0 }),
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

      const response = await app.request(`/api/runs/${runId}/events`);
      const events = parseSse(await response.text());

      expect(response.status).toBe(200);
      expect(events[0]?.event).toBe("open");
      expect(events.some((event) => event.event === "shot")).toBe(true);
      expect(events.at(-1)?.event).toBe("outcome");
    });
  }, 30_000);

  test("terminal run streams synthesized replay without resync", async () => {
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
      queries.finalizeRun({
        id: "run-1",
        endedAt: 200,
        outcome: "won",
        shotsFired: 2,
        hits: 1,
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

      const response = await app.request("/api/runs/run-1/events");
      const events = parseSse(await response.text());

      expect(response.status).toBe(200);
      expect(events.map((event) => event.event)).toEqual(["open", "shot", "shot", "outcome"]);
      expect(events.some((event) => event.event === "resync")).toBe(false);
    });
  });

  test("unknown id streams exactly one resync", async () => {
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

      const response = await app.request("/api/runs/missing/events");
      const events = parseSse(await response.text());

      expect(response.status).toBe(200);
      expect(events).toHaveLength(1);
      expect(events[0]?.event).toBe("resync");
    });
  });

  test("query lastEventId resumes from the next missed live event", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      const manager = createManager({
        queries,
        providers: createProviderRegistry({
          mock: createMockProvider({ delayMs: 20 }),
        }),
      });
      const app = buildApp({ queries, manager });
      const runId = manager.start({
        providerId: "mock",
        modelId: "mock-schema-errors",
        apiKey: "test-key",
        reasoningEnabled: false,
        clientSession: "session-1",
        seedDate: "2026-04-21",
      });
      const handle = manager.getHandle(runId);
      if (handle === null) {
        throw new Error("manager handle should exist");
      }

      for (let attempts = 0; attempts < 20; attempts += 1) {
        if (queries.listShots(runId).length > 0) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const response = await app.request(`/api/runs/${runId}/events?lastEventId=0`);
      const events = parseSse(await response.text());

      expect(response.status).toBe(200);
      expect(events[0]?.event).toBe("shot");
      expect(events[0]?.data).toContain('"idx":1');
      expect(events.at(-1)?.event).toBe("outcome");
    });
  }, 30_000);

  test("out-of-range Last-Event-ID returns a single resync for active runs", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      const ring = new EventRing(2);
      ring.push({
        kind: "open",
        id: 0,
        runId: "run-1",
        startedAt: 100,
        seedDate: "2026-04-21",
      });
      ring.push({
        kind: "shot",
        id: 0,
        idx: 0,
        row: null,
        col: null,
        result: "schema_error",
        reasoning: null,
      });
      ring.push({
        kind: "outcome",
        id: 0,
        outcome: "dnf_schema_errors",
        shotsFired: 0,
        hits: 0,
        schemaErrors: 5,
        invalidCoordinates: 0,
        endedAt: 200,
      });

      const app = buildApp({
        queries,
        manager: {
          start() {
            throw new Error("not used");
          },
          abort() {
            return false;
          },
          getHandle() {
            return {
              controller: new AbortController(),
              ring,
              subscribers: new Set(),
              taskPromise: Promise.resolve(null),
            };
          },
          shutdown() {
            return Promise.resolve();
          },
        },
      });

      const response = await app.request("/api/runs/run-1/events", {
        headers: {
          "Last-Event-ID": "0",
        },
      });
      const events = parseSse(await response.text());

      expect(response.status).toBe(200);
      expect(events).toHaveLength(1);
      expect(events[0]?.event).toBe("resync");
    });
  });
});
