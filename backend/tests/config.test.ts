import { describe, expect, test } from "bun:test";

import { ConfigError, loadConfig } from "../src/config.ts";

describe("loadConfig", () => {
  test("returns a typed configuration object for valid input", () => {
    expect(
      loadConfig({
        DATABASE_PATH: "/tmp/bsa-test-config.db",
        PORT: "9000",
        MAINTENANCE_SOFT: "true",
        SHUTDOWN_GRACE_SEC: "45",
        VERSION: "9.9.9",
        COMMIT_SHA: "abc123",
      }),
    ).toEqual({
      databasePath: "/tmp/bsa-test-config.db",
      port: 9000,
      maintenanceSoft: true,
      shutdownGraceSec: 45,
      mockTurnDelayMs: 150,
      version: "9.9.9",
      commitSha: "abc123",
    });
  });

  test("falls back to package version, unknown commit sha, and default numeric values", () => {
    const config = loadConfig({
      DATABASE_PATH: "/tmp/bsa-test-config-defaults.db",
      MAINTENANCE_SOFT: "false",
      VERSION: "",
      COMMIT_SHA: "",
    });

    expect(config.port).toBe(8081);
    expect(config.shutdownGraceSec).toBe(300);
    expect(config.mockTurnDelayMs).toBe(150);
    expect(config.maintenanceSoft).toBe(false);
    expect(config.commitSha).toBe("unknown");
    expect(config.version).toBe("0.1.0");
  });

  test("rejects missing DATABASE_PATH", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({})).toThrow("DATABASE_PATH");
  });

  test("rejects a non-positive PORT", () => {
    expect(() =>
      loadConfig({
        DATABASE_PATH: "/tmp/bsa-test-port.db",
        PORT: "0",
      }),
    ).toThrow("PORT");
  });

  test("rejects a negative SHUTDOWN_GRACE_SEC", () => {
    expect(() =>
      loadConfig({
        DATABASE_PATH: "/tmp/bsa-test-grace.db",
        SHUTDOWN_GRACE_SEC: "-1",
      }),
    ).toThrow("SHUTDOWN_GRACE_SEC");
  });

  test("rejects a negative MOCK_TURN_DELAY_MS", () => {
    expect(() =>
      loadConfig({
        DATABASE_PATH: "/tmp/bsa-test-delay.db",
        MOCK_TURN_DELAY_MS: "-1",
      }),
    ).toThrow("MOCK_TURN_DELAY_MS");
  });
});
