import { describe, expect, test } from "bun:test";

import { createQueries } from "../../src/db/queries.ts";
import { withTempDatabase } from "../../src/db/with-temp-database.ts";
import { createMockProvider } from "../../src/providers/mock.ts";
import { createProviderRegistry } from "../../src/providers/types.ts";
import { createManager } from "../../src/runs/manager.ts";

function baseInput(modelId: string, apiKey: string) {
  return {
    providerId: "mock",
    modelId,
    apiKey,
    reasoningEnabled: false,
    clientSession: "session-1",
    seedDate: "2026-04-21",
  };
}

function reachableDump(manager: ReturnType<typeof createManager>, runId: string): string {
  const handle = manager.getHandle(runId);
  if (handle === null) {
    throw new Error("manager handle should exist");
  }

  const ringEvents = handle.ring.since(null);
  if (ringEvents === "out_of_range") {
    throw new Error("ring.since(null) should not return out_of_range");
  }

  const subscriberDump = [...handle.subscribers]
    .map((subscriber) => JSON.stringify(subscriber) ?? "")
    .join("|");

  return [
    JSON.stringify(manager) ?? "",
    JSON.stringify(handle) ?? "",
    ringEvents.map((event) => JSON.stringify(event) ?? "").join("|"),
    subscriberDump,
  ].join("\n");
}

describe("createManager apiKey reachability", () => {
  test("apiKey is not reachable through enumerable manager state while running or after completion", async () => {
    await withTempDatabase(async ({ db }) => {
      const sentinel = "sk-live-REACHABILITY-CANARY";
      const queries = createQueries(db);
      const manager = createManager({
        queries,
        providers: createProviderRegistry({
          mock: createMockProvider({ delayMs: 20 }),
        }),
      });

      const runId = manager.start(baseInput("mock-schema-errors", sentinel));
      const handle = manager.getHandle(runId);
      if (handle === null) {
        throw new Error("manager handle should exist");
      }

      // This is a regression canary for enumerable state only. It does not cover
      // non-enumerable properties, symbol-keyed fields, WeakMap entries, or closure-captured values.
      // The primary defense is structural: Manager and RunHandle must not declare apiKey-bearing fields.
      handle.subscribers.add(() => {});

      expect(reachableDump(manager, runId)).not.toContain(sentinel);

      await handle.taskPromise;
      expect(manager.getHandle(runId)).toBeNull();
      expect(JSON.stringify(manager) ?? "").not.toContain(sentinel);
    });
  });
});
