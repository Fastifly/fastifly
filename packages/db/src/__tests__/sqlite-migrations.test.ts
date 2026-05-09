import { describe, expect, it } from "vitest";

import { createInMemorySqliteDatabase, runSqliteMigrations } from "../testing/migrations.js";
import { readMigration } from "./migration-files.js";

describe("SQLite migrations", () => {
  it("applies the foundation migration into a clean database", async () => {
    const db = await createInMemorySqliteDatabase();

    try {
      await runSqliteMigrations(db, [
        readMigration("sqlite", "0001_foundation"),
        readMigration("sqlite", "0002_passkey_challenges"),
      ]);

      const tables = await db.execute(`
        SELECT name
        FROM sqlite_schema
        WHERE type = 'table'
        ORDER BY name
      `);
      const tableNames = tables.rows.map((row) => String(row.name));

      expect(tableNames).toEqual([
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

      const userColumns = await db.execute(`
        SELECT name
        FROM pragma_table_info('users')
        ORDER BY cid
      `);
      expect(userColumns.rows.map((row) => String(row.name))).toContain("password_hash");

      const workspaceColumns = await db.execute(`
        SELECT name
        FROM pragma_table_info('workspaces')
        ORDER BY cid
      `);
      expect(workspaceColumns.rows.map((row) => String(row.name))).toContain("status");

      const ledgerColumns = await db.execute(`
        SELECT name
        FROM pragma_table_info('ledgers')
        ORDER BY cid
      `);
      expect(ledgerColumns.rows.map((row) => String(row.name))).toContain("status");

      const idempotencyColumns = await db.execute(`
        SELECT name
        FROM pragma_table_info('idempotency_receipts')
        ORDER BY cid
      `);
      expect(idempotencyColumns.rows.map((row) => String(row.name))).toContain("device_id");

      const passkeyColumns = await db.execute(`
        SELECT name
        FROM pragma_table_info('passkeys')
        ORDER BY cid
      `);
      expect(passkeyColumns.rows.map((row) => String(row.name))).toContain("name");

      await db.execute(`
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

      await db.execute(`
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
        db.execute(`
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
        db.execute(`
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
        db.execute(`
          UPDATE workspaces
          SET status = 'unknown'
          WHERE id = 'workspace_1'
        `),
      ).rejects.toThrow();
    } finally {
      db.close();
    }
  });
});
