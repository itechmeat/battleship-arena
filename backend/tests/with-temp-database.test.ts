import { existsSync } from "node:fs";

import { describe, expect, test } from "bun:test";

import { withTempDatabase } from "../src/db/with-temp-database.ts";

describe("withTempDatabase", () => {
  test("provides a migrated temp database and cleans it up after success", async () => {
    let databasePath = "";

    await withTempDatabase(({ path, sqlite }) => {
      databasePath = path;

      const tables = sqlite
        .query<[{ name: string }], []>(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('runs', 'run_shots') ORDER BY name",
        )
        .all() as unknown as Array<{ name: string }>;

      expect(existsSync(path)).toBe(true);
      expect(tables.map((row) => row.name)).toEqual(["run_shots", "runs"]);
    });

    expect(existsSync(databasePath)).toBe(false);
    expect(existsSync(`${databasePath}-wal`)).toBe(false);
    expect(existsSync(`${databasePath}-shm`)).toBe(false);
  });

  test("re-throws callback errors and still cleans up", async () => {
    let databasePath = "";

    await expect(
      withTempDatabase(({ path }) => {
        databasePath = path;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(existsSync(databasePath)).toBe(false);
    expect(existsSync(`${databasePath}-wal`)).toBe(false);
    expect(existsSync(`${databasePath}-shm`)).toBe(false);
  });
});
