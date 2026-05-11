import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUuidV7, type SyncedId, type SyncOperationEnvelope } from "@fastifly/common";
import { describe, expect, it } from "vitest";

import {
  createConfiguredSqliteClient,
  createPglitePostgresDatabaseFromClient,
  createPostgresIdentityRepository,
  createPostgresSyncRepository,
  createSqliteDatabaseFromClient,
  createSqliteIdentityRepository,
  createSqliteSyncRepository,
  type IdentityRepository,
  type SqliteClient,
  type SyncRepository,
} from "../index.js";
import {
  createInMemoryPgliteDatabase,
  runPglitePostgresMigrations,
  runSqliteMigrations,
} from "../testing/migrations.js";

type QueryablePostgres = { readonly query: (sql: string) => Promise<unknown> };

type SyncRepositoryFactory = {
  readonly name: string;
  readonly run: (test: (context: SyncRepositoryContext) => Promise<void>) => Promise<void>;
};

type SyncRepositoryContext = {
  readonly dialect: "sqlite" | "postgres";
  readonly identityRepository: IdentityRepository;
  readonly rawDb: SqliteClient | QueryablePostgres;
  readonly syncRepository: SyncRepository;
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

function createClock(date: Date) {
  return { now: () => date };
}

const repositoryClock = createClock(new Date("2026-05-09T00:00:00.000Z"));

const factories: readonly SyncRepositoryFactory[] = [
  {
    name: "SQLite",
    async run(test) {
      const sqliteDir = mkdtempSync(join(tmpdir(), "fastifly-sync-repository-sqlite-"));
      const client = createConfiguredSqliteClient({ source: join(sqliteDir, "test.db") });

      try {
        runSqliteMigrations(client);
        const db = createSqliteDatabaseFromClient(client);
        const createId = createDeterministicIdGenerator();
        await test({
          dialect: "sqlite",
          identityRepository: createSqliteIdentityRepository(db, {
            clock: repositoryClock,
            createId,
          }),
          rawDb: client,
          syncRepository: createSqliteSyncRepository(client),
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
          dialect: "postgres",
          identityRepository: createPostgresIdentityRepository(db, {
            clock: repositoryClock,
            createId,
          }),
          rawDb: client,
          syncRepository: createPostgresSyncRepository(db),
        });
      } finally {
        await client.close();
      }
    },
  },
];

describe("sync repository", () => {
  for (const factory of factories) {
    it(`records accepted operations with monotonic ledger revisions on ${factory.name}`, async () => {
      await factory.run(async ({ dialect, identityRepository, rawDb, syncRepository }) => {
        const { deviceId, user, workspaceState } = await createBaseState(
          dialect,
          rawDb,
          identityRepository,
        );
        const firstOperation = createOperation({
          deviceId,
          ledgerId: workspaceState.ledger.id,
          localSequence: "1",
          operationId: "operation_1",
          workspaceId: workspaceState.workspace.id,
        });
        const secondOperation = createOperation({
          deviceId,
          ledgerId: workspaceState.ledger.id,
          localSequence: "2",
          operationId: "operation_2",
          workspaceId: workspaceState.workspace.id,
        });

        await expect(syncRepository.findDeviceForUser(deviceId, user.id)).resolves.toMatchObject({
          id: deviceId,
          revokedAt: null,
        });
        await syncRepository.touchDeviceLastSeen(
          deviceId,
          user.id,
          new Date("2026-05-09T00:30:00.000Z"),
        );
        await expect(syncRepository.findDeviceForUser(deviceId, user.id)).resolves.toMatchObject({
          lastSeenAt: "2026-05-09T00:30:00.000Z",
        });
        await expect(
          syncRepository.recordAcceptedOperation({
            actorUserId: user.id,
            operation: firstOperation,
            receivedAt: new Date("2026-05-09T01:00:00.000Z"),
            resultJson: { status: "accepted" },
          }),
        ).resolves.toBe(1);
        await expect(
          syncRepository.recordAcceptedOperation({
            actorUserId: user.id,
            operation: secondOperation,
            receivedAt: new Date("2026-05-09T01:01:00.000Z"),
            resultJson: { status: "accepted" },
          }),
        ).resolves.toBe(2);

        await expect(
          syncRepository.getCurrentRevision({
            ledgerId: workspaceState.ledger.id,
            workspaceId: workspaceState.workspace.id,
          }),
        ).resolves.toBe(2);
        await expect(syncRepository.findOperation("operation_1")).resolves.toMatchObject({
          id: "operation_1",
          resultJson: { status: "accepted" },
          serverRevision: 1,
          status: "accepted",
        });
        await expect(
          syncRepository.findOperationByDeviceSequence(deviceId, "2"),
        ).resolves.toMatchObject({
          id: "operation_2",
          serverRevision: 2,
        });
        await expect(
          syncRepository.listAcceptedOperationsSince({
            ledgerId: workspaceState.ledger.id,
            limit: 10,
            sinceRevision: 1,
            workspaceId: workspaceState.workspace.id,
          }),
        ).resolves.toMatchObject([
          {
            id: "operation_2",
            serverRevision: 2,
            status: "accepted",
          },
        ]);
        await expect(
          syncRepository.getLastAcceptedOperationAt({
            ledgerId: workspaceState.ledger.id,
            workspaceId: workspaceState.workspace.id,
          }),
        ).resolves.toBe("2026-05-09T01:01:00.000Z");
      });
    });

    it(`records rejected and conflict operations without advancing revisions on ${factory.name}`, async () => {
      await factory.run(async ({ dialect, identityRepository, rawDb, syncRepository }) => {
        const { deviceId, user, workspaceState } = await createBaseState(
          dialect,
          rawDb,
          identityRepository,
        );
        const rejectedOperation = createOperation({
          deviceId,
          ledgerId: workspaceState.ledger.id,
          localSequence: "1",
          operationId: "operation_rejected",
          workspaceId: workspaceState.workspace.id,
        });
        const conflictOperation = createOperation({
          baseRevision: "0",
          deviceId,
          ledgerId: workspaceState.ledger.id,
          localSequence: "2",
          operationId: "operation_conflict",
          workspaceId: workspaceState.workspace.id,
        });

        await syncRepository.recordRejectedOperation({
          actorUserId: user.id,
          operation: rejectedOperation,
          receivedAt: new Date("2026-05-09T01:00:00.000Z"),
          resultJson: { reason: "invalid_operation" },
        });
        await syncRepository.recordConflictOperation({
          actorUserId: user.id,
          conflictId: createUuidV7(),
          conflictType: "stale_update",
          localRevision: 3,
          operation: conflictOperation,
          receivedAt: new Date("2026-05-09T01:01:00.000Z"),
          resultJson: { reason: "stale_base_revision" },
        });

        await expect(
          syncRepository.getCurrentRevision({
            ledgerId: workspaceState.ledger.id,
            workspaceId: workspaceState.workspace.id,
          }),
        ).resolves.toBe(0);
        await expect(syncRepository.findOperation("operation_rejected")).resolves.toMatchObject({
          serverRevision: null,
          status: "rejected",
        });
        await expect(syncRepository.findOperation("operation_conflict")).resolves.toMatchObject({
          serverRevision: null,
          status: "conflict",
        });
        await expect(
          syncRepository.countOpenConflicts({
            ledgerId: workspaceState.ledger.id,
            workspaceId: workspaceState.workspace.id,
          }),
        ).resolves.toBe(1);
        await expect(
          syncRepository.listOpenConflicts({
            ledgerId: workspaceState.ledger.id,
            workspaceId: workspaceState.workspace.id,
          }),
        ).resolves.toMatchObject([
          {
            conflictType: "stale_update",
            incomingOperationId: "operation_conflict",
            localRevision: 3,
            status: "open",
          },
        ]);
        const conflict = await syncRepository.listOpenConflicts({
          ledgerId: workspaceState.ledger.id,
          workspaceId: workspaceState.workspace.id,
        });
        const dismissed = await syncRepository.dismissConflict({
          actorUserId: user.id,
          conflictId: conflict[0]?.id ?? createUuidV7(),
          ledgerId: workspaceState.ledger.id,
          resolvedAt: new Date("2026-05-09T02:00:00.000Z"),
          workspaceId: workspaceState.workspace.id,
        });

        expect(dismissed).toEqual({
          conflictId: conflict[0]?.id,
          resolvedAt: "2026-05-09T02:00:00.000Z",
          status: "dismissed",
        });
        await expect(
          syncRepository.countOpenConflicts({
            ledgerId: workspaceState.ledger.id,
            workspaceId: workspaceState.workspace.id,
          }),
        ).resolves.toBe(0);
        await expect(
          countAuditActions(
            dialect,
            rawDb,
            workspaceState.workspace.id,
            workspaceState.ledger.id,
            "sync_conflict.dismissed",
          ),
        ).resolves.toBe(1);
      });
    });
  }
});

async function createBaseState(
  dialect: "sqlite" | "postgres",
  rawDb: SqliteClient | QueryablePostgres,
  identityRepository: IdentityRepository,
) {
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
  const deviceId = createUuidV7();
  await insertDevice(dialect, rawDb, deviceId, user.id);

  return { deviceId, user, workspaceState };
}

async function insertDevice(
  dialect: "sqlite" | "postgres",
  rawDb: SqliteClient | QueryablePostgres,
  deviceId: SyncedId,
  userId: SyncedId,
): Promise<void> {
  const now = "2026-05-09T00:00:00.000Z";

  if (dialect === "sqlite" && "prepare" in rawDb) {
    rawDb
      .prepare(
        `
        INSERT INTO devices (id, user_id, device_key, name, created_at)
        VALUES (?, ?, 'device-key', 'Test device', ?)
      `,
      )
      .run(deviceId, userId, now);
    return;
  }

  if ("query" in rawDb) {
    await rawDb.query(`
      INSERT INTO devices (id, user_id, device_key, name, created_at)
      VALUES ('${deviceId}', '${userId}', 'device-key', 'Test device', '${now}'::timestamptz)
    `);
    return;
  }

  throw new Error("Unsupported test database");
}

function createOperation(input: {
  readonly workspaceId: SyncedId;
  readonly ledgerId: SyncedId;
  readonly deviceId: SyncedId;
  readonly operationId: string;
  readonly localSequence: string;
  readonly baseRevision?: string | null;
}): SyncOperationEnvelope {
  return {
    baseRevision: input.baseRevision ?? "0",
    createdAt: "2026-05-09T00:01:00.000Z",
    deviceId: input.deviceId,
    idempotencyKey: `idem_${input.operationId}`,
    ledgerId: input.ledgerId,
    localSequence: input.localSequence,
    operationId: input.operationId,
    operationType: "transaction_group.create_expense.v1",
    operationVersion: 1,
    payload: {
      currencyCode: "INR",
      description: "Groceries",
      occurredAt: "2026-05-09T08:00:00.000Z",
      sourceAccountId: createUuidV7(),
      transactions: [],
    },
    payloadEncoding: "plaintext.v1",
    workspaceId: input.workspaceId,
  };
}

async function countAuditActions(
  dialect: "sqlite" | "postgres",
  rawDb: SqliteClient | QueryablePostgres,
  workspaceId: SyncedId,
  ledgerId: SyncedId,
  action: string,
): Promise<number> {
  if (dialect === "sqlite" && "prepare" in rawDb) {
    const row = rawDb
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM audit_log
        WHERE workspace_id = ?
          AND ledger_id = ?
          AND action = ?
      `,
      )
      .get(workspaceId, ledgerId, action) as { readonly count: number } | undefined;
    return Number(row?.count ?? 0);
  }

  if ("query" in rawDb) {
    const result = (await rawDb.query(`
      SELECT COUNT(*)::int AS count
      FROM audit_log
      WHERE workspace_id = '${workspaceId}'
        AND ledger_id = '${ledgerId}'
        AND action = '${action}'
    `)) as
      | { readonly rows?: ReadonlyArray<{ readonly count: number | string }> }
      | ReadonlyArray<{ readonly count: number | string }>;
    const rows = Array.isArray(result) ? result : (result.rows ?? []);
    return Number(rows[0]?.count ?? 0);
  }

  throw new Error("Unsupported test database");
}
