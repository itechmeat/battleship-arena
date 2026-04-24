import { describe, expect, test } from "bun:test";

import { shouldInjectMockProvider } from "../../src/islands/StartRunForm.tsx";

describe("StartRunForm mock provider gate", () => {
  test("injects mock only for development, staging, and test modes", () => {
    expect(shouldInjectMockProvider("development")).toBe(true);
    expect(shouldInjectMockProvider("staging")).toBe(true);
    expect(shouldInjectMockProvider("test")).toBe(true);
    expect(shouldInjectMockProvider("production")).toBe(false);
    expect(shouldInjectMockProvider("preview")).toBe(false);
  });
});
