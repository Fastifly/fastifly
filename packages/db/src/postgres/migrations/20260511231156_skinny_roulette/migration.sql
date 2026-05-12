ALTER TABLE "categories" ADD COLUMN "counterparty_account_id" text;--> statement-breakpoint
CREATE INDEX "categories_counterparty_account_id_idx" ON "categories" ("counterparty_account_id");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_counterparty_account_id_accounts_id_fkey" FOREIGN KEY ("counterparty_account_id") REFERENCES "accounts"("id");