export type JsonObject = Record<string, unknown>;

export type JobQueueStatus = "available" | "running" | "succeeded" | "failed" | "cancelled";

export type ImportJobStatus = "preview_ready" | "committed" | "undone" | "failed";

export type RuleActionType = "set_transaction_status";

export type RecurringCadence = "daily" | "weekly" | "monthly";

export type RecurringTemplateStatus = "active" | "paused" | "archived";

export type SyncOperationStatus = "accepted" | "rejected" | "conflict" | "superseded";

export type SyncConflictStatus = "open" | "resolved" | "dismissed";

export type SyncConflictType =
  | "stale_update"
  | "update_after_delete"
  | "delete_after_update"
  | "duplicate_unique_value"
  | "invalid_operation"
  | "reconciled_record_blocked";

export type AuditAction =
  | "user.created"
  | "session.created"
  | "workspace.created"
  | "workspace_member.invited"
  | "workspace_member.invite_revoked"
  | "workspace_member.joined"
  | "workspace_member.role_changed"
  | "workspace_member.removed"
  | "ledger.created"
  | "account.created"
  | "account.updated"
  | "category.created"
  | "category.updated"
  | "transaction.created"
  | "sync_conflict.dismissed"
  | "job.enqueued";
