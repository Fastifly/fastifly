import { makeTestApiConfig } from "@fastifly/config";
import {
  cleanDatabase,
  closePostgresClient,
  createPostgresClient,
  type SeedLevel,
  seedPostgres,
} from "@fastifly/db";
import type { FastifyInstance } from "fastify";
import { runMigrations } from "../../../../../packages/db/src/migrations/maintenance-cli.js";
import { buildApiApp } from "../../../src/app.js";
import { createRuntimeDependencies } from "../../../src/runtime.js";

export const E2E_POSTGRES_URL_ENV = "FASTIFLY_E2E_POSTGRES_URL";

export async function createPostgresE2eSystem(input: {
  readonly databaseUrl: string;
  readonly seedLevel?: SeedLevel;
}): Promise<{
  readonly app: FastifyInstance;
  readonly cleanup: () => Promise<void>;
}> {
  await runMigrations("postgres", input.databaseUrl);
  await cleanDatabase({ databaseUrl: input.databaseUrl, driver: "postgres" });

  const seedClient = createPostgresClient({
    maxConnections: 2,
    url: input.databaseUrl,
  });

  try {
    await seedPostgres(seedClient, input.seedLevel ?? "essential");
  } finally {
    await closePostgresClient(seedClient);
  }

  const config = makeTestApiConfig({
    databaseDriver: "postgres",
    databaseUrl: input.databaseUrl,
    logLevel: "silent",
    nodeEnv: "test",
  });
  const runtime = await createRuntimeDependencies(config);
  const app = await buildApiApp({
    ...runtime.appOptions,
    config,
    readiness: { migrations: "ok" },
  });

  return {
    app,
    cleanup: async () => {
      await app.close();
      await runtime.close();
    },
  };
}

export function getPostgresE2eUrlFromEnv(): string | null {
  const value = process.env[E2E_POSTGRES_URL_ENV];
  if (!value || value.trim().length < 1) {
    return null;
  }

  return value;
}
