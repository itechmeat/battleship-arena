import { describe, expect, test } from "bun:test";

import { parseShot } from "@battleship-arena/shared";

import { generateBoard } from "../../src/board/generator.ts";
import { createMockProvider } from "../../src/providers/mock.ts";

const baseInput = {
  apiKey: "k",
  boardPng: new Uint8Array(),
  shipsRemaining: [],
  systemPrompt: "",
  priorShots: [],
  seedDate: "2026-04-21",
} as const;

describe("createMockProvider", () => {
  test("exposes the three mock models", () => {
    const mock = createMockProvider({ delayMs: 0 });
    expect(mock.id).toBe("mock");
    expect(mock.models.map((model) => model.id)).toEqual([
      "mock-happy",
      "mock-misses",
      "mock-schema-errors",
    ]);
  });

  test("mock-happy wins a full simulated game in at most 100 shots", async () => {
    const mock = createMockProvider({ delayMs: 0 });
    const layout = generateBoard("2026-04-21");
    const shipCells = new Set(
      layout.ships.flatMap((ship) => ship.cells.map((cell) => `${cell.row}:${cell.col}`)),
    );
    const priorShots: Array<{
      row: number;
      col: number;
      result: "hit" | "miss" | "sunk";
    }> = [];
    let hits = 0;

    for (let turn = 0; turn < 100 && hits < 17; turn += 1) {
      const output = await mock.call(
        { ...baseInput, modelId: "mock-happy", priorShots },
        new AbortController().signal,
      );
      const parsed = parseShot(output.rawText);
      expect(parsed.kind).toBe("ok");
      if (parsed.kind !== "ok") {
        throw new Error("mock-happy returned an unparsable shot");
      }

      const key = `${parsed.shot.row}:${parsed.shot.col}`;
      const result = shipCells.has(key) ? "hit" : "miss";
      if (result === "hit") {
        hits += 1;
      }

      priorShots.push({ row: parsed.shot.row, col: parsed.shot.col, result });
    }

    expect(hits).toBe(17);
    expect(priorShots.length).toBeLessThanOrEqual(100);
  });

  test("mock-misses avoids ship cells until non-ship cells are exhausted", async () => {
    const mock = createMockProvider({ delayMs: 0 });
    const layout = generateBoard("2026-04-21");
    const shipCells = new Set(
      layout.ships.flatMap((ship) => ship.cells.map((cell) => `${cell.row}:${cell.col}`)),
    );
    const priorShots: Array<{
      row: number;
      col: number;
      result: "hit" | "miss" | "sunk";
    }> = [];

    for (let turn = 0; turn < 83; turn += 1) {
      const output = await mock.call(
        { ...baseInput, modelId: "mock-misses", priorShots },
        new AbortController().signal,
      );
      const parsed = parseShot(output.rawText);
      expect(parsed.kind).toBe("ok");
      if (parsed.kind !== "ok") {
        throw new Error("mock-misses returned an unparsable shot");
      }

      const key = `${parsed.shot.row}:${parsed.shot.col}`;
      expect(shipCells.has(key)).toBe(false);
      priorShots.push({
        row: parsed.shot.row,
        col: parsed.shot.col,
        result: "miss",
      });
    }
  });

  test("mock-misses falls back to the first prior shot after non-ship cells are exhausted", async () => {
    const mock = createMockProvider({ delayMs: 0 });
    const layout = generateBoard("2026-04-21");
    const shipCells = new Set(
      layout.ships.flatMap((ship) => ship.cells.map((cell) => `${cell.row}:${cell.col}`)),
    );
    const priorShots: Array<{
      row: number;
      col: number;
      result: "hit" | "miss" | "sunk";
    }> = [];

    for (let row = 0; row < 10; row += 1) {
      for (let col = 0; col < 10; col += 1) {
        if (shipCells.has(`${row}:${col}`)) {
          continue;
        }

        priorShots.push({ row, col, result: "miss" });
      }
    }

    const output = await mock.call(
      { ...baseInput, modelId: "mock-misses", priorShots },
      new AbortController().signal,
    );
    const parsed = parseShot(output.rawText);
    expect(parsed.kind).toBe("ok");
    if (parsed.kind !== "ok") {
      throw new Error("mock-misses returned an unparsable shot");
    }

    const firstPriorShot = priorShots[0];
    if (firstPriorShot === undefined) {
      throw new Error("Expected at least one prior shot for duplicate-shot fallback");
    }

    expect(parsed.shot.row).toBe(firstPriorShot.row);
    expect(parsed.shot.col).toBe(firstPriorShot.col);
  });

  test("mock-schema-errors always returns a schema_error payload", async () => {
    const mock = createMockProvider({ delayMs: 0 });

    for (let turn = 0; turn < 5; turn += 1) {
      const output = await mock.call(
        { ...baseInput, modelId: "mock-schema-errors", priorShots: [] },
        new AbortController().signal,
      );
      expect(parseShot(output.rawText).kind).toBe("schema_error");
    }
  });

  test("rejects an unknown model id", async () => {
    const mock = createMockProvider({ delayMs: 0 });

    await expect(
      mock.call({ ...baseInput, modelId: "unknown-model" }, new AbortController().signal),
    ).rejects.toThrow();
  });

  test("aborts promptly during sleep", async () => {
    const mock = createMockProvider({ delayMs: 1000 });
    const controller = new AbortController();

    const promise = mock.call({ ...baseInput, modelId: "mock-happy" }, controller.signal);
    controller.abort();

    await expect(promise).rejects.toThrow();
  });
});
