import {
  type CreateTransactionRequest,
  CreateTransactionRequestSchema,
  parseAmountMinor,
  parseSyncedId,
  type SyncedId,
  type SyncOperationEnvelope,
} from "@fastifly/common";
import type { LedgerMutationRunResult } from "../ledger-mutations.js";
import { LedgerMutationError } from "../ledger-mutations.js";
import type { SyncRepository } from "../repositories/sync.js";
import type { CreateTransactionLineInput } from "../repositories/transactions.js";
import type { JsonObject, SyncConflictType } from "../schema-types.js";
import type { LedgerFinanceMutationService } from "./finance-mutations.js";

export type SyncReplayAcceptedResult = {
  readonly operationId: string;
  readonly serverRevision: string;
};

export type SyncReplayRejectedResult = {
  readonly operationId: string;
  readonly reason: string;
};

export type SyncReplayConflictResult = {
  readonly operationId: string;
  readonly conflictType: SyncConflictType;
  readonly serverRevision: string;
};

export type SyncReplayPushResult = {
  readonly accepted: readonly SyncReplayAcceptedResult[];
  readonly rejected: readonly SyncReplayRejectedResult[];
  readonly conflicts: readonly SyncReplayConflictResult[];
  readonly serverRevision: string;
};

export type SyncReplayPushInput = {
  readonly actorUserId: SyncedId;
  readonly workspaceId: SyncedId;
  readonly ledgerId: SyncedId;
  readonly deviceId: SyncedId;
  readonly operations: readonly SyncOperationEnvelope[];
};

export type SyncReplayService = {
  readonly push: (input: SyncReplayPushInput) => Promise<SyncReplayPushResult>;
};

export type SyncReplayServiceOptions = {
  readonly financeMutationService: LedgerFinanceMutationService;
  readonly syncRepository: SyncRepository;
  readonly createId: () => SyncedId;
  readonly now?: () => Date;
};

export class SyncReplayError extends Error {
  constructor(
    message: string,
    readonly code: "DEVICE_NOT_FOUND" | "DEVICE_REVOKED" | "OPERATION_SCOPE_MISMATCH",
  ) {
    super(message);
    this.name = "SyncReplayError";
  }
}

export function createSyncReplayService(options: SyncReplayServiceOptions): SyncReplayService {
  const now = options.now ?? (() => new Date());

  return {
    async push(input) {
      const device = await options.syncRepository.findDeviceForUser(
        input.deviceId,
        input.actorUserId,
      );

      if (!device) {
        throw new SyncReplayError("Sync device was not found.", "DEVICE_NOT_FOUND");
      }
      if (device.revokedAt) {
        throw new SyncReplayError("Sync device is revoked.", "DEVICE_REVOKED");
      }

      const accepted: SyncReplayAcceptedResult[] = [];
      const rejected: SyncReplayRejectedResult[] = [];
      const conflicts: SyncReplayConflictResult[] = [];
      const orderedOperations = sortOperationsByLocalSequence(input.operations);

      for (const operation of orderedOperations) {
        assertOperationScope(input, operation);

        const replayed = await replayExistingOperation(options.syncRepository, operation);
        if (replayed) {
          pushReplayedResult(replayed, accepted, rejected, conflicts);
          continue;
        }

        const duplicatedSequence = await options.syncRepository.findOperationByDeviceSequence(
          operation.deviceId,
          operation.localSequence,
        );
        if (duplicatedSequence) {
          rejected.push({
            operationId: operation.operationId,
            reason: "duplicate_local_sequence",
          });
          continue;
        }

        const currentRevision = await options.syncRepository.getCurrentRevision({
          ledgerId: operation.ledgerId,
          workspaceId: operation.workspaceId,
        });
        const baseRevision = parseOptionalRevision(operation.baseRevision);

        if (baseRevision !== null && baseRevision !== currentRevision) {
          await options.syncRepository.recordConflictOperation({
            actorUserId: input.actorUserId,
            conflictId: options.createId(),
            conflictType: "stale_update",
            localRevision: currentRevision,
            operation,
            receivedAt: now(),
            resultJson: { reason: "stale_base_revision" },
          });
          conflicts.push({
            conflictType: "stale_update",
            operationId: operation.operationId,
            serverRevision: currentRevision.toString(),
          });
          continue;
        }

        const applied = await applyOperation(options.financeMutationService, {
          actorUserId: input.actorUserId,
          operation,
          receivedAt: now(),
        });

        if (applied.status === "accepted") {
          const serverRevision = await options.syncRepository.recordAcceptedOperation({
            actorUserId: input.actorUserId,
            operation,
            receivedAt: now(),
            resultJson: applied.result.body,
          });
          accepted.push({
            operationId: operation.operationId,
            serverRevision: serverRevision.toString(),
          });
          continue;
        }

        rejected.push(
          await recordRejectedOperation(options.syncRepository, {
            actorUserId: input.actorUserId,
            operation,
            reason: applied.reason,
            receivedAt: now(),
          }),
        );
      }

      await options.syncRepository.touchDeviceLastSeen(input.deviceId, input.actorUserId, now());

      const serverRevision = await options.syncRepository.getCurrentRevision({
        ledgerId: input.ledgerId,
        workspaceId: input.workspaceId,
      });

      return {
        accepted,
        conflicts,
        rejected,
        serverRevision: serverRevision.toString(),
      };
    },
  };
}

async function replayExistingOperation(
  syncRepository: SyncRepository,
  operation: SyncOperationEnvelope,
) {
  return await syncRepository.findOperation(operation.operationId);
}

function pushReplayedResult(
  operation: Awaited<ReturnType<SyncRepository["findOperation"]>>,
  accepted: SyncReplayAcceptedResult[],
  rejected: SyncReplayRejectedResult[],
  conflicts: SyncReplayConflictResult[],
): void {
  if (!operation) {
    return;
  }
  if (operation.status === "accepted" && operation.serverRevision !== null) {
    accepted.push({
      operationId: operation.id,
      serverRevision: operation.serverRevision.toString(),
    });
    return;
  }
  if (operation.status === "conflict") {
    conflicts.push({
      conflictType: "stale_update",
      operationId: operation.id,
      serverRevision: operation.serverRevision?.toString() ?? "0",
    });
    return;
  }

  rejected.push({
    operationId: operation.id,
    reason: String(operation.resultJson.reason ?? "rejected"),
  });
}

function assertOperationScope(input: SyncReplayPushInput, operation: SyncOperationEnvelope): void {
  if (
    operation.workspaceId !== input.workspaceId ||
    operation.ledgerId !== input.ledgerId ||
    operation.deviceId !== input.deviceId
  ) {
    throw new SyncReplayError(
      "Sync operation scope does not match the push envelope.",
      "OPERATION_SCOPE_MISMATCH",
    );
  }
}

async function applyOperation(
  financeMutationService: LedgerFinanceMutationService,
  input: {
    readonly actorUserId: SyncedId;
    readonly operation: SyncOperationEnvelope;
    readonly receivedAt: Date;
  },
): Promise<
  | { readonly status: "accepted"; readonly result: LedgerMutationRunResult }
  | { readonly status: "rejected"; readonly reason: string }
> {
  const transactionType = toTransactionType(input.operation.operationType);
  if (!transactionType) {
    return { status: "rejected", reason: "unsupported_operation" };
  }

  const parsed = parseTransactionPayload(input.operation.payload, transactionType);
  if (!parsed.success) {
    return { status: "rejected", reason: "invalid_operation" };
  }

  const create = {
    expense: financeMutationService.createExpense,
    income: financeMutationService.createIncome,
    transfer: financeMutationService.createTransfer,
  }[transactionType].bind(financeMutationService);

  try {
    const result = await create({
      envelope: {
        actorUserId: input.actorUserId,
        authorization: {
          action: "create",
          subject: "TransactionGroup",
        },
        baseRevision: parseOptionalRevision(input.operation.baseRevision),
        deviceId: input.operation.deviceId,
        dryRun: false,
        idempotencyKey: input.operation.idempotencyKey,
        ledgerId: input.operation.ledgerId,
        requestId: input.operation.operationId,
        sideEffectFlags: makeSyncSideEffectFlags(),
        source: "sync",
        syncOperation: {
          localSequence: input.operation.localSequence,
          operationId: input.operation.operationId,
          operationType: input.operation.operationType,
        },
        workspaceId: input.operation.workspaceId,
      },
      transaction: {
        currencyCode: parsed.data.currencyCode,
        description: parsed.data.description,
        lines: parsed.data.transactions.map(toTransactionLineInput),
        occurredAt: parsed.data.occurredAt,
        source: "api",
        sourceAccountId: parseSyncedId(parsed.data.sourceAccountId),
        title: parsed.data.title ?? null,
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
      },
    });

    return { result, status: "accepted" };
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      return { status: "rejected", reason: "permission_denied" };
    }
    throw error;
  }
}

function sortOperationsByLocalSequence(
  operations: readonly SyncOperationEnvelope[],
): readonly SyncOperationEnvelope[] {
  return [...operations].sort((left, right) => {
    const leftSequence = BigInt(left.localSequence);
    const rightSequence = BigInt(right.localSequence);
    if (leftSequence === rightSequence) {
      return 0;
    }
    return leftSequence < rightSequence ? -1 : 1;
  });
}

function isPermissionDeniedError(error: unknown): boolean {
  return error instanceof LedgerMutationError && error.code === "MUTATION_FORBIDDEN";
}

function parseTransactionPayload(
  payload: JsonObject,
  transactionType: "expense" | "income" | "transfer",
) {
  if ("type" in payload && payload.type !== transactionType) {
    return CreateTransactionRequestSchema.safeParse({
      ...payload,
      type: "__invalid_type__",
    });
  }

  return CreateTransactionRequestSchema.safeParse({
    ...payload,
    type: transactionType,
  });
}

function toTransactionType(
  operationType: SyncOperationEnvelope["operationType"],
): "expense" | "income" | "transfer" | null {
  if (operationType === "transaction_group.create_expense.v1") {
    return "expense";
  }
  if (operationType === "transaction_group.create_income.v1") {
    return "income";
  }
  if (operationType === "transaction_group.create_transfer.v1") {
    return "transfer";
  }

  return null;
}

function toTransactionLineInput(
  input: CreateTransactionRequest["transactions"][number],
): CreateTransactionLineInput {
  return {
    amountMinor: parseAmountMinor(input.amountMinor),
    budgetId: input.budgetId ? parseSyncedId(input.budgetId) : null,
    categoryId: input.categoryId ? parseSyncedId(input.categoryId) : null,
    description: input.description ?? null,
    destinationAccountId: parseSyncedId(input.destinationAccountId),
    reportingAmountMinor: input.reportingAmountMinor
      ? parseAmountMinor(input.reportingAmountMinor)
      : null,
    reportingCurrencyCode: input.reportingCurrencyCode ?? null,
  };
}

async function recordRejectedOperation(
  syncRepository: SyncRepository,
  input: {
    readonly actorUserId: SyncedId;
    readonly operation: SyncOperationEnvelope;
    readonly reason: string;
    readonly receivedAt: Date;
  },
): Promise<SyncReplayRejectedResult> {
  await syncRepository.recordRejectedOperation({
    actorUserId: input.actorUserId,
    operation: input.operation,
    receivedAt: input.receivedAt,
    resultJson: { reason: input.reason },
  });

  return {
    operationId: input.operation.operationId,
    reason: input.reason,
  };
}

function parseOptionalRevision(revision: string | null | undefined): number | null {
  return revision === null || revision === undefined ? null : Number(revision);
}

function makeSyncSideEffectFlags() {
  return {
    applyRules: false,
    batchSubmission: false,
    fireWebhooks: false,
    recalculateBalances: true,
    skipNotifications: false,
  };
}
