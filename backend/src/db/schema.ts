import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const runs = sqliteTable(
  "runs",
  {
    id: text("id").primaryKey(),
    seedDate: text("seed_date").notNull(),
    providerId: text("provider_id").notNull(),
    modelId: text("model_id").notNull(),
    displayName: text("display_name").notNull(),
    startedAt: integer("started_at").notNull(),
    endedAt: integer("ended_at"),
    outcome: text("outcome"),
    shotsFired: integer("shots_fired").notNull(),
    hits: integer("hits").notNull(),
    schemaErrors: integer("schema_errors").notNull(),
    invalidCoordinates: integer("invalid_coordinates").notNull(),
    durationMs: integer("duration_ms").notNull(),
    tokensIn: integer("tokens_in").notNull(),
    tokensOut: integer("tokens_out").notNull(),
    reasoningTokens: integer("reasoning_tokens"),
    costUsdMicros: integer("cost_usd_micros").notNull(),
    budgetUsdMicros: integer("budget_usd_micros"),
    clientSession: text("client_session").notNull(),
  },
  (table) => [
    index("runs_seed_date_outcome_idx").on(table.seedDate, table.outcome),
    index("runs_model_id_outcome_shots_fired_idx").on(
      table.modelId,
      table.outcome,
      table.shotsFired,
    ),
  ],
);

export const runShots = sqliteTable(
  "run_shots",
  {
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    row: integer("row"),
    col: integer("col"),
    result: text("result").notNull(),
    rawResponse: text("raw_response").notNull(),
    reasoningText: text("reasoning_text"),
    tokensIn: integer("tokens_in").notNull(),
    tokensOut: integer("tokens_out").notNull(),
    reasoningTokens: integer("reasoning_tokens"),
    costUsdMicros: integer("cost_usd_micros").notNull(),
    durationMs: integer("duration_ms").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.idx] }),
    index("run_shots_run_id_idx").on(table.runId, table.idx),
  ],
);
