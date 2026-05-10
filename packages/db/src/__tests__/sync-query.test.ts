import { createUuidV7 } from "@fastifly/common";
import { describe, expect, it, vi } from "vitest";

import { createSyncQueryService, type SyncOperationRecord, type SyncRepository } from "../index.js";

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
      ledgerId,
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
      limit: 100,
      sinceRevision: 1,
      workspaceId,
    });
  });

  it("reports current revision and open conflict count", async () => {
    const syncRepository = makeSyncRepository();
    const service = createSyncQueryService({ syncRepository });

    await expect(service.status({ actorUserId, ledgerId, workspaceId })).resolves.toEqual({
      ledgerId,
      openConflictCount: 1,
      serverRevision: "5",
      workspaceId,
    });
  });
});

function makeSyncRepository(): SyncRepository {
  return {
    countOpenConflicts: vi.fn(async () => 1),
    findDeviceForUser: vi.fn(),
    findOperation: vi.fn(),
    findOperationByDeviceSequence: vi.fn(),
    getCurrentRevision: vi.fn(async () => 5),
    listAcceptedOperationsSince: vi.fn(async () => [
      makeOperationRecord({
        localSequence: "2",
        operationId: "operation_2",
        operationType: "transaction_group.create_income.v1",
        payloadJson: { description: "Salary" },
        serverRevision: 2,
      }),
    ]),
    recordAcceptedOperation: vi.fn(),
    recordConflictOperation: vi.fn(),
    recordRejectedOperation: vi.fn(),
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
