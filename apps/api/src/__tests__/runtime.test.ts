import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeTestApiConfig } from "@fastifly/config";
import { describe, expect, it } from "vitest";

import { createRuntimeDependencies } from "../runtime.js";

describe("API runtime dependencies", () => {
  it("fails closed when database runtime config is missing", async () => {
    await expect(createRuntimeDependencies(makeTestApiConfig())).rejects.toThrow(
      "DATABASE_DRIVER is required",
    );
    await expect(
      createRuntimeDependencies(makeTestApiConfig({ databaseDriver: "sqlite" })),
    ).rejects.toThrow("DATABASE_URL is required");
  });

  it("rejects an unmigrated SQLite database before exposing the API as ready", async () => {
    const sqliteDir = mkdtempSync(join(tmpdir(), "fastifly-api-runtime-"));

    try {
      await expect(
        createRuntimeDependencies(
          makeTestApiConfig({
            databaseDriver: "sqlite",
            databaseUrl: join(sqliteDir, "fastifly.db"),
          }),
        ),
      ).rejects.toThrow("Run `pnpm db:migrate:sqlite`");
    } finally {
      rmSync(sqliteDir, { force: true, recursive: true });
    }
  });

  it("does not allow production auto migrations", async () => {
    await expect(
      createRuntimeDependencies(
        makeTestApiConfig({
          autoMigrate: true,
          cookieSecret: "x".repeat(32),
          databaseDriver: "sqlite",
          databaseUrl: ":memory:",
          nodeEnv: "production",
        }),
      ),
    ).rejects.toThrow("AUTO_MIGRATE must be false in production");
  });
});
