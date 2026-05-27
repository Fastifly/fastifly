import { and, asc, desc, eq, lt, lte } from "drizzle-orm";

import type { PostgresDatabase } from "../postgres/client.js";
import { pgJobQueue } from "../postgres/schema.js";
import type { JobQueueStatus, JsonObject } from "../schema-types.js";
import type { SqliteClient } from "../sqlite/client.js";
import type { RepositoryClock } from "./base.js";
import { systemClock } from "./base.js";
import type { RepositoryIdGenerator } from "./identity.js";

export type JobRecord = {
  readonly id: string;
  readonly type: string;
  readonly status: JobQueueStatus;
  readonly payload: JsonObject;
  readonly dedupeKey: string | null;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly availableAt: string;
  readonly lockedAt: string | null;
  readonly lockedBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type EnqueueJobInput = {
  readonly type: string;
  readonly payload: JsonObject;
  readonly dedupeKey?: string | null;
  readonly availableAt?: Date;
  readonly maxAttempts?: number;
};

export type JobRepository = {
  /** Insert a job. When `dedupeKey` matches an existing row, the existing row is returned unchanged. */
  readonly enqueue: (input: EnqueueJobInput) => Promise<JobRecord>;
  /** Atomically claim the next runnable job (status=available, availableAt<=now) and mark it running. */
  readonly claimNext: (workerId: string, now: Date) => Promise<JobRecord | null>;
  readonly complete: (jobId: string, now: Date) => Promise<void>;
  /** Increment attempts; reschedule with backoff, or mark terminal `failed` at maxAttempts. */
  readonly fail: (jobId: string, now: Date, backoffMs: number) => Promise<void>;
  /** Reclaim jobs stuck in `running` whose lock is older than `staleLockMs`. Returns reclaimed count. */
  readonly recoverStale: (now: Date, staleLockMs: number) => Promise<number>;
  readonly listRecent: (limit: number) => Promise<readonly JobRecord[]>;
  /** Reset a `failed` job back to `available`. Returns the job, or null if not found / not failed. */
  readonly retry: (jobId: string, now: Date) => Promise<JobRecord | null>;
};

export type JobRepositoryOptions = {
  readonly clock?: RepositoryClock;
  readonly createId: RepositoryIdGenerator;
  readonly defaultMaxAttempts?: number;
};

const FALLBACK_MAX_ATTEMPTS = 5;

function iso(date: Date): string {
  return date.toISOString();
}

// ---------------------------------------------------------------------------
// SQLite
// ---------------------------------------------------------------------------

type SqliteJobRow = {
  readonly id: string;
  readonly type: string;
  readonly status: JobQueueStatus;
  readonly payload_json: string;
  readonly dedupe_key: string | null;
  readonly attempts: number;
  readonly max_attempts: number;
  readonly available_at: string;
  readonly locked_at: string | null;
  readonly locked_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

function toRecordFromSqlite(row: SqliteJobRow): JobRecord {
  return {
    attempts: row.attempts,
    availableAt: row.available_at,
    createdAt: row.created_at,
    dedupeKey: row.dedupe_key,
    id: row.id,
    lockedAt: row.locked_at,
    lockedBy: row.locked_by,
    maxAttempts: row.max_attempts,
    payload: JSON.parse(row.payload_json) as JsonObject,
    status: row.status,
    type: row.type,
    updatedAt: row.updated_at,
  };
}

function readSqliteJob(client: SqliteClient, id: string): SqliteJobRow | undefined {
  return client
    .prepare(
      `SELECT id, type, status, payload_json, dedupe_key, attempts, max_attempts,
              available_at, locked_at, locked_by, created_at, updated_at
       FROM job_queue WHERE id = ? LIMIT 1`,
    )
    .get(id) as SqliteJobRow | undefined;
}

export function createSqliteJobRepository(
  client: SqliteClient,
  options: JobRepositoryOptions,
): JobRepository {
  const clock = options.clock ?? systemClock;
  const defaultMaxAttempts = options.defaultMaxAttempts ?? FALLBACK_MAX_ATTEMPTS;

  return {
    async enqueue(input) {
      const enqueueTx = client.transaction((): JobRecord => {
        if (input.dedupeKey != null) {
          const existing = client
            .prepare(`SELECT id FROM job_queue WHERE dedupe_key = ? LIMIT 1`)
            .get(input.dedupeKey) as { readonly id: string } | undefined;
          if (existing) {
            return toRecordFromSqlite(readSqliteJob(client, existing.id) as SqliteJobRow);
          }
        }

        const now = iso(clock.now());
        const id = options.createId();
        client
          .prepare(
            `INSERT INTO job_queue
               (id, type, status, payload_json, dedupe_key, attempts, max_attempts,
                available_at, created_at, updated_at)
             VALUES (?, ?, 'available', ?, ?, 0, ?, ?, ?, ?)`,
          )
          .run(
            id,
            input.type,
            JSON.stringify(input.payload),
            input.dedupeKey ?? null,
            input.maxAttempts ?? defaultMaxAttempts,
            input.availableAt ? iso(input.availableAt) : now,
            now,
            now,
          );
        return toRecordFromSqlite(readSqliteJob(client, id) as SqliteJobRow);
      });

      return enqueueTx.immediate();
    },

    async claimNext(workerId, now) {
      const nowIso = iso(now);
      const claimTx = client.transaction((): JobRecord | null => {
        const candidate = client
          .prepare(
            `SELECT id FROM job_queue
             WHERE status = 'available' AND available_at <= ?
             ORDER BY available_at ASC, created_at ASC
             LIMIT 1`,
          )
          .get(nowIso) as { readonly id: string } | undefined;
        if (!candidate) {
          return null;
        }

        client
          .prepare(
            `UPDATE job_queue
             SET status = 'running', locked_at = ?, locked_by = ?, updated_at = ?
             WHERE id = ?`,
          )
          .run(nowIso, workerId, nowIso, candidate.id);
        return toRecordFromSqlite(readSqliteJob(client, candidate.id) as SqliteJobRow);
      });

      return claimTx.immediate();
    },

    async complete(jobId, now) {
      client
        .prepare(
          `UPDATE job_queue SET status = 'succeeded', locked_at = NULL, locked_by = NULL, updated_at = ?
           WHERE id = ?`,
        )
        .run(iso(now), jobId);
    },

    async fail(jobId, now, backoffMs) {
      const failTx = client.transaction((): void => {
        const row = readSqliteJob(client, jobId);
        if (!row) {
          return;
        }
        const attempts = row.attempts + 1;
        const terminal = attempts >= row.max_attempts;
        const nowIso = iso(now);
        client
          .prepare(
            `UPDATE job_queue
             SET status = ?, attempts = ?, available_at = ?, locked_at = NULL, locked_by = NULL, updated_at = ?
             WHERE id = ?`,
          )
          .run(
            terminal ? "failed" : "available",
            attempts,
            terminal ? row.available_at : iso(new Date(now.getTime() + backoffMs)),
            nowIso,
            jobId,
          );
      });
      failTx.immediate();
    },

    async recoverStale(now, staleLockMs) {
      const threshold = iso(new Date(now.getTime() - staleLockMs));
      const result = client
        .prepare(
          `UPDATE job_queue
           SET status = 'available', locked_at = NULL, locked_by = NULL, updated_at = ?
           WHERE status = 'running' AND locked_at IS NOT NULL AND locked_at < ?`,
        )
        .run(iso(now), threshold);
      return result.changes;
    },

    async listRecent(limit) {
      const rows = client
        .prepare(
          `SELECT id, type, status, payload_json, dedupe_key, attempts, max_attempts,
                  available_at, locked_at, locked_by, created_at, updated_at
           FROM job_queue ORDER BY created_at DESC, id DESC LIMIT ?`,
        )
        .all(limit) as SqliteJobRow[];
      return rows.map(toRecordFromSqlite);
    },

    async retry(jobId, now) {
      const retryTx = client.transaction((): JobRecord | null => {
        const row = readSqliteJob(client, jobId);
        if (!row || row.status !== "failed") {
          return null;
        }
        const nowIso = iso(now);
        client
          .prepare(
            `UPDATE job_queue
             SET status = 'available', attempts = 0, available_at = ?, locked_at = NULL, locked_by = NULL, updated_at = ?
             WHERE id = ?`,
          )
          .run(nowIso, nowIso, jobId);
        return toRecordFromSqlite(readSqliteJob(client, jobId) as SqliteJobRow);
      });
      return retryTx.immediate();
    },
  };
}

// ---------------------------------------------------------------------------
// PostgreSQL
// ---------------------------------------------------------------------------

type PgJobRow = typeof pgJobQueue.$inferSelect;

function toRecordFromPostgres(row: PgJobRow): JobRecord {
  return {
    attempts: row.attempts,
    availableAt: row.availableAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    dedupeKey: row.dedupeKey,
    id: row.id,
    lockedAt: row.lockedAt ? row.lockedAt.toISOString() : null,
    lockedBy: row.lockedBy,
    maxAttempts: row.maxAttempts,
    payload: row.payloadJson,
    status: row.status,
    type: row.type,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createPostgresJobRepository(
  db: PostgresDatabase,
  options: JobRepositoryOptions,
): JobRepository {
  const clock = options.clock ?? systemClock;
  const defaultMaxAttempts = options.defaultMaxAttempts ?? FALLBACK_MAX_ATTEMPTS;

  return {
    async enqueue(input) {
      return db.transaction(async (tx) => {
        if (input.dedupeKey != null) {
          const existing = await tx
            .select()
            .from(pgJobQueue)
            .where(eq(pgJobQueue.dedupeKey, input.dedupeKey))
            .limit(1);
          if (existing[0]) {
            return toRecordFromPostgres(existing[0]);
          }
        }

        const now = clock.now();
        const rows = await tx
          .insert(pgJobQueue)
          .values({
            attempts: 0,
            availableAt: input.availableAt ?? now,
            createdAt: now,
            dedupeKey: input.dedupeKey ?? null,
            id: options.createId(),
            maxAttempts: input.maxAttempts ?? defaultMaxAttempts,
            payloadJson: input.payload,
            status: "available",
            type: input.type,
            updatedAt: now,
          })
          .returning();
        const row = rows[0];
        if (!row) {
          throw new Error("Failed to enqueue job.");
        }
        return toRecordFromPostgres(row);
      });
    },

    async claimNext(workerId, now) {
      return db.transaction(async (tx) => {
        const candidates = await tx
          .select()
          .from(pgJobQueue)
          .where(and(eq(pgJobQueue.status, "available"), lte(pgJobQueue.availableAt, now)))
          .orderBy(asc(pgJobQueue.availableAt), asc(pgJobQueue.createdAt))
          .limit(1)
          .for("update", { skipLocked: true });
        const candidate = candidates[0];
        if (!candidate) {
          return null;
        }

        const rows = await tx
          .update(pgJobQueue)
          .set({ lockedAt: now, lockedBy: workerId, status: "running", updatedAt: now })
          .where(eq(pgJobQueue.id, candidate.id))
          .returning();
        return rows[0] ? toRecordFromPostgres(rows[0]) : null;
      });
    },

    async complete(jobId, now) {
      await db
        .update(pgJobQueue)
        .set({ lockedAt: null, lockedBy: null, status: "succeeded", updatedAt: now })
        .where(eq(pgJobQueue.id, jobId));
    },

    async fail(jobId, now, backoffMs) {
      await db.transaction(async (tx) => {
        const rows = await tx.select().from(pgJobQueue).where(eq(pgJobQueue.id, jobId)).limit(1);
        const row = rows[0];
        if (!row) {
          return;
        }
        const attempts = row.attempts + 1;
        const terminal = attempts >= row.maxAttempts;
        await tx
          .update(pgJobQueue)
          .set({
            attempts,
            availableAt: terminal ? row.availableAt : new Date(now.getTime() + backoffMs),
            lockedAt: null,
            lockedBy: null,
            status: terminal ? "failed" : "available",
            updatedAt: now,
          })
          .where(eq(pgJobQueue.id, jobId));
      });
    },

    async recoverStale(now, staleLockMs) {
      const threshold = new Date(now.getTime() - staleLockMs);
      const rows = await db
        .update(pgJobQueue)
        .set({ lockedAt: null, lockedBy: null, status: "available", updatedAt: now })
        .where(and(eq(pgJobQueue.status, "running"), lt(pgJobQueue.lockedAt, threshold)))
        .returning({ id: pgJobQueue.id });
      return rows.length;
    },

    async listRecent(limit) {
      const rows = await db
        .select()
        .from(pgJobQueue)
        .orderBy(desc(pgJobQueue.createdAt), desc(pgJobQueue.id))
        .limit(limit);
      return rows.map(toRecordFromPostgres);
    },

    async retry(jobId, now) {
      return db.transaction(async (tx) => {
        const rows = await tx.select().from(pgJobQueue).where(eq(pgJobQueue.id, jobId)).limit(1);
        const row = rows[0];
        if (!row || row.status !== "failed") {
          return null;
        }
        const updated = await tx
          .update(pgJobQueue)
          .set({
            attempts: 0,
            availableAt: now,
            lockedAt: null,
            lockedBy: null,
            status: "available",
            updatedAt: now,
          })
          .where(eq(pgJobQueue.id, jobId))
          .returning();
        return updated[0] ? toRecordFromPostgres(updated[0]) : null;
      });
    },
  };
}
