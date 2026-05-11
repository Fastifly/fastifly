CREATE TABLE "import_jobs" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"ledger_id" text NOT NULL,
	"file_name" text,
	"csv_text" text NOT NULL,
	"preview_rows_json" jsonb NOT NULL,
	"status" text NOT NULL,
	"committed_group_ids_json" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"committed_at" timestamp with time zone,
	"undone_at" timestamp with time zone,
	CONSTRAINT "import_jobs_status_check" CHECK ("status" IN ('preview_ready', 'committed', 'undone', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "recurring_templates" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"ledger_id" text NOT NULL,
	"type" text NOT NULL,
	"cadence" text NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"template_json" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"last_generated_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	CONSTRAINT "recurring_templates_type_check" CHECK ("type" IN ('expense', 'income', 'transfer')),
	CONSTRAINT "recurring_templates_cadence_check" CHECK ("cadence" IN ('daily', 'weekly', 'monthly')),
	CONSTRAINT "recurring_templates_status_check" CHECK ("status" IN ('active', 'paused', 'archived')),
	CONSTRAINT "recurring_templates_interval_check" CHECK ("interval_count" >= 1)
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"ledger_id" text NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"condition_json" jsonb NOT NULL,
	"action_type" text NOT NULL,
	"action_json" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "rules_action_type_check" CHECK ("action_type" IN ('set_transaction_status'))
);
--> statement-breakpoint
CREATE INDEX "import_jobs_workspace_ledger_idx" ON "import_jobs" ("workspace_id","ledger_id");--> statement-breakpoint
CREATE INDEX "import_jobs_status_idx" ON "import_jobs" ("status");--> statement-breakpoint
CREATE INDEX "recurring_templates_workspace_ledger_idx" ON "recurring_templates" ("workspace_id","ledger_id");--> statement-breakpoint
CREATE INDEX "recurring_templates_status_idx" ON "recurring_templates" ("status");--> statement-breakpoint
CREATE INDEX "rules_workspace_ledger_idx" ON "rules" ("workspace_id","ledger_id");--> statement-breakpoint
CREATE INDEX "rules_enabled_idx" ON "rules" ("enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "rules_ledger_name_unique" ON "rules" ("ledger_id","name");--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id");--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_ledger_id_ledgers_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "ledgers"("id");--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "recurring_templates" ADD CONSTRAINT "recurring_templates_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id");--> statement-breakpoint
ALTER TABLE "recurring_templates" ADD CONSTRAINT "recurring_templates_ledger_id_ledgers_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "ledgers"("id");--> statement-breakpoint
ALTER TABLE "recurring_templates" ADD CONSTRAINT "recurring_templates_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "recurring_templates" ADD CONSTRAINT "recurring_templates_updated_by_users_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id");--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_ledger_id_ledgers_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "ledgers"("id");--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_updated_by_users_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id");