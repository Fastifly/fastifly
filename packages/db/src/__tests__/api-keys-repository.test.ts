import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUuidV7, type SyncedId } from "@fastifly/common";
import { describe, expect, it } from "vitest";

import {
  createConfiguredSqliteClient,
  createPglitePostgresDatabaseFromClient,
  createPostgresIdentityRepository,
  createSqliteDatabaseFromClient,
  createSqliteIdentityRepository,
  type IdentityRepository,
} from "../index.js";
import {
  createInMemoryPgliteDatabase,
  runPglitePostgresMigrations,
  runSqliteMigrations,
} from "../testing/migrations.js";

type IdentityRepositoryFactory = {
  readonly name: string;
  readonly run: (test: (identityRepository: IdentityRepository) => Promise<void>) => Promise<void>;
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

const factories: readonly IdentityRepositoryFactory[] = [
  {
    name: "SQLite",
    async run(test) {
      const sqliteDir = mkdtempSync(join(tmpdir(), "fastifly-api-keys-sqlite-"));
      const client = createConfiguredSqliteClient({ source: join(sqliteDir, "test.db") });
      try {
        runSqliteMigrations(client);
        const db = createSqliteDatabaseFromClient(client);
        const createId = createDeterministicIdGenerator();
        await test(
          createSqliteIdentityRepository(db, {
            clock: { now: () => new Date("2026-05-09T00:00:00.000Z") },
            createId,
          }),
        );
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
        await test(
          createPostgresIdentityRepository(db, {
            clock: { now: () => new Date("2026-05-09T00:00:00.000Z") },
            createId,
          }),
        );
      } finally {
        await client.close();
      }
    },
  },
];

describe("api key repository", () => {
  for (const factory of factories) {
    it(`creates, lists, resolves, and revokes user-scoped API keys on ${factory.name}`, async () => {
      await factory.run(async (identityRepository) => {
        const user = await identityRepository.createUser({
          displayName: "Owner",
          passwordHash: "$argon2id$fixture",
          username: "Owner",
        });

        const created = await identityRepository.createApiKey({
          name: "CLI integration",
          tokenHash: "hash-1",
          tokenPrefix: "ffk_abcd",
          userId: user.id,
        });

        expect(created).toMatchObject({
          name: "CLI integration",
          revokedAt: null,
          tokenPrefix: "ffk_abcd",
          userId: user.id,
        });

        await expect(identityRepository.listApiKeysForUser(user.id)).resolves.toMatchObject([
          { id: created.id, name: "CLI integration", revokedAt: null },
        ]);

        await expect(
          identityRepository.findActiveApiKeyByTokenHash("hash-1"),
        ).resolves.toMatchObject({ id: created.id, userId: user.id });

        await identityRepository.touchApiKeyLastUsed(created.id);
        const [touched] = await identityRepository.listApiKeysForUser(user.id);
        expect(touched?.lastUsedAt).toBe("2026-05-09T00:00:00.000Z");

        await expect(
          identityRepository.revokeApiKey({ apiKeyId: created.id, userId: user.id }),
        ).resolves.toMatchObject({ id: created.id, revokedAt: "2026-05-09T00:00:00.000Z" });

        await expect(identityRepository.findActiveApiKeyByTokenHash("hash-1")).resolves.toBeNull();
      });
    });

    it(`does not revoke another user's API key on ${factory.name}`, async () => {
      await factory.run(async (identityRepository) => {
        const owner = await identityRepository.createUser({
          displayName: "Owner",
          passwordHash: "$argon2id$fixture",
          username: "Owner",
        });
        const intruder = await identityRepository.createUser({
          displayName: "Intruder",
          passwordHash: "$argon2id$fixture",
          username: "Intruder",
        });

        const created = await identityRepository.createApiKey({
          name: "Owner key",
          tokenHash: "hash-owner",
          tokenPrefix: "ffk_zzzz",
          userId: owner.id,
        });

        await expect(
          identityRepository.revokeApiKey({ apiKeyId: created.id, userId: intruder.id }),
        ).resolves.toBeNull();
        await expect(
          identityRepository.findActiveApiKeyByTokenHash("hash-owner"),
        ).resolves.toMatchObject({ id: created.id });
      });
    });
  }
});
