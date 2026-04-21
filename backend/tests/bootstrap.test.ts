import { expect, test } from "bun:test";

import { bootstrap } from "../src/index.ts";
import { generateUlid } from "../src/db/ulid.ts";

test("bootstrap opens the database, migrates, and serves /api/health", async () => {
  const databasePath = `/tmp/bsa-test-${generateUlid()}.db`;

  const handle = await bootstrap({
    databasePath,
    port: 0,
    maintenanceSoft: false,
    shutdownGraceSec: 300,
    version: "0.1.0",
    commitSha: "abc123",
  });

  try {
    const response = await fetch(`http://127.0.0.1:${handle.server.port}/api/health`);
    const tables = handle.sqlite
      .query<[{ name: string }], []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('runs', 'run_shots') ORDER BY name",
      )
      .all() as unknown as Array<{ name: string }>;

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      version: "0.1.0",
      commitSha: "abc123",
      startedAt: expect.any(Number),
    });
    expect(tables.map((row) => row.name)).toEqual(["run_shots", "runs"]);
  } finally {
    handle.server.stop(true);
    handle.sqlite.close();
    await Bun.file(databasePath).delete();
    await Promise.allSettled([
      Bun.file(`${databasePath}-wal`).delete(),
      Bun.file(`${databasePath}-shm`).delete(),
    ]);
  }
});

test("bootstrap rejects an unreachable database path", async () => {
  await expect(
    bootstrap({
      databasePath: "/definitely/missing/path/project.db",
      port: 0,
      maintenanceSoft: false,
      shutdownGraceSec: 300,
      version: "0.1.0",
      commitSha: "unknown",
    }),
  ).rejects.toThrow();
});
