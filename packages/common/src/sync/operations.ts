import { z } from "zod";

import { IdempotencyKeySchema } from "../api/idempotency.js";
import { SyncedIdSchema } from "../ids.js";

export const SyncOperationTypeSchema = z.enum([
  "transaction_group.create_expense.v1",
  "transaction_group.create_income.v1",
  "transaction_group.create_transfer.v1",
]);

export type SyncOperationType = z.infer<typeof SyncOperationTypeSchema>;

export const APPROVED_SYNC_OPERATION_TYPES = SyncOperationTypeSchema.options;

export const SyncOperationStatusSchema = z.enum(["accepted", "rejected", "conflict", "superseded"]);

export type SyncOperationStatus = z.infer<typeof SyncOperationStatusSchema>;

export const SyncRevisionStringSchema = z.string().regex(/^(0|[1-9]\d*)$/);
export type SyncRevisionString = z.infer<typeof SyncRevisionStringSchema>;

export const SyncOperationIdSchema = z.string().trim().min(1).max(255);
export type SyncOperationId = z.infer<typeof SyncOperationIdSchema>;

export const SyncOperationEnvelopeSchema = z
  .object({
    operationId: SyncOperationIdSchema,
    workspaceId: SyncedIdSchema,
    ledgerId: SyncedIdSchema,
    deviceId: SyncedIdSchema,
    localSequence: SyncRevisionStringSchema,
    operationType: SyncOperationTypeSchema,
    operationVersion: z.literal(1),
    baseRevision: SyncRevisionStringSchema.nullish(),
    idempotencyKey: IdempotencyKeySchema,
    payloadEncoding: z.enum(["plaintext.v1"]),
    payload: z.record(z.string(), z.unknown()),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type SyncOperationEnvelope = z.infer<typeof SyncOperationEnvelopeSchema>;
