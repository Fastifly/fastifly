import { describe, expect, it } from "vitest";

import { createInMemorySqliteDatabase, runSqliteMigrations } from "../testing/migrations.js";
import { readMigration } from "./migration-files.js";

describe("SQLite migrations", () => {
  it("applies the foundation migration into a clean database", async () => {
    const db = await createInMemorySqliteDatabase();

    try {
      await runSqliteMigrations(db, [readMigration("sqlite", "0001_foundation")]);

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
        "passkeys",
        "recovery_codes",
        "sessions",
        "users",
        "workspace_invitations",
        "workspace_members",
        "workspaces",
      ]);

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
    } finally {
      db.close();
    }
  });
});
