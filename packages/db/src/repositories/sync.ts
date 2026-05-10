import {
  type SyncedId,
  type SyncOperationEnvelope,
  SyncOperationTypeSchema,
} from "@fastifly/common";
import { and, eq, sql } from "drizzle-orm";

import type { PostgresDatabase } from "../postgres/client.js";
import {
  pgDevices,
  pgSyncConflicts,
  pgSyncOperations,
  pgWorkspaceLedgerRevisions,
} from "../postgres/schema.js";
import type { JsonObject, SyncConflictType, SyncOperationStatus } from "../schema-types.js";
import type { SqliteClient } from "../sqlite/client.js";

export type SyncDeviceRecord = {
  readonly id: SyncedId;
  readonly userId: SyncedId;
  readonly deviceKey: string;
  readonly name: string;
  readonly createdAt: string;
  readonly lastSeenAt: string | null;
  readonly revokedAt: string | null;
};

export type SyncOperationRecord = {
  readonly id: string;
  readonly workspaceId: SyncedId;
  readonly ledgerId: SyncedId;
  readonly deviceId: SyncedId;
  readonly localSequence: string;
  readonly operationType: SyncOperationEnvelope["operationType"];
  readonly operationVersion: number;
  readonly baseRevision: number | null;
  readonly serverRevision: number | null;
  readonly idempotencyKey: string;
  readonly payloadJson: JsonObject;
  readonly payloadEncoding: "plaintext.v1";
  readonly status: SyncOperationStatus;
  readonly resultJson: JsonObject;
  readonly createdBy: SyncedId;
  readonly createdAt: string;
  readonly receivedAt: string;
};

export type RecordSyncOperationInput = {
  readonly operation: SyncOperationEnvelope;
  readonly actorUserId: SyncedId;
  readonly resultJson: JsonObject;
  readonly receivedAt: Date;
};

export type RecordSyncConflictInput = RecordSyncOperationInput & {
  readonly conflictId: SyncedId;
  readonly conflictType: SyncConflictType;
  readonly localRevision: number;
};

export type SyncRepository = {
  readonly findDeviceForUser: (
    deviceId: SyncedId,
    userId: SyncedId,
  ) => Promise<SyncDeviceRecord | null>;
  readonly findOperation: (operationId: string) => Promise<SyncOperationRecord | null>;
  readonly findOperationByDeviceSequence: (
    deviceId: SyncedId,
    localSequence: string,
  ) => Promise<SyncOperationRecord | null>;
  readonly getCurrentRevision: (input: {
    readonly workspaceId: SyncedId;
    readonly ledgerId: SyncedId;
  }) => Promise<number>;
  readonly recordAcceptedOperation: (input: RecordSyncOperationInput) => Promise<number>;
  readonly recordRejectedOperation: (input: RecordSyncOperationInput) => Promise<void>;
  readonly recordConflictOperation: (input: RecordSyncConflictInput) => Promise<void>;
};

export function createSqliteSyncRepository(client: SqliteClient): SyncRepository {
  return {
    async findDeviceForUser(deviceId, userId) {
      const row = client
        .prepare(
          `
          SELECT id, user_id, device_key, name, created_at, last_seen_at, revoked_at
          FROM devices
          WHERE id = ? AND user_id = ?
          LIMIT 1
        `,
        )
        .get(deviceId, userId) as SqliteDeviceRow | undefined;

      return row ? toSyncDeviceRecord(row) : null;
    },

    async findOperation(operationId) {
      return readSqliteSyncOperation(client, "id = ?", [operationId]);
    },

    async findOperationByDeviceSequence(deviceId, localSequence) {
      return readSqliteSyncOperation(client, "device_id = ? AND local_sequence = ?", [
        deviceId,
        localSequence,
      ]);
    },

    async getCurrentRevision(input) {
      return readSqliteCurrentRevision(client, input);
    },

    async recordAcceptedOperation(input) {
      return client.transaction(() => {
        const serverRevision = incrementSqliteRevision(client, input.operation, input.receivedAt);
        insertSqliteOperation(client, input, "accepted", serverRevision);
        return serverRevision;
      })();
    },

    async recordRejectedOperation(input) {
      insertSqliteOperation(client, input, "rejected", null);
    },

    async recordConflictOperation(input) {
      client.transaction(() => {
        insertSqliteOperation(client, input, "conflict", null);
        client
          .prepare(
            `
            INSERT INTO sync_conflicts (
              id,
              workspace_id,
              ledger_id,
              incoming_operation_id,
              conflict_type,
              local_revision,
              incoming_base_revision,
              local_snapshot_json,
              incoming_payload_json,
              status,
              created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
          `,
          )
          .run(
            input.conflictId,
            input.operation.workspaceId,
            input.operation.ledgerId,
            input.operation.operationId,
            input.conflictType,
            input.localRevision,
            parseOptionalRevision(input.operation.baseRevision),
            JSON.stringify({ currentRevision: input.localRevision }),
            JSON.stringify(input.operation.payload),
            input.receivedAt.toISOString(),
          );
      })();
    },
  };
}

export function createPostgresSyncRepository(db: PostgresDatabase): SyncRepository {
  return {
    async findDeviceForUser(deviceId, userId) {
      const rows = await db
        .select()
        .from(pgDevices)
        .where(and(eq(pgDevices.id, deviceId), eq(pgDevices.userId, userId)))
        .limit(1);

      return rows[0] ? toSyncDeviceRecord(rows[0]) : null;
    },

    async findOperation(operationId) {
      const rows = await db
        .select()
        .from(pgSyncOperations)
        .where(eq(pgSyncOperations.id, operationId))
        .limit(1);

      return rows[0] ? toSyncOperationRecord(rows[0]) : null;
    },

    async findOperationByDeviceSequence(deviceId, localSequence) {
      const rows = await db
        .select()
        .from(pgSyncOperations)
        .where(
          and(
            eq(pgSyncOperations.deviceId, deviceId),
            eq(pgSyncOperations.localSequence, localSequence),
          ),
        )
        .limit(1);

      return rows[0] ? toSyncOperationRecord(rows[0]) : null;
    },

    async getCurrentRevision(input) {
      const rows = await db
        .select({ currentRevision: pgWorkspaceLedgerRevisions.currentRevision })
        .from(pgWorkspaceLedgerRevisions)
        .where(
          and(
            eq(pgWorkspaceLedgerRevisions.workspaceId, input.workspaceId),
            eq(pgWorkspaceLedgerRevisions.ledgerId, input.ledgerId),
          ),
        )
        .limit(1);

      return rows[0]?.currentRevision ?? 0;
    },

    async recordAcceptedOperation(input) {
      return await db.transaction(async (tx) => {
        await tx
          .insert(pgWorkspaceLedgerRevisions)
          .values({
            currentRevision: 0,
            ledgerId: input.operation.ledgerId,
            updatedAt: input.receivedAt,
            workspaceId: input.operation.workspaceId,
          })
          .onConflictDoNothing();
        const rows = await tx
          .update(pgWorkspaceLedgerRevisions)
          .set({
            currentRevision: sql`${pgWorkspaceLedgerRevisions.currentRevision} + 1`,
            updatedAt: input.receivedAt,
          })
          .where(
            and(
              eq(pgWorkspaceLedgerRevisions.workspaceId, input.operation.workspaceId),
              eq(pgWorkspaceLedgerRevisions.ledgerId, input.operation.ledgerId),
            ),
          )
          .returning({ currentRevision: pgWorkspaceLedgerRevisions.currentRevision });
        const serverRevision = rows[0]?.currentRevision;
        if (serverRevision === undefined) {
          throw new Error("Failed to increment sync revision.");
        }

        await tx
          .insert(pgSyncOperations)
          .values(toPostgresSyncOperationInsert(input, "accepted", serverRevision));
        return serverRevision;
      });
    },

    async recordRejectedOperation(input) {
      await db
        .insert(pgSyncOperations)
        .values(toPostgresSyncOperationInsert(input, "rejected", null));
    },

    async recordConflictOperation(input) {
      await db.transaction(async (tx) => {
        await tx
          .insert(pgSyncOperations)
          .values(toPostgresSyncOperationInsert(input, "conflict", null));
        await tx.insert(pgSyncConflicts).values({
          conflictType: input.conflictType,
          createdAt: input.receivedAt,
          id: input.conflictId,
          incomingBaseRevision: parseOptionalRevision(input.operation.baseRevision),
          incomingOperationId: input.operation.operationId,
          incomingPayloadJson: input.operation.payload,
          ledgerId: input.operation.ledgerId,
          localRevision: input.localRevision,
          localSnapshotJson: { currentRevision: input.localRevision },
          status: "open",
          workspaceId: input.operation.workspaceId,
        });
      });
    },
  };
}

type SqliteDeviceRow = {
  readonly id: string;
  readonly user_id: string;
  readonly device_key: string;
  readonly name: string;
  readonly created_at: string;
  readonly last_seen_at: string | null;
  readonly revoked_at: string | null;
};

type SqliteSyncOperationRow = {
  readonly id: string;
  readonly workspace_id: string;
  readonly ledger_id: string;
  readonly device_id: string;
  readonly local_sequence: string;
  readonly operation_type: SyncOperationEnvelope["operationType"];
  readonly operation_version: number;
  readonly base_revision: number | null;
  readonly server_revision: number | null;
  readonly idempotency_key: string;
  readonly payload_json: string;
  readonly payload_encoding: "plaintext.v1";
  readonly status: SyncOperationStatus;
  readonly result_json: string;
  readonly created_by: string;
  readonly created_at: string;
  readonly received_at: string;
};

function readSqliteCurrentRevision(
  client: SqliteClient,
  input: { readonly workspaceId: SyncedId; readonly ledgerId: SyncedId },
): number {
  const row = client
    .prepare(
      `
      SELECT current_revision
      FROM workspace_ledger_revisions
      WHERE workspace_id = ? AND ledger_id = ?
      LIMIT 1
    `,
    )
    .get(input.workspaceId, input.ledgerId) as { readonly current_revision: number } | undefined;

  return row?.current_revision ?? 0;
}

function incrementSqliteRevision(
  client: SqliteClient,
  operation: SyncOperationEnvelope,
  receivedAt: Date,
): number {
  client
    .prepare(
      `
      INSERT INTO workspace_ledger_revisions (workspace_id, ledger_id, current_revision, updated_at)
      VALUES (?, ?, 0, ?)
      ON CONFLICT(workspace_id, ledger_id) DO NOTHING
    `,
    )
    .run(operation.workspaceId, operation.ledgerId, receivedAt.toISOString());
  client
    .prepare(
      `
      UPDATE workspace_ledger_revisions
      SET current_revision = current_revision + 1,
          updated_at = ?
      WHERE workspace_id = ? AND ledger_id = ?
    `,
    )
    .run(receivedAt.toISOString(), operation.workspaceId, operation.ledgerId);

  return readSqliteCurrentRevision(client, operation);
}

function readSqliteSyncOperation(
  client: SqliteClient,
  whereSql: string,
  params: readonly string[],
): SyncOperationRecord | null {
  const row = client
    .prepare(
      `
      SELECT
        id,
        workspace_id,
        ledger_id,
        device_id,
        local_sequence,
        operation_type,
        operation_version,
        base_revision,
        server_revision,
        idempotency_key,
        payload_json,
        payload_encoding,
        status,
        result_json,
        created_by,
        created_at,
        received_at
      FROM sync_operations
      WHERE ${whereSql}
      LIMIT 1
    `,
    )
    .get(...params) as SqliteSyncOperationRow | undefined;

  return row ? toSyncOperationRecord(row) : null;
}

function insertSqliteOperation(
  client: SqliteClient,
  input: RecordSyncOperationInput,
  status: SyncOperationStatus,
  serverRevision: number | null,
): void {
  client
    .prepare(
      `
      INSERT INTO sync_operations (
        id,
        workspace_id,
        ledger_id,
        device_id,
        local_sequence,
        operation_type,
        operation_version,
        base_revision,
        server_revision,
        idempotency_key,
        payload_json,
        payload_encoding,
        status,
        result_json,
        created_by,
        created_at,
        received_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      input.operation.operationId,
      input.operation.workspaceId,
      input.operation.ledgerId,
      input.operation.deviceId,
      input.operation.localSequence,
      input.operation.operationType,
      input.operation.operationVersion,
      parseOptionalRevision(input.operation.baseRevision),
      serverRevision,
      input.operation.idempotencyKey,
      JSON.stringify(input.operation.payload),
      input.operation.payloadEncoding,
      status,
      JSON.stringify(input.resultJson),
      input.actorUserId,
      input.operation.createdAt,
      input.receivedAt.toISOString(),
    );
}

function toPostgresSyncOperationInsert(
  input: RecordSyncOperationInput,
  status: SyncOperationStatus,
  serverRevision: number | null,
): typeof pgSyncOperations.$inferInsert {
  return {
    baseRevision: parseOptionalRevision(input.operation.baseRevision),
    createdAt: new Date(input.operation.createdAt),
    createdBy: input.actorUserId,
    deviceId: input.operation.deviceId,
    id: input.operation.operationId,
    idempotencyKey: input.operation.idempotencyKey,
    ledgerId: input.operation.ledgerId,
    localSequence: input.operation.localSequence,
    operationType: input.operation.operationType,
    operationVersion: input.operation.operationVersion,
    payloadEncoding: input.operation.payloadEncoding,
    payloadJson: input.operation.payload,
    receivedAt: input.receivedAt,
    resultJson: input.resultJson,
    serverRevision,
    status,
    workspaceId: input.operation.workspaceId,
  };
}

function parseOptionalRevision(revision: string | null | undefined): number | null {
  return revision === null || revision === undefined ? null : Number(revision);
}

function toSyncDeviceRecord(input: {
  readonly id: string;
  readonly userId?: string;
  readonly user_id?: string;
  readonly deviceKey?: string;
  readonly device_key?: string;
  readonly name: string;
  readonly createdAt?: Date | string;
  readonly created_at?: string;
  readonly lastSeenAt?: Date | string | null;
  readonly last_seen_at?: string | null;
  readonly revokedAt?: Date | string | null;
  readonly revoked_at?: string | null;
}): SyncDeviceRecord {
  return {
    createdAt: toIsoString(input.createdAt ?? input.created_at),
    deviceKey: input.deviceKey ?? input.device_key ?? "",
    id: input.id as SyncedId,
    lastSeenAt: toNullableIsoString(input.lastSeenAt ?? input.last_seen_at ?? null),
    name: input.name,
    revokedAt: toNullableIsoString(input.revokedAt ?? input.revoked_at ?? null),
    userId: (input.userId ?? input.user_id ?? "") as SyncedId,
  };
}

function toSyncOperationRecord(input: {
  readonly id: string;
  readonly workspaceId?: string;
  readonly workspace_id?: string;
  readonly ledgerId?: string;
  readonly ledger_id?: string;
  readonly deviceId?: string;
  readonly device_id?: string;
  readonly localSequence?: string;
  readonly local_sequence?: string;
  readonly operationType?: string;
  readonly operation_type?: string;
  readonly operationVersion?: number;
  readonly operation_version?: number;
  readonly baseRevision?: number | null;
  readonly base_revision?: number | null;
  readonly serverRevision?: number | null;
  readonly server_revision?: number | null;
  readonly idempotencyKey?: string;
  readonly idempotency_key?: string;
  readonly payloadJson?: JsonObject;
  readonly payload_json?: JsonObject | string;
  readonly payloadEncoding?: string;
  readonly payload_encoding?: string;
  readonly status: SyncOperationStatus;
  readonly resultJson?: JsonObject;
  readonly result_json?: JsonObject | string;
  readonly createdBy?: string;
  readonly created_by?: string;
  readonly createdAt?: Date | string;
  readonly created_at?: string;
  readonly receivedAt?: Date | string;
  readonly received_at?: string;
}): SyncOperationRecord {
  return {
    baseRevision: input.baseRevision ?? input.base_revision ?? null,
    createdAt: toIsoString(input.createdAt ?? input.created_at),
    createdBy: (input.createdBy ?? input.created_by ?? "") as SyncedId,
    deviceId: (input.deviceId ?? input.device_id ?? "") as SyncedId,
    id: input.id,
    idempotencyKey: input.idempotencyKey ?? input.idempotency_key ?? "",
    ledgerId: (input.ledgerId ?? input.ledger_id ?? "") as SyncedId,
    localSequence: input.localSequence ?? input.local_sequence ?? "",
    operationType: SyncOperationTypeSchema.parse(input.operationType ?? input.operation_type),
    operationVersion: input.operationVersion ?? input.operation_version ?? 1,
    payloadEncoding: parsePayloadEncoding(input.payloadEncoding ?? input.payload_encoding),
    payloadJson: parseJsonObject(input.payloadJson ?? input.payload_json),
    receivedAt: toIsoString(input.receivedAt ?? input.received_at),
    resultJson: parseJsonObject(input.resultJson ?? input.result_json),
    serverRevision: input.serverRevision ?? input.server_revision ?? null,
    status: input.status,
    workspaceId: (input.workspaceId ?? input.workspace_id ?? "") as SyncedId,
  };
}

function parseJsonObject(input: JsonObject | string | undefined): JsonObject {
  if (typeof input === "string") {
    return JSON.parse(input) as JsonObject;
  }

  return input ?? {};
}

function parsePayloadEncoding(input: string | undefined): "plaintext.v1" {
  if (input !== "plaintext.v1") {
    throw new Error("Unsupported sync payload encoding.");
  }

  return input;
}

function toIsoString(input: Date | string | undefined): string {
  if (input instanceof Date) {
    return input.toISOString();
  }

  return input ?? "";
}

function toNullableIsoString(input: Date | string | null): string | null {
  if (input instanceof Date) {
    return input.toISOString();
  }

  return input;
}
