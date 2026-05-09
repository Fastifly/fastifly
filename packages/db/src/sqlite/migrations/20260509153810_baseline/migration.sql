CREATE TABLE `account_meta` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`ledger_id` text NOT NULL,
	`account_id` text NOT NULL,
	`key` text NOT NULL,
	`value_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_account_meta_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`),
	CONSTRAINT `fk_account_meta_ledger_id_ledgers_id_fk` FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`),
	CONSTRAINT `fk_account_meta_account_id_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`)
);
--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`ledger_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`subtype` text NOT NULL,
	`currency_code` text(3) NOT NULL,
	`opening_balance_minor` integer,
	`opening_balance_date` text,
	`is_active` integer DEFAULT true NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_accounts_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`),
	CONSTRAINT `fk_accounts_ledger_id_ledgers_id_fk` FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`),
	CONSTRAINT `fk_accounts_currency_code_currencies_code_fk` FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`),
	CONSTRAINT "accounts_kind_check" CHECK("kind" IN ('asset', 'liability', 'revenue', 'expense', 'equity')),
	CONSTRAINT "accounts_subtype_check" CHECK("subtype" IN ('bank', 'cash', 'wallet', 'credit_card', 'loan', 'investment', 'income_source', 'expense_category', 'external', 'opening_helper', 'reconciliation_helper')),
	CONSTRAINT "accounts_currency_code_check" CHECK("currency_code" GLOB '[A-Z][A-Z][A-Z]'),
	CONSTRAINT "accounts_opening_balance_pair_check" CHECK(("opening_balance_minor" IS NULL AND "opening_balance_date" IS NULL) OR ("opening_balance_minor" IS NOT NULL AND "opening_balance_date" IS NOT NULL)),
	CONSTRAINT "accounts_archive_state_check" CHECK("archived_at" IS NULL OR "is_active" = 0)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY,
	`workspace_id` text,
	`ledger_id` text,
	`actor_user_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`metadata_json` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_audit_log_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`),
	CONSTRAINT `fk_audit_log_ledger_id_ledgers_id_fk` FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`),
	CONSTRAINT `fk_audit_log_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `balance_recalculation_queue` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`ledger_id` text NOT NULL,
	`account_id` text,
	`currency_code` text(3),
	`from_occurred_at` text NOT NULL,
	`reason` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_balance_recalculation_queue_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`),
	CONSTRAINT `fk_balance_recalculation_queue_ledger_id_ledgers_id_fk` FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`),
	CONSTRAINT `fk_balance_recalculation_queue_account_id_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`),
	CONSTRAINT `fk_balance_recalculation_queue_currency_code_currencies_code_fk` FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`),
	CONSTRAINT "balance_recalculation_queue_status_check" CHECK("status" IN ('pending', 'processing', 'completed', 'failed')),
	CONSTRAINT "balance_recalculation_queue_currency_code_check" CHECK("currency_code" IS NULL OR "currency_code" GLOB '[A-Z][A-Z][A-Z]')
);
--> statement-breakpoint
CREATE TABLE `budget_limits` (
	`id` text PRIMARY KEY,
	`budget_id` text NOT NULL,
	`category_id` text,
	`amount_minor` integer NOT NULL,
	`currency_code` text(3) NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_budget_limits_budget_id_budgets_id_fk` FOREIGN KEY (`budget_id`) REFERENCES `budgets`(`id`),
	CONSTRAINT `fk_budget_limits_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`),
	CONSTRAINT `fk_budget_limits_currency_code_currencies_code_fk` FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`),
	CONSTRAINT "budget_limits_currency_code_check" CHECK("currency_code" GLOB '[A-Z][A-Z][A-Z]'),
	CONSTRAINT "budget_limits_amount_non_negative_check" CHECK("amount_minor" >= 0),
	CONSTRAINT "budget_limits_date_order_check" CHECK("start_date" <= "end_date")
);
--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`ledger_id` text NOT NULL,
	`name` text NOT NULL,
	`currency_code` text(3) NOT NULL,
	`period` text NOT NULL,
	`rollover_enabled` integer DEFAULT false NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_budgets_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`),
	CONSTRAINT `fk_budgets_ledger_id_ledgers_id_fk` FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`),
	CONSTRAINT `fk_budgets_currency_code_currencies_code_fk` FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`),
	CONSTRAINT "budgets_currency_code_check" CHECK("currency_code" GLOB '[A-Z][A-Z][A-Z]'),
	CONSTRAINT "budgets_period_check" CHECK("period" IN ('weekly', 'bi_weekly', 'semi_monthly', 'monthly', 'quarterly', 'yearly', 'custom'))
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`ledger_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`color` text,
	`icon` text,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_categories_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`),
	CONSTRAINT `fk_categories_ledger_id_ledgers_id_fk` FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`),
	CONSTRAINT `fk_categories_parent_id_categories_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`)
);
--> statement-breakpoint
CREATE TABLE `currencies` (
	`code` text(3) PRIMARY KEY,
	`name` text NOT NULL,
	`decimal_places` integer NOT NULL,
	`symbol` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "currencies_code_check" CHECK("code" GLOB '[A-Z][A-Z][A-Z]'),
	CONSTRAINT "currencies_decimal_places_check" CHECK("decimal_places" BETWEEN 0 AND 8)
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`device_key` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text,
	`revoked_at` text,
	CONSTRAINT `fk_devices_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `exchange_rates` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`ledger_id` text NOT NULL,
	`base_currency_code` text(3) NOT NULL,
	`quote_currency_code` text(3) NOT NULL,
	`rate` text NOT NULL,
	`source` text NOT NULL,
	`rate_date` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_exchange_rates_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`),
	CONSTRAINT `fk_exchange_rates_ledger_id_ledgers_id_fk` FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`),
	CONSTRAINT `fk_exchange_rates_base_currency_code_currencies_code_fk` FOREIGN KEY (`base_currency_code`) REFERENCES `currencies`(`code`),
	CONSTRAINT `fk_exchange_rates_quote_currency_code_currencies_code_fk` FOREIGN KEY (`quote_currency_code`) REFERENCES `currencies`(`code`),
	CONSTRAINT "exchange_rates_base_code_check" CHECK("base_currency_code" GLOB '[A-Z][A-Z][A-Z]'),
	CONSTRAINT "exchange_rates_quote_code_check" CHECK("quote_currency_code" GLOB '[A-Z][A-Z][A-Z]'),
	CONSTRAINT "exchange_rates_rate_check" CHECK(length("rate") > 0 AND "rate" NOT GLOB '*[^0-9.]*' AND "rate" <> '.' AND (length("rate") - length(replace("rate", '.', ''))) <= 1 AND substr("rate", 1, 1) <> '.' AND substr("rate", length("rate"), 1) <> '.')
);
--> statement-breakpoint
CREATE TABLE `idempotency_receipts` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`ledger_id` text,
	`actor_user_id` text NOT NULL,
	`device_id` text,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`response_status` integer NOT NULL,
	`response_body_json` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	CONSTRAINT `fk_idempotency_receipts_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`),
	CONSTRAINT `fk_idempotency_receipts_ledger_id_ledgers_id_fk` FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`),
	CONSTRAINT `fk_idempotency_receipts_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`),
	CONSTRAINT `fk_idempotency_receipts_device_id_devices_id_fk` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`)
);
--> statement-breakpoint
CREATE TABLE `job_queue` (
	`id` text PRIMARY KEY,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`payload_json` text NOT NULL,
	`dedupe_key` text,
	`attempts` integer NOT NULL,
	`max_attempts` integer NOT NULL,
	`available_at` text NOT NULL,
	`locked_at` text,
	`locked_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `journal_meta` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`ledger_id` text NOT NULL,
	`journal_id` text NOT NULL,
	`key` text NOT NULL,
	`value_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_journal_meta_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`),
	CONSTRAINT `fk_journal_meta_ledger_id_ledgers_id_fk` FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`),
	CONSTRAINT `fk_journal_meta_journal_id_transaction_journals_id_fk` FOREIGN KEY (`journal_id`) REFERENCES `transaction_journals`(`id`)
);
--> statement-breakpoint
CREATE TABLE `ledgers` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`base_currency_code` text(3) NOT NULL,
	`first_day_of_week` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	CONSTRAINT `fk_ledgers_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`),
	CONSTRAINT "ledgers_status_check" CHECK("status" IN ('active', 'read_only', 'maintenance', 'archived', 'restore_preview', 'pending_restore', 'broken'))
);
--> statement-breakpoint
CREATE TABLE `passkey_challenges` (
	`id` text PRIMARY KEY,
	`user_id` text,
	`kind` text NOT NULL,
	`challenge` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	CONSTRAINT `fk_passkey_challenges_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
	CONSTRAINT "passkey_challenges_kind_check" CHECK("kind" IN ('registration', 'login'))
);
--> statement-breakpoint
CREATE TABLE `passkeys` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer NOT NULL,
	`transports_json` text,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text,
	CONSTRAINT `fk_passkeys_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `payee_aliases` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`ledger_id` text NOT NULL,
	`payee_id` text NOT NULL,
	`alias` text NOT NULL,
	`normalized_alias` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_payee_aliases_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`),
	CONSTRAINT `fk_payee_aliases_ledger_id_ledgers_id_fk` FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`),
	CONSTRAINT `fk_payee_aliases_payee_id_payees_id_fk` FOREIGN KEY (`payee_id`) REFERENCES `payees`(`id`)
);
--> statement-breakpoint
CREATE TABLE `payee_mappings` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`ledger_id` text NOT NULL,
	`from_payee_id` text NOT NULL,
	`to_payee_id` text NOT NULL,
	`reason` text NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_payee_mappings_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`),
	CONSTRAINT `fk_payee_mappings_ledger_id_ledgers_id_fk` FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`),
	CONSTRAINT `fk_payee_mappings_from_payee_id_payees_id_fk` FOREIGN KEY (`from_payee_id`) REFERENCES `payees`(`id`),
	CONSTRAINT `fk_payee_mappings_to_payee_id_payees_id_fk` FOREIGN KEY (`to_payee_id`) REFERENCES `payees`(`id`),
	CONSTRAINT `fk_payee_mappings_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`),
	CONSTRAINT "payee_mappings_no_self_merge_check" CHECK("from_payee_id" <> "to_payee_id")
);
--> statement-breakpoint
CREATE TABLE `payees` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`ledger_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_payees_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`),
	CONSTRAINT `fk_payees_ledger_id_ledgers_id_fk` FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`)
);
--> statement-breakpoint
CREATE TABLE `recovery_codes` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`used_at` text,
	CONSTRAINT `fk_recovery_codes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`user_agent` text,
	`ip_address` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	CONSTRAINT `fk_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`ledger_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_tags_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`),
	CONSTRAINT `fk_tags_ledger_id_ledgers_id_fk` FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`)
);
--> statement-breakpoint
CREATE TABLE `transaction_groups` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`ledger_id` text NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`source` text NOT NULL,
	`external_id` text,
	`import_job_id` text,
	`created_by` text,
	`updated_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	CONSTRAINT `fk_transaction_groups_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`),
	CONSTRAINT `fk_transaction_groups_ledger_id_ledgers_id_fk` FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`),
	CONSTRAINT `fk_transaction_groups_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`),
	CONSTRAINT `fk_transaction_groups_updated_by_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`),
	CONSTRAINT "transaction_groups_type_check" CHECK("type" IN ('expense', 'income', 'transfer', 'split', 'opening_balance', 'reconciliation', 'adjustment', 'exchange')),
	CONSTRAINT "transaction_groups_source_check" CHECK("source" IN ('manual', 'import', 'recurring', 'rule', 'api', 'system'))
);
--> statement-breakpoint
CREATE TABLE `transaction_journals` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`ledger_id` text NOT NULL,
	`group_id` text NOT NULL,
	`type` text NOT NULL,
	`occurred_at` text NOT NULL,
	`description` text NOT NULL,
	`notes` text,
	`payee_id` text,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`external_id` text,
	`import_job_id` text,
	`recurrence_template_id` text,
	`created_by` text,
	`updated_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	CONSTRAINT `fk_transaction_journals_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`),
	CONSTRAINT `fk_transaction_journals_ledger_id_ledgers_id_fk` FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`),
	CONSTRAINT `fk_transaction_journals_group_id_transaction_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `transaction_groups`(`id`),
	CONSTRAINT `fk_transaction_journals_payee_id_payees_id_fk` FOREIGN KEY (`payee_id`) REFERENCES `payees`(`id`),
	CONSTRAINT `fk_transaction_journals_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`),
	CONSTRAINT `fk_transaction_journals_updated_by_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`),
	CONSTRAINT "transaction_journals_type_check" CHECK("type" IN ('expense', 'income', 'transfer', 'split', 'opening_balance', 'reconciliation', 'adjustment', 'exchange')),
	CONSTRAINT "transaction_journals_status_check" CHECK("status" IN ('pending', 'cleared', 'reconciled', 'void')),
	CONSTRAINT "transaction_journals_source_check" CHECK("source" IN ('manual', 'import', 'recurring', 'rule', 'api', 'system'))
);
--> statement-breakpoint
CREATE TABLE `transaction_postings` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`ledger_id` text NOT NULL,
	`journal_id` text NOT NULL,
	`account_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency_code` text(3) NOT NULL,
	`foreign_amount_minor` integer,
	`foreign_currency_code` text(3),
	`reporting_amount_minor` integer NOT NULL,
	`reporting_currency_code` text(3) NOT NULL,
	`exchange_rate_snapshot_json` text,
	`category_id` text,
	`budget_id` text,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_transaction_postings_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`),
	CONSTRAINT `fk_transaction_postings_ledger_id_ledgers_id_fk` FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`),
	CONSTRAINT `fk_transaction_postings_journal_id_transaction_journals_id_fk` FOREIGN KEY (`journal_id`) REFERENCES `transaction_journals`(`id`),
	CONSTRAINT `fk_transaction_postings_account_id_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`),
	CONSTRAINT `fk_transaction_postings_currency_code_currencies_code_fk` FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`),
	CONSTRAINT `fk_transaction_postings_foreign_currency_code_currencies_code_fk` FOREIGN KEY (`foreign_currency_code`) REFERENCES `currencies`(`code`),
	CONSTRAINT `fk_transaction_postings_reporting_currency_code_currencies_code_fk` FOREIGN KEY (`reporting_currency_code`) REFERENCES `currencies`(`code`),
	CONSTRAINT `fk_transaction_postings_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`),
	CONSTRAINT `fk_transaction_postings_budget_id_budgets_id_fk` FOREIGN KEY (`budget_id`) REFERENCES `budgets`(`id`),
	CONSTRAINT "transaction_postings_currency_code_check" CHECK("currency_code" GLOB '[A-Z][A-Z][A-Z]'),
	CONSTRAINT "transaction_postings_reporting_currency_code_check" CHECK("reporting_currency_code" GLOB '[A-Z][A-Z][A-Z]'),
	CONSTRAINT "transaction_postings_foreign_pair_check" CHECK(("foreign_amount_minor" IS NULL AND "foreign_currency_code" IS NULL) OR ("foreign_amount_minor" IS NOT NULL AND "foreign_currency_code" IS NOT NULL AND "foreign_currency_code" GLOB '[A-Z][A-Z][A-Z]'))
);
--> statement-breakpoint
CREATE TABLE `transaction_tags` (
	`transaction_journal_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_transaction_tags_transaction_journal_id_transaction_journals_id_fk` FOREIGN KEY (`transaction_journal_id`) REFERENCES `transaction_journals`(`id`),
	CONSTRAINT `fk_transaction_tags_tag_id_tags_id_fk` FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY,
	`username` text NOT NULL,
	`username_normalized` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`disabled_at` text
);
--> statement-breakpoint
CREATE TABLE `workspace_invitations` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`invited_by_user_id` text NOT NULL,
	`invitee_identifier` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_at` text,
	`revoked_at` text,
	CONSTRAINT `fk_workspace_invitations_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`),
	CONSTRAINT `fk_workspace_invitations_invited_by_user_id_users_id_fk` FOREIGN KEY (`invited_by_user_id`) REFERENCES `users`(`id`),
	CONSTRAINT "workspace_invitations_role_check" CHECK("role" IN ('admin', 'editor', 'viewer'))
);
--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`removed_at` text,
	CONSTRAINT `fk_workspace_members_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`),
	CONSTRAINT `fk_workspace_members_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
	CONSTRAINT "workspace_members_role_check" CHECK("role" IN ('owner', 'admin', 'editor', 'viewer'))
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	CONSTRAINT `fk_workspaces_owner_user_id_users_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`),
	CONSTRAINT "workspaces_status_check" CHECK("status" IN ('active', 'read_only', 'maintenance', 'archived', 'restore_preview', 'pending_restore', 'broken'))
);
--> statement-breakpoint
CREATE INDEX `account_meta_account_id_idx` ON `account_meta` (`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_meta_account_key_unique` ON `account_meta` (`account_id`,`key`);--> statement-breakpoint
CREATE INDEX `accounts_workspace_id_idx` ON `accounts` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `accounts_ledger_id_idx` ON `accounts` (`ledger_id`);--> statement-breakpoint
CREATE INDEX `accounts_currency_code_idx` ON `accounts` (`currency_code`);--> statement-breakpoint
CREATE INDEX `accounts_archived_at_idx` ON `accounts` (`archived_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_ledger_name_unique` ON `accounts` (`ledger_id`,`name`);--> statement-breakpoint
CREATE INDEX `audit_log_workspace_id_idx` ON `audit_log` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `audit_log_ledger_id_idx` ON `audit_log` (`ledger_id`);--> statement-breakpoint
CREATE INDEX `audit_log_actor_user_id_idx` ON `audit_log` (`actor_user_id`);--> statement-breakpoint
CREATE INDEX `balance_recalculation_queue_workspace_ledger_idx` ON `balance_recalculation_queue` (`workspace_id`,`ledger_id`);--> statement-breakpoint
CREATE INDEX `balance_recalculation_queue_account_id_idx` ON `balance_recalculation_queue` (`account_id`);--> statement-breakpoint
CREATE INDEX `balance_recalculation_queue_status_idx` ON `balance_recalculation_queue` (`status`);--> statement-breakpoint
CREATE INDEX `budget_limits_budget_id_idx` ON `budget_limits` (`budget_id`);--> statement-breakpoint
CREATE INDEX `budget_limits_category_id_idx` ON `budget_limits` (`category_id`);--> statement-breakpoint
CREATE INDEX `budgets_workspace_id_idx` ON `budgets` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `budgets_ledger_id_idx` ON `budgets` (`ledger_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_ledger_name_unique` ON `budgets` (`ledger_id`,`name`);--> statement-breakpoint
CREATE INDEX `categories_workspace_id_idx` ON `categories` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `categories_ledger_id_idx` ON `categories` (`ledger_id`);--> statement-breakpoint
CREATE INDEX `categories_parent_id_idx` ON `categories` (`parent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_ledger_root_name_unique` ON `categories` (`ledger_id`,`name`) WHERE "categories"."parent_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `categories_ledger_parent_name_unique` ON `categories` (`ledger_id`,`parent_id`,`name`) WHERE "categories"."parent_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `devices_user_id_idx` ON `devices` (`user_id`);--> statement-breakpoint
CREATE INDEX `devices_revoked_at_idx` ON `devices` (`revoked_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `devices_user_device_key_unique` ON `devices` (`user_id`,`device_key`);--> statement-breakpoint
CREATE INDEX `exchange_rates_workspace_ledger_idx` ON `exchange_rates` (`workspace_id`,`ledger_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `exchange_rates_pair_date_source_unique` ON `exchange_rates` (`ledger_id`,`base_currency_code`,`quote_currency_code`,`rate_date`,`source`);--> statement-breakpoint
CREATE INDEX `idempotency_receipts_workspace_id_idx` ON `idempotency_receipts` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idempotency_receipts_ledger_id_idx` ON `idempotency_receipts` (`ledger_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idempotency_receipts_actor_key_unique` ON `idempotency_receipts` (`actor_user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `job_queue_status_idx` ON `job_queue` (`status`);--> statement-breakpoint
CREATE INDEX `job_queue_available_at_idx` ON `job_queue` (`available_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `job_queue_dedupe_key_unique` ON `job_queue` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `journal_meta_journal_id_idx` ON `journal_meta` (`journal_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `journal_meta_journal_key_unique` ON `journal_meta` (`journal_id`,`key`);--> statement-breakpoint
CREATE INDEX `ledgers_workspace_id_idx` ON `ledgers` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `passkey_challenges_user_id_idx` ON `passkey_challenges` (`user_id`);--> statement-breakpoint
CREATE INDEX `passkey_challenges_kind_idx` ON `passkey_challenges` (`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `passkeys_credential_id_unique` ON `passkeys` (`credential_id`);--> statement-breakpoint
CREATE INDEX `passkeys_user_id_idx` ON `passkeys` (`user_id`);--> statement-breakpoint
CREATE INDEX `payee_aliases_payee_id_idx` ON `payee_aliases` (`payee_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payee_aliases_ledger_normalized_alias_unique` ON `payee_aliases` (`ledger_id`,`normalized_alias`);--> statement-breakpoint
CREATE INDEX `payee_mappings_from_payee_id_idx` ON `payee_mappings` (`from_payee_id`);--> statement-breakpoint
CREATE INDEX `payee_mappings_to_payee_id_idx` ON `payee_mappings` (`to_payee_id`);--> statement-breakpoint
CREATE INDEX `payees_workspace_id_idx` ON `payees` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `payees_ledger_id_idx` ON `payees` (`ledger_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payees_ledger_normalized_name_unique` ON `payees` (`ledger_id`,`normalized_name`);--> statement-breakpoint
CREATE INDEX `recovery_codes_user_id_idx` ON `recovery_codes` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `tags_workspace_id_idx` ON `tags` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `tags_ledger_id_idx` ON `tags` (`ledger_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tags_ledger_name_unique` ON `tags` (`ledger_id`,`name`);--> statement-breakpoint
CREATE INDEX `transaction_groups_workspace_id_idx` ON `transaction_groups` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `transaction_groups_ledger_id_idx` ON `transaction_groups` (`ledger_id`);--> statement-breakpoint
CREATE INDEX `transaction_groups_type_idx` ON `transaction_groups` (`type`);--> statement-breakpoint
CREATE INDEX `transaction_groups_import_job_id_idx` ON `transaction_groups` (`import_job_id`);--> statement-breakpoint
CREATE INDEX `transaction_groups_external_id_idx` ON `transaction_groups` (`external_id`);--> statement-breakpoint
CREATE INDEX `transaction_journals_workspace_id_idx` ON `transaction_journals` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `transaction_journals_ledger_id_idx` ON `transaction_journals` (`ledger_id`);--> statement-breakpoint
CREATE INDEX `transaction_journals_group_id_idx` ON `transaction_journals` (`group_id`);--> statement-breakpoint
CREATE INDEX `transaction_journals_occurred_at_idx` ON `transaction_journals` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `transaction_journals_type_idx` ON `transaction_journals` (`type`);--> statement-breakpoint
CREATE INDEX `transaction_journals_status_idx` ON `transaction_journals` (`status`);--> statement-breakpoint
CREATE INDEX `transaction_journals_import_job_id_idx` ON `transaction_journals` (`import_job_id`);--> statement-breakpoint
CREATE INDEX `transaction_journals_external_id_idx` ON `transaction_journals` (`external_id`);--> statement-breakpoint
CREATE INDEX `transaction_postings_workspace_id_idx` ON `transaction_postings` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `transaction_postings_ledger_id_idx` ON `transaction_postings` (`ledger_id`);--> statement-breakpoint
CREATE INDEX `transaction_postings_journal_id_idx` ON `transaction_postings` (`journal_id`);--> statement-breakpoint
CREATE INDEX `transaction_postings_account_id_idx` ON `transaction_postings` (`account_id`);--> statement-breakpoint
CREATE INDEX `transaction_postings_category_id_idx` ON `transaction_postings` (`category_id`);--> statement-breakpoint
CREATE INDEX `transaction_postings_budget_id_idx` ON `transaction_postings` (`budget_id`);--> statement-breakpoint
CREATE INDEX `transaction_postings_currency_code_idx` ON `transaction_postings` (`currency_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_tags_journal_tag_unique` ON `transaction_tags` (`transaction_journal_id`,`tag_id`);--> statement-breakpoint
CREATE INDEX `transaction_tags_tag_id_idx` ON `transaction_tags` (`tag_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_normalized_unique` ON `users` (`username_normalized`);--> statement-breakpoint
CREATE INDEX `workspace_invitations_workspace_id_idx` ON `workspace_invitations` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_invitations_token_hash_unique` ON `workspace_invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `workspace_members_workspace_id_idx` ON `workspace_members` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `workspace_members_user_id_idx` ON `workspace_members` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_members_workspace_user_unique` ON `workspace_members` (`workspace_id`,`user_id`);