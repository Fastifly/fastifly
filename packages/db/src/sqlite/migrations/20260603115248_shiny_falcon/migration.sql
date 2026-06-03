CREATE UNIQUE INDEX `ledgers_workspace_active_name_unique` ON `ledgers` (`workspace_id`,lower("name")) WHERE "ledgers"."archived_at" IS NULL;
