import { createUuidV7, type SyncedId, type SyncOperationEnvelope } from "@fastifly/common";
import { describe, expect, it, vi } from "vitest";

import {
  createSyncReplayService,
  type LedgerFinanceMutationService,
  LedgerMutationError,
  type ResolvedSyncConflictRecord,
  type ResolveSyncConflictInput,
  type SyncConflictRecord,
  type SyncDeviceRecord,
  type SyncOperationRecord,
  SyncReplayError,
  type SyncRepository,
} from "../index.js";

const workspaceId = createUuidV7();
const ledgerId = createUuidV7();
const deviceId = createUuidV7();
const actorUserId = createUuidV7();

describe("sync replay service", () => {
  it("applies transaction commands through the finance mutation service", async () => {
    const syncRepository = new FakeSyncRepository({ currentRevision: 0 });
    const financeMutationService = makeFinanceMutationService();
    const service = createSyncReplayService({
      createId: createUuidV7,
      financeMutationService,
      now: () => new Date("2026-05-09T02:00:00.000Z"),
      syncRepository,
    });

    const result = await service.push({
      actorUserId,
      deviceId,
      ledgerId,
      operations: [createExpenseOperation({ baseRevision: "0", operationId: "operation_1" })],
      workspaceId,
    });

    expect(result).toEqual({
      accepted: [{ operationId: "operation_1", serverRevision: "1" }],
      conflicts: [],
      rejected: [],
      serverRevision: "1",
    });
    expect(financeMutationService.createExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        envelope: expect.objectContaining({
          authorization: { action: "create", subject: "TransactionGroup" },
          deviceId,
          source: "sync",
          syncOperation: expect.objectContaining({ operationId: "operation_1" }),
        }),
      }),
    );
    expect(syncRepository.operations.get("operation_1")).toMatchObject({
      serverRevision: 1,
      status: "accepted",
    });
  });

  it("replays duplicate operation results without calling finance twice", async () => {
    const syncRepository = new FakeSyncRepository({ currentRevision: 1 });
    syncRepository.operations.set("operation_1", {
      ...makeOperationRecord("operation_1"),
      serverRevision: 1,
      status: "accepted",
    });
    const financeMutationService = makeFinanceMutationService();
    const service = createSyncReplayService({
      createId: createUuidV7,
      financeMutationService,
      syncRepository,
    });

    const result = await service.push({
      actorUserId,
      deviceId,
      ledgerId,
      operations: [createExpenseOperation({ baseRevision: "0", operationId: "operation_1" })],
      workspaceId,
    });

    expect(result.accepted).toEqual([{ operationId: "operation_1", serverRevision: "1" }]);
    expect(financeMutationService.createExpense).not.toHaveBeenCalled();
  });

  it("rejects duplicate localSequence operations without mutating existing operation records", async () => {
    const syncRepository = new FakeSyncRepository({ currentRevision: 1 });
    syncRepository.operations.set("operation_accepted", {
      ...makeOperationRecord("operation_accepted"),
      localSequence: "1",
      serverRevision: 1,
      status: "accepted",
    });
    const financeMutationService = makeFinanceMutationService();
    const service = createSyncReplayService({
      createId: createUuidV7,
      financeMutationService,
      syncRepository,
    });

    const result = await service.push({
      actorUserId,
      deviceId,
      ledgerId,
      operations: [
        createOperation({
          baseRevision: null,
          localSequence: "1",
          operationId: "operation_duplicate_sequence",
          operationType: "transaction_group.create_expense.v1",
        }),
      ],
      workspaceId,
    });

    expect(result.accepted).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(result.rejected).toEqual([
      {
        operationId: "operation_duplicate_sequence",
        reason: "duplicate_local_sequence",
      },
    ]);
    expect(financeMutationService.createExpense).not.toHaveBeenCalled();
    expect(syncRepository.operations.get("operation_accepted")).toMatchObject({
      id: "operation_accepted",
      localSequence: "1",
      serverRevision: 1,
      status: "accepted",
    });
    expect(syncRepository.operations.get("operation_duplicate_sequence")).toBeUndefined();
  });

  it("records stale base revisions as explicit conflicts", async () => {
    const syncRepository = new FakeSyncRepository({ currentRevision: 3 });
    const service = createSyncReplayService({
      createId: createUuidV7,
      financeMutationService: makeFinanceMutationService(),
      syncRepository,
    });

    const result = await service.push({
      actorUserId,
      deviceId,
      ledgerId,
      operations: [createExpenseOperation({ baseRevision: "1", operationId: "operation_stale" })],
      workspaceId,
    });

    expect(result.conflicts).toEqual([
      {
        conflictType: "stale_update",
        operationId: "operation_stale",
        serverRevision: "3",
      },
    ]);
    expect(syncRepository.operations.get("operation_stale")).toMatchObject({
      serverRevision: null,
      status: "conflict",
    });
  });

  it("fails closed for revoked devices", async () => {
    const service = createSyncReplayService({
      createId: createUuidV7,
      financeMutationService: makeFinanceMutationService(),
      syncRepository: new FakeSyncRepository({
        currentRevision: 0,
        revokedAt: "2026-05-09T02:00:00.000Z",
      }),
    });

    await expect(
      service.push({
        actorUserId,
        deviceId,
        ledgerId,
        operations: [createExpenseOperation({ baseRevision: "0", operationId: "operation_1" })],
        workspaceId,
      }),
    ).rejects.toBeInstanceOf(SyncReplayError);
  });

  it("returns permission-denied operations as rejected and continues the batch", async () => {
    const syncRepository = new FakeSyncRepository({ currentRevision: 0 });
    const financeMutationService = makeFinanceMutationService();
    vi.mocked(financeMutationService.createExpense).mockRejectedValueOnce(
      new LedgerMutationError("Forbidden.", "MUTATION_FORBIDDEN"),
    );
    vi.mocked(financeMutationService.createIncome).mockResolvedValueOnce({
      body: { data: { transactionGroup: { id: createUuidV7() } } },
      idempotencyReplayed: false,
      status: 201,
    });
    const service = createSyncReplayService({
      createId: createUuidV7,
      financeMutationService,
      now: () => new Date("2026-05-09T02:00:00.000Z"),
      syncRepository,
    });

    const result = await service.push({
      actorUserId,
      deviceId,
      ledgerId,
      operations: [
        createOperation({
          baseRevision: "0",
          localSequence: "1",
          operationId: "operation_forbidden",
          operationType: "transaction_group.create_expense.v1",
        }),
        createOperation({
          baseRevision: "0",
          localSequence: "2",
          operationId: "operation_allowed",
          operationType: "transaction_group.create_income.v1",
        }),
      ],
      workspaceId,
    });

    expect(result.rejected).toEqual([
      { operationId: "operation_forbidden", reason: "permission_denied" },
    ]);
    expect(result.accepted).toEqual([{ operationId: "operation_allowed", serverRevision: "1" }]);
    expect(syncRepository.operations.get("operation_forbidden")).toMatchObject({
      serverRevision: null,
      status: "rejected",
    });
    expect(syncRepository.operations.get("operation_allowed")).toMatchObject({
      serverRevision: 1,
      status: "accepted",
    });
  });

  it("processes operations in localSequence order", async () => {
    const syncRepository = new FakeSyncRepository({ currentRevision: 0 });
    const order: string[] = [];
    const financeMutationService = makeFinanceMutationService();
    vi.mocked(financeMutationService.createExpense).mockImplementation(async (input) => {
      order.push(input.envelope.syncOperation?.localSequence ?? "missing");
      return {
        body: { data: { transactionGroup: { id: createUuidV7() } } },
        idempotencyReplayed: false,
        status: 201,
      };
    });
    const service = createSyncReplayService({
      createId: createUuidV7,
      financeMutationService,
      syncRepository,
    });

    await service.push({
      actorUserId,
      deviceId,
      ledgerId,
      operations: [
        createOperation({
          baseRevision: null,
          localSequence: "10",
          operationId: "operation_10",
          operationType: "transaction_group.create_expense.v1",
        }),
        createOperation({
          baseRevision: null,
          localSequence: "2",
          operationId: "operation_2",
          operationType: "transaction_group.create_expense.v1",
        }),
      ],
      workspaceId,
    });

    expect(order).toEqual(["2", "10"]);
  });

  it("updates device last seen time after processing push", async () => {
    const syncRepository = new FakeSyncRepository({ currentRevision: 0 });
    const service = createSyncReplayService({
      createId: createUuidV7,
      financeMutationService: makeFinanceMutationService(),
      now: () => new Date("2026-05-09T05:00:00.000Z"),
      syncRepository,
    });

    await service.push({
      actorUserId,
      deviceId,
      ledgerId,
      operations: [
        createOperation({
          baseRevision: "0",
          localSequence: "1",
          operationId: "operation_seen",
          operationType: "transaction_group.create_expense.v1",
        }),
      ],
      workspaceId,
    });

    expect(syncRepository.lastSeenAt).toBe("2026-05-09T05:00:00.000Z");
  });
});

class FakeSyncRepository implements SyncRepository {
  readonly operations = new Map<string, SyncOperationRecord>();
  lastSeenAt: string | null = null;
  #currentRevision: number;
  readonly #revokedAt: string | null;

  constructor(input: { readonly currentRevision: number; readonly revokedAt?: string | null }) {
    this.#currentRevision = input.currentRevision;
    this.#revokedAt = input.revokedAt ?? null;
  }

  async findDeviceForUser(id: SyncedId, userId: SyncedId): Promise<SyncDeviceRecord | null> {
    if (id !== deviceId || userId !== actorUserId) {
      return null;
    }

    return {
      createdAt: "2026-05-09T00:00:00.000Z",
      deviceKey: "device-key",
      id,
      lastSeenAt: null,
      name: "Test device",
      revokedAt: this.#revokedAt,
      userId,
    };
  }

  async findOperation(operationId: string): Promise<SyncOperationRecord | null> {
    return this.operations.get(operationId) ?? null;
  }

  async touchDeviceLastSeen(_deviceId: SyncedId, _userId: SyncedId, seenAt: Date): Promise<void> {
    this.lastSeenAt = seenAt.toISOString();
  }

  async findOperationByDeviceSequence(
    id: SyncedId,
    localSequence: string,
  ): Promise<SyncOperationRecord | null> {
    return (
      [...this.operations.values()].find(
        (operation) => operation.deviceId === id && operation.localSequence === localSequence,
      ) ?? null
    );
  }

  async getCurrentRevision(): Promise<number> {
    return this.#currentRevision;
  }

  async listAcceptedOperationsSince(input: {
    readonly sinceRevision: number;
    readonly limit: number;
  }): Promise<readonly SyncOperationRecord[]> {
    return [...this.operations.values()]
      .filter(
        (operation) =>
          operation.status === "accepted" &&
          operation.serverRevision !== null &&
          operation.serverRevision > input.sinceRevision,
      )
      .sort((left, right) => (left.serverRevision ?? 0) - (right.serverRevision ?? 0))
      .slice(0, input.limit);
  }

  async countOpenConflicts(): Promise<number> {
    return [...this.operations.values()].filter((operation) => operation.status === "conflict")
      .length;
  }

  async getLastAcceptedOperationAt(): Promise<string | null> {
    return (
      [...this.operations.values()]
        .filter((operation) => operation.status === "accepted")
        .map((operation) => operation.receivedAt)
        .sort()
        .at(-1) ?? null
    );
  }

  async listOpenConflicts(): Promise<readonly SyncConflictRecord[]> {
    return [];
  }

  async dismissConflict(
    _input: ResolveSyncConflictInput,
  ): Promise<ResolvedSyncConflictRecord | null> {
    return null;
  }

  async recordAcceptedOperation(input): Promise<number> {
    this.#currentRevision += 1;
    this.operations.set(input.operation.operationId, {
      ...makeOperationRecord(input.operation.operationId),
      localSequence: input.operation.localSequence,
      resultJson: input.resultJson,
      serverRevision: this.#currentRevision,
      status: "accepted",
    });
    return this.#currentRevision;
  }

  async recordRejectedOperation(input): Promise<void> {
    this.operations.set(input.operation.operationId, {
      ...makeOperationRecord(input.operation.operationId),
      resultJson: input.resultJson,
      serverRevision: null,
      status: "rejected",
    });
  }

  async recordConflictOperation(input): Promise<void> {
    this.operations.set(input.operation.operationId, {
      ...makeOperationRecord(input.operation.operationId),
      resultJson: input.resultJson,
      serverRevision: null,
      status: "conflict",
    });
  }
}

function makeFinanceMutationService(): LedgerFinanceMutationService {
  return {
    archiveAccount: vi.fn(),
    createAccount: vi.fn(),
    createExpense: vi.fn(async () => ({
      body: { data: { transactionGroup: { id: createUuidV7() } } },
      idempotencyReplayed: false,
      status: 201,
    })),
    createIncome: vi.fn(async () => ({
      body: { data: { transactionGroup: { id: createUuidV7() } } },
      idempotencyReplayed: false,
      status: 201,
    })),
    createTransaction: vi.fn(),
    createTransfer: vi.fn(async () => ({
      body: { data: { transactionGroup: { id: createUuidV7() } } },
      idempotencyReplayed: false,
      status: 201,
    })),
  };
}

function createOperation(input: {
  readonly operationId: string;
  readonly baseRevision: string | null;
  readonly localSequence: string;
  readonly operationType: SyncOperationEnvelope["operationType"];
}): SyncOperationEnvelope {
  return {
    baseRevision: input.baseRevision,
    createdAt: "2026-05-09T01:00:00.000Z",
    deviceId,
    idempotencyKey: `idem_${input.operationId}`,
    ledgerId,
    localSequence: input.localSequence,
    operationId: input.operationId,
    operationType: input.operationType,
    operationVersion: 1,
    payload: {
      currencyCode: "INR",
      description: "Groceries",
      occurredAt: "2026-05-09T08:00:00.000Z",
      sourceAccountId: createUuidV7(),
      transactions: [
        {
          amountMinor: "12000",
          destinationAccountId: createUuidV7(),
        },
      ],
    },
    payloadEncoding: "plaintext.v1",
    workspaceId,
  };
}

function createExpenseOperation(input: {
  readonly operationId: string;
  readonly baseRevision: string;
}): SyncOperationEnvelope {
  return createOperation({
    ...input,
    localSequence: "1",
    operationType: "transaction_group.create_expense.v1",
  });
}

function makeOperationRecord(operationId: string): SyncOperationRecord {
  return {
    baseRevision: 0,
    createdAt: "2026-05-09T01:00:00.000Z",
    createdBy: actorUserId,
    deviceId,
    id: operationId,
    idempotencyKey: `idem_${operationId}`,
    ledgerId,
    localSequence: "1",
    operationType: "transaction_group.create_expense.v1",
    operationVersion: 1,
    payloadEncoding: "plaintext.v1",
    payloadJson: {},
    receivedAt: "2026-05-09T02:00:00.000Z",
    resultJson: {},
    serverRevision: null,
    status: "accepted",
    workspaceId,
  };
}
