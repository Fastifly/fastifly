import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createConfiguredSqliteClient,
  createPglitePostgresDatabaseFromClient,
  createPostgresAccountRepository,
  createSqliteAccountRepository,
  type PglitePostgresClient,
  SEED_IDS,
  type SqliteClient,
  seedPostgresDatabase,
  seedSqlite,
} from "../index.js";
import {
  createInMemoryPostgresDatabase,
  runPostgresMigrations,
  runSqliteMigrations,
} from "../testing/migrations.js";

type SeedTestContext = {
  readonly countRows: (tableName: SeedCountTable) => Promise<number>;
  readonly readCheckingBalance: () => Promise<bigint | null>;
  readonly runSeed: () => Promise<void>;
};

type SeedCountTable =
  | "accounts"
  | "balance_recalculation_queue"
  | "currencies"
  | "transaction_groups"
  | "users"
  | "workspace_members";

const expectedSeededAccountCount = 13;
const expectedSeededTransactionCount = 18;

describe("seed data", () => {
  it("seeds deterministic full demo data idempotently on SQLite", async () => {
    const sqliteDir = mkdtempSync(join(tmpdir(), "fastifly-seed-sqlite-"));
    const client = createConfiguredSqliteClient({ source: join(sqliteDir, "test.db") });

    try {
      runSqliteMigrations(client);
      await assertFullSeedIsIdempotent(createSqliteSeedContext(client));
    } finally {
      client.close();
      rmSync(sqliteDir, { force: true, recursive: true });
    }
  });

  it("seeds deterministic full demo data idempotently on PostgreSQL", async () => {
    const client = await createInMemoryPostgresDatabase();

    try {
      await runPostgresMigrations(client);
      await assertFullSeedIsIdempotent(createPostgresSeedContext(client));
    } finally {
      await client.close();
    }
  });
});

async function assertFullSeedIsIdempotent(context: SeedTestContext): Promise<void> {
  await context.runSeed();
  await context.runSeed();

  expect(await context.countRows("currencies")).toBe(3);
  expect(await context.countRows("users")).toBe(2);
  expect(await context.countRows("workspace_members")).toBe(2);
  expect(await context.countRows("accounts")).toBe(expectedSeededAccountCount);
  expect(await context.countRows("transaction_groups")).toBe(expectedSeededTransactionCount);
  expect(await context.countRows("balance_recalculation_queue")).toBeGreaterThanOrEqual(
    expectedSeededTransactionCount,
  );
  expect(await context.readCheckingBalance()).toBe(128_061_00n);
}

function createSqliteSeedContext(client: SqliteClient): SeedTestContext {
  const accountRepository = createSqliteAccountRepository(client);

  return {
    countRows(tableName) {
      const row = client
        .prepare<unknown[], { readonly count: number }>(
          `SELECT COUNT(*) AS count FROM ${tableName}`,
        )
        .get();
      return Promise.resolve(row?.count ?? 0);
    },
    async readCheckingBalance() {
      const balance = await accountRepository.getAccountBalance({
        accountId: SEED_IDS.ACCOUNT_CHECKING,
        ledgerId: SEED_IDS.LEDGER_HOUSEHOLD,
        workspaceId: SEED_IDS.WORKSPACE_HOUSEHOLD,
      });
      return balance?.balanceMinor ?? null;
    },
    runSeed() {
      return seedSqlite(client, "e2e");
    },
  };
}

function createPostgresSeedContext(client: PglitePostgresClient): SeedTestContext {
  const db = createPglitePostgresDatabaseFromClient(client);
  const accountRepository = createPostgresAccountRepository(db);

  return {
    async countRows(tableName) {
      const result = (await client.query(`SELECT COUNT(*)::int AS count FROM ${tableName}`)) as {
        readonly rows: readonly { readonly count: unknown }[];
      };
      return Number(result.rows[0]?.count ?? 0);
    },
    async readCheckingBalance() {
      const balance = await accountRepository.getAccountBalance({
        accountId: SEED_IDS.ACCOUNT_CHECKING,
        ledgerId: SEED_IDS.LEDGER_HOUSEHOLD,
        workspaceId: SEED_IDS.WORKSPACE_HOUSEHOLD,
      });
      return balance?.balanceMinor ?? null;
    },
    runSeed() {
      return seedPostgresDatabase(db, "e2e");
    },
  };
}
