import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUuidV7, parseFinanceCursor, type SyncedId } from "@fastifly/common";
import { describe, expect, it } from "vitest";

import {
  type AccountRepository,
  type BudgetQueryService,
  createConfiguredSqliteClient,
  createPglitePostgresDatabaseFromClient,
  createPostgresAccountRepository,
  createPostgresBudgetQueryService,
  createPostgresIdentityRepository,
  createPostgresTransactionWriteRepository,
  createSqliteAccountRepository,
  createSqliteBudgetQueryService,
  createSqliteDatabaseFromClient,
  createSqliteIdentityRepository,
  createSqliteTransactionWriteRepository,
  type IdentityRepository,
  type SqliteClient,
  type TransactionWriteRepository,
} from "../index.js";
import {
  createInMemoryPgliteDatabase,
  runPglitePostgresMigrations,
  runSqliteMigrations,
} from "../testing/migrations.js";

type BudgetsRepositoryFactory = {
  readonly name: string;
  readonly run: (test: (context: RepositoryContext) => Promise<void>) => Promise<void>;
};

type QueryablePostgres = { readonly query: (sql: string) => Promise<unknown> };

type RepositoryContext = {
  readonly accountRepository: AccountRepository;
  readonly budgetQueryService: BudgetQueryService;
  readonly identityRepository: IdentityRepository;
  readonly rawDb: SqliteClient | QueryablePostgres;
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

const factories: readonly BudgetsRepositoryFactory[] = [
  {
    name: "SQLite",
    async run(test) {
      const sqliteDir = mkdtempSync(join(tmpdir(), "fastifly-budgets-sqlite-"));
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
          budgetQueryService: createSqliteBudgetQueryService(client),
          identityRepository: createSqliteIdentityRepository(db, {
            clock: repositoryClock,
            createId,
          }),
          rawDb: client,
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
          budgetQueryService: createPostgresBudgetQueryService(db),
          identityRepository: createPostgresIdentityRepository(db, {
            clock: repositoryClock,
            createId,
          }),
          rawDb: client,
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

describe("budget query service", () => {
  for (const factory of factories) {
    it(`lists budgets with active period totals and spent progress on ${factory.name}`, async () => {
      await factory.run(
        async ({
          accountRepository,
          budgetQueryService,
          identityRepository,
          rawDb,
          transactionRepository,
        }) => {
          const { accounts, workspaceState } = await createWorkspaceAccounts(
            identityRepository,
            accountRepository,
          );
          const scope = {
            ledgerId: workspaceState.ledger.id,
            workspaceId: workspaceState.workspace.id,
          };

          const foodBudgetId = createUuidV7();
          await insertBudget(rawDb, {
            currencyCode: "INR",
            id: foodBudgetId,
            ledgerId: scope.ledgerId,
            name: "Monthly food",
            period: "monthly",
            workspaceId: scope.workspaceId,
          });
          await insertBudgetLimit(rawDb, {
            amountMinor: 25_000n,
            budgetId: foodBudgetId,
            endDate: "2026-05-31",
            startDate: "2026-05-01",
          });

          await transactionRepository.createTransaction({
            currencyCode: "INR",
            description: "Groceries",
            ledgerId: scope.ledgerId,
            lines: [
              {
                amountMinor: 18_000n,
                budgetId: foodBudgetId,
                destinationAccountId: accounts.groceries.id,
              },
            ],
            occurredAt: "2026-05-09T08:00:00.000Z",
            sourceAccountId: accounts.bank.id,
            type: "expense",
            workspaceId: scope.workspaceId,
          });
          await transactionRepository.createTransaction({
            currencyCode: "INR",
            description: "Older groceries",
            ledgerId: scope.ledgerId,
            lines: [
              {
                amountMinor: 4_000n,
                budgetId: foodBudgetId,
                destinationAccountId: accounts.groceries.id,
              },
            ],
            occurredAt: "2026-04-30T08:00:00.000Z",
            sourceAccountId: accounts.bank.id,
            type: "expense",
            workspaceId: scope.workspaceId,
          });

          const page = await budgetQueryService.listBudgets({
            ...scope,
            asOfDate: "2026-05-09",
          });

          expect(page.items).toHaveLength(1);
          expect(page.items[0]).toMatchObject({
            currencyCode: "INR",
            id: foodBudgetId,
            limitMinor: 25_000n,
            remainingMinor: 7_000n,
            spentMinor: 18_000n,
          });
        },
      );
    });

    it(`paginates budgets by stable name cursor order on ${factory.name}`, async () => {
      await factory.run(
        async ({ accountRepository, budgetQueryService, identityRepository, rawDb }) => {
          const { workspaceState } = await createWorkspaceAccounts(
            identityRepository,
            accountRepository,
          );
          const scope = {
            ledgerId: workspaceState.ledger.id,
            workspaceId: workspaceState.workspace.id,
          };
          const foodBudgetId = createUuidV7();
          const travelBudgetId = createUuidV7();

          await insertBudget(rawDb, {
            currencyCode: "INR",
            id: travelBudgetId,
            ledgerId: scope.ledgerId,
            name: "Travel",
            period: "monthly",
            workspaceId: scope.workspaceId,
          });
          await insertBudget(rawDb, {
            currencyCode: "INR",
            id: foodBudgetId,
            ledgerId: scope.ledgerId,
            name: "Food",
            period: "monthly",
            workspaceId: scope.workspaceId,
          });
          await insertBudgetLimit(rawDb, {
            amountMinor: 10_000n,
            budgetId: travelBudgetId,
            endDate: "2026-05-31",
            startDate: "2026-05-01",
          });
          await insertBudgetLimit(rawDb, {
            amountMinor: 8_000n,
            budgetId: foodBudgetId,
            endDate: "2026-05-31",
            startDate: "2026-05-01",
          });

          const firstPage = await budgetQueryService.listBudgets({
            ...scope,
            asOfDate: "2026-05-09",
            limit: 1,
          });
          expect(firstPage.items.map((item) => item.name)).toEqual(["Food"]);
          expect(firstPage.hasNextPage).toBe(true);
          expect(firstPage.nextCursor).not.toBeNull();
          const parsedCursor = parseFinanceCursor(firstPage.nextCursor ?? "", "budget.name.asc");
          expect(parsedCursor.kind).toBe("budget.name.asc");

          const secondPage = await budgetQueryService.listBudgets({
            ...scope,
            asOfDate: "2026-05-09",
            cursor: firstPage.nextCursor,
            limit: 10,
          });
          expect(secondPage.items.map((item) => item.name)).toEqual(["Travel"]);
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
    workspaceState,
  };
}

type BudgetInsertInput = {
  readonly currencyCode: string;
  readonly id: SyncedId;
  readonly ledgerId: SyncedId;
  readonly name: string;
  readonly period: "monthly" | "weekly" | "quarterly";
  readonly workspaceId: SyncedId;
};

type BudgetLimitInsertInput = {
  readonly amountMinor: bigint;
  readonly budgetId: SyncedId;
  readonly endDate: string;
  readonly startDate: string;
};

async function insertBudget(rawDb: SqliteClient | QueryablePostgres, input: BudgetInsertInput) {
  if ("prepare" in rawDb) {
    rawDb
      .prepare(
        `
          INSERT INTO budgets (
            id, workspace_id, ledger_id, name, currency_code, period, rollover_enabled, archived_at, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)
        `,
      )
      .run(
        input.id,
        input.workspaceId,
        input.ledgerId,
        input.name,
        input.currencyCode,
        input.period,
        "2026-05-09T00:00:00.000Z",
        "2026-05-09T00:00:00.000Z",
      );
    return;
  }

  await rawDb.query(`
    INSERT INTO budgets (
      id, workspace_id, ledger_id, name, currency_code, period, rollover_enabled, archived_at, created_at, updated_at
    )
    VALUES (
      '${input.id}',
      '${input.workspaceId}',
      '${input.ledgerId}',
      '${escapeSqlLiteral(input.name)}',
      '${input.currencyCode}',
      '${input.period}',
      false,
      NULL,
      '2026-05-09T00:00:00.000Z',
      '2026-05-09T00:00:00.000Z'
    )
  `);
}

async function insertBudgetLimit(
  rawDb: SqliteClient | QueryablePostgres,
  input: BudgetLimitInsertInput,
) {
  const id = createUuidV7();
  if ("prepare" in rawDb) {
    rawDb
      .prepare(
        `
          INSERT INTO budget_limits (
            id, budget_id, category_id, amount_minor, currency_code, start_date, end_date, created_at, updated_at
          )
          VALUES (?, ?, NULL, ?, 'INR', ?, ?, ?, ?)
        `,
      )
      .run(
        id,
        input.budgetId,
        input.amountMinor,
        input.startDate,
        input.endDate,
        "2026-05-09T00:00:00.000Z",
        "2026-05-09T00:00:00.000Z",
      );
    return;
  }

  await rawDb.query(`
    INSERT INTO budget_limits (
      id, budget_id, category_id, amount_minor, currency_code, start_date, end_date, created_at, updated_at
    )
    VALUES (
      '${id}',
      '${input.budgetId}',
      NULL,
      '${input.amountMinor.toString()}',
      'INR',
      '${input.startDate}',
      '${input.endDate}',
      '2026-05-09T00:00:00.000Z',
      '2026-05-09T00:00:00.000Z'
    )
  `);
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

function escapeSqlLiteral(value: string): string {
  return value.replaceAll("'", "''");
}
