import { readFileSync } from "node:fs";

import type { DatabaseDialect, Migration } from "../migrations/types.js";

export function readMigration(dialect: DatabaseDialect, id: string): Migration {
  const migrationUrl = new URL(`../${dialect}/migrations/${id}.sql`, import.meta.url);

  return {
    dialect,
    id,
    sql: readFileSync(migrationUrl, "utf8"),
  };
}
