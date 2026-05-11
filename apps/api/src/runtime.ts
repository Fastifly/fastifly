import { assertCan, defineWorkspaceAbility } from "@fastifly/authz";
import { createUuidV7 } from "@fastifly/common";
import type { ApiConfig } from "@fastifly/config";
import {
  closePostgresClient,
  createConfiguredSqliteClient,
  createInProcessLedgerWriteBoundary,
  createLedgerFinanceMutationService,
  createPostgresAccountRepository,
  createPostgresAdvisoryLedgerWriteBoundary,
  createPostgresBudgetQueryService,
  createPostgresClient,
  createPostgresDatabaseFromClient,
  createPostgresDeviceRepository,
  createPostgresIdentityRepository,
  createPostgresLedgerMutationStore,
  createPostgresSyncRepository,
  createPostgresTransactionQueryService,
  createPostgresTransactionWriteRepository,
  createPostgresWorkflowRepository,
  createSqliteAccountRepository,
  createSqliteBudgetQueryService,
  createSqliteDatabaseFromClient,
  createSqliteDeviceRepository,
  createSqliteIdentityRepository,
  createSqliteLedgerMutationStore,
  createSqliteSyncRepository,
  createSqliteTransactionQueryService,
  createSqliteTransactionWriteRepository,
  createSqliteWorkflowRepository,
  createSyncQueryService,
  createSyncReplayService,
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
import { createFinanceWorkflowService } from "./services/finance-workflows.js";

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

const REQUIRED_CORE_TABLES = [
  "users",
  "sessions",
  "passkeys",
  "recovery_codes",
  "workspaces",
  "workspace_members",
  "workspace_invitations",
  "ledgers",
  "devices",
  "idempotency_receipts",
  "job_queue",
  "import_jobs",
  "rules",
  "recurring_templates",
  "audit_log",
] as const;

const DRIZZLE_MIGRATIONS_SCHEMA = "drizzle";
const DRIZZLE_MIGRATIONS_TABLE = "__drizzle_migrations";

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
    : await createPostgresRuntimeDependencies(config.databaseUrl, config);
}

function createSqliteRuntimeDependencies(databaseUrl: string): RuntimeDependencyBundle {
  const client = createConfiguredSqliteClient({ source: databaseUrl });

  try {
    assertSqliteSchemaReady(client);
    const db = createSqliteDatabaseFromClient(client);
    const createId = createUuidV7;
    const accountRepository = createSqliteAccountRepository(client, { createId });
    const deviceRepository = createSqliteDeviceRepository(client, { createId });
    const identityRepository = createSqliteIdentityRepository(db, { createId });
    const syncRepository = createSqliteSyncRepository(client);
    const transactionRepository = createSqliteTransactionWriteRepository(client, { createId });
    const transactionQueryService = createSqliteTransactionQueryService(client);
    const workflowRepository = createSqliteWorkflowRepository(client, { createId });
    const runner = new LedgerMutationRunner({
      authorize: createRuntimeAuthorization(identityRepository),
      store: createSqliteLedgerMutationStore(db, { createId }),
      writeBoundary: createInProcessLedgerWriteBoundary(),
    });
    const financeMutationService = createLedgerFinanceMutationService({
      accountRepository,
      runner,
      transactionRepository,
    });
    const workflowService = createFinanceWorkflowService({
      financeMutationService,
      transactionQueryService,
      workflowRepository,
    });

    return {
      appOptions: {
        accountRepository,
        budgetQueryService: createSqliteBudgetQueryService(client),
        deviceRepository,
        financeMutationService,
        identityRepository,
        syncReplayService: createSyncReplayService({
          createId,
          financeMutationService,
          syncRepository,
        }),
        syncQueryService: createSyncQueryService({ syncRepository }),
        transactionQueryService,
        workflowService,
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
  config: ApiConfig,
): Promise<RuntimeDependencyBundle> {
  const client = createPostgresClient({ url: databaseUrl });

  try {
    await assertPostgresSchemaReady(client);
    const db = createPostgresDatabaseFromClient(client);
    const createId = createUuidV7;
    const accountRepository = createPostgresAccountRepository(db, { createId });
    const deviceRepository = createPostgresDeviceRepository(db, { createId });
    const identityRepository = createPostgresIdentityRepository(db, { createId });
    const syncRepository = createPostgresSyncRepository(db);
    const transactionRepository = createPostgresTransactionWriteRepository(db, { createId });
    const transactionQueryService = createPostgresTransactionQueryService(db);
    const workflowRepository = createPostgresWorkflowRepository(db, { createId });
    const runner = new LedgerMutationRunner({
      authorize: createRuntimeAuthorization(identityRepository),
      store: createPostgresLedgerMutationStore(db, { createId }),
      writeBoundary: createPostgresAdvisoryLedgerWriteBoundary(client, {
        acquireTimeoutMs: config.postgresLedgerLockAcquireTimeoutMs,
      }),
    });
    const financeMutationService = createLedgerFinanceMutationService({
      accountRepository,
      createAccountRepositoryForTransaction: (transaction) =>
        createPostgresAccountRepository(transaction as PostgresTransaction, { createId }),
      createTransactionRepositoryForTransaction: (transaction) =>
        createPostgresTransactionWriteRepository(transaction as PostgresTransaction, {
          createId,
        }),
      runner,
      transactionRepository,
    });
    const workflowService = createFinanceWorkflowService({
      financeMutationService,
      transactionQueryService,
      workflowRepository,
    });

    return {
      appOptions: {
        accountRepository,
        budgetQueryService: createPostgresBudgetQueryService(db),
        deviceRepository,
        financeMutationService,
        identityRepository,
        syncReplayService: createSyncReplayService({
          createId,
          financeMutationService,
          syncRepository,
        }),
        syncQueryService: createSyncQueryService({ syncRepository }),
        transactionQueryService,
        workflowService,
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

export function createRuntimeAuthorization(
  identityRepository: IdentityRepository,
): RuntimeAuthorization {
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

    try {
      assertCan(
        defineWorkspaceAbility({ role: member.role }),
        envelope.authorization.action,
        envelope.authorization.subject,
      );
    } catch {
      throw new LedgerMutationError(
        "Actor is not allowed to perform this ledger mutation.",
        "MUTATION_FORBIDDEN",
      );
    }
  };
}

function assertSqliteSchemaReady(client: SqliteClient): void {
  try {
    const missingTables = REQUIRED_CORE_TABLES.filter((table) => !sqliteTableExists(client, table));
    const migrationsTableExists = sqliteTableExists(client, DRIZZLE_MIGRATIONS_TABLE);

    if (missingTables.length > 0 || !migrationsTableExists) {
      throw new Error(
        `Missing required SQLite tables: ${[
          ...missingTables,
          ...(migrationsTableExists ? [] : [`${DRIZZLE_MIGRATIONS_TABLE}`]),
        ].join(", ")}`,
      );
    }

    const migrationCount = client
      .prepare<unknown[], { readonly total: number }>(
        `SELECT COUNT(*) AS total FROM ${DRIZZLE_MIGRATIONS_TABLE}`,
      )
      .get()?.total;

    if (!migrationCount || migrationCount < 1) {
      throw new Error("SQLite migration log is empty.");
    }
  } catch (error) {
    throw new Error(
      "SQLite schema is not ready. Run `pnpm db:migrate:sqlite` before starting the API.",
      { cause: error },
    );
  }
}

async function assertPostgresSchemaReady(client: PostgresClient): Promise<void> {
  try {
    const missingTables: string[] = [];

    for (const table of REQUIRED_CORE_TABLES) {
      const result = await client.unsafe(`SELECT to_regclass('public.${table}') AS table_name`);
      const tableName =
        (result as unknown as ReadonlyArray<{ readonly table_name: string | null }>)[0]
          ?.table_name ?? null;

      if (!tableName) {
        missingTables.push(table);
      }
    }

    if (missingTables.length > 0) {
      throw new Error(`Missing required PostgreSQL tables: ${missingTables.join(", ")}`);
    }

    const migrationResult = await client.unsafe(
      `SELECT COUNT(*)::int AS total FROM ${DRIZZLE_MIGRATIONS_SCHEMA}.${DRIZZLE_MIGRATIONS_TABLE}`,
    );
    const migrationCount =
      (migrationResult as unknown as ReadonlyArray<{ readonly total: number }>)[0]?.total ?? 0;

    if (migrationCount < 1) {
      throw new Error("PostgreSQL migration log is empty.");
    }
  } catch (error) {
    throw new Error(
      "PostgreSQL schema is not ready. Run `pnpm db:migrate:postgres` before starting the API.",
      { cause: error },
    );
  }
}

function sqliteTableExists(client: SqliteClient, tableName: string): boolean {
  const row = client
    .prepare<unknown[], { readonly present: number }>(
      "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    )
    .get(tableName);

  return Boolean(row?.present);
}
