import { describe, expect, test } from "bun:test";

interface SpawnResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

async function runSmoke(args: readonly string[]): Promise<SpawnResult> {
  const processHandle = Bun.spawn(
    [process.execPath, "run", "./backend/scripts/smoke-real-keys.ts", ...args],
    {
      cwd: new URL("../../", import.meta.url).pathname,
      env: {
        ...process.env,
        NODE_ENV: "test",
      },
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

describe("real-token smoke CLI", () => {
  test("rejects missing provider selection with usage and exit code 2", async () => {
    const result = await runSmoke(["--dry-run", "--key", "sk-sentinel"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Usage:");
  });

  test("dry-run prints a redacted HTTP request plan without a network call", async () => {
    const result = await runSmoke([
      "--provider",
      "openrouter",
      "--dry-run",
      "--key",
      "sk-sentinel-openrouter-secret",
    ]);
    const plan = JSON.parse(result.stdout) as {
      url?: string;
      method?: string;
      headers?: Record<string, string>;
      body?: unknown;
    };

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(plan.url).toContain("openrouter.ai/api/v1/chat/completions");
    expect(plan.method).toBe("POST");
    expect(plan.headers?.Authorization).toBe("Bearer [redacted]");
    expect(JSON.stringify(plan)).not.toContain("sk-sentinel-openrouter-secret");
    expect(plan.body).toEqual(expect.objectContaining({ model: "openai/gpt-5-nano" }));
  });
});
