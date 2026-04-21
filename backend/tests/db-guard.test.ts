import { describe, expect, test } from "bun:test";

interface SpawnResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

async function runGuardProbe(databasePath: string | undefined): Promise<SpawnResult> {
  const env = { ...process.env };

  if (databasePath === undefined) {
    delete env.DATABASE_PATH;
  } else {
    env.DATABASE_PATH = databasePath;
  }

  const processHandle = Bun.spawn(
    [process.execPath, "test", "./backend/tests/fixtures/guard-probe.ts"],
    {
      cwd: new URL("../../", import.meta.url).pathname,
      env,
      stderr: "pipe",
      stdout: "pipe",
    },
  );

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(processHandle.stdout).text(),
    new Response(processHandle.stderr).text(),
    processHandle.exited,
  ]);

  return { exitCode, stderr, stdout };
}

describe("DATABASE_PATH test guard", () => {
  test("accepts safe values", async () => {
    for (const databasePath of [":memory:", "/tmp/bsa-abc.db", "./dev-test-foo.db"]) {
      const result = await runGuardProbe(databasePath);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).not.toContain("Unsafe DATABASE_PATH for tests");
    }
  });

  test("rejects unset and unsafe values", async () => {
    for (const databasePath of [undefined, "./project.db"]) {
      const result = await runGuardProbe(databasePath);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("Unsafe DATABASE_PATH for tests");
    }
  });
});
