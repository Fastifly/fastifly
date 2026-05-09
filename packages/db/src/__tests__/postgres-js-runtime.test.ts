import { fileURLToPath } from "node:url";

import { createUuidV7, type SyncedId } from "@fastifly/common";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { describe, expect, it } from "vitest";

import {
  closePostgresClient,
  createPostgresClient,
  createPostgresDatabaseFromClient,
  createPostgresIdentityRepository,
} from "../index.js";

const databaseUrl =
  process.env.FASTIFLY_TEST_POSTGRES_URL ?? process.env.TEST_POSTGRES_DATABASE_URL;
const migrationsFolder = fileURLToPath(new URL("../postgres/migrations", import.meta.url));
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres("postgres.js production runtime", () => {
  it("applies Drizzle migrations and runs repositories through postgres.js", async () => {
    const client = createPostgresClient({
      applicationName: "fastifly-test",
      connectTimeoutSeconds: 5,
      idleTimeoutSeconds: 1,
      maxConnections: 1,
      statementTimeoutMs: 5_000,
      url: databaseUrl as string,
    });

    try {
      await client.unsafe("DROP SCHEMA IF EXISTS public CASCADE");
      await client.unsafe("CREATE SCHEMA public");

      const db = createPostgresDatabaseFromClient(client);
      await migrate(db, { migrationsFolder });

      const repository = createPostgresIdentityRepository(db, {
        clock: { now: () => new Date("2026-05-09T00:00:00.000Z") },
        createId: createDeterministicIdGenerator(),
      });

      const user = await repository.createUser({
        displayName: "Production Runtime",
        passwordHash: "hash",
        username: "Production.User",
      });

      const found = await repository.findUserByNormalizedUsername("production.user");

      expect(found).toMatchObject({
        id: user.id,
        username: "Production.User",
        usernameNormalized: "production.user",
      });
    } finally {
      await closePostgresClient(client);
    }
  });
});

function createDeterministicIdGenerator(): () => SyncedId {
  let counter = 1;

  return () => {
    const value = counter;
    counter += 1;

    return createUuidV7({
      nowMs: Date.UTC(2026, 4, 9),
      randomBytes: (byteLength) => {
        const bytes = new Uint8Array(byteLength);
        bytes[byteLength - 1] = value;
        return bytes;
      },
    });
  };
}
