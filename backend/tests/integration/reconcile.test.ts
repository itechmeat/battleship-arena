import { describe, expect, test } from "bun:test";

import { createQueries } from "../../src/db/queries.ts";
import { withTempDatabase } from "../../src/db/with-temp-database.ts";
import { reconcileStuckRuns } from "../../src/runs/reconcile.ts";

describe("reconcileStuckRuns", () => {
  test("updates every unfinished run to aborted_server_restart", async () => {
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

      expect(reconcileStuckRuns(queries, 200)).toBe(1);
      expect(queries.getRunMeta("run-1")?.outcome).toBe("aborted_server_restart");
      expect(queries.getRunMeta("run-1")?.endedAt).toBe(200);
    });
  });

  test("returns 0 when there are no unfinished runs", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      expect(reconcileStuckRuns(queries, 200)).toBe(0);
    });
  });
});
