import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type { AuditAction, JobQueueStatus, JsonObject } from "../schema-types.js";

const timestampTz = (name: string) => timestamp(name, { withTimezone: true }).notNull();
const optionalTimestampTz = (name: string) => timestamp(name, { withTimezone: true });
const idText = (name = "id") => text(name).primaryKey().notNull();
const requiredIdText = (name: string) => text(name).notNull();

export const pgUsers = pgTable(
  "users",
  {
    id: idText(),
    username: text("username").notNull(),
    usernameNormalized: text("username_normalized").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestampTz("created_at"),
    updatedAt: timestampTz("updated_at"),
    disabledAt: optionalTimestampTz("disabled_at"),
  },
  (table) => [uniqueIndex("users_username_normalized_unique").on(table.usernameNormalized)],
);

export const pgSessions = pgTable(
  "sessions",
  {
    id: idText(),
    userId: requiredIdText("user_id").references(() => pgUsers.id),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    createdAt: timestampTz("created_at"),
    expiresAt: timestampTz("expires_at"),
    revokedAt: optionalTimestampTz("revoked_at"),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId),
  ],
);

export const pgPasskeys = pgTable(
  "passkeys",
  {
    id: idText(),
    userId: requiredIdText("user_id").references(() => pgUsers.id),
    credentialId: text("credential_id").notNull(),
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull(),
    transportsJson: jsonb("transports_json").$type<string[] | null>(),
    createdAt: timestampTz("created_at"),
    lastUsedAt: optionalTimestampTz("last_used_at"),
  },
  (table) => [
    uniqueIndex("passkeys_credential_id_unique").on(table.credentialId),
    index("passkeys_user_id_idx").on(table.userId),
  ],
);

export const pgRecoveryCodes = pgTable(
  "recovery_codes",
  {
    id: idText(),
    userId: requiredIdText("user_id").references(() => pgUsers.id),
    codeHash: text("code_hash").notNull(),
    createdAt: timestampTz("created_at"),
    usedAt: optionalTimestampTz("used_at"),
  },
  (table) => [index("recovery_codes_user_id_idx").on(table.userId)],
);

export const pgWorkspaces = pgTable("workspaces", {
  id: idText(),
  name: text("name").notNull(),
  ownerUserId: requiredIdText("owner_user_id").references(() => pgUsers.id),
  createdAt: timestampTz("created_at"),
  updatedAt: timestampTz("updated_at"),
  archivedAt: optionalTimestampTz("archived_at"),
});

export const pgWorkspaceMembers = pgTable(
  "workspace_members",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => pgWorkspaces.id),
    userId: requiredIdText("user_id").references(() => pgUsers.id),
    role: text("role").notNull(),
    createdAt: timestampTz("created_at"),
    updatedAt: timestampTz("updated_at"),
    removedAt: optionalTimestampTz("removed_at"),
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

export const pgWorkspaceInvitations = pgTable(
  "workspace_invitations",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => pgWorkspaces.id),
    invitedByUserId: requiredIdText("invited_by_user_id").references(() => pgUsers.id),
    inviteeIdentifier: text("invitee_identifier").notNull(),
    role: text("role").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestampTz("created_at"),
    expiresAt: timestampTz("expires_at"),
    acceptedAt: optionalTimestampTz("accepted_at"),
    revokedAt: optionalTimestampTz("revoked_at"),
  },
  (table) => [
    index("workspace_invitations_workspace_id_idx").on(table.workspaceId),
    uniqueIndex("workspace_invitations_token_hash_unique").on(table.tokenHash),
    check("workspace_invitations_role_check", sql`${table.role} IN ('admin', 'editor', 'viewer')`),
  ],
);

export const pgLedgers = pgTable(
  "ledgers",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => pgWorkspaces.id),
    name: text("name").notNull(),
    baseCurrencyCode: text("base_currency_code").notNull(),
    firstDayOfWeek: integer("first_day_of_week").notNull(),
    createdAt: timestampTz("created_at"),
    updatedAt: timestampTz("updated_at"),
    archivedAt: optionalTimestampTz("archived_at"),
  },
  (table) => [index("ledgers_workspace_id_idx").on(table.workspaceId)],
);

export const pgDevices = pgTable(
  "devices",
  {
    id: idText(),
    userId: requiredIdText("user_id").references(() => pgUsers.id),
    deviceKey: text("device_key").notNull(),
    name: text("name").notNull(),
    createdAt: timestampTz("created_at"),
    lastSeenAt: optionalTimestampTz("last_seen_at"),
    revokedAt: optionalTimestampTz("revoked_at"),
  },
  (table) => [
    index("devices_user_id_idx").on(table.userId),
    index("devices_revoked_at_idx").on(table.revokedAt),
    uniqueIndex("devices_user_device_key_unique").on(table.userId, table.deviceKey),
  ],
);

export const pgIdempotencyReceipts = pgTable(
  "idempotency_receipts",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => pgWorkspaces.id),
    ledgerId: text("ledger_id").references(() => pgLedgers.id),
    actorUserId: requiredIdText("actor_user_id").references(() => pgUsers.id),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseBodyJson: jsonb("response_body_json").$type<JsonObject>().notNull(),
    createdAt: timestampTz("created_at"),
    expiresAt: timestampTz("expires_at"),
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

export const pgJobQueue = pgTable(
  "job_queue",
  {
    id: idText(),
    type: text("type").notNull(),
    status: text("status").$type<JobQueueStatus>().notNull(),
    payloadJson: jsonb("payload_json").$type<JsonObject>().notNull(),
    dedupeKey: text("dedupe_key"),
    attempts: integer("attempts").notNull(),
    maxAttempts: integer("max_attempts").notNull(),
    availableAt: timestampTz("available_at"),
    lockedAt: optionalTimestampTz("locked_at"),
    lockedBy: text("locked_by"),
    createdAt: timestampTz("created_at"),
    updatedAt: timestampTz("updated_at"),
  },
  (table) => [
    index("job_queue_status_idx").on(table.status),
    index("job_queue_available_at_idx").on(table.availableAt),
    uniqueIndex("job_queue_dedupe_key_unique").on(table.dedupeKey),
  ],
);

export const pgAuditLog = pgTable(
  "audit_log",
  {
    id: idText(),
    workspaceId: text("workspace_id").references(() => pgWorkspaces.id),
    ledgerId: text("ledger_id").references(() => pgLedgers.id),
    actorUserId: text("actor_user_id").references(() => pgUsers.id),
    action: text("action").$type<AuditAction>().notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    metadataJson: jsonb("metadata_json").$type<JsonObject>().notNull(),
    createdAt: timestampTz("created_at"),
  },
  (table) => [
    index("audit_log_workspace_id_idx").on(table.workspaceId),
    index("audit_log_ledger_id_idx").on(table.ledgerId),
    index("audit_log_actor_user_id_idx").on(table.actorUserId),
  ],
);

export const pgSchema = {
  auditLog: pgAuditLog,
  devices: pgDevices,
  idempotencyReceipts: pgIdempotencyReceipts,
  jobQueue: pgJobQueue,
  ledgers: pgLedgers,
  passkeys: pgPasskeys,
  recoveryCodes: pgRecoveryCodes,
  sessions: pgSessions,
  users: pgUsers,
  workspaceInvitations: pgWorkspaceInvitations,
  workspaceMembers: pgWorkspaceMembers,
  workspaces: pgWorkspaces,
};
