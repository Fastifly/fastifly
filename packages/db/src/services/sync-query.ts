import type { SyncedId } from "@fastifly/common";
import type { SyncRepository } from "../repositories/sync.js";
import type { JsonObject } from "../schema-types.js";

const DEFAULT_PULL_LIMIT = 500;
const MAX_PULL_LIMIT = 500;
const DEFAULT_CONFLICT_LIMIT = 100;

export type SyncPullInput = {
  readonly actorUserId: SyncedId;
  readonly workspaceId: SyncedId;
  readonly ledgerId: SyncedId;
  readonly sinceRevision: number;
  readonly limit?: number;
};

export type SyncPulledOperation = {
  readonly operationId: string;
  readonly deviceId: SyncedId;
  readonly localSequence: string;
  readonly operationType: string;
  readonly serverRevision: string;
  readonly payloadEncoding: "plaintext.v1";
  readonly payload: JsonObject;
  readonly createdAt: string;
};

export type SyncPullResult = {
  readonly workspaceId: SyncedId;
  readonly ledgerId: SyncedId;
  readonly fromRevision: string;
  readonly toRevision: string;
  readonly operations: readonly SyncPulledOperation[];
  readonly hasMore: boolean;
  readonly nextSinceRevision: string | null;
};

export type SyncStatusInput = {
  readonly actorUserId: SyncedId;
  readonly workspaceId: SyncedId;
  readonly ledgerId: SyncedId;
};

export type SyncStatusResult = {
  readonly workspaceId: SyncedId;
  readonly ledgerId: SyncedId;
  readonly serverRevision: string;
  readonly openConflicts: number;
  readonly lastOperationAt: string | null;
};

export type SyncConflictResult = {
  readonly id: SyncedId;
  readonly incomingOperationId: string;
  readonly conflictType: string;
  readonly localRevision: string;
  readonly incomingBaseRevision: string | null;
  readonly localSnapshot: JsonObject;
  readonly incomingPayload: JsonObject;
  readonly status: "open" | "resolved" | "dismissed";
  readonly createdAt: string;
};

export type SyncConflictsInput = {
  readonly actorUserId: SyncedId;
  readonly workspaceId: SyncedId;
  readonly ledgerId: SyncedId;
};

export type SyncConflictsResult = {
  readonly workspaceId: SyncedId;
  readonly ledgerId: SyncedId;
  readonly conflicts: readonly SyncConflictResult[];
};

export type SyncDismissConflictInput = {
  readonly actorUserId: SyncedId;
  readonly workspaceId: SyncedId;
  readonly ledgerId: SyncedId;
  readonly conflictId: SyncedId;
};

export type SyncDismissConflictResult = {
  readonly conflictId: SyncedId;
  readonly status: "dismissed";
  readonly resolvedAt: string;
};

export type SyncQueryService = {
  readonly pull: (input: SyncPullInput) => Promise<SyncPullResult>;
  readonly status: (input: SyncStatusInput) => Promise<SyncStatusResult>;
  readonly listConflicts: (input: SyncConflictsInput) => Promise<SyncConflictsResult>;
  readonly dismissConflict: (
    input: SyncDismissConflictInput,
  ) => Promise<SyncDismissConflictResult | null>;
};

export type SyncQueryServiceOptions = {
  readonly syncRepository: SyncRepository;
  readonly now?: () => Date;
};

export function createSyncQueryService(options: SyncQueryServiceOptions): SyncQueryService {
  const now = options.now ?? (() => new Date());

  return {
    async pull(input) {
      const limit = clampPullLimit(input.limit);
      const [currentRevision, operations] = await Promise.all([
        options.syncRepository.getCurrentRevision(input),
        options.syncRepository.listAcceptedOperationsSince({
          ledgerId: input.ledgerId,
          limit: limit + 1,
          sinceRevision: input.sinceRevision,
          workspaceId: input.workspaceId,
        }),
      ]);
      const visibleOperations = operations.slice(0, limit);
      const deliveredRevision = visibleOperations.at(-1)?.serverRevision ?? currentRevision;
      const hasMore = operations.length > limit;

      return {
        fromRevision: input.sinceRevision.toString(),
        hasMore,
        ledgerId: input.ledgerId,
        nextSinceRevision: hasMore ? deliveredRevision.toString() : null,
        operations: visibleOperations.map((operation) => ({
          createdAt: operation.createdAt,
          deviceId: operation.deviceId,
          localSequence: operation.localSequence,
          operationId: operation.id,
          operationType: operation.operationType,
          payload: operation.payloadJson,
          payloadEncoding: operation.payloadEncoding,
          serverRevision: operation.serverRevision?.toString() ?? "0",
        })),
        toRevision: deliveredRevision.toString(),
        workspaceId: input.workspaceId,
      };
    },

    async status(input) {
      const [serverRevision, openConflicts, lastOperationAt] = await Promise.all([
        options.syncRepository.getCurrentRevision(input),
        options.syncRepository.countOpenConflicts(input),
        options.syncRepository.getLastAcceptedOperationAt(input),
      ]);

      return {
        ledgerId: input.ledgerId,
        lastOperationAt,
        openConflicts,
        serverRevision: serverRevision.toString(),
        workspaceId: input.workspaceId,
      };
    },

    async listConflicts(input) {
      const conflicts = await options.syncRepository.listOpenConflicts(input);

      return {
        conflicts: conflicts.slice(0, DEFAULT_CONFLICT_LIMIT).map((conflict) => ({
          conflictType: conflict.conflictType,
          createdAt: conflict.createdAt,
          id: conflict.id,
          incomingBaseRevision: conflict.incomingBaseRevision?.toString() ?? null,
          incomingOperationId: conflict.incomingOperationId,
          incomingPayload: conflict.incomingPayloadJson,
          localRevision: conflict.localRevision.toString(),
          localSnapshot: conflict.localSnapshotJson,
          status: conflict.status,
        })),
        ledgerId: input.ledgerId,
        workspaceId: input.workspaceId,
      };
    },

    async dismissConflict(input) {
      return await options.syncRepository.dismissConflict({
        actorUserId: input.actorUserId,
        conflictId: input.conflictId,
        ledgerId: input.ledgerId,
        resolvedAt: now(),
        workspaceId: input.workspaceId,
      });
    },
  };
}

function clampPullLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_PULL_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PULL_LIMIT);
}
