import {
  createClient,
  type Client as LibsqlClient,
  type Config as LibsqlConfig,
} from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";

import { sqliteSchema } from "./schema.js";

export type SqliteClient = LibsqlClient;
export type SqliteClientConfig = LibsqlConfig;
export type SqliteDatabase = LibSQLDatabase<typeof sqliteSchema>;

export function createSqliteClient(config: SqliteClientConfig): SqliteClient {
  return createClient(config);
}

export function createSqliteDatabase(config: SqliteClientConfig): SqliteDatabase {
  return drizzle({ connection: config, schema: sqliteSchema });
}

export function createSqliteDatabaseFromClient(client: SqliteClient): SqliteDatabase {
  return drizzle(client, { schema: sqliteSchema });
}
