import { describe, expect, test } from "bun:test";

import { parseShot } from "../src/shot-schema.ts";

describe("parseShot", () => {
  test("parses a valid in-range shot without reasoning", () => {
    expect(parseShot('{"row":3,"col":5}')).toEqual({
      kind: "ok",
      shot: { row: 3, col: 5 },
    });
  });

  test("parses a valid in-range shot with reasoning", () => {
    expect(parseShot('{"row":0,"col":0,"reasoning":"corner probe"}')).toEqual({
      kind: "ok",
      shot: { row: 0, col: 0, reasoning: "corner probe" },
    });
  });

  test("drops extra top-level keys", () => {
    expect(parseShot('{"row":1,"col":2,"extra":"ignored"}')).toEqual({
      kind: "ok",
      shot: { row: 1, col: 2 },
    });
  });

  test("returns schema_error for non-JSON input", () => {
    expect(parseShot("A1")).toEqual({ kind: "schema_error" });
  });

  test("returns schema_error for wrong top-level JSON shapes", () => {
    for (const raw of ["[]", "null", '"A1"', "42"]) {
      expect(parseShot(raw)).toEqual({ kind: "schema_error" });
    }
  });

  test("returns schema_error when row or col is missing", () => {
    expect(parseShot('{"row":3}')).toEqual({ kind: "schema_error" });
    expect(parseShot('{"col":5}')).toEqual({ kind: "schema_error" });
  });

  test("returns schema_error when row or col is not an integer", () => {
    for (const raw of [
      '{"row":"3","col":5}',
      '{"row":3,"col":5.5}',
      '{"row":true,"col":5}',
      '{"row":3,"col":null}',
    ]) {
      expect(parseShot(raw)).toEqual({ kind: "schema_error" });
    }
  });

  test("returns schema_error when reasoning is present but not a string", () => {
    expect(parseShot('{"row":3,"col":5,"reasoning":42}')).toEqual({
      kind: "schema_error",
    });
  });

  test("returns invalid_coordinate when row or col is out of range", () => {
    expect(parseShot('{"row":10,"col":0}')).toEqual({
      kind: "invalid_coordinate",
      row: 10,
      col: 0,
    });

    expect(parseShot('{"row":0,"col":-1}')).toEqual({
      kind: "invalid_coordinate",
      row: 0,
      col: -1,
    });
  });

  test("is pure for repeated identical input", () => {
    const raw = '{"row":4,"col":6,"reasoning":"repeatable"}';

    expect(parseShot(raw)).toEqual(parseShot(raw));
  });
});
