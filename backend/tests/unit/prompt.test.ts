import { describe, expect, test } from "bun:test";

import { buildProviderUserText } from "../../src/providers/prompt.ts";
import { SYSTEM_PROMPT } from "../../src/runs/prompt.ts";

function candidateCellsFromPrompt(prompt: string): string[] {
  const candidateLine = prompt
    .split("\n")
    .find((line) => line.startsWith("Rule-filtered candidate cells for this turn"));
  if (candidateLine === undefined) {
    throw new Error("Missing candidate line");
  }

  return candidateLine.split(": ")[1]?.split(", ") ?? [];
}

function cellRow(cell: string): number {
  return Number(cell.slice(1));
}

function cellCol(cell: string): number {
  return cell.charCodeAt(0) - "A".charCodeAt(0) + 1;
}

describe("SYSTEM_PROMPT", () => {
  test("frames each turn as bounded policy selection instead of exhaustive optimization", () => {
    expect(SYSTEM_PROMPT).toContain("Use concise internal reasoning");
    expect(SYSTEM_PROMPT).toContain("Use one short heuristic pass");
    expect(SYSTEM_PROMPT).toContain("pick an adjacent unknown");
    expect(SYSTEM_PROMPT).toContain("pick an unknown cell likely to find a remaining ship");
    expect(SYSTEM_PROMPT).toContain("Do not enumerate possible boards");
    expect(SYSTEM_PROMPT).toContain("Do not attempt exhaustive global optimization");
    expect(SYSTEM_PROMPT).toContain("Return one JSON object immediately");
    expect(SYSTEM_PROMPT).not.toContain("Follow this fixed shot policy");
    expect(SYSTEM_PROMPT).not.toContain("Recommended legal shot");
    expect(SYSTEM_PROMPT).not.toContain("efficiency is the only thing that matters");
    expect(SYSTEM_PROMPT).not.toContain("Ships never overlap");
    expect(SYSTEM_PROMPT).not.toContain("Ships never touch");
  });
});

describe("buildProviderUserText", () => {
  test("lists adjacent legal candidates around unsunk hits without direction ranking", () => {
    const prompt = buildProviderUserText({
      modelId: "opencode-go/deepseek-v4-flash",
      apiKey: "sk-test",
      boardText: [
        "   ABCDEFGHIJ",
        "01 ..........",
        "02 ..........",
        "03 ..........",
        "04 .....X....",
        "05 ..........",
        "06 ..........",
        "07 ..........",
        "08 ..........",
        "09 ..........",
        "10 ..........",
      ].join("\n"),
      shipsRemaining: ["Destroyer"],
      systemPrompt: "Return JSON.",
      priorShots: [],
      consecutiveSchemaErrors: 1,
      seedDate: "2026-04-25",
    });

    const cells = candidateCellsFromPrompt(prompt);

    expect(prompt).toContain(
      "Rule-filtered candidate cells for this turn (4, engine-filtered unordered)",
    );
    expect(prompt).toContain("Ships still afloat (lengths): Destroyer");
    expect(Array.from(cells).sort()).toEqual(["E4", "F3", "F5", "G4"]);
    expect(prompt).toContain(
      "Order is not a recommendation. Decide direction yourself from the board",
    );
    expect(prompt).not.toContain("engine-ranked");
    expect(prompt).not.toContain("filtered and ranked");
    expect(prompt).toContain(
      "Recovery mode: choose exactly one cell from the rule-filtered candidate list yourself",
    );
    expect(prompt).not.toContain("Emergency fallback final answer");
    expect(prompt).not.toContain('Emergency fallback final answer: {"cell":"A1"}');
  });

  test("uses a distributed unordered hunt shortlist when there are no hits", () => {
    const prompt = buildProviderUserText({
      modelId: "opencode-go/deepseek-v4-flash",
      apiKey: "sk-test",
      boardText: [
        "   ABCDEFGHIJ",
        "01 ..........",
        "02 ..........",
        "03 ..........",
        "04 ..........",
        "05 ..........",
        "06 ..........",
        "07 ..........",
        "08 ..........",
        "09 ..........",
        "10 ..........",
      ].join("\n"),
      shipsRemaining: ["Destroyer"],
      systemPrompt: "Return JSON.",
      priorShots: [],
      seedDate: "2026-04-25",
    });

    const cells = candidateCellsFromPrompt(prompt);

    expect(prompt).toContain(
      "Rule-filtered candidate cells for this turn (4, engine-filtered unordered)",
    );
    expect(prompt).not.toContain("Ships still afloat");
    expect(prompt).toContain("Order is not a recommendation");
    expect(cells).toHaveLength(4);
    expect(cells).toEqual(expect.arrayContaining(["F10", "H4", "B2", "B6"]));
    expect(cells.some((cell) => cellRow(cell) <= 5)).toBe(true);
    expect(cells.some((cell) => cellRow(cell) >= 6)).toBe(true);
    expect(cells.some((cell) => cellCol(cell) <= 5)).toBe(true);
    expect(cells.some((cell) => cellCol(cell) >= 6)).toBe(true);
  });

  test("uses compact model-chosen recovery for hunt schema errors", () => {
    const prompt = buildProviderUserText({
      modelId: "opencode-go/deepseek-v4-flash",
      apiKey: "sk-test",
      boardText: [
        "   ABCDEFGHIJ",
        "01 ..........",
        "02 ..........",
        "03 ..........",
        "04 ..........",
        "05 ..........",
        "06 ..........",
        "07 ..........",
        "08 ..........",
        "09 ..........",
        "10 ..........",
      ].join("\n"),
      shipsRemaining: ["Destroyer"],
      systemPrompt: "Return JSON.",
      priorShots: [],
      consecutiveSchemaErrors: 2,
      seedDate: "2026-04-25",
    });

    const cells = candidateCellsFromPrompt(prompt);

    expect(cells).toHaveLength(4);
    expect(prompt).toContain(
      "Previous response failed to produce a valid final shot (2 consecutive schema errors).",
    );
    expect(prompt).toContain("short unordered hunt list");
    expect(prompt).toContain("Choose exactly one cell from the candidate list yourself");
    expect(prompt).not.toContain("Current board:");
    expect(prompt).not.toContain("No separate shot history");
    expect(prompt).not.toContain("Emergency fallback final answer");
  });

  test("prunes candidate cells adjacent to sunk ships", () => {
    const prompt = buildProviderUserText({
      modelId: "opencode-go/deepseek-v4-flash",
      apiKey: "sk-test",
      boardText: [
        "   ABCDEFGHIJ",
        "01 .ooooooooo",
        "02 oSoooooooo",
        "03 oooooooooo",
        "04 oooooooooo",
        "05 oooooooooo",
        "06 oooooooooo",
        "07 oooooooooo",
        "08 oooooooooo",
        "09 oooooooooo",
        "10 ooooooooo.",
      ].join("\n"),
      shipsRemaining: ["Destroyer"],
      systemPrompt: "Return JSON.",
      priorShots: [],
      consecutiveSchemaErrors: 1,
      seedDate: "2026-04-25",
    });

    const cells = candidateCellsFromPrompt(prompt);

    expect(cells).toEqual(["J10"]);
    expect(prompt).toContain("cells impossible because sunk S ships cannot touch other ships");
    expect(prompt).toContain('Emergency fallback final answer: {"cell":"J10"}');
    expect(prompt).not.toContain('Emergency fallback final answer: {"cell":"A1"}');
  });
});
