import { describe, expect, it } from "vitest";

import { runFastiflyCli } from "../migrations/maintenance-cli.js";
import { createOutputBuffer, createSqliteFixture } from "./maintenance-cli.helpers.js";

describe("Fastifly maintenance CLI: migrate", () => {
  it("reports pending SQLite migrations without creating a missing database", async () => {
    const fixture = createSqliteFixture("fastifly-cli-status-");
    const { output, stdout } = createOutputBuffer();

    try {
      const exitCode = await runFastiflyCli(
        ["migrate", "status", "--json"],
        { DATABASE_DRIVER: "sqlite", DATABASE_URL: fixture.databaseUrl },
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
      fixture.cleanup();
    }
  });

  it("applies SQLite migrations and then reports a clean status", async () => {
    const fixture = createSqliteFixture("fastifly-cli-up-");
    const migrateOutput = createOutputBuffer();
    const statusOutput = createOutputBuffer();

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
          ["migrate", "status", "--json"],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: fixture.databaseUrl },
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
      fixture.cleanup();
    }
  });

  it("fails closed when database config is incomplete", async () => {
    const { output, stderr } = createOutputBuffer();

    await expect(runFastiflyCli(["migrate", "status"], {}, output)).resolves.toBe(1);
    expect(stderr.join("")).toContain("DATABASE_DRIVER is required");
  });
});
