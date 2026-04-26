import { describe, expect, test } from "bun:test";

import { createQueries } from "../../src/db/queries.ts";
import { withTempDatabase } from "../../src/db/with-temp-database.ts";
import { createMockProvider } from "../../src/providers/mock.ts";
import { createProviderRegistry } from "../../src/providers/types.ts";
import { createManager } from "../../src/runs/manager.ts";
import { reconcileStuckRuns } from "../../src/runs/reconcile.ts";

function baseInput(modelId: string, apiKey = "test-key") {
  return {
    providerId: "mock",
    modelId,
    apiKey,
    reasoningEnabled: false,
    clientSession: "session-1",
    seedDate: "2026-04-21",
  };
}

describe("createManager", () => {
  test("start + await task reaches won", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      const manager = createManager({
        queries,
        providers: createProviderRegistry({
          mock: createMockProvider({ delayMs: 0 }),
        }),
      });

      const runId = manager.start(baseInput("mock-happy"));
      const handle = manager.getHandle(runId);
      if (handle === null) {
        throw new Error("manager handle should exist");
      }

      await handle.taskPromise;

      expect(queries.getRunMeta(runId)?.outcome).toBe("won");
    });
  }, 30_000);

  test("subscribers receive live events including final outcome", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      const manager = createManager({
        queries,
        providers: createProviderRegistry({
          mock: createMockProvider({ delayMs: 20 }),
        }),
      });
      const receivedKinds: string[] = [];

      const runId = manager.start(baseInput("mock-schema-errors"));
      const handle = manager.getHandle(runId);
      if (handle === null) {
        throw new Error("manager handle should exist");
      }

      handle.subscribers.add((event) => {
        receivedKinds.push(event.kind);
      });

      await handle.taskPromise;

      expect(receivedKinds).toContain("shot");
      expect(receivedKinds).toContain("outcome");
    });
  });

  test("mid-run abort produces aborted_viewer", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      const manager = createManager({
        queries,
        providers: createProviderRegistry({
          mock: createMockProvider({ delayMs: 50 }),
        }),
      });

      const runId = manager.start(baseInput("mock-happy"));
      const handle = manager.getHandle(runId);
      if (handle === null) {
        throw new Error("manager handle should exist");
      }

      manager.abort(runId, "viewer");
      await handle.taskPromise;

      expect(queries.getRunMeta(runId)?.outcome).toBe("aborted_viewer");
    });
  });

  test("shutdown(0) aborts in-flight runs for later reconciliation", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      const manager = createManager({
        queries,
        providers: createProviderRegistry({
          mock: createMockProvider({ delayMs: 50 }),
        }),
      });

      const runId = manager.start(baseInput("mock-happy"));
      const handle = manager.getHandle(runId);
      if (handle === null) {
        throw new Error("manager handle should exist");
      }

      await manager.shutdown(0);
      await handle.taskPromise;

      expect(queries.getRunMeta(runId)?.outcome).toBeNull();
      expect(reconcileStuckRuns(queries, 500)).toBe(1);
      expect(queries.getRunMeta(runId)?.outcome).toBe("aborted_server_restart");
    });
  });
});
