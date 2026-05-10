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
  createSqliteAccountRepository,
  createSqliteDatabaseFromClient,
  createSqliteIdentityRepository,
  type IdentityRepository,
  type SqliteClient,
} from "../index.js";
import {
  createInMemoryPostgresDatabase,
  runPostgresMigrations,
  runSqliteMigrations,
} from "../testing/migrations.js";

type AccountsRepositoryFactory = {
  readonly name: string;
  readonly run: (test: (context: RepositoryContext) => Promise<void>) => Promise<void>;
};

type RepositoryContext = {
  readonly accountRepository: AccountRepository;
  readonly identityRepository: IdentityRepository;
  readonly rawDb: SqliteClient | { readonly query: (sql: string) => Promise<unknown> };
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

const factories: readonly AccountsRepositoryFactory[] = [
  {
    name: "SQLite",
    async run(test) {
      const sqliteDir = mkdtempSync(join(tmpdir(), "fastifly-accounts-sqlite-"));
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
        });
      } finally {
        await client.close();
      }
    },
  },
];

describe("account repository", () => {
  for (const factory of factories) {
    it(`creates accounts and opening-balance ledger entries on ${factory.name}`, async () => {
      await factory.run(async ({ accountRepository, identityRepository, rawDb }) => {
        const { user, workspaceState } = await createBaseState(identityRepository);
        const result = await accountRepository.createAccount({
          createdBy: user.id,
          currencyCode: "inr",
          kind: "asset",
          ledgerId: workspaceState.ledger.id,
          name: " Checking ",
          openingBalanceDate: "2026-05-01",
          openingBalanceMinor: 250_000n,
          subtype: "bank",
          workspaceId: workspaceState.workspace.id,
        });

        expect(result.account).toMatchObject({
          currencyCode: "INR",
          isActive: true,
          kind: "asset",
          name: "Checking",
          openingBalanceDate: "2026-05-01",
          openingBalanceMinor: 250_000n,
          subtype: "bank",
        });
        expect(result.openingBalanceGroupId).not.toBeNull();
        expect(result.openingBalanceJournalId).not.toBeNull();

        expect(
          await accountRepository.findAccount({
            accountId: result.account.id,
            ledgerId: workspaceState.ledger.id,
            workspaceId: workspaceState.workspace.id,
          }),
        ).toMatchObject({ id: result.account.id, name: "Checking" });

        expect(
          await accountRepository.getAccountBalance({
            accountId: result.account.id,
            ledgerId: workspaceState.ledger.id,
            workspaceId: workspaceState.workspace.id,
          }),
        ).toMatchObject({
          accountId: result.account.id,
          balanceMinor: 250_000n,
          currencyCode: "INR",
          reportingBalanceMinor: 250_000n,
          reportingCurrencyCode: "INR",
        });

        const ledgerEntries = await readOpeningBalanceLedgerEntries(rawDb);
        expect(ledgerEntries).toEqual({
          journals: 1,
          postings: 2,
          postingSum: 0n,
        });

        const accounts = await accountRepository.listAccounts({
          ledgerId: workspaceState.ledger.id,
          workspaceId: workspaceState.workspace.id,
        });
        expect(accounts.items.map((account) => account.name)).toEqual(["Checking"]);
      });
    });

    it(`paginates accounts by stable name and id cursor order on ${factory.name}`, async () => {
      await factory.run(async ({ accountRepository, identityRepository }) => {
        const { workspaceState } = await createBaseState(identityRepository);
        await accountRepository.createAccount({
          currencyCode: "INR",
          kind: "asset",
          ledgerId: workspaceState.ledger.id,
          name: "Cash A",
          subtype: "cash",
          workspaceId: workspaceState.workspace.id,
        });
        await accountRepository.createAccount({
          currencyCode: "INR",
          kind: "asset",
          ledgerId: workspaceState.ledger.id,
          name: "Cash B",
          subtype: "wallet",
          workspaceId: workspaceState.workspace.id,
        });
        await accountRepository.createAccount({
          currencyCode: "INR",
          kind: "asset",
          ledgerId: workspaceState.ledger.id,
          name: "Cash C",
          subtype: "bank",
          workspaceId: workspaceState.workspace.id,
        });

        const firstPage = await accountRepository.listAccounts({
          ledgerId: workspaceState.ledger.id,
          limit: 2,
          workspaceId: workspaceState.workspace.id,
        });

        expect(firstPage.items).toHaveLength(2);
        expect(firstPage.items.map((account) => account.name)).toEqual(["Cash A", "Cash B"]);
        expect(firstPage.hasNextPage).toBe(true);
        expect(firstPage.nextCursor).not.toBeNull();

        const secondPage = await accountRepository.listAccounts({
          cursor: firstPage.nextCursor,
          ledgerId: workspaceState.ledger.id,
          limit: 2,
          workspaceId: workspaceState.workspace.id,
        });

        expect(secondPage.items.map((account) => account.name)).toEqual(["Cash C"]);
        expect(secondPage.hasNextPage).toBe(false);
        expect(secondPage.nextCursor).toBeNull();
      });
    });

    it(`treats a zero opening balance as an explicit opening-balance event on ${factory.name}`, async () => {
      await factory.run(async ({ accountRepository, identityRepository }) => {
        const { workspaceState } = await createBaseState(identityRepository);
        const result = await accountRepository.createAccount({
          currencyCode: "INR",
          kind: "asset",
          ledgerId: workspaceState.ledger.id,
          name: "Wallet",
          openingBalanceDate: "2026-05-02",
          openingBalanceMinor: 0n,
          subtype: "wallet",
          workspaceId: workspaceState.workspace.id,
        });

        expect(result.openingBalanceGroupId).not.toBeNull();
        expect(
          await accountRepository.getAccountBalance({
            accountId: result.account.id,
            ledgerId: workspaceState.ledger.id,
            workspaceId: workspaceState.workspace.id,
          }),
        ).toMatchObject({ balanceMinor: 0n, reportingBalanceMinor: 0n });
      });
    });

    it(`archives accounts idempotently without deleting ledger history on ${factory.name}`, async () => {
      await factory.run(async ({ accountRepository, identityRepository }) => {
        const { workspaceState } = await createBaseState(identityRepository);
        const result = await accountRepository.createAccount({
          currencyCode: "INR",
          kind: "asset",
          ledgerId: workspaceState.ledger.id,
          name: "Cash",
          subtype: "cash",
          workspaceId: workspaceState.workspace.id,
        });
        const scope = {
          accountId: result.account.id,
          ledgerId: workspaceState.ledger.id,
          workspaceId: workspaceState.workspace.id,
        };

        expect(await accountRepository.archiveAccount(scope)).toMatchObject({
          archivedAt: "2026-05-09T10:11:12.000Z",
          id: result.account.id,
          isActive: false,
        });
        expect(await accountRepository.archiveAccount(scope)).toBeNull();
        expect(await accountRepository.findAccount(scope)).toMatchObject({
          id: result.account.id,
          isActive: false,
        });
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

async function seedPostgresCurrency(client: { readonly query: (sql: string) => Promise<unknown> }) {
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

async function readOpeningBalanceLedgerEntries(
  rawDb: SqliteClient | { readonly query: (sql: string) => Promise<unknown> },
) {
  if ("prepare" in rawDb) {
    const row = rawDb
      .prepare<
        unknown[],
        { readonly journals: number; readonly postings: number; readonly posting_sum: number }
      >(
        `
          SELECT
            COUNT(DISTINCT transaction_journals.id) AS journals,
            COUNT(transaction_postings.id) AS postings,
            COALESCE(SUM(transaction_postings.amount_minor), 0) AS posting_sum
          FROM transaction_journals
          JOIN transaction_postings
            ON transaction_postings.journal_id = transaction_journals.id
          WHERE transaction_journals.type = 'opening_balance'
        `,
      )
      .get();

    return {
      journals: row?.journals ?? 0,
      postings: row?.postings ?? 0,
      postingSum: BigInt(row?.posting_sum ?? 0),
    };
  }

  const result = await rawDb.query(`
    SELECT
      COUNT(DISTINCT transaction_journals.id)::int AS journals,
      COUNT(transaction_postings.id)::int AS postings,
      COALESCE(SUM(transaction_postings.amount_minor), 0)::bigint AS posting_sum
    FROM transaction_journals
    JOIN transaction_postings
      ON transaction_postings.journal_id = transaction_journals.id
    WHERE transaction_journals.type = 'opening_balance'
  `);
  const row = getRows(result)[0] as
    | {
        readonly journals: number;
        readonly postings: number;
        readonly posting_sum: bigint | number | string;
      }
    | undefined;

  return {
    journals: row?.journals ?? 0,
    postings: row?.postings ?? 0,
    postingSum: BigInt(row?.posting_sum ?? 0),
  };
}

function getRows(result: unknown): readonly unknown[] {
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { readonly rows?: unknown }).rows;
    return Array.isArray(rows) ? rows : [];
  }

  return [];
}
