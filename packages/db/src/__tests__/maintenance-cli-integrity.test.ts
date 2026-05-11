import { describe, expect, it } from "vitest";

import { runFastiflyCli } from "../migrations/maintenance-cli.js";
import { seedDatabase } from "../seed/index.js";
import { createConfiguredSqliteClient } from "../sqlite/client.js";
import { createOutputBuffer, createSqliteFixture } from "./maintenance-cli.helpers.js";

describe("Fastifly maintenance CLI: integrity", () => {
  it("reports healthy environment integrity after SQLite migrations", async () => {
    const fixture = createSqliteFixture("fastifly-cli-integrity-env-");
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
          ["integrity", "env", "--json"],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: fixture.databaseUrl },
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
      fixture.cleanup();
    }
  });

  it("aggregates environment and sum checks in integrity report", async () => {
    const fixture = createSqliteFixture("fastifly-cli-integrity-report-");
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
          ["integrity", "report", "--json"],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: fixture.databaseUrl },
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
      fixture.cleanup();
    }
  });

  it("detects unbalanced transaction postings in integrity sums", async () => {
    const fixture = createSqliteFixture("fastifly-cli-integrity-sums-");
    const output = createOutputBuffer();

    try {
      await expect(
        runFastiflyCli(
          ["migrate", "up"],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: fixture.databaseUrl },
          createOutputBuffer().output,
        ),
      ).resolves.toBe(0);
      await seedDatabase({ databaseUrl: fixture.databaseUrl, driver: "sqlite", level: "demo" });

      const client = createConfiguredSqliteClient({ source: fixture.databaseUrl });
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
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: fixture.databaseUrl },
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
      fixture.cleanup();
    }
  });
});
