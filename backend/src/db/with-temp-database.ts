import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openDatabase, type DatabaseHandle } from "./client.ts";
import { generateUlid } from "./ulid.ts";

async function removeDatabaseFiles(path: string) {
  await Promise.all([
    rm(path, { force: true }),
    rm(`${path}-wal`, { force: true }),
    rm(`${path}-shm`, { force: true }),
  ]);
}

export async function withTempDatabase<T>(
  callback: (database: DatabaseHandle & { path: string }) => Promise<T> | T,
) {
  const path = join(tmpdir(), `bsa-test-${generateUlid()}.db`);
  const database = openDatabase(path);

  try {
    return await callback({ ...database, path });
  } finally {
    database.sqlite.close();
    await removeDatabaseFiles(path);
  }
}
