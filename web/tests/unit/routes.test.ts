import { describe, expect, test } from "bun:test";

import { resolveLiveRunIdFromPath, resolveReplayRunIdFromPath } from "../../src/lib/routes.ts";

describe("frontend route helpers", () => {
  test("resolves dynamic live run ids", () => {
    expect(resolveLiveRunIdFromPath("/runs/01ABC")).toBe("01ABC");
    expect(resolveLiveRunIdFromPath("/")).toBe("");
  });

  test("resolves nested replay run ids", () => {
    expect(resolveReplayRunIdFromPath("/runs/01ABC/replay")).toBe("01ABC");
    expect(resolveReplayRunIdFromPath("/runs/01ABC")).toBe("");
  });
});
