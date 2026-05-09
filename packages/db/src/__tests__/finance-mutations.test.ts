import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUuidV7, type SyncedId } from "@fastifly/common";
import { describe, expect, it } from "vitest";

import {
  type AccountRepository,
  createConfiguredSqliteClient,
  createInProcessLedgerWriteBoundary,
  createLedgerFinanceMutationService,
  createPglitePostgresDatabaseFromClient,
  createPostgresAccountRepository,
  createPostgresIdentityRepository,
  createPostgresLedgerMutationStore,
  createPostgresTransactionWriteRepository,
  createSqliteAccountRepository,
  createSqliteDatabaseFromClient,
  createSqliteIdentityRepository,
  createSqliteLedgerMutationStore,
  createSqliteTransactionWriteRepository,
  type IdentityRepository,
  type LedgerFinanceMutationService,
  type LedgerMutationEnvelope,
  LedgerMutationRunner,
  type LedgerMutationStore,
  type SqliteClient,
} from "../index.js";
import {
  createInMemoryPostgresDatabase,
  runPostgresMigrations,
  runSqliteMigrations,
} from "../testing/migrations.js";

type QueryablePostgres = { readonly query: (sql: string) => Promise<unknown> };
type PostgresAccountConnection = Parameters<typeof createPostgresAccountRepository>[0];
type PostgresTransactionConnection = Parameters<typeof createPostgresTransactionWriteRepository>[0];

type FinanceMutationFactory = {
  readonly name: string;
  readonly run: (test: (context: FinanceMutationContext) => Promise<void>) => Promise<void>;
};

type FinanceMutationContext = {
  readonly accountRepository: AccountRepository;
  readonly dialect: "sqlite" | "postgres";
  readonly events: string[];
  readonly identityRepository: IdentityRepository;
  readonly rawDb: SqliteClient | QueryablePostgres;
  readonly service: LedgerFinanceMutationService;
};

function createDeterministicIdGenerator(): () => SyncedId {
  let counter = 1;

  return () => {
    const value = counter;
    counter += 1;

    return createUuidV7({
      nowMs: Date.UTC(2026, 4, 9),
      randomBytes: (byteLength) => {
        const bytes = new Uint8Array(byteLength);
        bytes[byteLength - 1] = value;
        return bytes;
      },
    });
  };
}

function createClock(date: Date) {
  return { now: () => date };
}

const repositoryClock = createClock(new Date("2026-05-09T10:11:12.000Z"));

const factories: readonly FinanceMutationFactory[] = [
  {
    name: "SQLite",
    async run(test) {
      const sqliteDir = mkdtempSync(join(tmpdir(), "fastifly-finance-mutations-sqlite-"));
      const client = createConfiguredSqliteClient({ source: join(sqliteDir, "test.db") });

      try {
        runSqliteMigrations(client);
        seedSqliteCurrency(client);
        const db = createSqliteDatabaseFromClient(client);
        const createId = createDeterministicIdGenerator();
        const events: string[] = [];
        const runner = new LedgerMutationRunner({
          authorize: () => undefined,
          dispatchDomainEvents: (items) => events.push(...items.map((event) => event.type)),
          now: repositoryClock.now,
          store: createSqliteLedgerMutationStore(db, {
            createId,
            now: repositoryClock.now,
          }) as LedgerMutationStore<unknown>,
          writeBoundary: createInProcessLedgerWriteBoundary(),
        });
        const accountRepository = createSqliteAccountRepository(client, {
          clock: repositoryClock,
          createId,
        });
        await test({
          accountRepository,
          dialect: "sqlite",
          events,
          identityRepository: createSqliteIdentityRepository(db, {
            clock: repositoryClock,
            createId,
          }),
          rawDb: client,
          service: createLedgerFinanceMutationService({
            accountRepository,
            runner,
            transactionRepository: createSqliteTransactionWriteRepository(client, {
              clock: repositoryClock,
              createId,
            }),
          }),
        });
      } finally {
        client.close();
        rmSync(sqliteDir, { force: true, recursive: true });
      }
    },
  },
  {
    name: "PostgreSQL",
    async run(test) {
      const client = await createInMemoryPostgresDatabase();

      try {
        await runPostgresMigrations(client);
        await seedPostgresCurrency(client);
        const db = createPglitePostgresDatabaseFromClient(client);
        const createId = createDeterministicIdGenerator();
        const events: string[] = [];
        const runner = new LedgerMutationRunner({
          authorize: () => undefined,
          dispatchDomainEvents: (items) => events.push(...items.map((event) => event.type)),
          now: repositoryClock.now,
          store: createPostgresLedgerMutationStore(db, {
            createId,
            now: repositoryClock.now,
          }) as LedgerMutationStore<unknown>,
          writeBoundary: createInProcessLedgerWriteBoundary(),
        });
        const accountRepository = createPostgresAccountRepository(db, {
          clock: repositoryClock,
          createId,
        });
        await test({
          accountRepository,
          dialect: "postgres",
          events,
          identityRepository: createPostgresIdentityRepository(db, {
            clock: repositoryClock,
            createId,
          }),
          rawDb: client,
          service: createLedgerFinanceMutationService({
            accountRepository,
            createAccountRepositoryForTransaction: (transaction) =>
              createPostgresAccountRepository(transaction as PostgresAccountConnection, {
                clock: repositoryClock,
                createId,
              }),
            createTransactionRepositoryForTransaction: (transaction) =>
              createPostgresTransactionWriteRepository(
                transaction as PostgresTransactionConnection,
                {
                  clock: repositoryClock,
                  createId,
                },
              ),
            runner,
            transactionRepository: createPostgresTransactionWriteRepository(db, {
              clock: repositoryClock,
              createId,
            }),
          }),
        });
      } finally {
        await client.close();
      }
    },
  },
];

describe("finance mutation service", () => {
  for (const factory of factories) {
    it(`creates accounts through the ledger mutation runner on ${factory.name}`, async () => {
      await factory.run(async ({ dialect, events, identityRepository, rawDb, service }) => {
        const { user, workspaceState } = await createBaseState(identityRepository);
        const envelope = createEnvelope({
          actorUserId: user.id,
          idempotencyKey: "idem_create_account",
          ledgerId: workspaceState.ledger.id,
          workspaceId: workspaceState.workspace.id,
        });

        const first = await service.createAccount({
          account: {
            currencyCode: "INR",
            kind: "asset",
            name: "Bank",
            subtype: "bank",
          },
          envelope,
        });
        const replay = await service.createAccount({
          account: {
            currencyCode: "INR",
            kind: "asset",
            name: "Bank",
            subtype: "bank",
          },
          envelope,
        });

        expect(first).toMatchObject({
          body: { account: { name: "Bank", openingBalanceMinor: null } },
          idempotencyReplayed: false,
          status: 201,
        });
        expect(replay).toMatchObject({
          body: first.body,
          idempotencyReplayed: true,
          status: 201,
        });
        expect(events).toEqual(["account.created"]);
        await expect(countRows(dialect, rawDb, "accounts")).resolves.toBe(1);
        await expect(countRows(dialect, rawDb, "audit_log")).resolves.toBe(1);
        await expect(countRows(dialect, rawDb, "idempotency_receipts")).resolves.toBe(1);
      });
    });

    it(`creates transactions through the ledger mutation runner on ${factory.name}`, async () => {
      await factory.run(
        async ({ accountRepository, dialect, events, identityRepository, rawDb, service }) => {
          const { accounts, user, workspaceState } = await createWorkspaceAccounts(
            identityRepository,
            accountRepository,
          );

          const result = await service.createTransaction({
            envelope: createEnvelope({
              actorUserId: user.id,
              idempotencyKey: "idem_create_transaction",
              ledgerId: workspaceState.ledger.id,
              workspaceId: workspaceState.workspace.id,
            }),
            transaction: {
              currencyCode: "INR",
              description: "Groceries",
              lines: [{ amountMinor: 12_000n, destinationAccountId: accounts.groceries.id }],
              occurredAt: "2026-05-09T08:00:00.000Z",
              sourceAccountId: accounts.bank.id,
              type: "expense",
            },
          });

          expect(result).toMatchObject({
            body: {
              transactionGroup: {
                journals: [{ postings: [{ amountMinor: "-12000" }, { amountMinor: "12000" }] }],
                title: "Groceries",
                type: "expense",
              },
            },
            status: 201,
          });
          expect(events).toEqual(["transaction.created"]);
          await expect(countRows(dialect, rawDb, "transaction_groups")).resolves.toBe(1);
          await expect(countRows(dialect, rawDb, "audit_log")).resolves.toBe(1);
        },
      );
    });

    it(`blocks finance writes before handlers run when a ledger is read-only on ${factory.name}`, async () => {
      await factory.run(
        async ({ accountRepository, dialect, identityRepository, rawDb, service }) => {
          const { accounts, user, workspaceState } = await createWorkspaceAccounts(
            identityRepository,
            accountRepository,
          );
          await updateLedgerStatus(dialect, rawDb, "read_only");

          await expect(
            service.createTransaction({
              envelope: createEnvelope({
                actorUserId: user.id,
                idempotencyKey: "idem_read_only_transaction",
                ledgerId: workspaceState.ledger.id,
                workspaceId: workspaceState.workspace.id,
              }),
              transaction: {
                currencyCode: "INR",
                description: "Blocked",
                lines: [{ amountMinor: 1_000n, destinationAccountId: accounts.groceries.id }],
                occurredAt: "2026-05-09T08:00:00.000Z",
                sourceAccountId: accounts.bank.id,
                type: "expense",
              },
            }),
          ).rejects.toMatchObject({ code: "LEDGER_NOT_WRITABLE" });
          await expect(countRows(dialect, rawDb, "transaction_groups")).resolves.toBe(0);
          await expect(countRows(dialect, rawDb, "audit_log")).resolves.toBe(0);
        },
      );
    });

    it(`does not write accounts during dry-run mutations on ${factory.name}`, async () => {
      await factory.run(async ({ dialect, identityRepository, rawDb, service }) => {
        const { user, workspaceState } = await createBaseState(identityRepository);

        const result = await service.createAccount({
          account: {
            currencyCode: "INR",
            kind: "asset",
            name: "Preview account",
            subtype: "bank",
          },
          envelope: createEnvelope({
            actorUserId: user.id,
            dryRun: true,
            idempotencyKey: "idem_dry_run_account",
            ledgerId: workspaceState.ledger.id,
            workspaceId: workspaceState.workspace.id,
          }),
        });

        expect(result).toMatchObject({
          body: { dryRun: true },
          idempotencyReplayed: false,
          status: 200,
        });
        await expect(countRows(dialect, rawDb, "accounts")).resolves.toBe(0);
        await expect(countRows(dialect, rawDb, "audit_log")).resolves.toBe(0);
        await expect(countRows(dialect, rawDb, "idempotency_receipts")).resolves.toBe(0);
      });
    });
  }
});

async function createBaseState(identityRepository: IdentityRepository) {
  const user = await identityRepository.createUser({
    displayName: "Owner",
    passwordHash: "$argon2id$fixture",
    username: "Owner",
  });
  const workspaceState = await identityRepository.bootstrapDefaultWorkspace({
    baseCurrencyCode: "INR",
    firstDayOfWeek: 1,
    ledgerName: "Primary",
    userId: user.id,
    workspaceName: "Personal",
  });

  return { user, workspaceState };
}

async function createWorkspaceAccounts(
  identityRepository: IdentityRepository,
  accountRepository: AccountRepository,
) {
  const { user, workspaceState } = await createBaseState(identityRepository);
  const scope = {
    ledgerId: workspaceState.ledger.id,
    workspaceId: workspaceState.workspace.id,
  };
  const bank = await accountRepository.createAccount({
    ...scope,
    currencyCode: "INR",
    kind: "asset",
    name: "Bank",
    subtype: "bank",
  });
  const groceries = await accountRepository.createAccount({
    ...scope,
    currencyCode: "INR",
    kind: "expense",
    name: "Groceries",
    subtype: "external",
  });

  return {
    accounts: {
      bank: bank.account,
      groceries: groceries.account,
    },
    user,
    workspaceState,
  };
}

function createEnvelope(input: {
  readonly actorUserId: SyncedId;
  readonly workspaceId: SyncedId;
  readonly ledgerId: SyncedId;
  readonly idempotencyKey: string;
  readonly dryRun?: boolean;
}): LedgerMutationEnvelope {
  return {
    actorUserId: input.actorUserId,
    baseRevision: null,
    deviceId: null,
    dryRun: input.dryRun ?? false,
    idempotencyKey: input.idempotencyKey,
    ledgerId: input.ledgerId,
    requestId: "request_1",
    sideEffectFlags: {
      applyRules: false,
      batchSubmission: false,
      fireWebhooks: false,
      recalculateBalances: true,
      skipNotifications: false,
    },
    source: "rest",
    syncOperation: null,
    workspaceId: input.workspaceId,
  };
}

function seedSqliteCurrency(client: SqliteClient): void {
  client.exec(`
    INSERT INTO currencies (
      code,
      name,
      decimal_places,
      symbol,
      created_at,
      updated_at
    )
    VALUES (
      'INR',
      'Indian Rupee',
      2,
      'Rs',
      '2026-05-09T00:00:00.000Z',
      '2026-05-09T00:00:00.000Z'
    )
    ON CONFLICT(code) DO NOTHING
  `);
}

async function seedPostgresCurrency(client: QueryablePostgres): Promise<void> {
  await client.query(`
    INSERT INTO currencies (
      code,
      name,
      decimal_places,
      symbol,
      created_at,
      updated_at
    )
    VALUES (
      'INR',
      'Indian Rupee',
      2,
      'Rs',
      '2026-05-09T00:00:00.000Z',
      '2026-05-09T00:00:00.000Z'
    )
    ON CONFLICT(code) DO NOTHING
  `);
}

async function updateLedgerStatus(
  dialect: "sqlite" | "postgres",
  rawDb: SqliteClient | QueryablePostgres,
  status: "read_only",
): Promise<void> {
  if (dialect === "sqlite" && "exec" in rawDb) {
    rawDb.exec(`UPDATE ledgers SET status = '${status}'`);
    return;
  }
  if ("query" in rawDb) {
    await rawDb.query(`UPDATE ledgers SET status = '${status}'`);
    return;
  }

  throw new Error("Unsupported test database");
}

async function countRows(
  dialect: "sqlite" | "postgres",
  rawDb: SqliteClient | QueryablePostgres,
  tableName: "accounts" | "audit_log" | "idempotency_receipts" | "transaction_groups",
): Promise<number> {
  if (dialect === "sqlite" && "prepare" in rawDb) {
    const row = rawDb.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get() as
      | { readonly count: unknown }
      | undefined;
    return Number(row?.count ?? 0);
  }
  if ("query" in rawDb) {
    const result = (await rawDb.query(`SELECT COUNT(*) AS count FROM ${tableName}`)) as {
      readonly rows: readonly { readonly count: unknown }[];
    };
    return Number(result.rows[0]?.count ?? 0);
  }

  throw new Error("Unsupported test database");
}
