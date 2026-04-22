import { and, eq, isNull } from "drizzle-orm";

import {
  isOutcome,
  type Outcome,
  type RunMeta,
  type RunShotRow,
  type ShotResult,
} from "@battleship-arena/shared";

import type { DatabaseHandle } from "./client.ts";
import { runShots, runs } from "./schema.ts";

const SHOT_RESULTS: readonly ShotResult[] = [
  "hit",
  "miss",
  "sunk",
  "schema_error",
  "invalid_coordinate",
];

function isShotResult(value: unknown): value is ShotResult {
  return typeof value === "string" && SHOT_RESULTS.includes(value as ShotResult);
}

function readOutcome(value: string | null): Outcome | null {
  if (value === null) {
    return null;
  }

  if (!isOutcome(value)) {
    throw new Error(`Unexpected outcome value in runs table: ${value}`);
  }

  return value;
}

function readShotResult(value: string): ShotResult {
  if (!isShotResult(value)) {
    throw new Error(`Unexpected shot result value in run_shots table: ${value}`);
  }

  return value;
}

export interface InsertRunArgs {
  id: string;
  seedDate: string;
  providerId: string;
  modelId: string;
  displayName: string;
  startedAt: number;
  clientSession: string;
  budgetUsdMicros: number | null;
}

export interface AppendShotArgs {
  runId: string;
  idx: number;
  row: number | null;
  col: number | null;
  result: ShotResult;
  rawResponse: string;
  reasoningText: string | null;
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number | null;
  costUsdMicros: number;
  durationMs: number;
  createdAt: number;
}

export interface FinalizeRunArgs {
  id: string;
  endedAt: number;
  outcome: Outcome;
  shotsFired: number;
  hits: number;
  schemaErrors: number;
  invalidCoordinates: number;
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number | null;
  costUsdMicros: number;
}

export interface Queries {
  insertRun(args: InsertRunArgs): void;
  appendShot(args: AppendShotArgs): void;
  finalizeRun(args: FinalizeRunArgs): void;
  getRunMeta(id: string): RunMeta | null;
  listShots(runId: string): RunShotRow[];
  findStuckRunIds(): string[];
  markStuckRunsAborted(outcome: Outcome, endedAt: number): number;
}

export function createQueries(db: DatabaseHandle["db"]): Queries {
  const findStuckRunIdsInternal = (): string[] => {
    return db
      .select({ id: runs.id })
      .from(runs)
      .where(and(isNull(runs.outcome), isNull(runs.endedAt)))
      .all()
      .map((row) => row.id);
  };

  return {
    insertRun(args) {
      db.insert(runs)
        .values({
          id: args.id,
          seedDate: args.seedDate,
          providerId: args.providerId,
          modelId: args.modelId,
          displayName: args.displayName,
          startedAt: args.startedAt,
          endedAt: null,
          outcome: null,
          shotsFired: 0,
          hits: 0,
          schemaErrors: 0,
          invalidCoordinates: 0,
          durationMs: 0,
          tokensIn: 0,
          tokensOut: 0,
          reasoningTokens: null,
          costUsdMicros: 0,
          budgetUsdMicros: args.budgetUsdMicros,
          clientSession: args.clientSession,
        })
        .run();
    },

    appendShot(args) {
      db.insert(runShots)
        .values({
          runId: args.runId,
          idx: args.idx,
          row: args.row,
          col: args.col,
          result: args.result,
          rawResponse: args.rawResponse,
          reasoningText: args.reasoningText,
          tokensIn: args.tokensIn,
          tokensOut: args.tokensOut,
          reasoningTokens: args.reasoningTokens,
          costUsdMicros: args.costUsdMicros,
          durationMs: args.durationMs,
          createdAt: args.createdAt,
        })
        .run();
    },

    finalizeRun(args) {
      db.update(runs)
        .set({
          endedAt: args.endedAt,
          outcome: args.outcome,
          shotsFired: args.shotsFired,
          hits: args.hits,
          schemaErrors: args.schemaErrors,
          invalidCoordinates: args.invalidCoordinates,
          durationMs: args.durationMs,
          tokensIn: args.tokensIn,
          tokensOut: args.tokensOut,
          reasoningTokens: args.reasoningTokens,
          costUsdMicros: args.costUsdMicros,
        })
        .where(eq(runs.id, args.id))
        .run();
    },

    getRunMeta(id) {
      const row = db.select().from(runs).where(eq(runs.id, id)).get();
      if (row === undefined) {
        return null;
      }

      return {
        id: row.id,
        seedDate: row.seedDate,
        providerId: row.providerId,
        modelId: row.modelId,
        displayName: row.displayName,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        outcome: readOutcome(row.outcome),
        shotsFired: row.shotsFired,
        hits: row.hits,
        schemaErrors: row.schemaErrors,
        invalidCoordinates: row.invalidCoordinates,
        durationMs: row.durationMs,
        tokensIn: row.tokensIn,
        tokensOut: row.tokensOut,
        reasoningTokens: row.reasoningTokens,
        costUsdMicros: row.costUsdMicros,
        budgetUsdMicros: row.budgetUsdMicros,
      };
    },

    listShots(runId) {
      return db
        .select()
        .from(runShots)
        .where(eq(runShots.runId, runId))
        .orderBy(runShots.idx)
        .all()
        .map((row) => ({
          runId: row.runId,
          idx: row.idx,
          row: row.row,
          col: row.col,
          result: readShotResult(row.result),
          rawResponse: row.rawResponse,
          reasoningText: row.reasoningText,
          tokensIn: row.tokensIn,
          tokensOut: row.tokensOut,
          reasoningTokens: row.reasoningTokens,
          costUsdMicros: row.costUsdMicros,
          durationMs: row.durationMs,
          createdAt: row.createdAt,
        }));
    },

    findStuckRunIds() {
      return findStuckRunIdsInternal();
    },

    markStuckRunsAborted(outcome, endedAt) {
      return db
        .update(runs)
        .set({ outcome, endedAt })
        .where(and(isNull(runs.outcome), isNull(runs.endedAt)))
        .returning({ id: runs.id })
        .all().length;
    },
  };
}
