import { describe, expect, it } from "vitest";

import { createInMemoryPostgresDatabase, runPostgresMigrations } from "../testing/migrations.js";
import { readMigration } from "./migration-files.js";

describe("PostgreSQL migrations", () => {
  it("applies the foundation migration into a clean database", async () => {
    const db = await createInMemoryPostgresDatabase();

    try {
      await runPostgresMigrations(db, [readMigration("postgres", "0001_foundation")]);

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
        "passkeys",
        "recovery_codes",
        "sessions",
        "users",
        "workspace_invitations",
        "workspace_members",
        "workspaces",
      ]);

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
    } finally {
      await db.close();
    }
  });
});
