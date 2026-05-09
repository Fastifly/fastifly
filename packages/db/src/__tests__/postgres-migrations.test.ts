import { describe, expect, it } from "vitest";

import { createInMemoryPostgresDatabase, runPostgresMigrations } from "../testing/migrations.js";
import { readMigration } from "./migration-files.js";

describe("PostgreSQL migrations", () => {
  it("applies the foundation migration into a clean database", async () => {
    const db = await createInMemoryPostgresDatabase();

    try {
      await runPostgresMigrations(db, [
        readMigration("postgres", "0001_foundation"),
        readMigration("postgres", "0002_passkey_challenges"),
      ]);

      const result = await db.query<{ table_name: string }>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);

      expect(result.rows.map((row) => row.table_name)).toEqual([
        "audit_log",
        "devices",
        "idempotency_receipts",
        "job_queue",
        "ledgers",
        "passkey_challenges",
        "passkeys",
        "recovery_codes",
        "sessions",
        "users",
        "workspace_invitations",
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
    } finally {
      await db.close();
    }
  });
});
