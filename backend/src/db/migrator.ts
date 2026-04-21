import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import * as schema from "./schema.ts";

function resolveMigrationsFolder(): string {
  const sourceFolder = fileURLToPath(new URL("./migrations", import.meta.url));
  const bundledFolder = fileURLToPath(new URL("./db/migrations", import.meta.url));

  if (existsSync(`${sourceFolder}/meta/_journal.json`)) {
    return sourceFolder;
  }

  return bundledFolder;
}

export function applyMigrations(database: BunSQLiteDatabase<typeof schema>) {
  migrate(database, { migrationsFolder: resolveMigrationsFolder() });
}
