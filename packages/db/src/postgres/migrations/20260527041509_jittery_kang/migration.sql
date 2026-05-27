ALTER TABLE "import_jobs" ADD COLUMN "kind" text DEFAULT 'csv' NOT NULL;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD COLUMN "plan_json" jsonb;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_kind_check" CHECK ("kind" IN ('csv', 'actual_budget'));