import { describe, expect, test } from "bun:test";

import { openDatabase } from "../src/db/client.ts";
import { applyMigrations } from "../src/db/migrator.ts";
import { withTempDatabase } from "../src/db/with-temp-database.ts";

function listTables(sqlite: ReturnType<typeof openDatabase>["sqlite"]) {
  const rows = sqlite
    .query<[{ name: string }], []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as unknown as Array<{ name: string }>;

  return rows.map((row) => row.name);
}

describe("applyMigrations", () => {
  test("fresh database contains runs and run_shots", async () => {
    await withTempDatabase(({ sqlite }) => {
      expect(listTables(sqlite)).toEqual(["__drizzle_migrations", "run_shots", "runs"]);
    });
  });

  test("running migrations twice is idempotent", async () => {
    await withTempDatabase(({ db, sqlite }) => {
      expect(() => applyMigrations(db)).not.toThrow();
      expect(listTables(sqlite)).toEqual(["__drizzle_migrations", "run_shots", "runs"]);
    });
  });
});
