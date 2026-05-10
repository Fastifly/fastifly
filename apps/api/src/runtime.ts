import { createUuidV7 } from "@fastifly/common";
import type { ApiConfig } from "@fastifly/config";
import {
  closePostgresClient,
  createConfiguredSqliteClient,
  createInProcessLedgerWriteBoundary,
  createLedgerFinanceMutationService,
  createPostgresAccountRepository,
  createPostgresClient,
  createPostgresDatabaseFromClient,
  createPostgresIdentityRepository,
  createPostgresLedgerMutationStore,
  createPostgresTransactionQueryService,
  createPostgresTransactionWriteRepository,
  createSqliteAccountRepository,
  createSqliteDatabaseFromClient,
  createSqliteIdentityRepository,
  createSqliteLedgerMutationStore,
  createSqliteTransactionQueryService,
  createSqliteTransactionWriteRepository,
  type IdentityRepository,
  LedgerMutationError,
  LedgerMutationRunner,
  type LedgerMutationRunnerOptions,
  type PostgresClient,
  type ProductionPostgresDatabase,
  type SqliteClient,
} from "@fastifly/db";
import type { FastifyInstance } from "fastify";

import { type BuildApiAppOptions, buildApiApp } from "./app.js";

type RuntimeDependencyBundle = {
  readonly appOptions: BuildApiAppOptions;
  readonly close: () => Promise<void>;
};
type RuntimeAuthorization = LedgerMutationRunnerOptions<unknown>["authorize"];
type PostgresTransaction = Parameters<ProductionPostgresDatabase["transaction"]>[0] extends (
  tx: infer T,
) => unknown
  ? T
  : never;

export async function buildProductionApiApp(config: ApiConfig): Promise<FastifyInstance> {
  const runtime = await createRuntimeDependencies(config);
  const app = await buildApiApp({
    ...runtime.appOptions,
    config,
    readiness: { migrations: "ok" },
  });

  app.addHook("onClose", async () => {
    await runtime.close();
  });

  return app;
}

export async function createRuntimeDependencies(
  config: ApiConfig,
): Promise<RuntimeDependencyBundle> {
  if (!config.databaseDriver) {
    throw new Error("DATABASE_DRIVER is required to start the API runtime.");
  }
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required to start the API runtime.");
  }
  if (config.autoMigrate && config.nodeEnv === "production") {
    throw new Error("AUTO_MIGRATE must be false in production.");
  }

  return config.databaseDriver === "sqlite"
    ? createSqliteRuntimeDependencies(config.databaseUrl)
    : await createPostgresRuntimeDependencies(config.databaseUrl);
}

function createSqliteRuntimeDependencies(databaseUrl: string): RuntimeDependencyBundle {
  const client = createConfiguredSqliteClient({ source: databaseUrl });

  try {
    assertSqliteSchemaReady(client);
    const db = createSqliteDatabaseFromClient(client);
    const createId = createUuidV7;
    const accountRepository = createSqliteAccountRepository(client, { createId });
    const identityRepository = createSqliteIdentityRepository(db, { createId });
    const transactionRepository = createSqliteTransactionWriteRepository(client, { createId });
    const runner = new LedgerMutationRunner({
      authorize: createRuntimeAuthorization(identityRepository),
      store: createSqliteLedgerMutationStore(db, { createId }),
      writeBoundary: createInProcessLedgerWriteBoundary(),
    });

    return {
      appOptions: {
        accountRepository,
        financeMutationService: createLedgerFinanceMutationService({
          accountRepository,
          runner,
          transactionRepository,
        }),
        identityRepository,
        transactionQueryService: createSqliteTransactionQueryService(client),
      },
      close: async () => {
        client.close();
      },
    };
  } catch (error) {
    client.close();
    throw error;
  }
}

async function createPostgresRuntimeDependencies(
  databaseUrl: string,
): Promise<RuntimeDependencyBundle> {
  const client = createPostgresClient({ url: databaseUrl });

  try {
    await assertPostgresSchemaReady(client);
    const db = createPostgresDatabaseFromClient(client);
    const createId = createUuidV7;
    const accountRepository = createPostgresAccountRepository(db, { createId });
    const identityRepository = createPostgresIdentityRepository(db, { createId });
    const transactionRepository = createPostgresTransactionWriteRepository(db, { createId });
    const runner = new LedgerMutationRunner({
      authorize: createRuntimeAuthorization(identityRepository),
      store: createPostgresLedgerMutationStore(db, { createId }),
      writeBoundary: createInProcessLedgerWriteBoundary(),
    });

    return {
      appOptions: {
        accountRepository,
        financeMutationService: createLedgerFinanceMutationService({
          accountRepository,
          createAccountRepositoryForTransaction: (transaction) =>
            createPostgresAccountRepository(transaction as PostgresTransaction, { createId }),
          createTransactionRepositoryForTransaction: (transaction) =>
            createPostgresTransactionWriteRepository(transaction as PostgresTransaction, {
              createId,
            }),
          runner,
          transactionRepository,
        }),
        identityRepository,
        transactionQueryService: createPostgresTransactionQueryService(db),
      },
      close: async () => {
        await closePostgresClient(client);
      },
    };
  } catch (error) {
    await closePostgresClient(client);
    throw error;
  }
}

function createRuntimeAuthorization(identityRepository: IdentityRepository): RuntimeAuthorization {
  return async (envelope) => {
    const member = await identityRepository.findWorkspaceMember(
      envelope.workspaceId,
      envelope.actorUserId,
    );

    if (!member) {
      throw new LedgerMutationError(
        "Actor is not a member of this workspace.",
        "MUTATION_FORBIDDEN",
      );
    }
  };
}

function assertSqliteSchemaReady(client: SqliteClient): void {
  try {
    client.prepare("SELECT 1 FROM users LIMIT 1").get();
  } catch (error) {
    throw new Error(
      "SQLite schema is not ready. Run `pnpm db:migrate:sqlite` before starting the API.",
      { cause: error },
    );
  }
}

async function assertPostgresSchemaReady(client: PostgresClient): Promise<void> {
  try {
    await client.unsafe("SELECT 1 FROM users LIMIT 1");
  } catch (error) {
    throw new Error(
      "PostgreSQL schema is not ready. Run `pnpm db:migrate:postgres` before starting the API.",
      { cause: error },
    );
  }
}
