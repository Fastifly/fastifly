CREATE UNIQUE INDEX "ledgers_workspace_active_name_unique" ON "ledgers" ("workspace_id",lower("name")) WHERE "archived_at" IS NULL;
