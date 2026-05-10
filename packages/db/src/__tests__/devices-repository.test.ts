import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUuidV7, type SyncedId } from "@fastifly/common";
import { describe, expect, it } from "vitest";

import {
  createConfiguredSqliteClient,
  createPglitePostgresDatabaseFromClient,
  createPostgresDeviceRepository,
  createPostgresIdentityRepository,
  createSqliteDatabaseFromClient,
  createSqliteDeviceRepository,
  createSqliteIdentityRepository,
  type DeviceRepository,
  type IdentityRepository,
} from "../index.js";
import {
  createInMemoryPgliteDatabase,
  runPglitePostgresMigrations,
  runSqliteMigrations,
} from "../testing/migrations.js";

type DeviceRepositoryFactory = {
  readonly name: string;
  readonly run: (test: (context: DeviceRepositoryContext) => Promise<void>) => Promise<void>;
};

type DeviceRepositoryContext = {
  readonly deviceRepository: DeviceRepository;
  readonly identityRepository: IdentityRepository;
};

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

const factories: readonly DeviceRepositoryFactory[] = [
  {
    name: "SQLite",
    async run(test) {
      const sqliteDir = mkdtempSync(join(tmpdir(), "fastifly-devices-sqlite-"));
      const client = createConfiguredSqliteClient({ source: join(sqliteDir, "test.db") });
      try {
        runSqliteMigrations(client);
        const db = createSqliteDatabaseFromClient(client);
        const createId = createDeterministicIdGenerator();
        await test({
          deviceRepository: createSqliteDeviceRepository(client, {
            clock: { now: () => new Date("2026-05-09T00:00:00.000Z") },
            createId,
          }),
          identityRepository: createSqliteIdentityRepository(db, { createId }),
        });
      } finally {
        client.close();
        rmSync(sqliteDir, { force: true, recursive: true });
      }
    },
  },
  {
    name: "PostgreSQL (PGlite)",
    async run(test) {
      const client = await createInMemoryPgliteDatabase();
      try {
        await runPglitePostgresMigrations(client);
        const db = createPglitePostgresDatabaseFromClient(client);
        const createId = createDeterministicIdGenerator();
        await test({
          deviceRepository: createPostgresDeviceRepository(db, {
            clock: { now: () => new Date("2026-05-09T00:00:00.000Z") },
            createId,
          }),
          identityRepository: createPostgresIdentityRepository(db, { createId }),
        });
      } finally {
        await client.close();
      }
    },
  },
];

describe("device repository", () => {
  for (const factory of factories) {
    it(`registers, lists, and revokes user-scoped devices on ${factory.name}`, async () => {
      await factory.run(async ({ deviceRepository, identityRepository }) => {
        const user = await identityRepository.createUser({
          displayName: "Owner",
          passwordHash: "$argon2id$fixture",
          username: "Owner",
        });

        const registered = await deviceRepository.registerDevice({
          deviceKey: "browser-profile",
          name: "Laptop",
          userId: user.id,
        });
        const renamed = await deviceRepository.registerDevice({
          deviceKey: "browser-profile",
          name: "Work laptop",
          userId: user.id,
        });

        expect(renamed.id).toBe(registered.id);
        expect(renamed.name).toBe("Work laptop");
        await expect(deviceRepository.listDevicesForUser(user.id)).resolves.toMatchObject([
          { id: registered.id, name: "Work laptop", revokedAt: null },
        ]);
        await expect(
          deviceRepository.revokeDevice({ deviceId: registered.id, userId: user.id }),
        ).resolves.toMatchObject({
          id: registered.id,
          revokedAt: "2026-05-09T00:00:00.000Z",
        });
      });
    });
  }
});
