import { describe, expect, it } from "vitest";

import {
  createPglitePostgresDatabaseFromClient,
  createSqliteDatabaseFromClient,
  MIGRATION_COMMANDS,
  pgSchema,
  sqliteSchema,
} from "../index.js";
import { assertLedgerScope, makeTimestamp } from "../repositories/base.js";
import {
  createInMemoryPgliteDatabase,
  createInMemorySqliteDatabase,
} from "../testing/migrations.js";

describe("database package surface", () => {
  it("exports both dialect schemas with the same table keys", () => {
    expect(Object.keys(sqliteSchema).sort()).toEqual(Object.keys(pgSchema).sort());
  });

  it("documents migration command shape for both dialects", () => {
    expect(MIGRATION_COMMANDS.map((command) => command.name)).toEqual([
      "generate:sqlite",
      "generate:postgres",
      "migrate:sqlite",
      "migrate:postgres",
    ]);
    expect(MIGRATION_COMMANDS.filter((command) => command.mutatesDatabase)).toHaveLength(2);
  });

  it("creates Drizzle clients from standard dialect drivers", async () => {
    const sqliteClient = createInMemorySqliteDatabase();
    const postgresClient = await createInMemoryPgliteDatabase();

    try {
      expect(createSqliteDatabaseFromClient(sqliteClient)).toBeDefined();
      expect(createPglitePostgresDatabaseFromClient(postgresClient)).toBeDefined();
    } finally {
      sqliteClient.close();
      await postgresClient.close();
    }
  });

  it("keeps repository scope helpers strict", () => {
    expect(() =>
      assertLedgerScope({ workspaceId: "workspace" as never, ledgerId: "" as never }),
    ).toThrow("Ledger repository operations require workspaceId and ledgerId");
    expect(makeTimestamp({ now: () => new Date("2026-05-09T00:00:00.000Z") })).toBe(
      "2026-05-09T00:00:00.000Z",
    );
  });
});
