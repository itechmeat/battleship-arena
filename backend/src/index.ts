import { createApp } from "./app.ts";
import { loadConfigOrExit, type AppConfig } from "./config.ts";
import { openDatabase } from "./db/client.ts";

const STARTED_AT = Date.now();

export async function bootstrap(config: AppConfig) {
  const database = openDatabase(config.databasePath);
  const app = createApp({
    version: config.version,
    commitSha: config.commitSha,
    startedAt: STARTED_AT,
  });

  const server = Bun.serve({
    port: config.port,
    fetch: app.fetch,
  });

  return {
    server,
    sqlite: database.sqlite,
    config,
  };
}

if (import.meta.main) {
  await bootstrap(loadConfigOrExit(process.env));
}
