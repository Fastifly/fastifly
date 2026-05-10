import { z } from "zod";

import { SyncedIdSchema } from "../ids.js";
import { IsoDateTimeSchema, NullableIsoDateTimeSchema } from "../schemas/scalars.js";
import {
  SyncOperationIdSchema,
  SyncOperationTypeSchema,
  SyncRevisionStringSchema,
} from "../sync/operations.js";
import { IdempotencyKeySchema } from "./idempotency.js";

export const SyncPushOperationSchema = z.strictObject({
  operationId: SyncOperationIdSchema,
  localSequence: SyncRevisionStringSchema,
  operationType: SyncOperationTypeSchema,
  operationVersion: z.literal(1),
  baseRevision: SyncRevisionStringSchema.nullish(),
  idempotencyKey: IdempotencyKeySchema,
  payloadEncoding: z.enum(["plaintext.v1"]).default("plaintext.v1"),
  payload: z.record(z.string(), z.unknown()),
  createdAt: IsoDateTimeSchema,
});

export const SyncPushRequestSchema = z.strictObject({
  workspaceId: SyncedIdSchema,
  ledgerId: SyncedIdSchema,
  deviceId: SyncedIdSchema,
  lastKnownServerRevision: SyncRevisionStringSchema.optional(),
  operations: z.array(SyncPushOperationSchema).min(1).max(100),
});

export const SyncPushResponseSchema = z.strictObject({
  data: z.strictObject({
    accepted: z.array(
      z.strictObject({
        operationId: SyncOperationIdSchema,
        serverRevision: SyncRevisionStringSchema,
      }),
    ),
    rejected: z.array(
      z.strictObject({
        operationId: SyncOperationIdSchema,
        reason: z.string().min(1),
      }),
    ),
    conflicts: z.array(
      z.strictObject({
        operationId: SyncOperationIdSchema,
        conflictType: z.enum([
          "stale_update",
          "update_after_delete",
          "delete_after_update",
          "duplicate_unique_value",
          "invalid_operation",
          "reconciled_record_blocked",
        ]),
        serverRevision: SyncRevisionStringSchema,
      }),
    ),
    serverRevision: SyncRevisionStringSchema,
  }),
});

export const SyncPullQuerySchema = z.strictObject({
  workspaceId: SyncedIdSchema,
  ledgerId: SyncedIdSchema,
  sinceRevision: SyncRevisionStringSchema,
});

export const SyncPullResponseSchema = z.strictObject({
  data: z.strictObject({
    workspaceId: SyncedIdSchema,
    ledgerId: SyncedIdSchema,
    fromRevision: SyncRevisionStringSchema,
    toRevision: SyncRevisionStringSchema,
    hasMore: z.boolean(),
    nextSinceRevision: SyncRevisionStringSchema.nullable(),
    operations: z.array(
      z.strictObject({
        operationId: SyncOperationIdSchema,
        deviceId: SyncedIdSchema,
        localSequence: SyncRevisionStringSchema,
        operationType: SyncOperationTypeSchema,
        serverRevision: SyncRevisionStringSchema,
        payloadEncoding: z.enum(["plaintext.v1"]),
        payload: z.record(z.string(), z.unknown()),
        createdAt: IsoDateTimeSchema,
      }),
    ),
  }),
});

export const SyncStatusQuerySchema = z.strictObject({
  workspaceId: SyncedIdSchema,
  ledgerId: SyncedIdSchema,
});

export const SyncStatusResponseSchema = z.strictObject({
  data: z.strictObject({
    workspaceId: SyncedIdSchema,
    ledgerId: SyncedIdSchema,
    serverRevision: SyncRevisionStringSchema,
    openConflicts: z.number().int().min(0),
    lastOperationAt: NullableIsoDateTimeSchema,
  }),
});

export const SyncConflictsQuerySchema = z.strictObject({
  workspaceId: SyncedIdSchema,
  ledgerId: SyncedIdSchema,
});

const SyncConflictTypeSchema = z.enum([
  "stale_update",
  "update_after_delete",
  "delete_after_update",
  "duplicate_unique_value",
  "invalid_operation",
  "reconciled_record_blocked",
]);

export const SyncConflictsResponseSchema = z.strictObject({
  data: z.strictObject({
    workspaceId: SyncedIdSchema,
    ledgerId: SyncedIdSchema,
    conflicts: z.array(
      z.strictObject({
        id: SyncedIdSchema,
        incomingOperationId: SyncOperationIdSchema,
        conflictType: SyncConflictTypeSchema,
        localRevision: SyncRevisionStringSchema,
        incomingBaseRevision: SyncRevisionStringSchema.nullable(),
        localSnapshot: z.record(z.string(), z.unknown()),
        incomingPayload: z.record(z.string(), z.unknown()),
        status: z.enum(["open", "resolved", "dismissed"]),
        createdAt: IsoDateTimeSchema,
      }),
    ),
  }),
});

export const SyncResolveConflictParamsSchema = z.strictObject({
  conflictId: SyncedIdSchema,
});

export const SyncResolveConflictRequestSchema = z.strictObject({
  workspaceId: SyncedIdSchema,
  ledgerId: SyncedIdSchema,
  resolution: z.literal("dismiss"),
});

export const SyncResolveConflictResponseSchema = z.strictObject({
  data: z.strictObject({
    conflictId: SyncedIdSchema,
    status: z.literal("dismissed"),
    resolvedAt: IsoDateTimeSchema,
  }),
});

export type SyncPushOperation = z.infer<typeof SyncPushOperationSchema>;
export type SyncPushRequest = z.infer<typeof SyncPushRequestSchema>;
export type SyncPushResponse = z.infer<typeof SyncPushResponseSchema>;
export type SyncPullQuery = z.infer<typeof SyncPullQuerySchema>;
export type SyncPullResponse = z.infer<typeof SyncPullResponseSchema>;
export type SyncStatusQuery = z.infer<typeof SyncStatusQuerySchema>;
export type SyncStatusResponse = z.infer<typeof SyncStatusResponseSchema>;
export type SyncConflictsQuery = z.infer<typeof SyncConflictsQuerySchema>;
export type SyncConflictsResponse = z.infer<typeof SyncConflictsResponseSchema>;
export type SyncResolveConflictParams = z.infer<typeof SyncResolveConflictParamsSchema>;
export type SyncResolveConflictRequest = z.infer<typeof SyncResolveConflictRequestSchema>;
export type SyncResolveConflictResponse = z.infer<typeof SyncResolveConflictResponseSchema>;
