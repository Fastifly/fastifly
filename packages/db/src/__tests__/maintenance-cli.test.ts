import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runFastiflyCli } from "../migrations/maintenance-cli.js";
import { seedDatabase } from "../seed/index.js";
import { createConfiguredSqliteClient } from "../sqlite/client.js";

function createOutputBuffer() {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    output: {
      stderr(message: string) {
        stderr.push(message);
      },
      stdout(message: string) {
        stdout.push(message);
      },
    },
    stderr,
    stdout,
  };
}

describe("Fastifly maintenance CLI", () => {
  it("reports pending SQLite migrations without creating a missing database", async () => {
    const sqliteDir = mkdtempSync(join(tmpdir(), "fastifly-cli-status-"));
    const databaseUrl = join(sqliteDir, "fastifly.db");
    const { output, stdout } = createOutputBuffer();

    try {
      const exitCode = await runFastiflyCli(
        ["migrate", "status", "--json"],
        { DATABASE_DRIVER: "sqlite", DATABASE_URL: databaseUrl },
        output,
      );
      const status = JSON.parse(stdout.join("")) as {
        readonly pendingMigrations: number;
        readonly appliedMigrations: number;
        readonly totalMigrations: number;
      };

      expect(exitCode).toBe(1);
      expect(status.appliedMigrations).toBe(0);
      expect(status.pendingMigrations).toBe(status.totalMigrations);
      expect(status.totalMigrations).toBeGreaterThan(0);
    } finally {
      rmSync(sqliteDir, { force: true, recursive: true });
    }
  });

  it("applies SQLite migrations and then reports a clean status", async () => {
    const sqliteDir = mkdtempSync(join(tmpdir(), "fastifly-cli-up-"));
    const databaseUrl = join(sqliteDir, "fastifly.db");
    const migrateOutput = createOutputBuffer();
    const statusOutput = createOutputBuffer();

    try {
      await expect(
        runFastiflyCli(
          ["migrate", "up", "--json"],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: databaseUrl },
          migrateOutput.output,
        ),
      ).resolves.toBe(0);

      await expect(
        runFastiflyCli(
          ["migrate", "status", "--json"],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: databaseUrl },
          statusOutput.output,
        ),
      ).resolves.toBe(0);

      const status = JSON.parse(statusOutput.stdout.join("")) as {
        readonly pendingMigrations: number;
        readonly appliedMigrations: number;
        readonly totalMigrations: number;
      };
      expect(status.appliedMigrations).toBe(status.totalMigrations);
      expect(status.pendingMigrations).toBe(0);
      expect(status.totalMigrations).toBeGreaterThan(0);
    } finally {
      rmSync(sqliteDir, { force: true, recursive: true });
    }
  });

  it("fails closed when database config is incomplete", async () => {
    const { output, stderr } = createOutputBuffer();

    await expect(runFastiflyCli(["migrate", "status"], {}, output)).resolves.toBe(1);
    expect(stderr.join("")).toContain("DATABASE_DRIVER is required");
  });

  it("creates a SQLite backup with metadata and restores it with explicit confirmation", async () => {
    const sqliteDir = mkdtempSync(join(tmpdir(), "fastifly-cli-backup-"));
    const databaseUrl = join(sqliteDir, "fastifly.db");
    const backupPath = join(sqliteDir, "fastifly.backup.db");
    const migrateOutput = createOutputBuffer();
    const backupOutput = createOutputBuffer();
    const restoreOutput = createOutputBuffer();

    try {
      await expect(
        runFastiflyCli(
          ["migrate", "up", "--json"],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: databaseUrl },
          migrateOutput.output,
        ),
      ).resolves.toBe(0);

      await expect(
        runFastiflyCli(
          ["backup", "create", "--output", backupPath, "--json"],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: databaseUrl },
          backupOutput.output,
        ),
      ).resolves.toBe(0);

      expect(existsSync(backupPath)).toBe(true);
      expect(existsSync(`${backupPath}.meta.json`)).toBe(true);
      const metadata = JSON.parse(readFileSync(`${backupPath}.meta.json`, "utf8")) as {
        readonly driver: string;
        readonly schemaVersion: number;
      };
      expect(metadata.driver).toBe("sqlite");
      expect(metadata.schemaVersion).toBeGreaterThan(0);

      await expect(
        runFastiflyCli(
          ["backup", "restore", backupPath, "--yes", "--json"],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: databaseUrl },
          restoreOutput.output,
        ),
      ).resolves.toBe(0);
      const restoreResult = JSON.parse(restoreOutput.stdout.join("")) as {
        readonly emergencyBackupPath: string | null;
        readonly restoredDatabasePath: string;
        readonly schemaVersion: number;
      };
      expect(restoreResult.restoredDatabasePath).toBe(databaseUrl);
      expect(restoreResult.emergencyBackupPath).not.toBeNull();
      expect(existsSync(restoreResult.emergencyBackupPath as string)).toBe(true);
      expect(restoreResult.schemaVersion).toBeGreaterThan(0);
    } finally {
      rmSync(sqliteDir, { force: true, recursive: true });
    }
  });

  it("requires --yes before restoring a SQLite backup", async () => {
    const sqliteDir = mkdtempSync(join(tmpdir(), "fastifly-cli-backup-confirm-"));
    const databaseUrl = join(sqliteDir, "fastifly.db");
    const backupPath = join(sqliteDir, "fastifly.backup.db");
    const output = createOutputBuffer();

    try {
      await expect(
        runFastiflyCli(
          ["migrate", "up"],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: databaseUrl },
          createOutputBuffer().output,
        ),
      ).resolves.toBe(0);
      await expect(
        runFastiflyCli(
          ["backup", "create", "--output", backupPath],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: databaseUrl },
          createOutputBuffer().output,
        ),
      ).resolves.toBe(0);

      await expect(
        runFastiflyCli(
          ["backup", "restore", backupPath],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: databaseUrl },
          output.output,
        ),
      ).resolves.toBe(1);
      expect(output.stderr.join("")).toContain("--yes");
    } finally {
      rmSync(sqliteDir, { force: true, recursive: true });
    }
  });

  it("rejects backup commands when DATABASE_DRIVER is postgres", async () => {
    const output = createOutputBuffer();

    await expect(
      runFastiflyCli(
        ["backup", "create"],
        { DATABASE_DRIVER: "postgres", DATABASE_URL: "postgres://localhost:5432/fastifly" },
        output.output,
      ),
    ).resolves.toBe(1);
    expect(output.stderr.join("")).toContain("sqlite only");
  });

  it("fails backup create when the SQLite source database does not exist", async () => {
    const sqliteDir = mkdtempSync(join(tmpdir(), "fastifly-cli-backup-missing-"));
    const databaseUrl = join(sqliteDir, "missing.db");
    const output = createOutputBuffer();

    try {
      await expect(
        runFastiflyCli(
          ["backup", "create"],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: databaseUrl },
          output.output,
        ),
      ).resolves.toBe(1);
      expect(output.stderr.join("")).toContain("does not exist");
    } finally {
      rmSync(sqliteDir, { force: true, recursive: true });
    }
  });

  it("reports healthy environment integrity after SQLite migrations", async () => {
    const sqliteDir = mkdtempSync(join(tmpdir(), "fastifly-cli-integrity-env-"));
    const databaseUrl = join(sqliteDir, "fastifly.db");
    const output = createOutputBuffer();

    try {
      await expect(
        runFastiflyCli(
          ["migrate", "up"],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: databaseUrl },
          createOutputBuffer().output,
        ),
      ).resolves.toBe(0);

      await expect(
        runFastiflyCli(
          ["integrity", "env", "--json"],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: databaseUrl },
          output.output,
        ),
      ).resolves.toBe(0);

      const result = JSON.parse(output.stdout.join("")) as {
        readonly healthy: boolean;
        readonly migrationStatus: { readonly pendingMigrations: number };
      };
      expect(result.healthy).toBe(true);
      expect(result.migrationStatus.pendingMigrations).toBe(0);
    } finally {
      rmSync(sqliteDir, { force: true, recursive: true });
    }
  });

  it("aggregates environment and sum checks in integrity report", async () => {
    const sqliteDir = mkdtempSync(join(tmpdir(), "fastifly-cli-integrity-report-"));
    const databaseUrl = join(sqliteDir, "fastifly.db");
    const output = createOutputBuffer();

    try {
      await expect(
        runFastiflyCli(
          ["migrate", "up"],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: databaseUrl },
          createOutputBuffer().output,
        ),
      ).resolves.toBe(0);

      await expect(
        runFastiflyCli(
          ["integrity", "report", "--json"],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: databaseUrl },
          output.output,
        ),
      ).resolves.toBe(0);

      const result = JSON.parse(output.stdout.join("")) as {
        readonly healthy: boolean;
        readonly env: { readonly healthy: boolean };
        readonly sums: { readonly healthy: boolean };
      };
      expect(result.healthy).toBe(true);
      expect(result.env.healthy).toBe(true);
      expect(result.sums.healthy).toBe(true);
    } finally {
      rmSync(sqliteDir, { force: true, recursive: true });
    }
  });

  it("detects unbalanced transaction postings in integrity sums", async () => {
    const sqliteDir = mkdtempSync(join(tmpdir(), "fastifly-cli-integrity-sums-"));
    const databaseUrl = join(sqliteDir, "fastifly.db");
    const output = createOutputBuffer();

    try {
      await expect(
        runFastiflyCli(
          ["migrate", "up"],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: databaseUrl },
          createOutputBuffer().output,
        ),
      ).resolves.toBe(0);
      await seedDatabase({ databaseUrl, driver: "sqlite", level: "demo" });

      const client = createConfiguredSqliteClient({ source: databaseUrl });
      try {
        client
          .prepare(
            `
              UPDATE transaction_postings
              SET amount_minor = amount_minor + 1
              WHERE rowid = (
                SELECT rowid
                FROM transaction_postings
                ORDER BY rowid
                LIMIT 1
              )
            `,
          )
          .run();
      } finally {
        client.close();
      }

      await expect(
        runFastiflyCli(
          ["integrity", "sums", "--json"],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: databaseUrl },
          output.output,
        ),
      ).resolves.toBe(1);
      const result = JSON.parse(output.stdout.join("")) as {
        readonly healthy: boolean;
        readonly sourceAmountViolationsCount: number;
      };
      expect(result.healthy).toBe(false);
      expect(result.sourceAmountViolationsCount).toBeGreaterThan(0);
    } finally {
      rmSync(sqliteDir, { force: true, recursive: true });
    }
  });
});
