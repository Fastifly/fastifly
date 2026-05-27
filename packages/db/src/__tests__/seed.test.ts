import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verify } from "@node-rs/argon2";
import { describe, expect, it } from "vitest";

import {
  cleanPglitePostgres,
  cleanSqlite,
  createConfiguredSqliteClient,
  createPglitePostgresDatabaseFromClient,
  createPostgresAccountRepository,
  createPostgresReportQueryService,
  createSqliteAccountRepository,
  createSqliteReportQueryService,
  type PglitePostgresClient,
  SEED_CREDENTIALS,
  SEED_IDS,
  type SqliteClient,
  seedId,
  seedPostgresDatabase,
  seedSqlite,
} from "../index.js";
import {
  createInMemoryPgliteDatabase,
  runPglitePostgresMigrations,
  runSqliteMigrations,
} from "../testing/migrations.js";

type SeedTestContext = {
  readonly clean: () => Promise<void>;
  readonly countRows: (tableName: SeedCountTable) => Promise<number>;
  readonly readNetWorthTrend: () => Promise<readonly SeedNetWorthPoint[]>;
  readonly readScenarioSummary: () => Promise<SeedScenarioSummary>;
  readonly readCheckingBalance: () => Promise<bigint | null>;
  readonly readUserPasswordHash: (username: string) => Promise<string | null>;
  readonly runSeed: () => Promise<void>;
};

type SeedNetWorthPoint = {
  readonly monthKey: string;
  readonly netWorthMinor: bigint;
};

type SeedScenarioSummary = {
  readonly distinctMonths: number;
  readonly expenseCount: number;
  readonly incomeCount: number;
  readonly pendingCount: number;
  readonly splitCount: number;
  readonly transferCount: number;
};

type SeedCountTable =
  | "accounts"
  | "balance_recalculation_queue"
  | "currencies"
  | "transaction_groups"
  | "users"
  | "workspace_members";

const expectedSeededAccountCount: number = 15;
const expectedSeededTransactionCount: number = 41;

describe("seed data", () => {
  it("seeds full demo data idempotently on SQLite", async () => {
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

  it("seeds full demo data idempotently on PostgreSQL", async () => {
    const client = await createInMemoryPgliteDatabase();

    try {
      await runPglitePostgresMigrations(client);
      await assertFullSeedIsIdempotent(createPostgresSeedContext(client));
    } finally {
      await client.close();
    }
  });

  it("reuses existing SQLite owner user by username during e2e seed", async () => {
    const sqliteDir = mkdtempSync(join(tmpdir(), "fastifly-seed-sqlite-owner-"));
    const client = createConfiguredSqliteClient({ source: join(sqliteDir, "test.db") });

    try {
      runSqliteMigrations(client);
      const legacyOwnerId = seedId(9_991);
      insertSqliteLegacyOwner(client, legacyOwnerId);

      await seedSqlite(client, "e2e");

      expect(readSqliteOwnerRowCount(client)).toBe(1);
      expect(readSqliteOwnerId(client)).toBe(legacyOwnerId);
    } finally {
      client.close();
      rmSync(sqliteDir, { force: true, recursive: true });
    }
  });

  it("reuses existing PostgreSQL owner user by username during e2e seed", async () => {
    const client = await createInMemoryPgliteDatabase();

    try {
      await runPglitePostgresMigrations(client);
      const legacyOwnerId = seedId(9_992);
      await insertPostgresLegacyOwner(client, legacyOwnerId);

      await seedPostgresDatabase(createPglitePostgresDatabaseFromClient(client), "e2e");

      await expect(readPostgresOwnerRowCount(client)).resolves.toBe(1);
      await expect(readPostgresOwnerId(client)).resolves.toBe(legacyOwnerId);
    } finally {
      await client.close();
    }
  });
});

async function assertFullSeedIsIdempotent(context: SeedTestContext): Promise<void> {
  await context.runSeed();
  await context.runSeed();

  await assertSeededRows(context);
  await assertSeededCredentials(context);
  await assertNetWorthMilestones(context);
  expect(await context.readCheckingBalance()).toBe(275_581_00n);

  await context.clean();

  expect(await context.countRows("currencies")).toBe(0);
  expect(await context.countRows("users")).toBe(0);
  expect(await context.countRows("workspace_members")).toBe(0);
  expect(await context.countRows("accounts")).toBe(0);
  expect(await context.countRows("transaction_groups")).toBe(0);
  expect(await context.countRows("balance_recalculation_queue")).toBe(0);

  await context.runSeed();
  await assertSeededRows(context);
  await assertSeededCredentials(context);
  await assertNetWorthMilestones(context);
  expect(await context.readCheckingBalance()).toBe(275_581_00n);
}

async function assertSeededRows(context: SeedTestContext): Promise<void> {
  expect(await context.countRows("currencies")).toBe(3);
  expect(await context.countRows("users")).toBe(2);
  expect(await context.countRows("workspace_members")).toBe(2);
  expect(await context.countRows("accounts")).toBe(expectedSeededAccountCount);
  expect(await context.countRows("transaction_groups")).toBe(expectedSeededTransactionCount);
  expect(await context.countRows("balance_recalculation_queue")).toBeGreaterThanOrEqual(
    expectedSeededTransactionCount,
  );

  const summary = await context.readScenarioSummary();
  expect(summary.distinctMonths).toBeGreaterThanOrEqual(7);
  expect(summary.expenseCount).toBeGreaterThan(0);
  expect(summary.incomeCount).toBeGreaterThan(0);
  expect(summary.transferCount).toBeGreaterThan(0);
  expect(summary.splitCount).toBeGreaterThan(0);
  expect(summary.pendingCount).toBeGreaterThan(0);
}

async function assertSeededCredentials(context: SeedTestContext): Promise<void> {
  const ownerPasswordHash = await context.readUserPasswordHash(SEED_CREDENTIALS.owner.username);
  const partnerPasswordHash = await context.readUserPasswordHash(SEED_CREDENTIALS.partner.username);

  expect(ownerPasswordHash).not.toBeNull();
  expect(partnerPasswordHash).not.toBeNull();
  await expect(verify(ownerPasswordHash ?? "", SEED_CREDENTIALS.owner.password)).resolves.toBe(
    true,
  );
  await expect(verify(partnerPasswordHash ?? "", SEED_CREDENTIALS.partner.password)).resolves.toBe(
    true,
  );
}

async function assertNetWorthMilestones(context: SeedTestContext): Promise<void> {
  const points = await context.readNetWorthTrend();
  const january = points.find((point) => point.monthKey === "2026-01");
  const february = points.find((point) => point.monthKey === "2026-02");
  const march = points.find((point) => point.monthKey === "2026-03");

  expect(january).toBeDefined();
  expect(february).toBeDefined();
  expect(march).toBeDefined();

  const januaryMinor = january?.netWorthMinor ?? 0n;
  const februaryMinor = february?.netWorthMinor ?? 0n;
  const marchMinor = march?.netWorthMinor ?? 0n;

  expect(januaryMinor).toBeLessThan(0n);
  expect(februaryMinor).toBeLessThan(0n);
  expect(februaryMinor).toBeGreaterThan(januaryMinor);
  expect(marchMinor).toBeGreaterThan(0n);
}

function createSqliteSeedContext(client: SqliteClient): SeedTestContext {
  const accountRepository = createSqliteAccountRepository(client);
  const reportService = createSqliteReportQueryService(client);

  return {
    clean() {
      cleanSqlite(client);
      return Promise.resolve();
    },
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
    async readNetWorthTrend() {
      const report = await reportService.getNetWorthTrend({
        asOfDate: "2026-05-31",
        ledgerId: SEED_IDS.LEDGER_HOUSEHOLD,
        months: 6,
        workspaceId: SEED_IDS.WORKSPACE_HOUSEHOLD,
      });
      return report.points.map((point) => ({
        monthKey: point.monthKey,
        netWorthMinor: point.netWorthMinor,
      }));
    },
    readScenarioSummary() {
      const typeRow = client
        .prepare<
          unknown[],
          {
            readonly expenseCount: number;
            readonly incomeCount: number;
            readonly splitCount: number;
            readonly transferCount: number;
          }
        >(
          `SELECT
             SUM(CASE WHEN type = 'expense' THEN 1 ELSE 0 END) AS expenseCount,
             SUM(CASE WHEN type = 'income' THEN 1 ELSE 0 END) AS incomeCount,
             SUM(CASE WHEN type = 'transfer' THEN 1 ELSE 0 END) AS transferCount,
             SUM(CASE WHEN type = 'split' THEN 1 ELSE 0 END) AS splitCount
           FROM transaction_groups
           WHERE workspace_id = ? AND ledger_id = ?`,
        )
        .get(SEED_IDS.WORKSPACE_HOUSEHOLD, SEED_IDS.LEDGER_HOUSEHOLD);
      const journalRow = client
        .prepare<
          unknown[],
          {
            readonly distinctMonths: number;
            readonly pendingCount: number;
          }
        >(
          `SELECT
             COUNT(DISTINCT substr(occurred_at, 1, 7)) AS distinctMonths,
             SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pendingCount
           FROM transaction_journals
           WHERE workspace_id = ? AND ledger_id = ?`,
        )
        .get(SEED_IDS.WORKSPACE_HOUSEHOLD, SEED_IDS.LEDGER_HOUSEHOLD);
      return Promise.resolve({
        distinctMonths: journalRow?.distinctMonths ?? 0,
        expenseCount: typeRow?.expenseCount ?? 0,
        incomeCount: typeRow?.incomeCount ?? 0,
        pendingCount: journalRow?.pendingCount ?? 0,
        splitCount: typeRow?.splitCount ?? 0,
        transferCount: typeRow?.transferCount ?? 0,
      });
    },
    readUserPasswordHash(username) {
      const row = client
        .prepare<[string], { readonly password_hash: string }>(
          "SELECT password_hash FROM users WHERE username_normalized = ?",
        )
        .get(username);
      return Promise.resolve(row?.password_hash ?? null);
    },
    runSeed() {
      return seedSqlite(client, "e2e");
    },
  };
}

function createPostgresSeedContext(client: PglitePostgresClient): SeedTestContext {
  const db = createPglitePostgresDatabaseFromClient(client);
  const accountRepository = createPostgresAccountRepository(db);
  const reportService = createPostgresReportQueryService(db);

  return {
    clean() {
      return cleanPglitePostgres(client);
    },
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
    async readNetWorthTrend() {
      const report = await reportService.getNetWorthTrend({
        asOfDate: "2026-05-31",
        ledgerId: SEED_IDS.LEDGER_HOUSEHOLD,
        months: 6,
        workspaceId: SEED_IDS.WORKSPACE_HOUSEHOLD,
      });
      return report.points.map((point) => ({
        monthKey: point.monthKey,
        netWorthMinor: point.netWorthMinor,
      }));
    },
    async readScenarioSummary() {
      const typeResult = (await client.query(
        `SELECT
           SUM(CASE WHEN type = 'expense' THEN 1 ELSE 0 END)::int AS "expenseCount",
           SUM(CASE WHEN type = 'income' THEN 1 ELSE 0 END)::int AS "incomeCount",
           SUM(CASE WHEN type = 'transfer' THEN 1 ELSE 0 END)::int AS "transferCount",
           SUM(CASE WHEN type = 'split' THEN 1 ELSE 0 END)::int AS "splitCount"
         FROM transaction_groups
         WHERE workspace_id = $1 AND ledger_id = $2`,
        [SEED_IDS.WORKSPACE_HOUSEHOLD, SEED_IDS.LEDGER_HOUSEHOLD],
      )) as {
        readonly rows: readonly [
          {
            readonly expenseCount: unknown;
            readonly incomeCount: unknown;
            readonly splitCount: unknown;
            readonly transferCount: unknown;
          },
        ];
      };
      const journalResult = (await client.query(
        `SELECT
           COUNT(DISTINCT substring(occurred_at::text, 1, 7))::int AS "distinctMonths",
           SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)::int AS "pendingCount"
         FROM transaction_journals
         WHERE workspace_id = $1 AND ledger_id = $2`,
        [SEED_IDS.WORKSPACE_HOUSEHOLD, SEED_IDS.LEDGER_HOUSEHOLD],
      )) as {
        readonly rows: readonly [
          {
            readonly distinctMonths: unknown;
            readonly pendingCount: unknown;
          },
        ];
      };
      const typeRow = typeResult.rows[0];
      const journalRow = journalResult.rows[0];
      return {
        distinctMonths: Number(journalRow?.distinctMonths ?? 0),
        expenseCount: Number(typeRow?.expenseCount ?? 0),
        incomeCount: Number(typeRow?.incomeCount ?? 0),
        pendingCount: Number(journalRow?.pendingCount ?? 0),
        splitCount: Number(typeRow?.splitCount ?? 0),
        transferCount: Number(typeRow?.transferCount ?? 0),
      };
    },
    async readUserPasswordHash(username) {
      const result = (await client.query(
        "SELECT password_hash FROM users WHERE username_normalized = $1",
        [username],
      )) as {
        readonly rows: readonly { readonly password_hash: unknown }[];
      };
      const passwordHash = result.rows[0]?.password_hash;
      return typeof passwordHash === "string" ? passwordHash : null;
    },
    runSeed() {
      return seedPostgresDatabase(db, "e2e");
    },
  };
}

function insertSqliteLegacyOwner(client: SqliteClient, userId: string): void {
  client
    .prepare(
      `INSERT INTO users (id, username, username_normalized, display_name, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      userId,
      SEED_CREDENTIALS.owner.username,
      SEED_CREDENTIALS.owner.username,
      "Legacy Owner",
      "legacy-hash",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    );
}

function readSqliteOwnerRowCount(client: SqliteClient): number {
  const row = client
    .prepare<unknown[], { readonly count: number }>(
      "SELECT COUNT(*) AS count FROM users WHERE username_normalized = ?",
    )
    .get(SEED_CREDENTIALS.owner.username);
  return row?.count ?? 0;
}

function readSqliteOwnerId(client: SqliteClient): string | null {
  const row = client
    .prepare<unknown[], { readonly id: string }>(
      "SELECT id FROM users WHERE username_normalized = ? LIMIT 1",
    )
    .get(SEED_CREDENTIALS.owner.username);
  return row?.id ?? null;
}

async function insertPostgresLegacyOwner(
  client: PglitePostgresClient,
  userId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO users (id, username, username_normalized, display_name, password_hash, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      userId,
      SEED_CREDENTIALS.owner.username,
      SEED_CREDENTIALS.owner.username,
      "Legacy Owner",
      "legacy-hash",
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-01-01T00:00:00.000Z"),
    ],
  );
}

async function readPostgresOwnerRowCount(client: PglitePostgresClient): Promise<number> {
  const result = (await client.query(
    "SELECT COUNT(*)::int AS count FROM users WHERE username_normalized = $1",
    [SEED_CREDENTIALS.owner.username],
  )) as {
    readonly rows: readonly { readonly count: unknown }[];
  };
  return Number(result.rows[0]?.count ?? 0);
}

async function readPostgresOwnerId(client: PglitePostgresClient): Promise<string | null> {
  const result = (await client.query(
    "SELECT id FROM users WHERE username_normalized = $1 LIMIT 1",
    [SEED_CREDENTIALS.owner.username],
  )) as {
    readonly rows: readonly { readonly id: unknown }[];
  };
  const id = result.rows[0]?.id;
  return typeof id === "string" ? id : null;
}
