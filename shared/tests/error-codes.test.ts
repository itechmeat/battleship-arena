import { describe, expect, test } from "bun:test";

import { ERROR_CODES } from "../src/error-codes.ts";

describe("S2a error codes", () => {
  test("run_not_found is in the closed set", () => {
    expect((ERROR_CODES as readonly string[]).includes("run_not_found")).toBe(true);
  });

  test("already_aborted is in the closed set", () => {
    expect((ERROR_CODES as readonly string[]).includes("already_aborted")).toBe(true);
  });
});
