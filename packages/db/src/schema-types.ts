export type JsonObject = Record<string, unknown>;

export type JobQueueStatus = "available" | "running" | "succeeded" | "failed" | "cancelled";

export type AuditAction =
  | "user.created"
  | "session.created"
  | "workspace.created"
  | "workspace_member.added"
  | "ledger.created"
  | "job.enqueued";
