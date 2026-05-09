import { PGlite, type PGliteOptions } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgresJs, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export type PostgresClient = postgres.Sql;
export type PostgresClientConfig = {
  readonly url: string;
  readonly maxConnections?: number;
  readonly idleTimeoutSeconds?: number;
  readonly connectTimeoutSeconds?: number;
  readonly maxLifetimeSeconds?: number | null;
  readonly ssl?: postgres.Options<Record<string, postgres.PostgresType>>["ssl"];
  readonly prepare?: boolean;
  readonly applicationName?: string;
  readonly statementTimeoutMs?: number;
};
export type PostgresDatabase = PostgresJsDatabase | PgliteDatabase;
export type ProductionPostgresDatabase = PostgresJsDatabase;

export type PglitePostgresClient = PGlite;
export type PglitePostgresClientConfig = PGliteOptions & {
  readonly dataDir?: string;
};
export type PglitePostgresDatabase = PgliteDatabase;

export function createPostgresClient(config: PostgresClientConfig): PostgresClient {
  const connection: NonNullable<
    postgres.Options<Record<string, postgres.PostgresType>>["connection"]
  > = {
    application_name: config.applicationName ?? "fastifly",
  };

  if (config.statementTimeoutMs !== undefined) {
    connection.statement_timeout = config.statementTimeoutMs;
  }

  const options: postgres.Options<Record<string, postgres.PostgresType>> = {
    connect_timeout: config.connectTimeoutSeconds ?? 30,
    connection,
    idle_timeout: config.idleTimeoutSeconds ?? 20,
    max: config.maxConnections ?? 10,
    max_lifetime: config.maxLifetimeSeconds ?? 60 * 30,
    onnotice: () => undefined,
    prepare: config.prepare ?? true,
  };

  if (config.ssl !== undefined) {
    options.ssl = config.ssl;
  }

  return postgres(config.url, options);
}

export function createPostgresDatabase(config: PostgresClientConfig): ProductionPostgresDatabase {
  return createPostgresDatabaseFromClient(createPostgresClient(config));
}

export function createPostgresDatabaseFromClient(
  client: PostgresClient,
): ProductionPostgresDatabase {
  return drizzlePostgresJs({ client });
}

export async function closePostgresClient(
  client: PostgresClient,
  options: { readonly timeoutSeconds?: number } = {},
): Promise<void> {
  await client.end({ timeout: options.timeoutSeconds ?? 5 });
}

export async function createPglitePostgresClient(
  config?: PglitePostgresClientConfig,
): Promise<PglitePostgresClient> {
  return PGlite.create(config);
}

export function createPglitePostgresDatabase(
  config?: PglitePostgresClientConfig,
): PglitePostgresDatabase {
  if (config === undefined) {
    return drizzlePglite();
  }

  return drizzlePglite({ connection: config });
}

export function createPglitePostgresDatabaseFromClient(
  client: PglitePostgresClient,
): PglitePostgresDatabase {
  return drizzlePglite({ client });
}
