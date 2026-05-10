import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runFastiflyCli } from "../migrations/maintenance-cli.js";

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
      expect(status).toMatchObject({
        appliedMigrations: 0,
        pendingMigrations: 1,
        totalMigrations: 1,
      });
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

      expect(JSON.parse(statusOutput.stdout.join(""))).toMatchObject({
        appliedMigrations: 1,
        pendingMigrations: 0,
        totalMigrations: 1,
      });
    } finally {
      rmSync(sqliteDir, { force: true, recursive: true });
    }
  });

  it("fails closed when database config is incomplete", async () => {
    const { output, stderr } = createOutputBuffer();

    await expect(runFastiflyCli(["migrate", "status"], {}, output)).resolves.toBe(1);
    expect(stderr.join("")).toContain("DATABASE_DRIVER is required");
  });
});
