import { describe, expect, test } from "bun:test";

import type { SseEvent } from "@battleship-arena/shared";

import { createQueries } from "../../src/db/queries.ts";
import { withTempDatabase } from "../../src/db/with-temp-database.ts";
import { ProviderError } from "../../src/providers/errors.ts";
import { createMockProvider } from "../../src/providers/mock.ts";
import { runEngine } from "../../src/runs/engine.ts";

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
      expect(meta.shotsFired).toBe(5);
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

  test("budgetUsd uses floor micros and finalizes dnf_budget after exceeding the cap", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      const provider = createMockProvider({ delayMs: 0, costUsdMicros: 501 });

      const outcome = await runEngine(
        "run-1",
        {
          ...baseInput("mock-misses"),
          budgetUsd: 0.0005,
        },
        new AbortController().signal,
        () => {},
        { queries, provider },
      );

      const meta = queries.getRunMeta("run-1");

      expect(outcome).toBe("dnf_budget");
      expect(meta?.budgetUsdMicros).toBe(500);
      expect(meta?.costUsdMicros).toBe(501);
    });
  });

  test("terminal cost is the sum of every provider turn", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      const provider = createMockProvider({ delayMs: 0, costUsdMicros: 7 });

      const outcome = await runEngine(
        "run-1",
        baseInput("mock-happy"),
        new AbortController().signal,
        () => {},
        { queries, provider },
      );

      const meta = queries.getRunMeta("run-1");
      const shots = queries.listShots("run-1");

      expect(outcome).toBe("won");
      expect(meta?.costUsdMicros).toBe(shots.length * 7);
    });
  });

  test("transient ProviderError persists llm_error, increments schema errors, and continues", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      let calls = 0;
      const provider = createMockProvider({
        delayMs: 0,
        testHooks: {
          async beforeCall() {
            calls += 1;
            if (calls > 1) {
              return;
            }

            throw new ProviderError({
              kind: "transient",
              code: "provider_5xx",
              providerId: "mock",
              message: "Provider service failed",
              status: 503,
              cause: "upstream failed with sk-secret",
            });
          },
        },
      });

      const outcome = await runEngine(
        "run-1",
        baseInput("mock-happy", "sk-secret"),
        new AbortController().signal,
        () => {},
        { queries, provider },
      );

      const shots = queries.listShots("run-1");
      const meta = queries.getRunMeta("run-1");

      expect(outcome).toBe("won");
      expect(meta?.schemaErrors).toBe(1);
      expect(shots[0]).toMatchObject({
        row: null,
        col: null,
        result: "schema_error",
        rawResponse: "",
        tokensIn: 0,
        tokensOut: 0,
        costUsdMicros: 0,
      });
      expect(shots[0]?.llmError).toBe("upstream failed with [REDACTED]");
      expect(shots[0]?.llmError).not.toContain("sk-secret");
    });
  }, 30_000);

  test("provider turn timeout records a timeout and continues", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      const provider = createMockProvider({ delayMs: 50 });

      const outcome = await runEngine(
        "run-1",
        baseInput("mock-happy"),
        new AbortController().signal,
        () => {},
        { queries, provider, turnTimeoutMs: 1 },
      );

      const meta = queries.getRunMeta("run-1");
      const shots = queries.listShots("run-1");

      expect(outcome).toBe("dnf_schema_errors");
      expect(meta?.schemaErrors).toBe(5);
      expect(meta?.shotsFired).toBe(5);
      expect(shots).toHaveLength(5);
      expect(shots.every((shot) => shot.result === "timeout")).toBe(true);
      expect(shots.every((shot) => shot.llmError?.includes("timed out"))).toBe(true);
    });
  });

  test("five consecutive transient ProviderErrors reach dnf_schema_errors", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      const provider = createMockProvider({
        delayMs: 0,
        failure: new ProviderError({
          kind: "transient",
          code: "provider_5xx",
          providerId: "mock",
          message: "Provider service failed",
          status: 503,
          cause: "503 upstream",
        }),
      });

      const outcome = await runEngine(
        "run-1",
        baseInput("mock-happy"),
        new AbortController().signal,
        () => {},
        { queries, provider },
      );

      const meta = queries.getRunMeta("run-1");
      const shots = queries.listShots("run-1");

      expect(outcome).toBe("dnf_schema_errors");
      expect(meta?.schemaErrors).toBe(5);
      expect(meta?.shotsFired).toBe(5);
      expect(shots).toHaveLength(5);
      expect(shots.every((shot) => shot.result === "schema_error")).toBe(true);
      expect(shots.every((shot) => shot.llmError?.includes("503 upstream"))).toBe(true);
    });
  });

  test("rate-limited ProviderError finalizes provider_rate_limited without a shot row", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      const provider = createMockProvider({
        delayMs: 0,
        failure: new ProviderError({
          kind: "unreachable",
          code: "rate_limited",
          providerId: "mock",
          message: "Provider rate limit reached",
          status: 429,
          cause: "429 upstream: Rate limit exceeded",
        }),
      });

      const outcome = await runEngine(
        "run-1",
        baseInput("mock-happy"),
        new AbortController().signal,
        () => {},
        { queries, provider },
      );

      const meta = queries.getRunMeta("run-1");

      expect(outcome).toBe("provider_rate_limited");
      expect(meta?.outcome).toBe("provider_rate_limited");
      expect(meta?.terminalErrorCode).toBe("rate_limited");
      expect(meta?.terminalErrorStatus).toBe(429);
      expect(meta?.terminalErrorMessage).toContain("Rate limit exceeded");
      expect(meta?.schemaErrors).toBe(0);
      expect(meta?.shotsFired).toBe(0);
      expect(queries.listShots("run-1")).toEqual([]);
    });
  });

  test("unreachable ProviderError finalizes llm_unreachable without a shot row", async () => {
    await withTempDatabase(async ({ db }) => {
      const queries = createQueries(db);
      const provider = createMockProvider({
        delayMs: 0,
        failure: new ProviderError({
          kind: "unreachable",
          code: "auth",
          providerId: "mock",
          message: "Provider authentication failed",
          status: 401,
          cause: "401 unauthorized",
        }),
      });

      const outcome = await runEngine(
        "run-1",
        baseInput("mock-happy"),
        new AbortController().signal,
        () => {},
        { queries, provider },
      );

      const meta = queries.getRunMeta("run-1");

      expect(outcome).toBe("llm_unreachable");
      expect(meta?.terminalErrorCode).toBe("auth");
      expect(meta?.terminalErrorStatus).toBe(401);
      expect(meta?.terminalErrorMessage).toBe("401 unauthorized");
      expect(meta?.schemaErrors).toBe(0);
      expect(meta?.shotsFired).toBe(0);
      expect(queries.listShots("run-1")).toEqual([]);
    });
  });
});
