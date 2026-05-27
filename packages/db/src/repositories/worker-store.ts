import type { SyncedId } from "@fastifly/common";
import { and, asc, eq, lt, lte } from "drizzle-orm";

import type { PostgresDatabase } from "../postgres/client.js";
import {
  pgIdempotencyReceipts,
  pgRecurringOccurrences,
  pgRecurringTemplates,
  pgSessions,
} from "../postgres/schema.js";
import type { RecurringOccurrenceStatus } from "../schema-types.js";
import type { SqliteClient } from "../sqlite/client.js";
import type { RepositoryClock } from "./base.js";
import { systemClock } from "./base.js";
import type { RepositoryIdGenerator } from "./identity.js";

export type DueRecurringTemplate = {
  readonly id: SyncedId;
  readonly workspaceId: SyncedId;
  readonly ledgerId: SyncedId;
  readonly createdBy: SyncedId;
  readonly nextRunAt: string;
};

export type RecordRecurringOccurrenceInput = {
  readonly workspaceId: SyncedId;
  readonly ledgerId: SyncedId;
  readonly recurringTemplateId: SyncedId;
  readonly scheduledFor: string;
  readonly transactionGroupId: string | null;
  readonly status: RecurringOccurrenceStatus;
  readonly errorMessage?: string | null;
};

/** Cross-cutting data access used by the worker process (scheduler + cleanup handlers). */
export type WorkerStore = {
  readonly listDueRecurringTemplates: (
    now: Date,
    limit: number,
  ) => Promise<readonly DueRecurringTemplate[]>;
  readonly recordRecurringOccurrence: (input: RecordRecurringOccurrenceInput) => Promise<void>;
  readonly deleteExpiredSessions: (now: Date) => Promise<number>;
  readonly deleteExpiredIdempotencyReceipts: (now: Date) => Promise<number>;
};

export type WorkerStoreOptions = {
  readonly clock?: RepositoryClock;
  readonly createId: RepositoryIdGenerator;
};

const iso = (date: Date): string => date.toISOString();

export function createSqliteWorkerStore(
  client: SqliteClient,
  options: WorkerStoreOptions,
): WorkerStore {
  const clock = options.clock ?? systemClock;

  return {
    async listDueRecurringTemplates(now, limit) {
      const rows = client
        .prepare(
          `SELECT id, workspace_id, ledger_id, created_by, next_run_at
           FROM recurring_templates
           WHERE status = 'active' AND next_run_at <= ?
           ORDER BY next_run_at ASC, id ASC
           LIMIT ?`,
        )
        .all(iso(now), limit) as {
        readonly id: string;
        readonly workspace_id: string;
        readonly ledger_id: string;
        readonly created_by: string;
        readonly next_run_at: string;
      }[];
      return rows.map((row) => ({
        createdBy: row.created_by as SyncedId,
        id: row.id as SyncedId,
        ledgerId: row.ledger_id as SyncedId,
        nextRunAt: row.next_run_at,
        workspaceId: row.workspace_id as SyncedId,
      }));
    },

    async recordRecurringOccurrence(input) {
      const now = iso(clock.now());
      client
        .prepare(
          `INSERT INTO recurring_occurrences
             (id, workspace_id, ledger_id, recurring_template_id, scheduled_for,
              transaction_group_id, status, error_message, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (recurring_template_id, scheduled_for)
           DO UPDATE SET transaction_group_id = excluded.transaction_group_id,
                         status = excluded.status,
                         error_message = excluded.error_message,
                         updated_at = excluded.updated_at`,
        )
        .run(
          options.createId(),
          input.workspaceId,
          input.ledgerId,
          input.recurringTemplateId,
          input.scheduledFor,
          input.transactionGroupId,
          input.status,
          input.errorMessage ?? null,
          now,
          now,
        );
    },

    async deleteExpiredSessions(now) {
      return client.prepare(`DELETE FROM sessions WHERE expires_at < ?`).run(iso(now)).changes;
    },

    async deleteExpiredIdempotencyReceipts(now) {
      return client.prepare(`DELETE FROM idempotency_receipts WHERE expires_at < ?`).run(iso(now))
        .changes;
    },
  };
}

export function createPostgresWorkerStore(
  db: PostgresDatabase,
  options: WorkerStoreOptions,
): WorkerStore {
  const clock = options.clock ?? systemClock;

  return {
    async listDueRecurringTemplates(now, limit) {
      const rows = await db
        .select({
          createdBy: pgRecurringTemplates.createdBy,
          id: pgRecurringTemplates.id,
          ledgerId: pgRecurringTemplates.ledgerId,
          nextRunAt: pgRecurringTemplates.nextRunAt,
          workspaceId: pgRecurringTemplates.workspaceId,
        })
        .from(pgRecurringTemplates)
        .where(
          and(eq(pgRecurringTemplates.status, "active"), lte(pgRecurringTemplates.nextRunAt, now)),
        )
        .orderBy(asc(pgRecurringTemplates.nextRunAt), asc(pgRecurringTemplates.id))
        .limit(limit);
      return rows.map((row) => ({
        createdBy: row.createdBy as SyncedId,
        id: row.id as SyncedId,
        ledgerId: row.ledgerId as SyncedId,
        nextRunAt: row.nextRunAt.toISOString(),
        workspaceId: row.workspaceId as SyncedId,
      }));
    },

    async recordRecurringOccurrence(input) {
      const now = clock.now();
      await db
        .insert(pgRecurringOccurrences)
        .values({
          createdAt: now,
          errorMessage: input.errorMessage ?? null,
          id: options.createId(),
          ledgerId: input.ledgerId,
          recurringTemplateId: input.recurringTemplateId,
          scheduledFor: new Date(input.scheduledFor),
          status: input.status,
          transactionGroupId: input.transactionGroupId,
          updatedAt: now,
          workspaceId: input.workspaceId,
        })
        .onConflictDoUpdate({
          set: {
            errorMessage: input.errorMessage ?? null,
            status: input.status,
            transactionGroupId: input.transactionGroupId,
            updatedAt: now,
          },
          target: [pgRecurringOccurrences.recurringTemplateId, pgRecurringOccurrences.scheduledFor],
        });
    },

    async deleteExpiredSessions(now) {
      const rows = await db.delete(pgSessions).where(lt(pgSessions.expiresAt, now)).returning();
      return rows.length;
    },

    async deleteExpiredIdempotencyReceipts(now) {
      const rows = await db
        .delete(pgIdempotencyReceipts)
        .where(lt(pgIdempotencyReceipts.expiresAt, now))
        .returning();
      return rows.length;
    },
  };
}
