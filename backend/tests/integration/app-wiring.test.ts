import { expect, test } from "bun:test";

import { createApp } from "../../src/app.ts";
import { createQueries } from "../../src/db/queries.ts";
import { withTempDatabase } from "../../src/db/with-temp-database.ts";
import { createMockProvider } from "../../src/providers/mock.ts";
import { createProviderRegistry } from "../../src/providers/types.ts";
import { createManager } from "../../src/runs/manager.ts";

test("createApp serves /api/health and /api/runs in the same app instance", async () => {
  await withTempDatabase(async ({ db }) => {
    const queries = createQueries(db);
    const providers = createProviderRegistry({
      mock: createMockProvider({ delayMs: 0 }),
    });
    const manager = createManager({
      queries,
      providers,
      now: () => Date.now(),
    });
    const app = createApp(
      {
        version: "0.1.0",
        commitSha: "abc123",
        startedAt: 1_745_000_000_000,
      },
      { queries, providers, manager },
    );

    const healthResponse = await app.request("/api/health");
    const runsResponse = await app.request("/api/runs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        providerId: "mock",
        modelId: "mock-schema-errors",
        apiKey: "test-key",
      }),
    });
    expect(runsResponse.status).toBe(200);

    const runsBody = (await runsResponse.json()) as { runId: string };
    const handle = manager.getHandle(runsBody.runId);
    if (handle === null) {
      throw new Error("manager handle should exist");
    }

    await handle.taskPromise;

    expect(healthResponse.status).toBe(200);
  });
}, 10_000);
