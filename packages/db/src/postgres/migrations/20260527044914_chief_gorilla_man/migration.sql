CREATE TABLE "recurring_occurrences" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"ledger_id" text NOT NULL,
	"recurring_template_id" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"transaction_group_id" text,
	"status" text NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "recurring_occurrences_status_check" CHECK ("status" IN ('generated', 'skipped', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_occurrences_template_scheduled_unique" ON "recurring_occurrences" ("recurring_template_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "recurring_occurrences_workspace_ledger_idx" ON "recurring_occurrences" ("workspace_id","ledger_id");--> statement-breakpoint
CREATE INDEX "recurring_occurrences_template_idx" ON "recurring_occurrences" ("recurring_template_id");--> statement-breakpoint
ALTER TABLE "recurring_occurrences" ADD CONSTRAINT "recurring_occurrences_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id");--> statement-breakpoint
ALTER TABLE "recurring_occurrences" ADD CONSTRAINT "recurring_occurrences_ledger_id_ledgers_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "ledgers"("id");--> statement-breakpoint
ALTER TABLE "recurring_occurrences" ADD CONSTRAINT "recurring_occurrences_13nNZJVX23jx_fkey" FOREIGN KEY ("recurring_template_id") REFERENCES "recurring_templates"("id");--> statement-breakpoint
ALTER TABLE "recurring_occurrences" ADD CONSTRAINT "recurring_occurrences_m3x0eSDpJ371_fkey" FOREIGN KEY ("transaction_group_id") REFERENCES "transaction_groups"("id");