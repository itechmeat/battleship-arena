import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

import { applyMigrations } from "./migrator.ts";
import * as schema from "./schema.ts";

export interface DatabaseHandle {
  sqlite: Database;
  db: BunSQLiteDatabase<typeof schema>;
}

export function openDatabase(path: string): DatabaseHandle {
  const sqlite = new Database(path);

  sqlite.exec("PRAGMA busy_timeout = 5000;");
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");

  const db = drizzle(sqlite, { schema });

  applyMigrations(db);

  return { sqlite, db };
}
