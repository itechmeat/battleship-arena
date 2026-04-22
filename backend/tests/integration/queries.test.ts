import { describe, expect, test } from "bun:test";

import { createQueries } from "../../src/db/queries.ts";
import { withTempDatabase } from "../../src/db/with-temp-database.ts";

describe("createQueries", () => {
  test("insertRun and getRunMeta round-trip", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);

      queries.insertRun({
        id: "run-1",
        seedDate: "2026-04-21",
        providerId: "mock",
        modelId: "mock-happy",
        displayName: "Mock happy",
        startedAt: 100,
        clientSession: "session-1",
        budgetUsdMicros: null,
      });

      expect(queries.getRunMeta("run-1")?.id).toBe("run-1");
      expect(queries.getRunMeta("run-1")?.outcome).toBeNull();
    });
  });

  test("appendShot and listShots preserve idx order", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      queries.insertRun({
        id: "run-1",
        seedDate: "2026-04-21",
        providerId: "mock",
        modelId: "mock-happy",
        displayName: "Mock happy",
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

      expect(queries.listShots("run-1").map((shot) => shot.idx)).toEqual([0, 1]);
    });
  });

  test("finalizeRun updates terminal fields", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      queries.insertRun({
        id: "run-1",
        seedDate: "2026-04-21",
        providerId: "mock",
        modelId: "mock-happy",
        displayName: "Mock happy",
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

      const meta = queries.getRunMeta("run-1");
      expect(meta?.outcome).toBe("won");
      expect(meta?.endedAt).toBe(200);
      expect(meta?.hits).toBe(17);
    });
  });

  test("findStuckRunIds returns only unfinished runs", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      queries.insertRun({
        id: "run-1",
        seedDate: "2026-04-21",
        providerId: "mock",
        modelId: "mock-happy",
        displayName: "Mock happy",
        startedAt: 100,
        clientSession: "session-1",
        budgetUsdMicros: null,
      });
      queries.insertRun({
        id: "run-2",
        seedDate: "2026-04-21",
        providerId: "mock",
        modelId: "mock-happy",
        displayName: "Mock happy",
        startedAt: 100,
        clientSession: "session-1",
        budgetUsdMicros: null,
      });
      queries.finalizeRun({
        id: "run-2",
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

      expect(queries.findStuckRunIds()).toEqual(["run-1"]);
    });
  });

  test("markStuckRunsAborted updates every unfinished row", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      queries.insertRun({
        id: "run-1",
        seedDate: "2026-04-21",
        providerId: "mock",
        modelId: "mock-happy",
        displayName: "Mock happy",
        startedAt: 100,
        clientSession: "session-1",
        budgetUsdMicros: null,
      });

      expect(queries.markStuckRunsAborted("aborted_server_restart", 300)).toBe(1);
      expect(queries.getRunMeta("run-1")?.outcome).toBe("aborted_server_restart");
      expect(queries.getRunMeta("run-1")?.endedAt).toBe(300);
    });
  });

  test("markStuckRunsAborted returns 0 when no unfinished rows remain", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      queries.insertRun({
        id: "run-1",
        seedDate: "2026-04-21",
        providerId: "mock",
        modelId: "mock-happy",
        displayName: "Mock happy",
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

      expect(queries.markStuckRunsAborted("aborted_server_restart", 300)).toBe(0);
    });
  });
});
