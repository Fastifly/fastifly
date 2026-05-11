CREATE TABLE `import_jobs` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`ledger_id` text NOT NULL,
	`file_name` text,
	`csv_text` text NOT NULL,
	`preview_rows_json` text NOT NULL,
	`status` text NOT NULL,
	`committed_group_ids_json` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`committed_at` text,
	`undone_at` text,
	CONSTRAINT `fk_import_jobs_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`),
	CONSTRAINT `fk_import_jobs_ledger_id_ledgers_id_fk` FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`),
	CONSTRAINT `fk_import_jobs_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`),
	CONSTRAINT "import_jobs_status_check" CHECK("status" IN ('preview_ready', 'committed', 'undone', 'failed'))
);
--> statement-breakpoint
CREATE TABLE `recurring_templates` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`ledger_id` text NOT NULL,
	`type` text NOT NULL,
	`cadence` text NOT NULL,
	`interval_count` integer DEFAULT 1 NOT NULL,
	`next_run_at` text NOT NULL,
	`status` text NOT NULL,
	`template_json` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_generated_at` text,
	`archived_at` text,
	CONSTRAINT `fk_recurring_templates_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`),
	CONSTRAINT `fk_recurring_templates_ledger_id_ledgers_id_fk` FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`),
	CONSTRAINT `fk_recurring_templates_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`),
	CONSTRAINT `fk_recurring_templates_updated_by_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`),
	CONSTRAINT "recurring_templates_type_check" CHECK("type" IN ('expense', 'income', 'transfer')),
	CONSTRAINT "recurring_templates_cadence_check" CHECK("cadence" IN ('daily', 'weekly', 'monthly')),
	CONSTRAINT "recurring_templates_status_check" CHECK("status" IN ('active', 'paused', 'archived')),
	CONSTRAINT "recurring_templates_interval_check" CHECK("interval_count" >= 1)
);
--> statement-breakpoint
CREATE TABLE `rules` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`ledger_id` text NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`condition_json` text NOT NULL,
	`action_type` text NOT NULL,
	`action_json` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	CONSTRAINT `fk_rules_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`),
	CONSTRAINT `fk_rules_ledger_id_ledgers_id_fk` FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`),
	CONSTRAINT `fk_rules_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`),
	CONSTRAINT `fk_rules_updated_by_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`),
	CONSTRAINT "rules_action_type_check" CHECK("action_type" IN ('set_transaction_status'))
);
--> statement-breakpoint
CREATE INDEX `import_jobs_workspace_ledger_idx` ON `import_jobs` (`workspace_id`,`ledger_id`);--> statement-breakpoint
CREATE INDEX `import_jobs_status_idx` ON `import_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `recurring_templates_workspace_ledger_idx` ON `recurring_templates` (`workspace_id`,`ledger_id`);--> statement-breakpoint
CREATE INDEX `recurring_templates_status_idx` ON `recurring_templates` (`status`);--> statement-breakpoint
CREATE INDEX `rules_workspace_ledger_idx` ON `rules` (`workspace_id`,`ledger_id`);--> statement-breakpoint
CREATE INDEX `rules_enabled_idx` ON `rules` (`enabled`);--> statement-breakpoint
CREATE UNIQUE INDEX `rules_ledger_name_unique` ON `rules` (`ledger_id`,`name`);