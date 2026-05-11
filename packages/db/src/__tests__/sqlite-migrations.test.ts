import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createConfiguredSqliteClient, readSqliteRuntimePragmas } from "../index.js";
import { createInMemorySqliteDatabase, runSqliteMigrations } from "../testing/migrations.js";

describe("SQLite migrations", () => {
  it("configures and verifies required SQLite runtime pragmas for file databases", async () => {
    const sqliteDir = mkdtempSync(join(tmpdir(), "fastifly-sqlite-pragmas-"));
    const db = createConfiguredSqliteClient({ source: join(sqliteDir, "test.db") });

    try {
      expect(readSqliteRuntimePragmas(db)).toEqual({
        busyTimeoutMs: 5000,
        foreignKeys: true,
        journalMode: "wal",
        synchronous: 1,
      });
    } finally {
      db.close();
      rmSync(sqliteDir, { force: true, recursive: true });
    }
  });

  it("applies the foundation migration into a clean database", async () => {
    const db = createInMemorySqliteDatabase();

    try {
      runSqliteMigrations(db);

      const tables = db
        .prepare(`
        SELECT name
        FROM sqlite_schema
        WHERE type = 'table'
        ORDER BY name
      `)
        .all() as { name: string }[];
      const tableNames = tables.map((row) => String(row.name));

      expect(tableNames).toEqual([
        "__drizzle_migrations",
        "account_meta",
        "accounts",
        "audit_log",
        "balance_recalculation_queue",
        "budget_limits",
        "budgets",
        "categories",
        "currencies",
        "devices",
        "exchange_rates",
        "idempotency_receipts",
        "import_jobs",
        "job_queue",
        "journal_meta",
        "ledgers",
        "passkey_challenges",
        "passkeys",
        "payee_aliases",
        "payee_mappings",
        "payees",
        "recovery_codes",
        "recurring_templates",
        "rules",
        "sessions",
        "sync_conflicts",
        "sync_operations",
        "tags",
        "transaction_groups",
        "transaction_journals",
        "transaction_postings",
        "transaction_tags",
        "users",
        "workspace_invitations",
        "workspace_ledger_revisions",
        "workspace_members",
        "workspaces",
      ]);

      const userColumns = db
        .prepare(`
        SELECT name
        FROM pragma_table_info('users')
        ORDER BY cid
      `)
        .all() as { name: string }[];
      expect(userColumns.map((row) => String(row.name))).toContain("password_hash");

      const workspaceColumns = db
        .prepare(`
        SELECT name
        FROM pragma_table_info('workspaces')
        ORDER BY cid
      `)
        .all() as { name: string }[];
      expect(workspaceColumns.map((row) => String(row.name))).toContain("status");

      const ledgerColumns = db
        .prepare(`
        SELECT name
        FROM pragma_table_info('ledgers')
        ORDER BY cid
      `)
        .all() as { name: string }[];
      expect(ledgerColumns.map((row) => String(row.name))).toContain("status");

      const idempotencyColumns = db
        .prepare(`
        SELECT name
        FROM pragma_table_info('idempotency_receipts')
        ORDER BY cid
      `)
        .all() as { name: string }[];
      expect(idempotencyColumns.map((row) => String(row.name))).toContain("device_id");

      const passkeyColumns = db
        .prepare(`
        SELECT name
        FROM pragma_table_info('passkeys')
        ORDER BY cid
      `)
        .all() as { name: string }[];
      expect(passkeyColumns.map((row) => String(row.name))).toContain("name");

      const accountColumns = db
        .prepare(`
        SELECT name
        FROM pragma_table_info('accounts')
        ORDER BY cid
      `)
        .all() as { name: string }[];
      expect(accountColumns.map((row) => String(row.name))).toEqual([
        "id",
        "workspace_id",
        "ledger_id",
        "name",
        "kind",
        "subtype",
        "currency_code",
        "opening_balance_minor",
        "opening_balance_date",
        "is_active",
        "archived_at",
        "created_at",
        "updated_at",
      ]);

      const postingColumns = db
        .prepare(`
        SELECT name
        FROM pragma_table_info('transaction_postings')
        ORDER BY cid
      `)
        .all() as { name: string }[];
      expect(postingColumns.map((row) => String(row.name))).toContain("reporting_amount_minor");

      db.exec(`
        INSERT INTO users (
          id,
          username,
          username_normalized,
          display_name,
          password_hash,
          created_at,
          updated_at
        )
        VALUES (
          'user_1',
          'Owner',
          'owner',
          'Owner',
          '$argon2id$fixture',
          '2026-05-09T00:00:00.000Z',
          '2026-05-09T00:00:00.000Z'
        )
      `);

      db.exec(`
        INSERT INTO workspaces (
          id,
          name,
          owner_user_id,
          created_at,
          updated_at
        )
        VALUES (
          'workspace_1',
          'Main',
          'user_1',
          '2026-05-09T00:00:00.000Z',
          '2026-05-09T00:00:00.000Z'
        )
      `);

      db.exec(`
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
      `);

      db.exec(`
        INSERT INTO ledgers (
          id,
          workspace_id,
          name,
          base_currency_code,
          first_day_of_week,
          created_at,
          updated_at
        )
        VALUES (
          'ledger_1',
          'workspace_1',
          'Main',
          'INR',
          1,
          '2026-05-09T00:00:00.000Z',
          '2026-05-09T00:00:00.000Z'
        )
      `);

      db.exec(`
        INSERT INTO categories (
          id,
          workspace_id,
          ledger_id,
          name,
          created_at,
          updated_at
        )
        VALUES (
          'category_1',
          'workspace_1',
          'ledger_1',
          'Food',
          '2026-05-09T00:00:00.000Z',
          '2026-05-09T00:00:00.000Z'
        )
      `);

      expect(() =>
        db.exec(`
          INSERT INTO categories (
            id,
            workspace_id,
            ledger_id,
            name,
            created_at,
            updated_at
          )
          VALUES (
            'category_2',
            'workspace_1',
            'ledger_1',
            'Food',
            '2026-05-09T00:00:00.000Z',
            '2026-05-09T00:00:00.000Z'
          )
        `),
      ).toThrow();

      expect(() =>
        db.exec(`
        INSERT INTO workspace_members (
          id,
          workspace_id,
          user_id,
          role,
          created_at,
          updated_at
        )
        VALUES (
          'member_1',
          'workspace_1',
          'user_1',
          'invalid_role',
          '2026-05-09T00:00:00.000Z',
          '2026-05-09T00:00:00.000Z'
        )
      `),
      ).toThrow();

      expect(() =>
        db.exec(`
          INSERT INTO ledgers (
            id,
            workspace_id,
            name,
            base_currency_code,
            first_day_of_week,
            created_at,
            updated_at
          )
          VALUES (
            'ledger_without_workspace',
            'missing_workspace',
            'Main',
            'INR',
            1,
            '2026-05-09T00:00:00.000Z',
            '2026-05-09T00:00:00.000Z'
          )
        `),
      ).toThrow();

      expect(() =>
        db.exec(`
          UPDATE workspaces
          SET status = 'unknown'
          WHERE id = 'workspace_1'
        `),
      ).toThrow();

      expect(() =>
        db.exec(`
          INSERT INTO accounts (
            id,
            workspace_id,
            ledger_id,
            name,
            kind,
            subtype,
            currency_code,
            is_active,
            created_at,
            updated_at
          )
          VALUES (
            'account_1',
            'workspace_1',
            'missing_ledger',
            'Checking',
            'asset',
            'bank',
            'INR',
            1,
            '2026-05-09T00:00:00.000Z',
            '2026-05-09T00:00:00.000Z'
          )
        `),
      ).toThrow();

      expect(() =>
        db.exec(`
          INSERT INTO accounts (
            id,
            workspace_id,
            ledger_id,
            name,
            kind,
            subtype,
            currency_code,
            is_active,
            created_at,
            updated_at
          )
          VALUES (
            'account_2',
            'workspace_1',
            'ledger_1',
            'Broken',
            'invalid',
            'bank',
            'INR',
            1,
            '2026-05-09T00:00:00.000Z',
            '2026-05-09T00:00:00.000Z'
          )
        `),
      ).toThrow();

      expect(() =>
        db.exec(`
          INSERT INTO accounts (
            id,
            workspace_id,
            ledger_id,
            name,
            kind,
            subtype,
            currency_code,
            opening_balance_minor,
            is_active,
            created_at,
            updated_at
          )
          VALUES (
            'account_3',
            'workspace_1',
            'ledger_1',
            'Unpaired Opening',
            'asset',
            'bank',
            'INR',
            1000,
            1,
            '2026-05-09T00:00:00.000Z',
            '2026-05-09T00:00:00.000Z'
          )
        `),
      ).toThrow();

      expect(() =>
        db.exec(`
          INSERT INTO exchange_rates (
            id,
            workspace_id,
            ledger_id,
            base_currency_code,
            quote_currency_code,
            rate,
            source,
            rate_date,
            created_at
          )
          VALUES (
            'rate_1',
            'workspace_1',
            'ledger_1',
            'INR',
            'INR',
            '1x',
            'manual',
            '2026-05-09',
            '2026-05-09T00:00:00.000Z'
          )
        `),
      ).toThrow();
    } finally {
      db.close();
    }
  });
});
