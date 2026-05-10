import { describe, expect, it } from "vitest";

import {
  createInMemoryPgliteDatabase,
  runPglitePostgresMigrations,
} from "../testing/migrations.js";

describe("PostgreSQL-compat migrations (PGlite)", () => {
  it("applies the foundation migration into a clean database", async () => {
    const db = await createInMemoryPgliteDatabase();

    try {
      await runPglitePostgresMigrations(db);

      const result = await db.query<{ table_name: string }>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);

      expect(result.rows.map((row) => row.table_name)).toEqual([
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
        "job_queue",
        "journal_meta",
        "ledgers",
        "passkey_challenges",
        "passkeys",
        "payee_aliases",
        "payee_mappings",
        "payees",
        "recovery_codes",
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

      const userColumns = await db.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users'
        ORDER BY ordinal_position
      `);
      expect(userColumns.rows.map((row) => row.column_name)).toContain("password_hash");

      const workspaceColumns = await db.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'workspaces'
        ORDER BY ordinal_position
      `);
      expect(workspaceColumns.rows.map((row) => row.column_name)).toContain("status");

      const ledgerColumns = await db.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ledgers'
        ORDER BY ordinal_position
      `);
      expect(ledgerColumns.rows.map((row) => row.column_name)).toContain("status");

      const idempotencyColumns = await db.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'idempotency_receipts'
        ORDER BY ordinal_position
      `);
      expect(idempotencyColumns.rows.map((row) => row.column_name)).toContain("device_id");

      const passkeyColumns = await db.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'passkeys'
        ORDER BY ordinal_position
      `);
      expect(passkeyColumns.rows.map((row) => row.column_name)).toContain("name");

      const accountColumns = await db.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'accounts'
        ORDER BY ordinal_position
      `);
      expect(accountColumns.rows.map((row) => row.column_name)).toEqual([
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

      const postingColumns = await db.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'transaction_postings'
        ORDER BY ordinal_position
      `);
      expect(postingColumns.rows.map((row) => row.column_name)).toContain("reporting_amount_minor");

      await db.query(`
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

      await db.query(`
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

      await db.query(`
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

      await db.query(`
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

      await db.query(`
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

      await expect(
        db.query(`
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
      ).rejects.toThrow();

      await expect(
        db.query(`
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
      ).rejects.toThrow();

      await expect(
        db.query(`
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
      ).rejects.toThrow();

      await expect(
        db.query(`
          UPDATE workspaces
          SET status = 'unknown'
          WHERE id = 'workspace_1'
        `),
      ).rejects.toThrow();

      await expect(
        db.query(`
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
            TRUE,
            '2026-05-09T00:00:00.000Z',
            '2026-05-09T00:00:00.000Z'
          )
        `),
      ).rejects.toThrow();

      await expect(
        db.query(`
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
            TRUE,
            '2026-05-09T00:00:00.000Z',
            '2026-05-09T00:00:00.000Z'
          )
        `),
      ).rejects.toThrow();

      await expect(
        db.query(`
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
            TRUE,
            '2026-05-09T00:00:00.000Z',
            '2026-05-09T00:00:00.000Z'
          )
        `),
      ).rejects.toThrow();

      await expect(
        db.query(`
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
      ).rejects.toThrow();
    } finally {
      await db.close();
    }
  });
});
