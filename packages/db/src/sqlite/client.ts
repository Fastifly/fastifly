import Database from "better-sqlite3";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";

import { sqliteSchema } from "./schema.js";

export type SqliteClient = Database.Database;
export type SqliteClientConfig = {
  readonly source: string | Buffer;
  readonly options?: Database.Options;
};
export type SqliteDatabase = BetterSQLite3Database<typeof sqliteSchema>;

export type SqliteRuntimePragmas = {
  readonly foreignKeys: boolean;
  readonly journalMode: string;
  readonly busyTimeoutMs: number;
  readonly synchronous: number;
};

export function createUnconfiguredSqliteClient(config: SqliteClientConfig): SqliteClient {
  return new Database(config.source, config.options);
}

export function createConfiguredSqliteClient(config: SqliteClientConfig): SqliteClient {
  const client = createUnconfiguredSqliteClient(config);

  try {
    configureSqliteRuntime(client);
    assertSqliteRuntimePragmas(client);
    return client;
  } catch (error) {
    client.close();
    throw error;
  }
}

export function createSqliteDatabase(config: SqliteClientConfig): SqliteDatabase {
  return createSqliteDatabaseFromClient(createConfiguredSqliteClient(config));
}

export function createSqliteDatabaseFromClient(client: SqliteClient): SqliteDatabase {
  return drizzle({ client, schema: sqliteSchema });
}

export function configureSqliteRuntime(client: SqliteClient): void {
  client.pragma("foreign_keys = ON");
  client.pragma("journal_mode = WAL");
  client.pragma("busy_timeout = 5000");
  client.pragma("synchronous = NORMAL");
}

export function readSqliteRuntimePragmas(client: SqliteClient): SqliteRuntimePragmas {
  return {
    busyTimeoutMs: Number(client.pragma("busy_timeout", { simple: true })),
    foreignKeys: Number(client.pragma("foreign_keys", { simple: true })) === 1,
    journalMode: String(client.pragma("journal_mode", { simple: true })).toLowerCase(),
    synchronous: Number(client.pragma("synchronous", { simple: true })),
  };
}

export function assertSqliteRuntimePragmas(client: SqliteClient): SqliteRuntimePragmas {
  const pragmas = readSqliteRuntimePragmas(client);
  if (
    !pragmas.foreignKeys ||
    pragmas.journalMode !== "wal" ||
    pragmas.busyTimeoutMs < 5000 ||
    pragmas.synchronous !== 1
  ) {
    throw new Error(
      `SQLite runtime pragmas are invalid: ${JSON.stringify({
        busyTimeoutMs: pragmas.busyTimeoutMs,
        foreignKeys: pragmas.foreignKeys,
        journalMode: pragmas.journalMode,
        synchronous: pragmas.synchronous,
      })}`,
    );
  }

  return pragmas;
}
