import { z } from "zod";

export const SyncOperationTypeSchema = z.enum([
  "transaction_group.create",
  "transaction_group.update",
  "transaction_group.delete",
  "account.create",
  "account.update",
  "account.archive",
]);

export type SyncOperationType = z.infer<typeof SyncOperationTypeSchema>;

export const SyncOperationStatusSchema = z.enum(["pending", "accepted", "rejected", "conflicted"]);

export type SyncOperationStatus = z.infer<typeof SyncOperationStatusSchema>;
