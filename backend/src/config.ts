import backendPackage from "../package.json" with { type: "json" };

export interface AppConfig {
  databasePath: string;
  port: number;
  maintenanceSoft: boolean;
  shutdownGraceSec: number;
  version: string;
  commitSha: string;
}

export class ConfigError extends Error {
  constructor(
    public readonly key: string,
    message: string,
  ) {
    super(`${key}: ${message}`);
    this.name = "ConfigError";
  }
}

type EnvMap = Record<string, string | undefined>;

const DEFAULT_PORT = 8081;
const DEFAULT_SHUTDOWN_GRACE_SEC = 300;

function readRequiredString(env: EnvMap, key: string): string {
  const value = env[key]?.trim();

  if (!value) {
    throw new ConfigError(key, "is required");
  }

  return value;
}

function readPositiveInteger(env: EnvMap, key: string, fallback: number): number {
  const rawValue = env[key]?.trim();

  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ConfigError(key, "must be a positive integer");
  }

  return parsed;
}

function readNonNegativeInteger(env: EnvMap, key: string, fallback: number): number {
  const rawValue = env[key]?.trim();

  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ConfigError(key, "must be a non-negative integer");
  }

  return parsed;
}

export function loadConfig(env: EnvMap): AppConfig {
  const version = env.VERSION?.trim() || backendPackage.version;
  const commitSha = env.COMMIT_SHA?.trim() || "unknown";

  return {
    databasePath: readRequiredString(env, "DATABASE_PATH"),
    port: readPositiveInteger(env, "PORT", DEFAULT_PORT),
    maintenanceSoft: env.MAINTENANCE_SOFT === "true",
    shutdownGraceSec: readNonNegativeInteger(env, "SHUTDOWN_GRACE_SEC", DEFAULT_SHUTDOWN_GRACE_SEC),
    version,
    commitSha,
  };
}

export function loadConfigOrExit(env: EnvMap = process.env): AppConfig {
  try {
    return loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }

    throw error;
  }
}
