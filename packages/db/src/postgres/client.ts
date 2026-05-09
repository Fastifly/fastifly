import { PGlite, type PGliteOptions } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";

import { pgSchema } from "./schema.js";

export type PostgresClient = PGlite;
export type PostgresClientConfig = PGliteOptions & {
  readonly dataDir?: string;
};
export type PostgresDatabase = PgliteDatabase<typeof pgSchema>;

export async function createPostgresClient(config?: PostgresClientConfig): Promise<PostgresClient> {
  return PGlite.create(config);
}

export function createPostgresDatabase(config?: PostgresClientConfig): PostgresDatabase {
  if (config === undefined) {
    return drizzle({ schema: pgSchema });
  }

  return drizzle({ connection: config, schema: pgSchema });
}

export function createPostgresDatabaseFromClient(client: PostgresClient): PostgresDatabase {
  return drizzle(client, { schema: pgSchema });
}
