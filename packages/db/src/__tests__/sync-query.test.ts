import { createUuidV7, type SyncedId } from "@fastifly/common";
import { describe, expect, it, vi } from "vitest";

import {
  createSyncQueryService,
  type SyncConflictRecord,
  type SyncOperationRecord,
  type SyncRepository,
} from "../index.js";

const workspaceId = createUuidV7();
const ledgerId = createUuidV7();
const actorUserId = createUuidV7();
const deviceId = createUuidV7();

describe("sync query service", () => {
  it("returns accepted operations after the requested revision", async () => {
    const syncRepository = makeSyncRepository();
    const service = createSyncQueryService({ syncRepository });

    const result = await service.pull({
      actorUserId,
      ledgerId,
      sinceRevision: 1,
      workspaceId,
    });

    expect(result).toEqual({
      fromRevision: "1",
      hasMore: false,
      ledgerId,
      nextSinceRevision: null,
      operations: [
        {
          createdAt: "2026-05-09T01:01:00.000Z",
          deviceId,
          localSequence: "2",
          operationId: "operation_2",
          operationType: "transaction_group.create_income.v1",
          payload: { description: "Salary" },
          payloadEncoding: "plaintext.v1",
          serverRevision: "2",
        },
      ],
      toRevision: "2",
      workspaceId,
    });
    expect(syncRepository.listAcceptedOperationsSince).toHaveBeenCalledWith({
      ledgerId,
      limit: 501,
      sinceRevision: 1,
      workspaceId,
    });
  });

  it("reports current revision and open conflict count", async () => {
    const syncRepository = makeSyncRepository();
    const service = createSyncQueryService({ syncRepository });

    await expect(service.status({ actorUserId, ledgerId, workspaceId })).resolves.toEqual({
      lastOperationAt: "2026-05-09T01:02:00.000Z",
      ledgerId,
      openConflicts: 1,
      serverRevision: "5",
      workspaceId,
    });
  });

  it("lists and dismisses open conflicts without mutating finance rows", async () => {
    const syncRepository = makeSyncRepository();
    const service = createSyncQueryService({
      now: () => new Date("2026-05-09T03:00:00.000Z"),
      syncRepository,
    });

    await expect(service.listConflicts({ actorUserId, ledgerId, workspaceId })).resolves.toEqual({
      conflicts: [
        {
          conflictType: "stale_update",
          createdAt: "2026-05-09T02:00:00.000Z",
          id: expect.any(String),
          incomingBaseRevision: "1",
          incomingOperationId: "operation_conflict",
          incomingPayload: { description: "Local edit" },
          localRevision: "5",
          localSnapshot: { currentRevision: 5 },
          status: "open",
        },
      ],
      ledgerId,
      workspaceId,
    });
    await expect(
      service.dismissConflict({
        actorUserId,
        conflictId: conflictId(),
        ledgerId,
        workspaceId,
      }),
    ).resolves.toEqual({
      conflictId: conflictId(),
      resolvedAt: "2026-05-09T03:00:00.000Z",
      status: "dismissed",
    });
    expect(syncRepository.dismissConflict).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId,
        conflictId: conflictId(),
        ledgerId,
        workspaceId,
      }),
    );
  });
});

function makeSyncRepository(): SyncRepository {
  return {
    countOpenConflicts: vi.fn(async () => 1),
    findDeviceForUser: vi.fn(),
    findOperation: vi.fn(),
    findOperationByDeviceSequence: vi.fn(),
    getCurrentRevision: vi.fn(async () => 5),
    getLastAcceptedOperationAt: vi.fn(async () => "2026-05-09T01:02:00.000Z"),
    listOpenConflicts: vi.fn(async () => [makeConflictRecord()]),
    listAcceptedOperationsSince: vi.fn(async () => [
      makeOperationRecord({
        localSequence: "2",
        operationId: "operation_2",
        operationType: "transaction_group.create_income.v1",
        payloadJson: { description: "Salary" },
        serverRevision: 2,
      }),
    ]),
    dismissConflict: vi.fn(async (input) => ({
      conflictId: input.conflictId,
      resolvedAt: input.resolvedAt.toISOString(),
      status: "dismissed",
    })),
    touchDeviceLastSeen: vi.fn(async () => undefined),
    recordAcceptedOperation: vi.fn(),
    recordConflictOperation: vi.fn(),
    recordRejectedOperation: vi.fn(),
  };
}

function conflictId(): SyncedId {
  return "0196b785-a900-7000-8000-000000000999" as SyncedId;
}

function makeConflictRecord(): SyncConflictRecord {
  return {
    conflictType: "stale_update",
    createdAt: "2026-05-09T02:00:00.000Z",
    id: conflictId(),
    incomingBaseRevision: 1,
    incomingOperationId: "operation_conflict",
    incomingPayloadJson: { description: "Local edit" },
    ledgerId,
    localRevision: 5,
    localSnapshotJson: { currentRevision: 5 },
    objectId: null,
    objectType: null,
    resolutionOperationId: null,
    resolvedAt: null,
    status: "open",
    workspaceId,
  };
}

function makeOperationRecord(input: {
  readonly operationId: string;
  readonly localSequence: string;
  readonly operationType: SyncOperationRecord["operationType"];
  readonly payloadJson: SyncOperationRecord["payloadJson"];
  readonly serverRevision: number;
}): SyncOperationRecord {
  return {
    baseRevision: input.serverRevision - 1,
    createdAt: "2026-05-09T01:01:00.000Z",
    createdBy: actorUserId,
    deviceId,
    id: input.operationId,
    idempotencyKey: `idem_${input.operationId}`,
    ledgerId,
    localSequence: input.localSequence,
    operationType: input.operationType,
    operationVersion: 1,
    payloadEncoding: "plaintext.v1",
    payloadJson: input.payloadJson,
    receivedAt: "2026-05-09T01:02:00.000Z",
    resultJson: {},
    serverRevision: input.serverRevision,
    status: "accepted",
    workspaceId,
  };
}
