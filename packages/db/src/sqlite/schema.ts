import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import type { AuditAction, JobQueueStatus, JsonObject } from "../schema-types.js";

const timestampText = (name: string) => text(name).notNull();
const optionalTimestampText = (name: string) => text(name);
const idText = (name = "id") => text(name).primaryKey().notNull();
const requiredIdText = (name: string) => text(name).notNull();

export const sqliteUsers = sqliteTable(
  "users",
  {
    id: idText(),
    username: text("username").notNull(),
    usernameNormalized: text("username_normalized").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestampText("created_at"),
    updatedAt: timestampText("updated_at"),
    disabledAt: optionalTimestampText("disabled_at"),
  },
  (table) => [uniqueIndex("users_username_normalized_unique").on(table.usernameNormalized)],
);

export const sqliteSessions = sqliteTable(
  "sessions",
  {
    id: idText(),
    userId: requiredIdText("user_id").references(() => sqliteUsers.id),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    createdAt: timestampText("created_at"),
    expiresAt: timestampText("expires_at"),
    revokedAt: optionalTimestampText("revoked_at"),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId),
  ],
);

export const sqlitePasskeys = sqliteTable(
  "passkeys",
  {
    id: idText(),
    userId: requiredIdText("user_id").references(() => sqliteUsers.id),
    credentialId: text("credential_id").notNull(),
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull(),
    transportsJson: text("transports_json", { mode: "json" }).$type<string[] | null>(),
    name: text("name").notNull(),
    createdAt: timestampText("created_at"),
    lastUsedAt: optionalTimestampText("last_used_at"),
  },
  (table) => [
    uniqueIndex("passkeys_credential_id_unique").on(table.credentialId),
    index("passkeys_user_id_idx").on(table.userId),
  ],
);

export const sqlitePasskeyChallenges = sqliteTable(
  "passkey_challenges",
  {
    id: idText(),
    userId: text("user_id").references(() => sqliteUsers.id),
    kind: text("kind").notNull(),
    challenge: text("challenge").notNull(),
    createdAt: timestampText("created_at"),
    expiresAt: timestampText("expires_at"),
    consumedAt: optionalTimestampText("consumed_at"),
  },
  (table) => [
    index("passkey_challenges_user_id_idx").on(table.userId),
    index("passkey_challenges_kind_idx").on(table.kind),
    check("passkey_challenges_kind_check", sql`${table.kind} IN ('registration', 'login')`),
  ],
);

export const sqliteRecoveryCodes = sqliteTable(
  "recovery_codes",
  {
    id: idText(),
    userId: requiredIdText("user_id").references(() => sqliteUsers.id),
    codeHash: text("code_hash").notNull(),
    createdAt: timestampText("created_at"),
    usedAt: optionalTimestampText("used_at"),
  },
  (table) => [index("recovery_codes_user_id_idx").on(table.userId)],
);

export const sqliteWorkspaces = sqliteTable(
  "workspaces",
  {
    id: idText(),
    name: text("name").notNull(),
    ownerUserId: requiredIdText("owner_user_id").references(() => sqliteUsers.id),
    status: text("status").notNull().default("active"),
    createdAt: timestampText("created_at"),
    updatedAt: timestampText("updated_at"),
    archivedAt: optionalTimestampText("archived_at"),
  },
  (table) => [
    check(
      "workspaces_status_check",
      sql`${table.status} IN ('active', 'read_only', 'maintenance', 'archived', 'restore_preview', 'pending_restore', 'broken')`,
    ),
  ],
);

export const sqliteWorkspaceMembers = sqliteTable(
  "workspace_members",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => sqliteWorkspaces.id),
    userId: requiredIdText("user_id").references(() => sqliteUsers.id),
    role: text("role").notNull(),
    createdAt: timestampText("created_at"),
    updatedAt: timestampText("updated_at"),
    removedAt: optionalTimestampText("removed_at"),
  },
  (table) => [
    index("workspace_members_workspace_id_idx").on(table.workspaceId),
    index("workspace_members_user_id_idx").on(table.userId),
    uniqueIndex("workspace_members_workspace_user_unique").on(table.workspaceId, table.userId),
    check(
      "workspace_members_role_check",
      sql`${table.role} IN ('owner', 'admin', 'editor', 'viewer')`,
    ),
  ],
);

export const sqliteWorkspaceInvitations = sqliteTable(
  "workspace_invitations",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => sqliteWorkspaces.id),
    invitedByUserId: requiredIdText("invited_by_user_id").references(() => sqliteUsers.id),
    inviteeIdentifier: text("invitee_identifier").notNull(),
    role: text("role").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestampText("created_at"),
    expiresAt: timestampText("expires_at"),
    acceptedAt: optionalTimestampText("accepted_at"),
    revokedAt: optionalTimestampText("revoked_at"),
  },
  (table) => [
    index("workspace_invitations_workspace_id_idx").on(table.workspaceId),
    uniqueIndex("workspace_invitations_token_hash_unique").on(table.tokenHash),
    check("workspace_invitations_role_check", sql`${table.role} IN ('admin', 'editor', 'viewer')`),
  ],
);

export const sqliteLedgers = sqliteTable(
  "ledgers",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => sqliteWorkspaces.id),
    name: text("name").notNull(),
    baseCurrencyCode: text("base_currency_code", { length: 3 }).notNull(),
    firstDayOfWeek: integer("first_day_of_week").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestampText("created_at"),
    updatedAt: timestampText("updated_at"),
    archivedAt: optionalTimestampText("archived_at"),
  },
  (table) => [
    index("ledgers_workspace_id_idx").on(table.workspaceId),
    check(
      "ledgers_status_check",
      sql`${table.status} IN ('active', 'read_only', 'maintenance', 'archived', 'restore_preview', 'pending_restore', 'broken')`,
    ),
  ],
);

export const sqliteDevices = sqliteTable(
  "devices",
  {
    id: idText(),
    userId: requiredIdText("user_id").references(() => sqliteUsers.id),
    deviceKey: text("device_key").notNull(),
    name: text("name").notNull(),
    createdAt: timestampText("created_at"),
    lastSeenAt: optionalTimestampText("last_seen_at"),
    revokedAt: optionalTimestampText("revoked_at"),
  },
  (table) => [
    index("devices_user_id_idx").on(table.userId),
    index("devices_revoked_at_idx").on(table.revokedAt),
    uniqueIndex("devices_user_device_key_unique").on(table.userId, table.deviceKey),
  ],
);

export const sqliteIdempotencyReceipts = sqliteTable(
  "idempotency_receipts",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => sqliteWorkspaces.id),
    ledgerId: text("ledger_id").references(() => sqliteLedgers.id),
    actorUserId: requiredIdText("actor_user_id").references(() => sqliteUsers.id),
    deviceId: text("device_id").references(() => sqliteDevices.id),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseBodyJson: text("response_body_json", { mode: "json" }).$type<JsonObject>().notNull(),
    createdAt: timestampText("created_at"),
    expiresAt: timestampText("expires_at"),
  },
  (table) => [
    index("idempotency_receipts_workspace_id_idx").on(table.workspaceId),
    index("idempotency_receipts_ledger_id_idx").on(table.ledgerId),
    uniqueIndex("idempotency_receipts_actor_key_unique").on(
      table.actorUserId,
      table.idempotencyKey,
    ),
  ],
);

export const sqliteJobQueue = sqliteTable(
  "job_queue",
  {
    id: idText(),
    type: text("type").notNull(),
    status: text("status").$type<JobQueueStatus>().notNull(),
    payloadJson: text("payload_json", { mode: "json" }).$type<JsonObject>().notNull(),
    dedupeKey: text("dedupe_key"),
    attempts: integer("attempts").notNull(),
    maxAttempts: integer("max_attempts").notNull(),
    availableAt: timestampText("available_at"),
    lockedAt: optionalTimestampText("locked_at"),
    lockedBy: text("locked_by"),
    createdAt: timestampText("created_at"),
    updatedAt: timestampText("updated_at"),
  },
  (table) => [
    index("job_queue_status_idx").on(table.status),
    index("job_queue_available_at_idx").on(table.availableAt),
    uniqueIndex("job_queue_dedupe_key_unique").on(table.dedupeKey),
  ],
);

export const sqliteAuditLog = sqliteTable(
  "audit_log",
  {
    id: idText(),
    workspaceId: text("workspace_id").references(() => sqliteWorkspaces.id),
    ledgerId: text("ledger_id").references(() => sqliteLedgers.id),
    actorUserId: text("actor_user_id").references(() => sqliteUsers.id),
    action: text("action").$type<AuditAction>().notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    metadataJson: text("metadata_json", { mode: "json" }).$type<JsonObject>().notNull(),
    createdAt: timestampText("created_at"),
  },
  (table) => [
    index("audit_log_workspace_id_idx").on(table.workspaceId),
    index("audit_log_ledger_id_idx").on(table.ledgerId),
    index("audit_log_actor_user_id_idx").on(table.actorUserId),
  ],
);

export const sqliteSchema = {
  auditLog: sqliteAuditLog,
  devices: sqliteDevices,
  idempotencyReceipts: sqliteIdempotencyReceipts,
  jobQueue: sqliteJobQueue,
  ledgers: sqliteLedgers,
  passkeyChallenges: sqlitePasskeyChallenges,
  passkeys: sqlitePasskeys,
  recoveryCodes: sqliteRecoveryCodes,
  sessions: sqliteSessions,
  users: sqliteUsers,
  workspaceInvitations: sqliteWorkspaceInvitations,
  workspaceMembers: sqliteWorkspaceMembers,
  workspaces: sqliteWorkspaces,
};
