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
  createSqliteAccountRepository,
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
  readonly readCheckingBalance: () => Promise<bigint | null>;
  readonly readUserPasswordHash: (username: string) => Promise<string | null>;
  readonly runSeed: () => Promise<void>;
};

type SeedCountTable =
  | "accounts"
  | "balance_recalculation_queue"
  | "currencies"
  | "transaction_groups"
  | "users"
  | "workspace_members";

const expectedSeededAccountCount = 14;
const expectedSeededTransactionCount = 18;

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
  expect(await context.readCheckingBalance()).toBe(128_061_00n);

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
  expect(await context.readCheckingBalance()).toBe(128_061_00n);
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

function createSqliteSeedContext(client: SqliteClient): SeedTestContext {
  const accountRepository = createSqliteAccountRepository(client);

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
