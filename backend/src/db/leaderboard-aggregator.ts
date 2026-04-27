import type { LeaderboardRow } from "@battleship-arena/shared";

export interface LeaderboardRunRow {
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

export function median(values: readonly number[]): number {
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

export function dedupeBestWins(
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

export function aggregateTodayLeaderboardRows(
  rows: readonly LeaderboardRunRow[],
): LeaderboardRow[] {
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

export function aggregateAllLeaderboardRows(rows: readonly LeaderboardRunRow[]): LeaderboardRow[] {
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
