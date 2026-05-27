ALTER TABLE `import_jobs` ADD `kind` text DEFAULT 'csv' NOT NULL;--> statement-breakpoint
ALTER TABLE `import_jobs` ADD `plan_json` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_import_jobs` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`ledger_id` text NOT NULL,
	`file_name` text,
	`kind` text DEFAULT 'csv' NOT NULL,
	`csv_text` text NOT NULL,
	`preview_rows_json` text NOT NULL,
	`plan_json` text,
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
	CONSTRAINT "import_jobs_status_check" CHECK("status" IN ('preview_ready', 'committed', 'undone', 'failed')),
	CONSTRAINT "import_jobs_kind_check" CHECK("kind" IN ('csv', 'actual_budget'))
);
--> statement-breakpoint
INSERT INTO `__new_import_jobs`(`id`, `workspace_id`, `ledger_id`, `file_name`, `csv_text`, `preview_rows_json`, `status`, `committed_group_ids_json`, `created_by`, `created_at`, `updated_at`, `committed_at`, `undone_at`) SELECT `id`, `workspace_id`, `ledger_id`, `file_name`, `csv_text`, `preview_rows_json`, `status`, `committed_group_ids_json`, `created_by`, `created_at`, `updated_at`, `committed_at`, `undone_at` FROM `import_jobs`;--> statement-breakpoint
DROP TABLE `import_jobs`;--> statement-breakpoint
ALTER TABLE `__new_import_jobs` RENAME TO `import_jobs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `import_jobs_workspace_ledger_idx` ON `import_jobs` (`workspace_id`,`ledger_id`);--> statement-breakpoint
CREATE INDEX `import_jobs_status_idx` ON `import_jobs` (`status`);