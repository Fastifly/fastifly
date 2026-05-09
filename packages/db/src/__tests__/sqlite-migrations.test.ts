import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createConfiguredSqliteClient, readSqliteRuntimePragmas } from "../index.js";
import { createInMemorySqliteDatabase, runSqliteMigrations } from "../testing/migrations.js";
import { readMigration } from "./migration-files.js";

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
      await runSqliteMigrations(db, [
        readMigration("sqlite", "0001_foundation"),
        readMigration("sqlite", "0002_passkey_challenges"),
      ]);

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
    } finally {
      db.close();
    }
  });
});
