import type { SyncedId } from "@fastifly/common";
import type { SyncRepository } from "../repositories/sync.js";
import type { JsonObject } from "../schema-types.js";

const DEFAULT_PULL_LIMIT = 100;
const MAX_PULL_LIMIT = 500;

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
  readonly openConflictCount: number;
};

export type SyncQueryService = {
  readonly pull: (input: SyncPullInput) => Promise<SyncPullResult>;
  readonly status: (input: SyncStatusInput) => Promise<SyncStatusResult>;
};

export type SyncQueryServiceOptions = {
  readonly syncRepository: SyncRepository;
};

export function createSyncQueryService(options: SyncQueryServiceOptions): SyncQueryService {
  return {
    async pull(input) {
      const limit = clampPullLimit(input.limit);
      const [currentRevision, operations] = await Promise.all([
        options.syncRepository.getCurrentRevision(input),
        options.syncRepository.listAcceptedOperationsSince({
          ledgerId: input.ledgerId,
          limit,
          sinceRevision: input.sinceRevision,
          workspaceId: input.workspaceId,
        }),
      ]);
      const deliveredRevision = operations.at(-1)?.serverRevision ?? currentRevision;

      return {
        fromRevision: input.sinceRevision.toString(),
        ledgerId: input.ledgerId,
        operations: operations.map((operation) => ({
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
      const [serverRevision, openConflictCount] = await Promise.all([
        options.syncRepository.getCurrentRevision(input),
        options.syncRepository.countOpenConflicts(input),
      ]);

      return {
        ledgerId: input.ledgerId,
        openConflictCount,
        serverRevision: serverRevision.toString(),
        workspaceId: input.workspaceId,
      };
    },
  };
}

function clampPullLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_PULL_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PULL_LIMIT);
}
