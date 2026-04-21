CREATE TABLE `run_shots` (
	`run_id` text NOT NULL,
	`idx` integer NOT NULL,
	`row` integer,
	`col` integer,
	`result` text NOT NULL,
	`raw_response` text NOT NULL,
	`reasoning_text` text,
	`tokens_in` integer NOT NULL,
	`tokens_out` integer NOT NULL,
	`reasoning_tokens` integer,
	`cost_usd_micros` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`run_id`, `idx`),
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `run_shots_run_id_idx` ON `run_shots` (`run_id`,`idx`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`seed_date` text NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`display_name` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`outcome` text,
	`shots_fired` integer NOT NULL,
	`hits` integer NOT NULL,
	`schema_errors` integer NOT NULL,
	`invalid_coordinates` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`tokens_in` integer NOT NULL,
	`tokens_out` integer NOT NULL,
	`reasoning_tokens` integer,
	`cost_usd_micros` integer NOT NULL,
	`budget_usd_micros` integer,
	`client_session` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `runs_seed_date_outcome_idx` ON `runs` (`seed_date`,`outcome`);--> statement-breakpoint
CREATE INDEX `runs_model_id_outcome_shots_fired_idx` ON `runs` (`model_id`,`outcome`,`shots_fired`);