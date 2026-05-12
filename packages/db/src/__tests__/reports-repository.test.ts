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
  createPostgresReportQueryService,
  createPostgresTransactionWriteRepository,
  createSqliteAccountRepository,
  createSqliteDatabaseFromClient,
  createSqliteIdentityRepository,
  createSqliteReportQueryService,
  createSqliteTransactionWriteRepository,
  type IdentityRepository,
  type ReportQueryService,
  type SqliteClient,
  type TransactionWriteRepository,
} from "../index.js";
import {
  createInMemoryPgliteDatabase,
  runPglitePostgresMigrations,
  runSqliteMigrations,
} from "../testing/migrations.js";

type ReportsRepositoryFactory = {
  readonly name: string;
  readonly run: (test: (context: RepositoryContext) => Promise<void>) => Promise<void>;
};

type RepositoryContext = {
  readonly accountRepository: AccountRepository;
  readonly identityRepository: IdentityRepository;
  readonly reportQueryService: ReportQueryService;
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

const factories: readonly ReportsRepositoryFactory[] = [
  {
    name: "SQLite",
    async run(test) {
      const sqliteDir = mkdtempSync(join(tmpdir(), "fastifly-reports-sqlite-"));
      const client = createConfiguredSqliteClient({ source: join(sqliteDir, "test.db") });

      try {
        runSqliteMigrations(client);
        seedSqliteCurrency(client);
        const db = createSqliteDatabaseFromClient(client);
        const createId = createDeterministicIdGenerator();
        await test({
          accountRepository: createSqliteAccountRepository(client, { createId }),
          identityRepository: createSqliteIdentityRepository(db, { createId }),
          reportQueryService: createSqliteReportQueryService(client),
          transactionRepository: createSqliteTransactionWriteRepository(client, { createId }),
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
          accountRepository: createPostgresAccountRepository(db, { createId }),
          identityRepository: createPostgresIdentityRepository(db, { createId }),
          reportQueryService: createPostgresReportQueryService(db),
          transactionRepository: createPostgresTransactionWriteRepository(db, { createId }),
        });
      } finally {
        await client.close();
      }
    },
  },
];

describe("report query service", () => {
  for (const factory of factories) {
    it(`returns monthly net worth up/down trend from persisted postings on ${factory.name}`, async () => {
      await factory.run(
        async ({
          accountRepository,
          identityRepository,
          reportQueryService,
          transactionRepository,
        }) => {
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
          const cash = await accountRepository.createAccount({
            ...scope,
            currencyCode: "INR",
            kind: "asset",
            name: "Cash Wallet",
            subtype: "cash",
          });
          const groceries = await accountRepository.createAccount({
            ...scope,
            currencyCode: "INR",
            kind: "expense",
            name: "Groceries",
            subtype: "external",
          });
          const salary = await accountRepository.createAccount({
            ...scope,
            currencyCode: "INR",
            kind: "revenue",
            name: "Salary",
            subtype: "external",
          });

          await transactionRepository.createTransaction({
            currencyCode: "INR",
            description: "January salary",
            ledgerId: scope.ledgerId,
            lines: [{ amountMinor: 100_000n, destinationAccountId: bank.account.id }],
            occurredAt: "2026-01-20T09:00:00.000Z",
            sourceAccountId: salary.account.id,
            type: "income",
            workspaceId: scope.workspaceId,
          });
          await transactionRepository.createTransaction({
            currencyCode: "INR",
            description: "February groceries",
            ledgerId: scope.ledgerId,
            lines: [{ amountMinor: 15_000n, destinationAccountId: groceries.account.id }],
            occurredAt: "2026-02-10T09:00:00.000Z",
            sourceAccountId: bank.account.id,
            type: "expense",
            workspaceId: scope.workspaceId,
          });
          await transactionRepository.createTransaction({
            currencyCode: "INR",
            description: "March salary",
            ledgerId: scope.ledgerId,
            lines: [{ amountMinor: 50_000n, destinationAccountId: bank.account.id }],
            occurredAt: "2026-03-05T09:00:00.000Z",
            sourceAccountId: salary.account.id,
            type: "income",
            workspaceId: scope.workspaceId,
          });
          await transactionRepository.createTransaction({
            currencyCode: "INR",
            description: "April cash transfer",
            ledgerId: scope.ledgerId,
            lines: [{ amountMinor: 10_000n, destinationAccountId: cash.account.id }],
            occurredAt: "2026-04-12T09:00:00.000Z",
            sourceAccountId: bank.account.id,
            type: "transfer",
            workspaceId: scope.workspaceId,
          });
          await transactionRepository.createTransaction({
            currencyCode: "INR",
            description: "May groceries",
            ledgerId: scope.ledgerId,
            lines: [{ amountMinor: 7_000n, destinationAccountId: groceries.account.id }],
            occurredAt: "2026-05-02T09:00:00.000Z",
            sourceAccountId: bank.account.id,
            type: "expense",
            workspaceId: scope.workspaceId,
          });

          const report = await reportQueryService.getNetWorthTrend({
            ...scope,
            asOfDate: "2026-05-15",
            months: 4,
          });

          expect(report.currencyCode).toBe("INR");
          expect(report.months).toBe(4);
          expect(report.range).toEqual({
            fromMonth: "2026-02-01",
            toMonth: "2026-05-01",
          });
          expect(report.points.map((point) => point.monthKey)).toEqual([
            "2026-02",
            "2026-03",
            "2026-04",
            "2026-05",
          ]);
          expect(report.points.map((point) => point.changeMinor)).toEqual([
            -15_000n,
            50_000n,
            0n,
            -7_000n,
          ]);
          expect(report.points.map((point) => point.netWorthMinor)).toEqual([
            85_000n,
            135_000n,
            135_000n,
            128_000n,
          ]);
          expect(report.points.map((point) => point.direction)).toEqual([
            "down",
            "up",
            "flat",
            "down",
          ]);
        },
      );
    });
  }
});

function seedSqliteCurrency(client: SqliteClient): void {
  const now = "2026-05-10T00:00:00.000Z";
  client
    .prepare(
      "INSERT OR IGNORE INTO currencies (code, name, symbol, decimal_places, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run("INR", "Indian Rupee", "₹", 2, now, now);
}

async function seedPostgresCurrency(client: { readonly query: (sql: string) => Promise<unknown> }) {
  await client.query(`
    INSERT INTO currencies (code, name, symbol, decimal_places, created_at, updated_at)
    VALUES ('INR', 'Indian Rupee', '₹', 2, '2026-05-10T00:00:00.000Z', '2026-05-10T00:00:00.000Z')
    ON CONFLICT (code) DO NOTHING
  `);
}
