import { describe, expect, test } from "bun:test";

import type { SseEvent } from "@battleship-arena/shared";

import { createQueries } from "../../src/db/queries.ts";
import { withTempDatabase } from "../../src/db/with-temp-database.ts";
import { createMockProvider } from "../../src/providers/mock.ts";
import { runEngine } from "../../src/runs/engine.ts";

function baseInput(modelId: string, apiKey = "test-key") {
  return {
    providerId: "mock",
    modelId,
    apiKey,
    clientSession: "session-1",
    seedDate: "2026-04-21",
  };
}

describe("runEngine", () => {
  test("mock-happy reaches won and emits open then outcome", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      const provider = createMockProvider({ delayMs: 0 });
      const events: SseEvent[] = [];

      const outcome = await runEngine(
        "run-1",
        baseInput("mock-happy"),
        new AbortController().signal,
        (event) => {
          events.push(event);
        },
        { queries, provider },
      );

      const meta = queries.getRunMeta("run-1");
      if (meta === null) {
        throw new Error("run metadata should exist");
      }

      expect(outcome).toBe("won");
      expect(meta.outcome).toBe("won");
      expect(meta.endedAt).not.toBeNull();
      expect(meta.hits).toBe(17);
      expect(events[0]?.kind).toBe("open");
      expect(events.at(-1)?.kind).toBe("outcome");
    });
  }, 30_000);

  test("mock-misses reaches dnf_shot_cap with 83 misses and 17 invalid coordinates", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      const provider = createMockProvider({ delayMs: 0 });

      const outcome = await runEngine(
        "run-1",
        baseInput("mock-misses"),
        new AbortController().signal,
        () => {},
        { queries, provider },
      );

      const meta = queries.getRunMeta("run-1");
      if (meta === null) {
        throw new Error("run metadata should exist");
      }

      const shots = queries.listShots("run-1");

      expect(outcome).toBe("dnf_shot_cap");
      expect(meta.outcome).toBe("dnf_shot_cap");
      expect(meta.shotsFired).toBe(100);
      expect(meta.hits).toBe(0);
      expect(meta.schemaErrors).toBe(0);
      expect(meta.invalidCoordinates).toBe(17);
      expect(shots.filter((shot) => shot.result === "miss")).toHaveLength(83);
      expect(shots.filter((shot) => shot.result === "invalid_coordinate")).toHaveLength(17);
    });
  }, 30_000);

  test("mock-schema-errors reaches dnf_schema_errors after 5 turns", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      const provider = createMockProvider({ delayMs: 0 });

      const outcome = await runEngine(
        "run-1",
        baseInput("mock-schema-errors"),
        new AbortController().signal,
        () => {},
        { queries, provider },
      );

      const meta = queries.getRunMeta("run-1");
      if (meta === null) {
        throw new Error("run metadata should exist");
      }

      const shots = queries.listShots("run-1");

      expect(outcome).toBe("dnf_schema_errors");
      expect(meta.outcome).toBe("dnf_schema_errors");
      expect(meta.shotsFired).toBe(0);
      expect(meta.schemaErrors).toBe(5);
      expect(shots).toHaveLength(5);
      expect(shots.every((shot) => shot.result === "schema_error")).toBe(true);
    });
  });

  test("mid-run viewer abort reaches aborted_viewer", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      const provider = createMockProvider({ delayMs: 50 });
      const controller = new AbortController();

      const task = runEngine("run-1", baseInput("mock-happy"), controller.signal, () => {}, {
        queries,
        provider,
      });

      setTimeout(() => {
        controller.abort({ reason: "viewer" });
      }, 0);

      const outcome = await task;
      const meta = queries.getRunMeta("run-1");
      if (meta === null) {
        throw new Error("run metadata should exist");
      }

      expect(outcome).toBe("aborted_viewer");
      expect(meta.outcome).toBe("aborted_viewer");
    });
  });

  test("apiKey never appears in runs or run_shots rows", async () => {
    await withTempDatabase(async ({ db, sqlite }) => {
      const sentinel = "sk-test-DO-NOT-PERSIST";
      const queries = createQueries(db);
      const provider = createMockProvider({ delayMs: 0 });

      await runEngine(
        "run-1",
        baseInput("mock-schema-errors", sentinel),
        new AbortController().signal,
        () => {},
        { queries, provider },
      );

      const dump =
        JSON.stringify(sqlite.query("SELECT * FROM runs").all()) +
        JSON.stringify(sqlite.query("SELECT * FROM run_shots").all());

      expect(dump).not.toContain(sentinel);
    });
  });
});
