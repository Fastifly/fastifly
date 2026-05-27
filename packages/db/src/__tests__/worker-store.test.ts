import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUuidV7, type SyncedId } from "@fastifly/common";
import { describe, expect, it } from "vitest";

import {
  createConfiguredSqliteClient,
  createPglitePostgresDatabaseFromClient,
  createPostgresIdentityRepository,
  createPostgresWorkerStore,
  createPostgresWorkflowRepository,
  createSqliteDatabaseFromClient,
  createSqliteIdentityRepository,
  createSqliteWorkerStore,
  createSqliteWorkflowRepository,
  type IdentityRepository,
  type RecurringTemplatePayload,
  type WorkerStore,
  type WorkflowRepository,
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

const payload = (): RecurringTemplatePayload => ({
  currencyCode: "INR",
  description: "Rent",
  lines: [],
  sourceAccountId: createUuidV7(),
  title: "Rent",
  type: "expense",
});

type WorkerStoreContext = {
  readonly workerStore: WorkerStore;
  readonly identityRepository: IdentityRepository;
  readonly workflowRepository: WorkflowRepository;
  readonly countOccurrences: () => Promise<number>;
  readonly insertExpiredReceipt: (input: {
    readonly workspaceId: SyncedId;
    readonly ledgerId: SyncedId;
    readonly actorUserId: SyncedId;
    readonly expiresAt: Date;
  }) => Promise<void>;
};

type WorkerStoreFactory = {
  readonly name: string;
  readonly run: (test: (context: WorkerStoreContext) => Promise<void>) => Promise<void>;
};

const clock = { now: () => T0 };

const factories: readonly WorkerStoreFactory[] = [
  {
    name: "SQLite",
    async run(test) {
      const dir = mkdtempSync(join(tmpdir(), "fastifly-worker-store-sqlite-"));
      const client = createConfiguredSqliteClient({ source: join(dir, "test.db") });
      try {
        runSqliteMigrations(client);
        const db = createSqliteDatabaseFromClient(client);
        const createId = createDeterministicIdGenerator();
        await test({
          countOccurrences: async () =>
            (
              client.prepare("SELECT COUNT(*) AS c FROM recurring_occurrences").get() as {
                readonly c: number;
              }
            ).c,
          identityRepository: createSqliteIdentityRepository(db, { clock, createId }),
          insertExpiredReceipt: async (input) => {
            client
              .prepare(
                `INSERT INTO idempotency_receipts
                   (id, workspace_id, ledger_id, actor_user_id, idempotency_key, request_hash,
                    response_status, response_body_json, created_at, expires_at)
                 VALUES (?, ?, ?, ?, ?, ?, 200, '{}', ?, ?)`,
              )
              .run(
                createId(),
                input.workspaceId,
                input.ledgerId,
                input.actorUserId,
                `key-${createId()}`,
                "hash",
                T0.toISOString(),
                input.expiresAt.toISOString(),
              );
          },
          workerStore: createSqliteWorkerStore(client, { clock, createId }),
          workflowRepository: createSqliteWorkflowRepository(client, { clock, createId }),
        });
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
        const createId = createDeterministicIdGenerator();
        await test({
          countOccurrences: async () => {
            const result = await client.query<{ readonly c: number }>(
              "SELECT COUNT(*)::int AS c FROM recurring_occurrences",
            );
            return result.rows[0]?.c ?? 0;
          },
          identityRepository: createPostgresIdentityRepository(db, { clock, createId }),
          insertExpiredReceipt: async (input) => {
            await client.query(
              `INSERT INTO idempotency_receipts
                 (id, workspace_id, ledger_id, actor_user_id, idempotency_key, request_hash,
                  response_status, response_body_json, created_at, expires_at)
               VALUES ($1, $2, $3, $4, $5, $6, 200, '{}', $7, $8)`,
              [
                createId(),
                input.workspaceId,
                input.ledgerId,
                input.actorUserId,
                `key-${createId()}`,
                "hash",
                T0.toISOString(),
                input.expiresAt.toISOString(),
              ],
            );
          },
          workerStore: createPostgresWorkerStore(db, { clock, createId }),
          workflowRepository: createPostgresWorkflowRepository(db, { clock, createId }),
        });
      } finally {
        await client.close();
      }
    },
  },
];

async function createBaseState(identityRepository: IdentityRepository) {
  const user = await identityRepository.createUser({
    displayName: "Owner",
    passwordHash: "$argon2id$fixture",
    username: "Owner",
  });
  const workspaceState = await identityRepository.bootstrapDefaultWorkspace({
    baseCurrencyCode: "INR",
    firstDayOfWeek: 1,
    ledgerName: "Primary",
    userId: user.id,
    workspaceName: "Personal",
  });
  return { ledger: workspaceState.ledger, user, workspace: workspaceState.workspace };
}

describe("worker store", () => {
  for (const factory of factories) {
    it(`lists only active, due recurring templates on ${factory.name}`, async () => {
      await factory.run(async ({ identityRepository, workerStore, workflowRepository }) => {
        const { ledger, user, workspace } = await createBaseState(identityRepository);
        const base = {
          cadence: "monthly" as const,
          createdBy: user.id,
          intervalCount: 1,
          ledgerId: ledger.id,
          payload: payload(),
          workspaceId: workspace.id,
        };
        const due = await workflowRepository.createRecurringTemplate({
          ...base,
          nextRunAt: new Date(T0.getTime() - 1000).toISOString(),
          status: "active",
        });
        await workflowRepository.createRecurringTemplate({
          ...base,
          nextRunAt: new Date(T0.getTime() + 86_400_000).toISOString(),
          status: "active",
        });
        await workflowRepository.createRecurringTemplate({
          ...base,
          nextRunAt: new Date(T0.getTime() - 1000).toISOString(),
          status: "paused",
        });

        const dueTemplates = await workerStore.listDueRecurringTemplates(T0, 50);
        expect(dueTemplates).toHaveLength(1);
        expect(dueTemplates[0]?.id).toBe(due.id);
        expect(dueTemplates[0]?.createdBy).toBe(user.id);
      });
    });

    it(`upserts recurring occurrences idempotently on ${factory.name}`, async () => {
      await factory.run(
        async ({ countOccurrences, identityRepository, workerStore, workflowRepository }) => {
          const { ledger, user, workspace } = await createBaseState(identityRepository);
          const template = await workflowRepository.createRecurringTemplate({
            cadence: "monthly",
            createdBy: user.id,
            intervalCount: 1,
            ledgerId: ledger.id,
            nextRunAt: T0.toISOString(),
            payload: payload(),
            status: "active",
            workspaceId: workspace.id,
          });

          const occurrence = {
            ledgerId: ledger.id,
            recurringTemplateId: template.id,
            scheduledFor: T0.toISOString(),
            workspaceId: workspace.id,
          };
          await workerStore.recordRecurringOccurrence({
            ...occurrence,
            status: "generated",
            transactionGroupId: null,
          });
          await workerStore.recordRecurringOccurrence({
            ...occurrence,
            status: "generated",
            transactionGroupId: null,
          });

          expect(await countOccurrences()).toBe(1);
        },
      );
    });

    it(`deletes only expired sessions and idempotency receipts on ${factory.name}`, async () => {
      await factory.run(async ({ identityRepository, insertExpiredReceipt, workerStore }) => {
        const { ledger, user, workspace } = await createBaseState(identityRepository);

        await identityRepository.createSession({
          expiresAt: new Date(T0.getTime() - 1000),
          tokenHash: "expired-hash",
          userId: user.id,
        });
        await identityRepository.createSession({
          expiresAt: new Date(T0.getTime() + 86_400_000),
          tokenHash: "live-hash",
          userId: user.id,
        });
        await insertExpiredReceipt({
          actorUserId: user.id,
          expiresAt: new Date(T0.getTime() - 1000),
          ledgerId: ledger.id,
          workspaceId: workspace.id,
        });

        expect(await workerStore.deleteExpiredSessions(T0)).toBe(1);
        expect(await workerStore.deleteExpiredSessions(T0)).toBe(0);
        expect(await workerStore.deleteExpiredIdempotencyReceipts(T0)).toBe(1);
        expect(await workerStore.deleteExpiredIdempotencyReceipts(T0)).toBe(0);
      });
    });
  }
});
