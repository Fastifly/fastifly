import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUuidV7, type SyncedId } from "@fastifly/common";
import { describe, expect, it } from "vitest";
import {
  createConfiguredSqliteClient,
  createPglitePostgresDatabaseFromClient,
  createPostgresJobRepository,
  createSqliteJobRepository,
  type JobRepository,
} from "../index.js";
import {
  createInMemoryPgliteDatabase,
  runPglitePostgresMigrations,
  runSqliteMigrations,
} from "../testing/migrations.js";

const T0 = new Date("2026-05-27T10:00:00.000Z");

function createDeterministicIdGenerator(): () => SyncedId {
  let counter = 0;
  return () => {
    counter += 1;
    const value = counter;
    return createUuidV7({
      nowMs: Date.UTC(2026, 4, 27),
      randomBytes: (byteLength) => {
        const bytes = new Uint8Array(byteLength);
        bytes[byteLength - 1] = value & 0xff;
        bytes[byteLength - 2] = (value >> 8) & 0xff;
        return bytes;
      },
    });
  };
}

type JobFactory = {
  readonly name: string;
  readonly run: (test: (repository: JobRepository) => Promise<void>) => Promise<void>;
};

const factories: readonly JobFactory[] = [
  {
    name: "SQLite",
    async run(test) {
      const dir = mkdtempSync(join(tmpdir(), "fastifly-jobs-sqlite-"));
      const client = createConfiguredSqliteClient({ source: join(dir, "test.db") });
      try {
        runSqliteMigrations(client);
        await test(
          createSqliteJobRepository(client, {
            clock: { now: () => T0 },
            createId: createDeterministicIdGenerator(),
            defaultMaxAttempts: 3,
          }),
        );
      } finally {
        client.close();
        rmSync(dir, { force: true, recursive: true });
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
        await test(
          createPostgresJobRepository(db, {
            clock: { now: () => T0 },
            createId: createDeterministicIdGenerator(),
            defaultMaxAttempts: 3,
          }),
        );
      } finally {
        await client.close();
      }
    },
  },
];

describe("job repository", () => {
  for (const factory of factories) {
    it(`enqueues a runnable job on ${factory.name}`, async () => {
      await factory.run(async (jobs) => {
        const job = await jobs.enqueue({
          payload: { templateId: "t1" },
          type: "recurring.generate",
        });
        expect(job).toMatchObject({
          attempts: 0,
          maxAttempts: 3,
          payload: { templateId: "t1" },
          status: "available",
          type: "recurring.generate",
        });
      });
    });

    it(`deduplicates by dedupeKey without inserting twice on ${factory.name}`, async () => {
      await factory.run(async (jobs) => {
        const first = await jobs.enqueue({
          dedupeKey: "recurring.generate:t1:2026-06",
          payload: { n: 1 },
          type: "recurring.generate",
        });
        const second = await jobs.enqueue({
          dedupeKey: "recurring.generate:t1:2026-06",
          payload: { n: 2 },
          type: "recurring.generate",
        });
        expect(second.id).toBe(first.id);
        expect(second.payload).toEqual({ n: 1 });
        expect(await jobs.listRecent(10)).toHaveLength(1);
      });
    });

    it(`claims runnable jobs once and returns null when none remain on ${factory.name}`, async () => {
      await factory.run(async (jobs) => {
        await jobs.enqueue({ payload: { n: 1 }, type: "a" });
        await jobs.enqueue({ payload: { n: 2 }, type: "b" });

        const claimedOne = await jobs.claimNext("worker-1", T0);
        const claimedTwo = await jobs.claimNext("worker-1", T0);
        const claimedThree = await jobs.claimNext("worker-1", T0);

        expect(claimedOne?.status).toBe("running");
        expect(claimedOne?.lockedBy).toBe("worker-1");
        expect(claimedTwo?.id).not.toBe(claimedOne?.id);
        expect(claimedThree).toBeNull();
      });
    });

    it(`does not claim jobs scheduled for the future on ${factory.name}`, async () => {
      await factory.run(async (jobs) => {
        await jobs.enqueue({
          availableAt: new Date(T0.getTime() + 60_000),
          payload: {},
          type: "later",
        });
        expect(await jobs.claimNext("worker-1", T0)).toBeNull();
        expect(await jobs.claimNext("worker-1", new Date(T0.getTime() + 60_000))).not.toBeNull();
      });
    });

    it(`retries with backoff then marks terminal failure at maxAttempts on ${factory.name}`, async () => {
      await factory.run(async (jobs) => {
        const job = await jobs.enqueue({ payload: {}, type: "flaky" });

        await jobs.claimNext("worker-1", T0);
        await jobs.fail(job.id, T0, 5_000);
        let reread = (await jobs.listRecent(1))[0];
        expect(reread?.status).toBe("available");
        expect(reread?.attempts).toBe(1);
        expect(reread?.availableAt).toBe(new Date(T0.getTime() + 5_000).toISOString());

        await jobs.fail(job.id, T0, 5_000); // attempt 2
        await jobs.fail(job.id, T0, 5_000); // attempt 3 -> terminal (maxAttempts 3)
        reread = (await jobs.listRecent(1))[0];
        expect(reread?.status).toBe("failed");
        expect(reread?.attempts).toBe(3);
      });
    });

    it(`completes a claimed job on ${factory.name}`, async () => {
      await factory.run(async (jobs) => {
        const job = await jobs.enqueue({ payload: {}, type: "ok" });
        await jobs.claimNext("worker-1", T0);
        await jobs.complete(job.id, T0);
        expect((await jobs.listRecent(1))[0]?.status).toBe("succeeded");
      });
    });

    it(`recovers jobs whose lock is stale on ${factory.name}`, async () => {
      await factory.run(async (jobs) => {
        await jobs.enqueue({ payload: {}, type: "stuck" });
        await jobs.claimNext("worker-1", T0);

        // Not stale yet.
        expect(await jobs.recoverStale(new Date(T0.getTime() + 30_000), 60_000)).toBe(0);
        // Lock older than TTL -> reclaimed.
        const reclaimed = await jobs.recoverStale(new Date(T0.getTime() + 120_000), 60_000);
        expect(reclaimed).toBe(1);
        expect((await jobs.listRecent(1))[0]?.status).toBe("available");
      });
    });

    it(`resets a failed job via retry on ${factory.name}`, async () => {
      await factory.run(async (jobs) => {
        const job = await jobs.enqueue({ maxAttempts: 1, payload: {}, type: "deadletter" });
        await jobs.claimNext("worker-1", T0);
        await jobs.fail(job.id, T0, 1_000); // maxAttempts 1 -> terminal
        expect((await jobs.listRecent(1))[0]?.status).toBe("failed");

        const retried = await jobs.retry(job.id, new Date(T0.getTime() + 1_000));
        expect(retried?.status).toBe("available");
        expect(retried?.attempts).toBe(0);
        expect(await jobs.retry(job.id, T0)).toBeNull(); // already available, not failed
      });
    });
  }
});
