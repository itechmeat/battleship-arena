import { createApp } from "./app.ts";
import { loadConfigOrExit, type AppConfig } from "./config.ts";
import { openDatabase } from "./db/client.ts";
import { createQueries } from "./db/queries.ts";
import { createMockProvider } from "./providers/mock.ts";
import { createProviderRegistry } from "./providers/types.ts";
import { createManager } from "./runs/manager.ts";
import { reconcileStuckRuns } from "./runs/reconcile.ts";

const STARTED_AT = Date.now();

function logShutdownError(step: "manager.shutdown" | "server.stop", error: unknown) {
  console.error(`Graceful shutdown failed during ${step}`, error);
}

export async function bootstrap(config: AppConfig) {
  const database = openDatabase(config.databasePath);
  const queries = createQueries(database.db);
  reconcileStuckRuns(queries, Date.now());

  const providers = createProviderRegistry({
    mock: createMockProvider({ delayMs: config.mockTurnDelayMs }),
  });
  const manager = createManager({
    queries,
    providers,
    now: () => Date.now(),
  });
  const app = createApp(
    {
      version: config.version,
      commitSha: config.commitSha,
      startedAt: STARTED_AT,
    },
    {
      queries,
      providers,
      manager,
    },
  );

  const server = Bun.serve({
    port: config.port,
    fetch: app.fetch,
  });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    try {
      await manager.shutdown(config.shutdownGraceSec * 1000);
    } catch (error) {
      logShutdownError("manager.shutdown", error);
    } finally {
      try {
        await server.stop();
      } catch (error) {
        logShutdownError("server.stop", error);
      }
    }
  };

  const handleSignal = (signal: "SIGTERM" | "SIGINT") => {
    shutdown().catch((error) => {
      console.error(`Unexpected ${signal} shutdown failure`, error);
    });
  };

  process.once("SIGTERM", () => {
    handleSignal("SIGTERM");
  });
  process.once("SIGINT", () => {
    handleSignal("SIGINT");
  });

  return {
    server,
    sqlite: database.sqlite,
    manager,
    config,
  };
}

if (import.meta.main) {
  await bootstrap(loadConfigOrExit(process.env));
}
