import { expect, test } from "bun:test";
import type { Database } from "bun:sqlite";

import { withTempDatabase } from "../src/db/with-temp-database.ts";

function readSinglePragma<T extends Record<string, number | string>>(
  sqlite: Database,
  pragma: string,
) {
  return sqlite.query<T, []>(`PRAGMA ${pragma};`).get();
}

test("openDatabase applies migrations and enables WAL + foreign keys", async () => {
  await withTempDatabase(({ sqlite }) => {
    const foreignKeys = readSinglePragma<{ foreign_keys: number }>(sqlite, "foreign_keys");
    const journalMode = readSinglePragma<{ journal_mode: string }>(sqlite, "journal_mode");
    const tables = sqlite
      .query<[{ name: string }], []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('runs', 'run_shots') ORDER BY name",
      )
      .all() as unknown as Array<{ name: string }>;

    expect(foreignKeys?.foreign_keys).toBe(1);
    expect(journalMode?.journal_mode).toBe("wal");
    expect(tables.map((row) => row.name)).toEqual(["run_shots", "runs"]);
  });
});
