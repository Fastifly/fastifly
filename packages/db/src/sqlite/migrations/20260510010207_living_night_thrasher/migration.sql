CREATE TABLE `sync_conflicts` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`ledger_id` text NOT NULL,
	`object_type` text,
	`object_id` text,
	`incoming_operation_id` text NOT NULL,
	`conflict_type` text NOT NULL,
	`local_revision` integer NOT NULL,
	`incoming_base_revision` integer,
	`local_snapshot_json` text NOT NULL,
	`incoming_payload_json` text NOT NULL,
	`status` text NOT NULL,
	`resolution_operation_id` text,
	`created_at` text NOT NULL,
	`resolved_at` text,
	CONSTRAINT `fk_sync_conflicts_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`),
	CONSTRAINT `fk_sync_conflicts_ledger_id_ledgers_id_fk` FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`),
	CONSTRAINT `fk_sync_conflicts_incoming_operation_id_sync_operations_id_fk` FOREIGN KEY (`incoming_operation_id`) REFERENCES `sync_operations`(`id`),
	CONSTRAINT `fk_sync_conflicts_resolution_operation_id_sync_operations_id_fk` FOREIGN KEY (`resolution_operation_id`) REFERENCES `sync_operations`(`id`),
	CONSTRAINT "sync_conflicts_type_check" CHECK("conflict_type" IN ('stale_update', 'update_after_delete', 'delete_after_update', 'duplicate_unique_value', 'invalid_operation', 'reconciled_record_blocked')),
	CONSTRAINT "sync_conflicts_status_check" CHECK("status" IN ('open', 'resolved', 'dismissed'))
);
--> statement-breakpoint
CREATE TABLE `sync_operations` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`ledger_id` text NOT NULL,
	`device_id` text NOT NULL,
	`local_sequence` text NOT NULL,
	`operation_type` text NOT NULL,
	`operation_version` integer NOT NULL,
	`base_revision` integer,
	`server_revision` integer,
	`idempotency_key` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_encoding` text NOT NULL,
	`encrypted_payload` text,
	`key_version` integer,
	`status` text NOT NULL,
	`result_json` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`received_at` text NOT NULL,
	CONSTRAINT `fk_sync_operations_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`),
	CONSTRAINT `fk_sync_operations_ledger_id_ledgers_id_fk` FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`),
	CONSTRAINT `fk_sync_operations_device_id_devices_id_fk` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`),
	CONSTRAINT `fk_sync_operations_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`),
	CONSTRAINT "sync_operations_revision_check" CHECK("server_revision" IS NULL OR "server_revision" >= 0),
	CONSTRAINT "sync_operations_status_check" CHECK("status" IN ('accepted', 'rejected', 'conflict', 'superseded')),
	CONSTRAINT "sync_operations_payload_encoding_check" CHECK("payload_encoding" IN ('plaintext.v1'))
);
--> statement-breakpoint
CREATE TABLE `workspace_ledger_revisions` (
	`workspace_id` text NOT NULL,
	`ledger_id` text NOT NULL,
	`current_revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_workspace_ledger_revisions_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`),
	CONSTRAINT `fk_workspace_ledger_revisions_ledger_id_ledgers_id_fk` FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`),
	CONSTRAINT "workspace_ledger_revisions_non_negative_check" CHECK("current_revision" >= 0)
);
--> statement-breakpoint
CREATE INDEX `sync_conflicts_workspace_ledger_idx` ON `sync_conflicts` (`workspace_id`,`ledger_id`);--> statement-breakpoint
CREATE INDEX `sync_conflicts_status_idx` ON `sync_conflicts` (`status`);--> statement-breakpoint
CREATE INDEX `sync_conflicts_incoming_operation_idx` ON `sync_conflicts` (`incoming_operation_id`);--> statement-breakpoint
CREATE INDEX `sync_operations_workspace_ledger_idx` ON `sync_operations` (`workspace_id`,`ledger_id`);--> statement-breakpoint
CREATE INDEX `sync_operations_status_idx` ON `sync_operations` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `sync_operations_device_sequence_unique` ON `sync_operations` (`device_id`,`local_sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `sync_operations_workspace_ledger_revision_unique` ON `sync_operations` (`workspace_id`,`ledger_id`,`server_revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_ledger_revisions_scope_unique` ON `workspace_ledger_revisions` (`workspace_id`,`ledger_id`);