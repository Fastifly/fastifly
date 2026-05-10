import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUuidV7, type SyncedId } from "@fastifly/common";
import { describe, expect, it } from "vitest";

import {
  type AccountRepository,
  createConfiguredSqliteClient,
  createPglitePostgresDatabaseFromClient,
  createPostgresAccountRepository,
  createPostgresIdentityRepository,
  createPostgresTransactionQueryService,
  createPostgresTransactionWriteRepository,
  createSqliteAccountRepository,
  createSqliteDatabaseFromClient,
  createSqliteIdentityRepository,
  createSqliteTransactionQueryService,
  createSqliteTransactionWriteRepository,
  type IdentityRepository,
  type SqliteClient,
  type TransactionQueryService,
  type TransactionWriteRepository,
} from "../index.js";
import {
  createInMemoryPgliteDatabase,
  runPglitePostgresMigrations,
  runSqliteMigrations,
} from "../testing/migrations.js";

type TransactionsRepositoryFactory = {
  readonly name: string;
  readonly run: (test: (context: RepositoryContext) => Promise<void>) => Promise<void>;
};

type QueryablePostgres = { readonly query: (sql: string) => Promise<unknown> };

type RepositoryContext = {
  readonly accountRepository: AccountRepository;
  readonly identityRepository: IdentityRepository;
  readonly rawDb: SqliteClient | QueryablePostgres;
  readonly transactionQueryService: TransactionQueryService;
  readonly transactionRepository: TransactionWriteRepository;
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

const factories: readonly TransactionsRepositoryFactory[] = [
  {
    name: "SQLite",
    async run(test) {
      const sqliteDir = mkdtempSync(join(tmpdir(), "fastifly-transactions-sqlite-"));
      const client = createConfiguredSqliteClient({ source: join(sqliteDir, "test.db") });

      try {
        runSqliteMigrations(client);
        seedSqliteCurrency(client);
        const db = createSqliteDatabaseFromClient(client);
        const createId = createDeterministicIdGenerator();
        await test({
          accountRepository: createSqliteAccountRepository(client, {
            clock: repositoryClock,
            createId,
          }),
          identityRepository: createSqliteIdentityRepository(db, {
            clock: repositoryClock,
            createId,
          }),
          rawDb: client,
          transactionQueryService: createSqliteTransactionQueryService(client),
          transactionRepository: createSqliteTransactionWriteRepository(client, {
            clock: repositoryClock,
            createId,
          }),
        });
      } finally {
        client.close();
        rmSync(sqliteDir, { force: true, recursive: true });
      }
    },
  },
  {
    name: "PostgreSQL (PGlite)",
    async run(test) {
      const client = await createInMemoryPgliteDatabase();

      try {
        await runPglitePostgresMigrations(client);
        await seedPostgresCurrency(client);
        const db = createPglitePostgresDatabaseFromClient(client);
        const createId = createDeterministicIdGenerator();
        await test({
          accountRepository: createPostgresAccountRepository(db, {
            clock: repositoryClock,
            createId,
          }),
          identityRepository: createPostgresIdentityRepository(db, {
            clock: repositoryClock,
            createId,
          }),
          rawDb: client,
          transactionQueryService: createPostgresTransactionQueryService(db),
          transactionRepository: createPostgresTransactionWriteRepository(db, {
            clock: repositoryClock,
            createId,
          }),
        });
      } finally {
        await client.close();
      }
    },
  },
];

describe("transaction write repository", () => {
  for (const factory of factories) {
    it(`creates balanced expense postings and dirty-balance work on ${factory.name}`, async () => {
      await factory.run(
        async ({ accountRepository, identityRepository, rawDb, transactionRepository }) => {
          const { accounts, workspaceState } = await createWorkspaceAccounts(
            identityRepository,
            accountRepository,
          );

          const group = await transactionRepository.createTransaction({
            currencyCode: "inr",
            description: " Grocery run ",
            ledgerId: workspaceState.ledger.id,
            lines: [
              {
                amountMinor: 12_000n,
                destinationAccountId: accounts.groceries.id,
              },
            ],
            occurredAt: "2026-05-09T08:00:00.000Z",
            sourceAccountId: accounts.bank.id,
            title: " Saturday groceries ",
            type: "expense",
            workspaceId: workspaceState.workspace.id,
          });

          expect(group).toMatchObject({
            title: "Saturday groceries",
            type: "expense",
            workspaceId: workspaceState.workspace.id,
          });
          expect(group.journals).toHaveLength(1);
          expect(group.journals[0]?.postings.map((posting) => posting.amountMinor)).toEqual([
            -12_000n,
            12_000n,
          ]);

          expect(
            await accountRepository.getAccountBalance({
              accountId: accounts.bank.id,
              ledgerId: workspaceState.ledger.id,
              workspaceId: workspaceState.workspace.id,
            }),
          ).toMatchObject({ balanceMinor: -12_000n });
          expect(
            await accountRepository.getAccountBalance({
              accountId: accounts.groceries.id,
              ledgerId: workspaceState.ledger.id,
              workspaceId: workspaceState.workspace.id,
            }),
          ).toMatchObject({ balanceMinor: 12_000n });
          await expect(readBalanceDirtyCount(rawDb)).resolves.toBe(2);
        },
      );
    });

    it(`creates split expense groups as multiple balanced journals on ${factory.name}`, async () => {
      await factory.run(
        async ({ accountRepository, identityRepository, rawDb, transactionRepository }) => {
          const { accounts, workspaceState } = await createWorkspaceAccounts(
            identityRepository,
            accountRepository,
          );

          const group = await transactionRepository.createTransaction({
            currencyCode: "INR",
            description: "Store run",
            ledgerId: workspaceState.ledger.id,
            lines: [
              {
                amountMinor: 8_000n,
                destinationAccountId: accounts.groceries.id,
                description: "Food",
              },
              {
                amountMinor: 4_000n,
                destinationAccountId: accounts.household.id,
                description: "Household",
              },
            ],
            occurredAt: "2026-05-09T09:00:00.000Z",
            sourceAccountId: accounts.bank.id,
            type: "expense",
            workspaceId: workspaceState.workspace.id,
          });

          expect(group.type).toBe("split");
          expect(group.journals).toHaveLength(2);
          expect(group.journals.map((journal) => journal.description)).toEqual([
            "Food",
            "Household",
          ]);
          expect(
            await accountRepository.getAccountBalance({
              accountId: accounts.bank.id,
              ledgerId: workspaceState.ledger.id,
              workspaceId: workspaceState.workspace.id,
            }),
          ).toMatchObject({ balanceMinor: -12_000n });
          await expect(readBalanceDirtyCount(rawDb)).resolves.toBe(3);
        },
      );
    });

    it(`creates income and transfer transactions with the same ledger invariant on ${factory.name}`, async () => {
      await factory.run(
        async ({ accountRepository, identityRepository, transactionRepository }) => {
          const { accounts, workspaceState } = await createWorkspaceAccounts(
            identityRepository,
            accountRepository,
          );

          await transactionRepository.createTransaction({
            currencyCode: "INR",
            description: "Salary",
            ledgerId: workspaceState.ledger.id,
            lines: [{ amountMinor: 100_000n, destinationAccountId: accounts.bank.id }],
            occurredAt: "2026-05-09T10:00:00.000Z",
            sourceAccountId: accounts.salary.id,
            type: "income",
            workspaceId: workspaceState.workspace.id,
          });
          await transactionRepository.createTransaction({
            currencyCode: "INR",
            description: "Move to wallet",
            ledgerId: workspaceState.ledger.id,
            lines: [
              {
                amountMinor: 10_000n,
                budgetId: "01jv0fakebudget0000000000000" as SyncedId,
                categoryId: "01jv0fakecategory00000000000" as SyncedId,
                destinationAccountId: accounts.wallet.id,
              },
            ],
            occurredAt: "2026-05-09T11:00:00.000Z",
            sourceAccountId: accounts.bank.id,
            type: "transfer",
            workspaceId: workspaceState.workspace.id,
          });

          expect(
            await accountRepository.getAccountBalance({
              accountId: accounts.bank.id,
              ledgerId: workspaceState.ledger.id,
              workspaceId: workspaceState.workspace.id,
            }),
          ).toMatchObject({ balanceMinor: 90_000n });
          expect(
            await accountRepository.getAccountBalance({
              accountId: accounts.salary.id,
              ledgerId: workspaceState.ledger.id,
              workspaceId: workspaceState.workspace.id,
            }),
          ).toMatchObject({ balanceMinor: -100_000n });
          expect(
            await accountRepository.getAccountBalance({
              accountId: accounts.wallet.id,
              ledgerId: workspaceState.ledger.id,
              workspaceId: workspaceState.workspace.id,
            }),
          ).toMatchObject({ balanceMinor: 10_000n });
        },
      );
    });

    it(`rejects account pairs that do not match the requested type on ${factory.name}`, async () => {
      await factory.run(
        async ({ accountRepository, identityRepository, rawDb, transactionRepository }) => {
          const { accounts, workspaceState } = await createWorkspaceAccounts(
            identityRepository,
            accountRepository,
          );

          await expect(
            Promise.resolve().then(() =>
              transactionRepository.createTransaction({
                currencyCode: "INR",
                description: "Invalid direction",
                ledgerId: workspaceState.ledger.id,
                lines: [{ amountMinor: 1_000n, destinationAccountId: accounts.bank.id }],
                occurredAt: "2026-05-09T12:00:00.000Z",
                sourceAccountId: accounts.groceries.id,
                type: "expense",
                workspaceId: workspaceState.workspace.id,
              }),
            ),
          ).rejects.toThrow("Transaction accounts do not match");
          await expect(readTransactionGroupCount(rawDb)).resolves.toBe(0);
        },
      );
    });

    it(`rejects converted reporting amounts until cross-currency writes are explicit on ${factory.name}`, async () => {
      await factory.run(
        async ({ accountRepository, identityRepository, transactionRepository }) => {
          const { accounts, workspaceState } = await createWorkspaceAccounts(
            identityRepository,
            accountRepository,
          );

          await expect(
            Promise.resolve().then(() =>
              transactionRepository.createTransaction({
                currencyCode: "INR",
                description: "Converted reporting",
                ledgerId: workspaceState.ledger.id,
                lines: [
                  {
                    amountMinor: 1_000n,
                    destinationAccountId: accounts.groceries.id,
                    reportingAmountMinor: 12n,
                    reportingCurrencyCode: "USD",
                  },
                ],
                occurredAt: "2026-05-09T12:00:00.000Z",
                sourceAccountId: accounts.bank.id,
                type: "expense",
                workspaceId: workspaceState.workspace.id,
              }),
            ),
          ).rejects.toThrow("Converted reporting amounts require cross-currency");
        },
      );
    });

    it(`lists transaction groups with stable ordering and nested postings on ${factory.name}`, async () => {
      await factory.run(
        async ({
          accountRepository,
          identityRepository,
          transactionQueryService,
          transactionRepository,
        }) => {
          const { accounts, workspaceState } = await createWorkspaceAccounts(
            identityRepository,
            accountRepository,
          );
          const openingBalanceAccount = await accountRepository.createAccount({
            currencyCode: "INR",
            kind: "asset",
            ledgerId: workspaceState.ledger.id,
            name: "Starting balance account",
            openingBalanceDate: "2026-05-01",
            openingBalanceMinor: 25_000n,
            subtype: "bank",
            workspaceId: workspaceState.workspace.id,
          });
          await transactionRepository.createTransaction({
            currencyCode: "INR",
            description: "Early groceries",
            ledgerId: workspaceState.ledger.id,
            lines: [{ amountMinor: 5_000n, destinationAccountId: accounts.groceries.id }],
            occurredAt: "2026-05-08T09:00:00.000Z",
            sourceAccountId: accounts.bank.id,
            type: "expense",
            workspaceId: workspaceState.workspace.id,
          });
          const latest = await transactionRepository.createTransaction({
            currencyCode: "INR",
            description: "Latest split",
            ledgerId: workspaceState.ledger.id,
            lines: [
              { amountMinor: 8_000n, destinationAccountId: accounts.groceries.id },
              { amountMinor: 4_000n, destinationAccountId: accounts.household.id },
            ],
            occurredAt: "2026-05-09T09:00:00.000Z",
            sourceAccountId: accounts.bank.id,
            type: "expense",
            workspaceId: workspaceState.workspace.id,
          });

          const groups = await transactionQueryService.listTransactionGroups({
            ledgerId: workspaceState.ledger.id,
            limit: 10,
            workspaceId: workspaceState.workspace.id,
          });

          expect(openingBalanceAccount.openingBalanceGroupId).not.toBeNull();
          expect(groups.items.map((group) => group.title)).toEqual([
            "Latest split",
            "Early groceries",
          ]);
          await expect(
            transactionQueryService.getTransactionGroup({
              ledgerId: workspaceState.ledger.id,
              transactionGroupId: openingBalanceAccount.openingBalanceGroupId as SyncedId,
              workspaceId: workspaceState.workspace.id,
            }),
          ).resolves.toBeNull();
          expect(groups.items[0]).toMatchObject({
            id: latest.id,
            type: "split",
            journals: [
              { postings: [{ amountMinor: -8_000n }, { amountMinor: 8_000n }] },
              { postings: [{ amountMinor: -4_000n }, { amountMinor: 4_000n }] },
            ],
          });
        },
      );
    });

    it(`paginates tied transaction timestamps by group id on ${factory.name}`, async () => {
      await factory.run(
        async ({
          accountRepository,
          identityRepository,
          transactionQueryService,
          transactionRepository,
        }) => {
          const { accounts, workspaceState } = await createWorkspaceAccounts(
            identityRepository,
            accountRepository,
          );
          const first = await transactionRepository.createTransaction({
            currencyCode: "INR",
            description: "Tie one",
            ledgerId: workspaceState.ledger.id,
            lines: [{ amountMinor: 1_000n, destinationAccountId: accounts.groceries.id }],
            occurredAt: "2026-05-09T09:00:00.000Z",
            sourceAccountId: accounts.bank.id,
            type: "expense",
            workspaceId: workspaceState.workspace.id,
          });
          const second = await transactionRepository.createTransaction({
            currencyCode: "INR",
            description: "Tie two",
            ledgerId: workspaceState.ledger.id,
            lines: [{ amountMinor: 2_000n, destinationAccountId: accounts.groceries.id }],
            occurredAt: "2026-05-09T09:00:00.000Z",
            sourceAccountId: accounts.bank.id,
            type: "expense",
            workspaceId: workspaceState.workspace.id,
          });
          const third = await transactionRepository.createTransaction({
            currencyCode: "INR",
            description: "Tie three",
            ledgerId: workspaceState.ledger.id,
            lines: [{ amountMinor: 3_000n, destinationAccountId: accounts.groceries.id }],
            occurredAt: "2026-05-09T09:00:00.000Z",
            sourceAccountId: accounts.bank.id,
            type: "expense",
            workspaceId: workspaceState.workspace.id,
          });

          const firstPage = await transactionQueryService.listTransactionGroups({
            ledgerId: workspaceState.ledger.id,
            limit: 2,
            workspaceId: workspaceState.workspace.id,
          });

          expect(firstPage.items.map((group) => group.id)).toEqual([third.id, second.id]);
          expect(firstPage.hasNextPage).toBe(true);
          expect(firstPage.nextCursor).not.toBeNull();

          const secondPage = await transactionQueryService.listTransactionGroups({
            cursor: firstPage.nextCursor,
            ledgerId: workspaceState.ledger.id,
            limit: 2,
            workspaceId: workspaceState.workspace.id,
          });

          expect(secondPage.items.map((group) => group.id)).toEqual([first.id]);
          expect(secondPage.hasNextPage).toBe(false);
          expect(secondPage.nextCursor).toBeNull();
        },
      );
    });

    it(`filters transactions by account, type, status, and occurred date on ${factory.name}`, async () => {
      await factory.run(
        async ({
          accountRepository,
          identityRepository,
          transactionQueryService,
          transactionRepository,
        }) => {
          const { accounts, workspaceState } = await createWorkspaceAccounts(
            identityRepository,
            accountRepository,
          );
          await transactionRepository.createTransaction({
            currencyCode: "INR",
            description: "Groceries",
            ledgerId: workspaceState.ledger.id,
            lines: [{ amountMinor: 5_000n, destinationAccountId: accounts.groceries.id }],
            occurredAt: "2026-05-07T09:00:00.000Z",
            sourceAccountId: accounts.bank.id,
            status: "pending",
            type: "expense",
            workspaceId: workspaceState.workspace.id,
          });
          await transactionRepository.createTransaction({
            currencyCode: "INR",
            description: "Household",
            ledgerId: workspaceState.ledger.id,
            lines: [{ amountMinor: 4_000n, destinationAccountId: accounts.household.id }],
            occurredAt: "2026-05-09T09:00:00.000Z",
            sourceAccountId: accounts.bank.id,
            type: "expense",
            workspaceId: workspaceState.workspace.id,
          });
          await transactionRepository.createTransaction({
            currencyCode: "INR",
            description: "Mixed store run",
            ledgerId: workspaceState.ledger.id,
            lines: [
              { amountMinor: 2_000n, destinationAccountId: accounts.groceries.id },
              { amountMinor: 3_000n, destinationAccountId: accounts.household.id },
            ],
            occurredAt: "2026-05-07T10:00:00.000Z",
            sourceAccountId: accounts.bank.id,
            status: "pending",
            type: "expense",
            workspaceId: workspaceState.workspace.id,
          });

          const filtered = await transactionQueryService.listTransactionGroups({
            accountId: accounts.groceries.id,
            fromOccurredAt: "2026-05-07T00:00:00.000Z",
            ledgerId: workspaceState.ledger.id,
            status: "pending",
            toOccurredAt: "2026-05-08T00:00:00.000Z",
            type: "expense",
            workspaceId: workspaceState.workspace.id,
          });

          expect(filtered.items.map((group) => group.title)).toEqual([
            "Mixed store run",
            "Groceries",
          ]);
          expect(filtered.items[0]?.journals).toHaveLength(1);
          expect(filtered.items[0]?.journals[0]?.description).toBe("Mixed store run");
          expect(filtered.items[0]?.journals[0]?.postings).toHaveLength(2);
        },
      );
    });

    it(`returns transaction detail scoped by workspace and ledger on ${factory.name}`, async () => {
      await factory.run(
        async ({
          accountRepository,
          identityRepository,
          transactionQueryService,
          transactionRepository,
        }) => {
          const { accounts, workspaceState } = await createWorkspaceAccounts(
            identityRepository,
            accountRepository,
          );
          const group = await transactionRepository.createTransaction({
            currencyCode: "INR",
            description: "Detail transaction",
            ledgerId: workspaceState.ledger.id,
            lines: [{ amountMinor: 6_000n, destinationAccountId: accounts.groceries.id }],
            occurredAt: "2026-05-09T09:00:00.000Z",
            sourceAccountId: accounts.bank.id,
            type: "expense",
            workspaceId: workspaceState.workspace.id,
          });

          await expect(
            transactionQueryService.getTransactionGroup({
              ledgerId: workspaceState.ledger.id,
              transactionGroupId: group.id,
              workspaceId: workspaceState.workspace.id,
            }),
          ).resolves.toMatchObject({
            id: group.id,
            journals: [{ description: "Detail transaction" }],
          });
          await expect(
            transactionQueryService.getTransactionGroup({
              ledgerId: workspaceState.ledger.id,
              transactionGroupId: group.id,
              workspaceId: "01jv0wrongworkspace000000000" as SyncedId,
            }),
          ).resolves.toBeNull();
        },
      );
    });
  }
});

async function createWorkspaceAccounts(
  identityRepository: IdentityRepository,
  accountRepository: AccountRepository,
) {
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
  const wallet = await accountRepository.createAccount({
    ...scope,
    currencyCode: "INR",
    kind: "asset",
    name: "Wallet",
    subtype: "wallet",
  });
  const groceries = await accountRepository.createAccount({
    ...scope,
    currencyCode: "INR",
    kind: "expense",
    name: "Groceries",
    subtype: "external",
  });
  const household = await accountRepository.createAccount({
    ...scope,
    currencyCode: "INR",
    kind: "expense",
    name: "Household",
    subtype: "external",
  });
  const salary = await accountRepository.createAccount({
    ...scope,
    currencyCode: "INR",
    kind: "revenue",
    name: "Salary",
    subtype: "external",
  });

  return {
    accounts: {
      bank: bank.account,
      groceries: groceries.account,
      household: household.account,
      salary: salary.account,
      wallet: wallet.account,
    },
    workspaceState,
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

async function readBalanceDirtyCount(rawDb: SqliteClient | QueryablePostgres): Promise<number> {
  if ("prepare" in rawDb) {
    const row = rawDb
      .prepare<unknown[], { readonly total: number }>(
        `SELECT COUNT(*) AS total FROM balance_recalculation_queue`,
      )
      .get();
    return row?.total ?? 0;
  }

  const result = await rawDb.query(
    `SELECT COUNT(*)::int AS total FROM balance_recalculation_queue`,
  );
  return readCount(result);
}

async function readTransactionGroupCount(rawDb: SqliteClient | QueryablePostgres): Promise<number> {
  if ("prepare" in rawDb) {
    const row = rawDb
      .prepare<unknown[], { readonly total: number }>(
        `SELECT COUNT(*) AS total FROM transaction_groups`,
      )
      .get();
    return row?.total ?? 0;
  }

  const result = await rawDb.query(`SELECT COUNT(*)::int AS total FROM transaction_groups`);
  return readCount(result);
}

function readCount(result: unknown): number {
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { readonly rows?: readonly { readonly total?: unknown }[] }).rows;
    const total = rows?.[0]?.total;
    return typeof total === "number" ? total : Number(total ?? 0);
  }

  return 0;
}
