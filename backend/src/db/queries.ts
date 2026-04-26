import { and, eq, isNull, sql } from "drizzle-orm";

import {
  isOutcome,
  type LeaderboardRow,
  type LeaderboardScope,
  type LeaderboardResponse,
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
  "timeout",
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
  reasoningEnabled: boolean;
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
  llmError?: string | null;
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
  getLeaderboard(scope: LeaderboardScope, seedDate: string): LeaderboardResponse;
  findStuckRunIds(): string[];
  markStuckRunsAborted(outcome: Outcome, endedAt: number): number;
}

interface LeaderboardRunRow {
  id: string;
  seedDate: string;
  providerId: string;
  modelId: string;
  displayName: string;
  reasoningEnabled: number;
  shotsFired: number;
  clientSession: string;
  startedAt: number;
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }

  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function compareWins(left: LeaderboardRunRow, right: LeaderboardRunRow): number {
  return (
    left.shotsFired - right.shotsFired ||
    left.startedAt - right.startedAt ||
    left.id.localeCompare(right.id)
  );
}

function dedupeBestWins(
  rows: readonly LeaderboardRunRow[],
  keyForRow: (row: LeaderboardRunRow) => string,
): LeaderboardRunRow[] {
  const bestByKey = new Map<string, LeaderboardRunRow>();

  for (const row of rows) {
    const key = keyForRow(row);
    const current = bestByKey.get(key);

    if (current === undefined || compareWins(row, current) < 0) {
      bestByKey.set(key, row);
    }
  }

  return [...bestByKey.values()];
}

function modelKey(row: LeaderboardRunRow): string {
  return `${row.providerId}\0${row.modelId}\0${row.reasoningEnabled}`;
}

function rankRows(rows: readonly Omit<LeaderboardRow, "rank">[]): LeaderboardRow[] {
  return rows.map((row, index) => ({ rank: index + 1, ...row }));
}

function leaderboardTodayRows(db: DatabaseHandle["db"], seedDate: string): LeaderboardRunRow[] {
  return db.all<LeaderboardRunRow>(sql`
    WITH ranked AS (
      SELECT
        id,
        seed_date AS seedDate,
        provider_id AS providerId,
        model_id AS modelId,
        display_name AS displayName,
        reasoning_enabled AS reasoningEnabled,
        shots_fired AS shotsFired,
        client_session AS clientSession,
        started_at AS startedAt,
        ROW_NUMBER() OVER (
          PARTITION BY client_session, provider_id, model_id, reasoning_enabled
          ORDER BY shots_fired ASC, started_at ASC, id ASC
        ) AS sessionRank
      FROM runs
      WHERE outcome = 'won' AND seed_date = ${seedDate}
    )
    SELECT
      id,
      seedDate,
      providerId,
      modelId,
      displayName,
      reasoningEnabled,
      shotsFired,
      clientSession,
      startedAt
    FROM ranked
    WHERE sessionRank = 1
  `);
}

function leaderboardAllRows(db: DatabaseHandle["db"]): LeaderboardRunRow[] {
  return db.all<LeaderboardRunRow>(sql`
    WITH ranked AS (
      SELECT
        id,
        seed_date AS seedDate,
        provider_id AS providerId,
        model_id AS modelId,
        display_name AS displayName,
        reasoning_enabled AS reasoningEnabled,
        shots_fired AS shotsFired,
        client_session AS clientSession,
        started_at AS startedAt,
        ROW_NUMBER() OVER (
          PARTITION BY client_session, provider_id, model_id, reasoning_enabled, seed_date
          ORDER BY shots_fired ASC, started_at ASC, id ASC
        ) AS sessionSeedRank
      FROM runs
      WHERE outcome = 'won'
    )
    SELECT
      id,
      seedDate,
      providerId,
      modelId,
      displayName,
      reasoningEnabled,
      shotsFired,
      clientSession,
      startedAt
    FROM ranked
    WHERE sessionSeedRank = 1
  `);
}

function aggregateTodayLeaderboardRows(rows: readonly LeaderboardRunRow[]): LeaderboardRow[] {
  const sessionBest = dedupeBestWins(rows, (row) =>
    [row.clientSession, row.providerId, row.modelId, row.reasoningEnabled].join("\0"),
  );
  const byModel = new Map<string, LeaderboardRunRow[]>();

  for (const row of sessionBest) {
    const key = modelKey(row);
    byModel.set(key, [...(byModel.get(key) ?? []), row]);
  }

  return rankRows(
    [...byModel.values()]
      .map((modelRows) => {
        const best = dedupeBestWins(modelRows, modelKey).at(0);
        if (best === undefined) {
          throw new Error("Cannot aggregate empty leaderboard group");
        }

        return {
          providerId: best.providerId,
          modelId: best.modelId,
          displayName: best.displayName,
          reasoningEnabled: Boolean(best.reasoningEnabled),
          shotsToWin: best.shotsFired,
          runsCount: modelRows.length,
          bestRunId: best.id,
        };
      })
      .sort(
        (left, right) =>
          left.shotsToWin - right.shotsToWin ||
          left.displayName.localeCompare(right.displayName) ||
          left.providerId.localeCompare(right.providerId) ||
          left.modelId.localeCompare(right.modelId),
      ),
  );
}

function aggregateAllLeaderboardRows(rows: readonly LeaderboardRunRow[]): LeaderboardRow[] {
  const sessionSeedBest = dedupeBestWins(rows, (row) =>
    [row.clientSession, row.providerId, row.modelId, row.reasoningEnabled, row.seedDate].join("\0"),
  );
  const byModel = new Map<string, LeaderboardRunRow[]>();

  for (const row of sessionSeedBest) {
    const key = modelKey(row);
    byModel.set(key, [...(byModel.get(key) ?? []), row]);
  }

  return rankRows(
    [...byModel.values()]
      .map((modelRows) => {
        const first = modelRows[0];
        if (first === undefined) {
          throw new Error("Cannot aggregate empty leaderboard group");
        }

        return {
          providerId: first.providerId,
          modelId: first.modelId,
          displayName: first.displayName,
          reasoningEnabled: Boolean(first.reasoningEnabled),
          shotsToWin: median(modelRows.map((row) => row.shotsFired)),
          runsCount: modelRows.length,
          bestRunId: null,
        };
      })
      .sort(
        (left, right) =>
          left.shotsToWin - right.shotsToWin ||
          right.runsCount - left.runsCount ||
          left.displayName.localeCompare(right.displayName) ||
          left.providerId.localeCompare(right.providerId) ||
          left.modelId.localeCompare(right.modelId),
      ),
  );
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
          reasoningEnabled: args.reasoningEnabled,
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
          llmError: args.llmError ?? null,
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
        reasoningEnabled: row.reasoningEnabled,
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
          llmError: row.llmError,
          tokensIn: row.tokensIn,
          tokensOut: row.tokensOut,
          reasoningTokens: row.reasoningTokens,
          costUsdMicros: row.costUsdMicros,
          durationMs: row.durationMs,
          createdAt: row.createdAt,
        }));
    },

    getLeaderboard(scope, seedDate) {
      const rows = scope === "today" ? leaderboardTodayRows(db, seedDate) : leaderboardAllRows(db);

      return {
        scope,
        seedDate: scope === "today" ? seedDate : null,
        rows:
          scope === "today"
            ? aggregateTodayLeaderboardRows(rows)
            : aggregateAllLeaderboardRows(rows),
      };
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
