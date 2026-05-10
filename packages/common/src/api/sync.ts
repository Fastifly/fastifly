import { z } from "zod";

import { SyncedIdSchema } from "../ids.js";
import {
  SyncOperationIdSchema,
  SyncOperationTypeSchema,
  SyncRevisionStringSchema,
} from "../sync/operations.js";

export const SyncPushOperationSchema = z.strictObject({
  operationId: SyncOperationIdSchema,
  localSequence: SyncRevisionStringSchema,
  operationType: SyncOperationTypeSchema,
  operationVersion: z.literal(1),
  baseRevision: SyncRevisionStringSchema.nullish(),
  idempotencyKey: z.string().trim().min(1).max(255),
  payloadEncoding: z.enum(["plaintext.v1"]).default("plaintext.v1"),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime({ offset: true }),
});

export const SyncPushRequestSchema = z.strictObject({
  workspaceId: SyncedIdSchema,
  ledgerId: SyncedIdSchema,
  deviceId: SyncedIdSchema,
  lastKnownServerRevision: SyncRevisionStringSchema.optional(),
  operations: z.array(SyncPushOperationSchema).min(1).max(50),
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
    operations: z.array(
      z.strictObject({
        operationId: SyncOperationIdSchema,
        deviceId: SyncedIdSchema,
        localSequence: SyncRevisionStringSchema,
        operationType: SyncOperationTypeSchema,
        serverRevision: SyncRevisionStringSchema,
        payloadEncoding: z.enum(["plaintext.v1"]),
        payload: z.record(z.string(), z.unknown()),
        createdAt: z.string(),
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
    openConflictCount: z.number().int().min(0),
  }),
});

export type SyncPushOperation = z.infer<typeof SyncPushOperationSchema>;
export type SyncPushRequest = z.infer<typeof SyncPushRequestSchema>;
export type SyncPushResponse = z.infer<typeof SyncPushResponseSchema>;
export type SyncPullQuery = z.infer<typeof SyncPullQuerySchema>;
export type SyncPullResponse = z.infer<typeof SyncPullResponseSchema>;
export type SyncStatusQuery = z.infer<typeof SyncStatusQuerySchema>;
export type SyncStatusResponse = z.infer<typeof SyncStatusResponseSchema>;
