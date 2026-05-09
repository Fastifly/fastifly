export type JsonObject = Record<string, unknown>;

export type JobQueueStatus = "available" | "running" | "succeeded" | "failed" | "cancelled";

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
  | "job.enqueued";
