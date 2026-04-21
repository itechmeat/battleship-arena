import { expect, test } from "bun:test";

test("guard probe reaches the suite body", () => {
  expect(true).toBe(true);
});
