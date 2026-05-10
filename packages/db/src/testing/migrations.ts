import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { migrate as migrateSqlite } from "drizzle-orm/better-sqlite3/migrator";
import { migrate as migratePostgres } from "drizzle-orm/pglite/migrator";

import { createPglitePostgresDatabaseFromClient } from "../postgres/client.js";
import {
  configureSqliteRuntime,
  createSqliteDatabaseFromClient,
  createUnconfiguredSqliteClient,
  type SqliteClient,
} from "../sqlite/client.js";

const sqliteMigrationsFolder = fileURLToPath(new URL("../sqlite/migrations", import.meta.url));
const postgresMigrationsFolder = fileURLToPath(new URL("../postgres/migrations", import.meta.url));

export function createInMemorySqliteDatabase(): SqliteClient {
  const client = createUnconfiguredSqliteClient({ source: ":memory:" });
  configureSqliteRuntime(client);
  return client;
}

export async function createInMemoryPgliteDatabase(): Promise<PGlite> {
  return PGlite.create();
}

export function runSqliteMigrations(db: SqliteClient): void {
  migrateSqlite(createSqliteDatabaseFromClient(db), {
    migrationsFolder: sqliteMigrationsFolder,
  });
}

export async function runPglitePostgresMigrations(db: PGlite): Promise<void> {
  await migratePostgres(createPglitePostgresDatabaseFromClient(db), {
    migrationsFolder: postgresMigrationsFolder,
  });
}

// Backward-compatible aliases while callers migrate to explicit PGlite names.
export const createInMemoryPostgresDatabase = createInMemoryPgliteDatabase;
export const runPostgresMigrations = runPglitePostgresMigrations;
