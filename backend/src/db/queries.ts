import { and, eq, isNull, sql } from "drizzle-orm";

import {
  type LeaderboardScope,
  type LeaderboardResponse,
  type Outcome,
  type RunMeta,
  type RunShotRow,
  type ShotResult,
} from "@battleship-arena/shared";

import type { DatabaseHandle } from "./client.ts";
import {
  aggregateAllLeaderboardRows,
  aggregateTodayLeaderboardRows,
  type LeaderboardRunRow,
} from "./leaderboard-aggregator.ts";
import { mapRunMetaRow, mapRunShotRow } from "./row-mappers.ts";
import { runShots, runs } from "./schema.ts";

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
  terminalErrorCode?: string | null;
  terminalErrorStatus?: number | null;
  terminalErrorMessage?: string | null;
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
          terminalErrorCode: null,
          terminalErrorStatus: null,
          terminalErrorMessage: null,
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
          terminalErrorCode: args.terminalErrorCode ?? null,
          terminalErrorStatus: args.terminalErrorStatus ?? null,
          terminalErrorMessage: args.terminalErrorMessage ?? null,
        })
        .where(eq(runs.id, args.id))
        .run();
    },

    getRunMeta(id) {
      const row = db.select().from(runs).where(eq(runs.id, id)).get();
      if (row === undefined) {
        return null;
      }

      return mapRunMetaRow(row);
    },

    listShots(runId) {
      return db
        .select()
        .from(runShots)
        .where(eq(runShots.runId, runId))
        .orderBy(runShots.idx)
        .all()
        .map(mapRunShotRow);
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
