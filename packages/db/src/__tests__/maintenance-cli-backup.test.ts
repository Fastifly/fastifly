import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runFastiflyCli } from "../migrations/maintenance-cli.js";
import { createOutputBuffer, createSqliteFixture } from "./maintenance-cli.helpers.js";

describe("Fastifly maintenance CLI: backup/restore", () => {
  it("creates a SQLite backup with metadata and restores it with explicit confirmation", async () => {
    const fixture = createSqliteFixture("fastifly-cli-backup-");
    const backupPath = join(fixture.databaseUrl, "..", "fastifly.backup.db");
    const migrateOutput = createOutputBuffer();
    const backupOutput = createOutputBuffer();
    const restoreOutput = createOutputBuffer();

    try {
      await expect(
        runFastiflyCli(
          ["migrate", "up", "--json"],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: fixture.databaseUrl },
          migrateOutput.output,
        ),
      ).resolves.toBe(0);

      await expect(
        runFastiflyCli(
          ["backup", "create", "--output", backupPath, "--json"],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: fixture.databaseUrl },
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
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: fixture.databaseUrl },
          restoreOutput.output,
        ),
      ).resolves.toBe(0);
      const restoreResult = JSON.parse(restoreOutput.stdout.join("")) as {
        readonly emergencyBackupPath: string | null;
        readonly restoredDatabasePath: string;
        readonly schemaVersion: number;
      };
      expect(restoreResult.restoredDatabasePath).toBe(fixture.databaseUrl);
      expect(restoreResult.emergencyBackupPath).not.toBeNull();
      expect(existsSync(restoreResult.emergencyBackupPath as string)).toBe(true);
      expect(restoreResult.schemaVersion).toBeGreaterThan(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("requires --yes before restoring a SQLite backup", async () => {
    const fixture = createSqliteFixture("fastifly-cli-backup-confirm-");
    const backupPath = join(fixture.databaseUrl, "..", "fastifly.backup.db");
    const output = createOutputBuffer();

    try {
      await expect(
        runFastiflyCli(
          ["migrate", "up"],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: fixture.databaseUrl },
          createOutputBuffer().output,
        ),
      ).resolves.toBe(0);
      await expect(
        runFastiflyCli(
          ["backup", "create", "--output", backupPath],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: fixture.databaseUrl },
          createOutputBuffer().output,
        ),
      ).resolves.toBe(0);

      await expect(
        runFastiflyCli(
          ["backup", "restore", backupPath],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: fixture.databaseUrl },
          output.output,
        ),
      ).resolves.toBe(1);
      expect(output.stderr.join("")).toContain("--yes");
    } finally {
      fixture.cleanup();
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
    const fixture = createSqliteFixture("fastifly-cli-backup-missing-");
    const missingDatabaseUrl = join(fixture.databaseUrl, "..", "missing.db");
    const output = createOutputBuffer();

    try {
      await expect(
        runFastiflyCli(
          ["backup", "create"],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: missingDatabaseUrl },
          output.output,
        ),
      ).resolves.toBe(1);
      expect(output.stderr.join("")).toContain("does not exist");
    } finally {
      fixture.cleanup();
    }
  });
});
