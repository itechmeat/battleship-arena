import { describe, expect, test } from "bun:test";

import {
  abortRunPath,
  leaderboardPath,
  providersPath,
  runEventsPath,
  runPath,
  runsPath,
  runShotsPath,
} from "../../src/lib/api-routes.ts";

describe("API route builders", () => {
  test("builds stable API paths", () => {
    expect(providersPath()).toBe("/api/providers");
    expect(runsPath()).toBe("/api/runs");
    expect(runPath("run 1")).toBe("/api/runs/run%201");
    expect(runShotsPath("run 1")).toBe("/api/runs/run%201/shots");
    expect(abortRunPath("run 1")).toBe("/api/runs/run%201/abort");
    expect(runEventsPath("run 1", 7)).toBe("/api/runs/run%201/events?lastEventId=7");
  });

  test("builds leaderboard filter query strings", () => {
    expect(
      leaderboardPath("all", {
        providerId: "openrouter",
        modelId: "openai/gpt-5.4-nano",
        reasoningEnabled: true,
      }),
    ).toBe(
      "/api/leaderboard?scope=all&providerId=openrouter&modelId=openai%2Fgpt-5.4-nano&reasoningEnabled=true",
    );
  });
});
