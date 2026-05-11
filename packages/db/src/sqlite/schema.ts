import { sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import type {
  AuditAction,
  ImportJobStatus,
  JobQueueStatus,
  JsonObject,
  RecurringCadence,
  RecurringTemplateStatus,
  RuleActionType,
  SyncConflictStatus,
  SyncConflictType,
  SyncOperationStatus,
} from "../schema-types.js";

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

export const sqliteWorkspaceLedgerRevisions = sqliteTable(
  "workspace_ledger_revisions",
  {
    workspaceId: requiredIdText("workspace_id").references(() => sqliteWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => sqliteLedgers.id),
    currentRevision: integer("current_revision").notNull().default(0),
    updatedAt: timestampText("updated_at"),
  },
  (table) => [
    uniqueIndex("workspace_ledger_revisions_scope_unique").on(table.workspaceId, table.ledgerId),
    check("workspace_ledger_revisions_non_negative_check", sql`${table.currentRevision} >= 0`),
  ],
);

export const sqliteSyncOperations = sqliteTable(
  "sync_operations",
  {
    id: text("id").primaryKey().notNull(),
    workspaceId: requiredIdText("workspace_id").references(() => sqliteWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => sqliteLedgers.id),
    deviceId: requiredIdText("device_id").references(() => sqliteDevices.id),
    localSequence: text("local_sequence").notNull(),
    operationType: text("operation_type").notNull(),
    operationVersion: integer("operation_version").notNull(),
    baseRevision: integer("base_revision"),
    serverRevision: integer("server_revision"),
    idempotencyKey: text("idempotency_key").notNull(),
    payloadJson: text("payload_json", { mode: "json" }).$type<JsonObject>().notNull(),
    payloadEncoding: text("payload_encoding").notNull(),
    encryptedPayload: text("encrypted_payload"),
    keyVersion: integer("key_version"),
    status: text("status").$type<SyncOperationStatus>().notNull(),
    resultJson: text("result_json", { mode: "json" }).$type<JsonObject>().notNull(),
    createdBy: requiredIdText("created_by").references(() => sqliteUsers.id),
    createdAt: timestampText("created_at"),
    receivedAt: timestampText("received_at"),
  },
  (table) => [
    index("sync_operations_workspace_ledger_idx").on(table.workspaceId, table.ledgerId),
    index("sync_operations_status_idx").on(table.status),
    uniqueIndex("sync_operations_device_sequence_unique").on(table.deviceId, table.localSequence),
    uniqueIndex("sync_operations_workspace_ledger_revision_unique").on(
      table.workspaceId,
      table.ledgerId,
      table.serverRevision,
    ),
    check(
      "sync_operations_revision_check",
      sql`${table.serverRevision} IS NULL OR ${table.serverRevision} >= 0`,
    ),
    check(
      "sync_operations_status_check",
      sql`${table.status} IN ('accepted', 'rejected', 'conflict', 'superseded')`,
    ),
    check(
      "sync_operations_payload_encoding_check",
      sql`${table.payloadEncoding} IN ('plaintext.v1')`,
    ),
  ],
);

export const sqliteSyncConflicts = sqliteTable(
  "sync_conflicts",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => sqliteWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => sqliteLedgers.id),
    objectType: text("object_type"),
    objectId: text("object_id"),
    incomingOperationId: requiredIdText("incoming_operation_id").references(
      () => sqliteSyncOperations.id,
    ),
    conflictType: text("conflict_type").$type<SyncConflictType>().notNull(),
    localRevision: integer("local_revision").notNull(),
    incomingBaseRevision: integer("incoming_base_revision"),
    localSnapshotJson: text("local_snapshot_json", { mode: "json" }).$type<JsonObject>().notNull(),
    incomingPayloadJson: text("incoming_payload_json", { mode: "json" })
      .$type<JsonObject>()
      .notNull(),
    status: text("status").$type<SyncConflictStatus>().notNull(),
    resolutionOperationId: text("resolution_operation_id").references(
      () => sqliteSyncOperations.id,
    ),
    createdAt: timestampText("created_at"),
    resolvedAt: optionalTimestampText("resolved_at"),
  },
  (table) => [
    index("sync_conflicts_workspace_ledger_idx").on(table.workspaceId, table.ledgerId),
    index("sync_conflicts_status_idx").on(table.status),
    index("sync_conflicts_incoming_operation_idx").on(table.incomingOperationId),
    check(
      "sync_conflicts_type_check",
      sql`${table.conflictType} IN ('stale_update', 'update_after_delete', 'delete_after_update', 'duplicate_unique_value', 'invalid_operation', 'reconciled_record_blocked')`,
    ),
    check("sync_conflicts_status_check", sql`${table.status} IN ('open', 'resolved', 'dismissed')`),
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

export const sqliteCurrencies = sqliteTable(
  "currencies",
  {
    code: text("code", { length: 3 }).primaryKey().notNull(),
    name: text("name").notNull(),
    decimalPlaces: integer("decimal_places").notNull(),
    symbol: text("symbol"),
    createdAt: timestampText("created_at"),
    updatedAt: timestampText("updated_at"),
  },
  (table) => [
    check("currencies_code_check", sql`${table.code} GLOB '[A-Z][A-Z][A-Z]'`),
    check("currencies_decimal_places_check", sql`${table.decimalPlaces} BETWEEN 0 AND 8`),
  ],
);

export const sqliteExchangeRates = sqliteTable(
  "exchange_rates",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => sqliteWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => sqliteLedgers.id),
    baseCurrencyCode: text("base_currency_code", { length: 3 })
      .notNull()
      .references(() => sqliteCurrencies.code),
    quoteCurrencyCode: text("quote_currency_code", { length: 3 })
      .notNull()
      .references(() => sqliteCurrencies.code),
    rate: text("rate").notNull(),
    source: text("source").notNull(),
    rateDate: text("rate_date").notNull(),
    createdAt: timestampText("created_at"),
  },
  (table) => [
    index("exchange_rates_workspace_ledger_idx").on(table.workspaceId, table.ledgerId),
    uniqueIndex("exchange_rates_pair_date_source_unique").on(
      table.ledgerId,
      table.baseCurrencyCode,
      table.quoteCurrencyCode,
      table.rateDate,
      table.source,
    ),
    check("exchange_rates_base_code_check", sql`${table.baseCurrencyCode} GLOB '[A-Z][A-Z][A-Z]'`),
    check(
      "exchange_rates_quote_code_check",
      sql`${table.quoteCurrencyCode} GLOB '[A-Z][A-Z][A-Z]'`,
    ),
    check(
      "exchange_rates_rate_check",
      sql`length(${table.rate}) > 0 AND ${table.rate} NOT GLOB '*[^0-9.]*' AND ${table.rate} <> '.' AND (length(${table.rate}) - length(replace(${table.rate}, '.', ''))) <= 1 AND substr(${table.rate}, 1, 1) <> '.' AND substr(${table.rate}, length(${table.rate}), 1) <> '.'`,
    ),
  ],
);

export const sqliteAccounts = sqliteTable(
  "accounts",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => sqliteWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => sqliteLedgers.id),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    subtype: text("subtype").notNull(),
    currencyCode: text("currency_code", { length: 3 })
      .notNull()
      .references(() => sqliteCurrencies.code),
    openingBalanceMinor: integer("opening_balance_minor"),
    openingBalanceDate: text("opening_balance_date"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    archivedAt: optionalTimestampText("archived_at"),
    createdAt: timestampText("created_at"),
    updatedAt: timestampText("updated_at"),
  },
  (table) => [
    index("accounts_workspace_id_idx").on(table.workspaceId),
    index("accounts_ledger_id_idx").on(table.ledgerId),
    index("accounts_currency_code_idx").on(table.currencyCode),
    index("accounts_archived_at_idx").on(table.archivedAt),
    uniqueIndex("accounts_ledger_name_unique").on(table.ledgerId, table.name),
    uniqueIndex("accounts_opening_helper_active_unique")
      .on(table.ledgerId, table.currencyCode)
      .where(
        sql`${table.kind} = 'equity' AND ${table.subtype} = 'opening_helper' AND ${table.archivedAt} IS NULL`,
      ),
    check(
      "accounts_kind_check",
      sql`${table.kind} IN ('asset', 'liability', 'revenue', 'expense', 'equity')`,
    ),
    check(
      "accounts_subtype_check",
      sql`${table.subtype} IN ('bank', 'cash', 'wallet', 'credit_card', 'loan', 'investment', 'income_source', 'expense_category', 'external', 'opening_helper', 'reconciliation_helper')`,
    ),
    check("accounts_currency_code_check", sql`${table.currencyCode} GLOB '[A-Z][A-Z][A-Z]'`),
    check(
      "accounts_opening_balance_pair_check",
      sql`(${table.openingBalanceMinor} IS NULL AND ${table.openingBalanceDate} IS NULL) OR (${table.openingBalanceMinor} IS NOT NULL AND ${table.openingBalanceDate} IS NOT NULL)`,
    ),
    check(
      "accounts_archive_state_check",
      sql`${table.archivedAt} IS NULL OR ${table.isActive} = 0`,
    ),
  ],
);

export const sqliteCategories = sqliteTable(
  "categories",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => sqliteWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => sqliteLedgers.id),
    parentId: text("parent_id").references((): AnySQLiteColumn => sqliteCategories.id),
    name: text("name").notNull(),
    color: text("color"),
    icon: text("icon"),
    archivedAt: optionalTimestampText("archived_at"),
    createdAt: timestampText("created_at"),
    updatedAt: timestampText("updated_at"),
  },
  (table) => [
    index("categories_workspace_id_idx").on(table.workspaceId),
    index("categories_ledger_id_idx").on(table.ledgerId),
    index("categories_parent_id_idx").on(table.parentId),
    uniqueIndex("categories_ledger_root_name_unique")
      .on(table.ledgerId, table.name)
      .where(sql`${table.parentId} IS NULL`),
    uniqueIndex("categories_ledger_parent_name_unique")
      .on(table.ledgerId, table.parentId, table.name)
      .where(sql`${table.parentId} IS NOT NULL`),
  ],
);

export const sqliteTags = sqliteTable(
  "tags",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => sqliteWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => sqliteLedgers.id),
    name: text("name").notNull(),
    color: text("color"),
    createdAt: timestampText("created_at"),
    updatedAt: timestampText("updated_at"),
  },
  (table) => [
    index("tags_workspace_id_idx").on(table.workspaceId),
    index("tags_ledger_id_idx").on(table.ledgerId),
    uniqueIndex("tags_ledger_name_unique").on(table.ledgerId, table.name),
  ],
);

export const sqlitePayees = sqliteTable(
  "payees",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => sqliteWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => sqliteLedgers.id),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdAt: timestampText("created_at"),
    updatedAt: timestampText("updated_at"),
  },
  (table) => [
    index("payees_workspace_id_idx").on(table.workspaceId),
    index("payees_ledger_id_idx").on(table.ledgerId),
    uniqueIndex("payees_ledger_normalized_name_unique").on(table.ledgerId, table.normalizedName),
  ],
);

export const sqlitePayeeAliases = sqliteTable(
  "payee_aliases",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => sqliteWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => sqliteLedgers.id),
    payeeId: requiredIdText("payee_id").references(() => sqlitePayees.id),
    alias: text("alias").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),
    source: text("source").notNull(),
    createdAt: timestampText("created_at"),
  },
  (table) => [
    index("payee_aliases_payee_id_idx").on(table.payeeId),
    uniqueIndex("payee_aliases_ledger_normalized_alias_unique").on(
      table.ledgerId,
      table.normalizedAlias,
    ),
  ],
);

export const sqlitePayeeMappings = sqliteTable(
  "payee_mappings",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => sqliteWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => sqliteLedgers.id),
    fromPayeeId: requiredIdText("from_payee_id").references(() => sqlitePayees.id),
    toPayeeId: requiredIdText("to_payee_id").references(() => sqlitePayees.id),
    reason: text("reason").notNull(),
    createdBy: text("created_by").references(() => sqliteUsers.id),
    createdAt: timestampText("created_at"),
  },
  (table) => [
    index("payee_mappings_from_payee_id_idx").on(table.fromPayeeId),
    index("payee_mappings_to_payee_id_idx").on(table.toPayeeId),
    check("payee_mappings_no_self_merge_check", sql`${table.fromPayeeId} <> ${table.toPayeeId}`),
  ],
);

export const sqliteBudgets = sqliteTable(
  "budgets",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => sqliteWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => sqliteLedgers.id),
    name: text("name").notNull(),
    currencyCode: text("currency_code", { length: 3 })
      .notNull()
      .references(() => sqliteCurrencies.code),
    period: text("period").notNull(),
    rolloverEnabled: integer("rollover_enabled", { mode: "boolean" }).notNull().default(false),
    archivedAt: optionalTimestampText("archived_at"),
    createdAt: timestampText("created_at"),
    updatedAt: timestampText("updated_at"),
  },
  (table) => [
    index("budgets_workspace_id_idx").on(table.workspaceId),
    index("budgets_ledger_id_idx").on(table.ledgerId),
    uniqueIndex("budgets_ledger_name_unique").on(table.ledgerId, table.name),
    check("budgets_currency_code_check", sql`${table.currencyCode} GLOB '[A-Z][A-Z][A-Z]'`),
    check(
      "budgets_period_check",
      sql`${table.period} IN ('weekly', 'bi_weekly', 'semi_monthly', 'monthly', 'quarterly', 'yearly', 'custom')`,
    ),
  ],
);

export const sqliteBudgetLimits = sqliteTable(
  "budget_limits",
  {
    id: idText(),
    budgetId: requiredIdText("budget_id").references(() => sqliteBudgets.id),
    categoryId: text("category_id").references(() => sqliteCategories.id),
    amountMinor: integer("amount_minor").notNull(),
    currencyCode: text("currency_code", { length: 3 })
      .notNull()
      .references(() => sqliteCurrencies.code),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    createdAt: timestampText("created_at"),
    updatedAt: timestampText("updated_at"),
  },
  (table) => [
    index("budget_limits_budget_id_idx").on(table.budgetId),
    index("budget_limits_category_id_idx").on(table.categoryId),
    check("budget_limits_currency_code_check", sql`${table.currencyCode} GLOB '[A-Z][A-Z][A-Z]'`),
    check("budget_limits_amount_non_negative_check", sql`${table.amountMinor} >= 0`),
    check("budget_limits_date_order_check", sql`${table.startDate} <= ${table.endDate}`),
  ],
);

export const sqliteImportJobs = sqliteTable(
  "import_jobs",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => sqliteWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => sqliteLedgers.id),
    fileName: text("file_name"),
    csvText: text("csv_text").notNull(),
    previewRowsJson: text("preview_rows_json", { mode: "json" })
      .$type<readonly JsonObject[]>()
      .notNull(),
    status: text("status").$type<ImportJobStatus>().notNull(),
    committedGroupIdsJson: text("committed_group_ids_json", { mode: "json" })
      .$type<readonly string[]>()
      .notNull(),
    createdBy: requiredIdText("created_by").references(() => sqliteUsers.id),
    createdAt: timestampText("created_at"),
    updatedAt: timestampText("updated_at"),
    committedAt: optionalTimestampText("committed_at"),
    undoneAt: optionalTimestampText("undone_at"),
  },
  (table) => [
    index("import_jobs_workspace_ledger_idx").on(table.workspaceId, table.ledgerId),
    index("import_jobs_status_idx").on(table.status),
    check(
      "import_jobs_status_check",
      sql`${table.status} IN ('preview_ready', 'committed', 'undone', 'failed')`,
    ),
  ],
);

export const sqliteRules = sqliteTable(
  "rules",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => sqliteWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => sqliteLedgers.id),
    name: text("name").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    conditionJson: text("condition_json", { mode: "json" }).$type<JsonObject>().notNull(),
    actionType: text("action_type").$type<RuleActionType>().notNull(),
    actionJson: text("action_json", { mode: "json" }).$type<JsonObject>().notNull(),
    createdBy: requiredIdText("created_by").references(() => sqliteUsers.id),
    updatedBy: requiredIdText("updated_by").references(() => sqliteUsers.id),
    createdAt: timestampText("created_at"),
    updatedAt: timestampText("updated_at"),
    archivedAt: optionalTimestampText("archived_at"),
  },
  (table) => [
    index("rules_workspace_ledger_idx").on(table.workspaceId, table.ledgerId),
    index("rules_enabled_idx").on(table.enabled),
    uniqueIndex("rules_ledger_name_unique").on(table.ledgerId, table.name),
    check("rules_action_type_check", sql`${table.actionType} IN ('set_transaction_status')`),
  ],
);

export const sqliteRecurringTemplates = sqliteTable(
  "recurring_templates",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => sqliteWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => sqliteLedgers.id),
    type: text("type").notNull(),
    cadence: text("cadence").$type<RecurringCadence>().notNull(),
    intervalCount: integer("interval_count").notNull().default(1),
    nextRunAt: timestampText("next_run_at"),
    status: text("status").$type<RecurringTemplateStatus>().notNull(),
    templateJson: text("template_json", { mode: "json" }).$type<JsonObject>().notNull(),
    createdBy: requiredIdText("created_by").references(() => sqliteUsers.id),
    updatedBy: requiredIdText("updated_by").references(() => sqliteUsers.id),
    createdAt: timestampText("created_at"),
    updatedAt: timestampText("updated_at"),
    lastGeneratedAt: optionalTimestampText("last_generated_at"),
    archivedAt: optionalTimestampText("archived_at"),
  },
  (table) => [
    index("recurring_templates_workspace_ledger_idx").on(table.workspaceId, table.ledgerId),
    index("recurring_templates_status_idx").on(table.status),
    check(
      "recurring_templates_type_check",
      sql`${table.type} IN ('expense', 'income', 'transfer')`,
    ),
    check(
      "recurring_templates_cadence_check",
      sql`${table.cadence} IN ('daily', 'weekly', 'monthly')`,
    ),
    check(
      "recurring_templates_status_check",
      sql`${table.status} IN ('active', 'paused', 'archived')`,
    ),
    check("recurring_templates_interval_check", sql`${table.intervalCount} >= 1`),
  ],
);

export const sqliteTransactionGroups = sqliteTable(
  "transaction_groups",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => sqliteWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => sqliteLedgers.id),
    title: text("title").notNull(),
    type: text("type").notNull(),
    source: text("source").notNull(),
    externalId: text("external_id"),
    importJobId: text("import_job_id"),
    createdBy: text("created_by").references(() => sqliteUsers.id),
    updatedBy: text("updated_by").references(() => sqliteUsers.id),
    createdAt: timestampText("created_at"),
    updatedAt: timestampText("updated_at"),
    deletedAt: optionalTimestampText("deleted_at"),
  },
  (table) => [
    index("transaction_groups_workspace_id_idx").on(table.workspaceId),
    index("transaction_groups_ledger_id_idx").on(table.ledgerId),
    index("transaction_groups_type_idx").on(table.type),
    index("transaction_groups_import_job_id_idx").on(table.importJobId),
    index("transaction_groups_external_id_idx").on(table.externalId),
    check(
      "transaction_groups_type_check",
      sql`${table.type} IN ('expense', 'income', 'transfer', 'split', 'opening_balance', 'reconciliation', 'adjustment', 'exchange')`,
    ),
    check(
      "transaction_groups_source_check",
      sql`${table.source} IN ('manual', 'import', 'recurring', 'rule', 'api', 'system')`,
    ),
  ],
);

export const sqliteTransactionJournals = sqliteTable(
  "transaction_journals",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => sqliteWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => sqliteLedgers.id),
    groupId: requiredIdText("group_id").references(() => sqliteTransactionGroups.id),
    type: text("type").notNull(),
    occurredAt: timestampText("occurred_at"),
    description: text("description").notNull(),
    notes: text("notes"),
    payeeId: text("payee_id").references(() => sqlitePayees.id),
    status: text("status").notNull(),
    source: text("source").notNull(),
    externalId: text("external_id"),
    importJobId: text("import_job_id"),
    recurrenceTemplateId: text("recurrence_template_id"),
    createdBy: text("created_by").references(() => sqliteUsers.id),
    updatedBy: text("updated_by").references(() => sqliteUsers.id),
    createdAt: timestampText("created_at"),
    updatedAt: timestampText("updated_at"),
    deletedAt: optionalTimestampText("deleted_at"),
  },
  (table) => [
    index("transaction_journals_workspace_id_idx").on(table.workspaceId),
    index("transaction_journals_ledger_id_idx").on(table.ledgerId),
    index("transaction_journals_group_id_idx").on(table.groupId),
    index("transaction_journals_occurred_at_idx").on(table.occurredAt),
    index("transaction_journals_type_idx").on(table.type),
    index("transaction_journals_status_idx").on(table.status),
    index("transaction_journals_import_job_id_idx").on(table.importJobId),
    index("transaction_journals_external_id_idx").on(table.externalId),
    check(
      "transaction_journals_type_check",
      sql`${table.type} IN ('expense', 'income', 'transfer', 'split', 'opening_balance', 'reconciliation', 'adjustment', 'exchange')`,
    ),
    check(
      "transaction_journals_status_check",
      sql`${table.status} IN ('pending', 'cleared', 'reconciled', 'void')`,
    ),
    check(
      "transaction_journals_source_check",
      sql`${table.source} IN ('manual', 'import', 'recurring', 'rule', 'api', 'system')`,
    ),
  ],
);

export const sqliteTransactionPostings = sqliteTable(
  "transaction_postings",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => sqliteWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => sqliteLedgers.id),
    journalId: requiredIdText("journal_id").references(() => sqliteTransactionJournals.id),
    accountId: requiredIdText("account_id").references(() => sqliteAccounts.id),
    amountMinor: integer("amount_minor").notNull(),
    currencyCode: text("currency_code", { length: 3 })
      .notNull()
      .references(() => sqliteCurrencies.code),
    foreignAmountMinor: integer("foreign_amount_minor"),
    foreignCurrencyCode: text("foreign_currency_code", { length: 3 }).references(
      () => sqliteCurrencies.code,
    ),
    reportingAmountMinor: integer("reporting_amount_minor").notNull(),
    reportingCurrencyCode: text("reporting_currency_code", { length: 3 })
      .notNull()
      .references(() => sqliteCurrencies.code),
    exchangeRateSnapshotJson: text("exchange_rate_snapshot_json", {
      mode: "json",
    }).$type<JsonObject | null>(),
    categoryId: text("category_id").references(() => sqliteCategories.id),
    budgetId: text("budget_id").references(() => sqliteBudgets.id),
    createdAt: timestampText("created_at"),
  },
  (table) => [
    index("transaction_postings_workspace_id_idx").on(table.workspaceId),
    index("transaction_postings_ledger_id_idx").on(table.ledgerId),
    index("transaction_postings_journal_id_idx").on(table.journalId),
    index("transaction_postings_account_id_idx").on(table.accountId),
    index("transaction_postings_category_id_idx").on(table.categoryId),
    index("transaction_postings_budget_id_idx").on(table.budgetId),
    index("transaction_postings_currency_code_idx").on(table.currencyCode),
    check(
      "transaction_postings_currency_code_check",
      sql`${table.currencyCode} GLOB '[A-Z][A-Z][A-Z]'`,
    ),
    check(
      "transaction_postings_reporting_currency_code_check",
      sql`${table.reportingCurrencyCode} GLOB '[A-Z][A-Z][A-Z]'`,
    ),
    check(
      "transaction_postings_foreign_pair_check",
      sql`(${table.foreignAmountMinor} IS NULL AND ${table.foreignCurrencyCode} IS NULL) OR (${table.foreignAmountMinor} IS NOT NULL AND ${table.foreignCurrencyCode} IS NOT NULL AND ${table.foreignCurrencyCode} GLOB '[A-Z][A-Z][A-Z]')`,
    ),
  ],
);

export const sqliteTransactionTags = sqliteTable(
  "transaction_tags",
  {
    transactionJournalId: requiredIdText("transaction_journal_id").references(
      () => sqliteTransactionJournals.id,
    ),
    tagId: requiredIdText("tag_id").references(() => sqliteTags.id),
    createdAt: timestampText("created_at"),
  },
  (table) => [
    uniqueIndex("transaction_tags_journal_tag_unique").on(table.transactionJournalId, table.tagId),
    index("transaction_tags_tag_id_idx").on(table.tagId),
  ],
);

export const sqliteJournalMeta = sqliteTable(
  "journal_meta",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => sqliteWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => sqliteLedgers.id),
    journalId: requiredIdText("journal_id").references(() => sqliteTransactionJournals.id),
    key: text("key").notNull(),
    valueJson: text("value_json", { mode: "json" }).$type<JsonObject>().notNull(),
    createdAt: timestampText("created_at"),
    updatedAt: timestampText("updated_at"),
  },
  (table) => [
    index("journal_meta_journal_id_idx").on(table.journalId),
    uniqueIndex("journal_meta_journal_key_unique").on(table.journalId, table.key),
  ],
);

export const sqliteAccountMeta = sqliteTable(
  "account_meta",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => sqliteWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => sqliteLedgers.id),
    accountId: requiredIdText("account_id").references(() => sqliteAccounts.id),
    key: text("key").notNull(),
    valueJson: text("value_json", { mode: "json" }).$type<JsonObject>().notNull(),
    createdAt: timestampText("created_at"),
    updatedAt: timestampText("updated_at"),
  },
  (table) => [
    index("account_meta_account_id_idx").on(table.accountId),
    uniqueIndex("account_meta_account_key_unique").on(table.accountId, table.key),
  ],
);

export const sqliteBalanceRecalculationQueue = sqliteTable(
  "balance_recalculation_queue",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => sqliteWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => sqliteLedgers.id),
    accountId: text("account_id").references(() => sqliteAccounts.id),
    currencyCode: text("currency_code", { length: 3 }).references(() => sqliteCurrencies.code),
    fromOccurredAt: timestampText("from_occurred_at"),
    reason: text("reason").notNull(),
    status: text("status").notNull(),
    createdAt: timestampText("created_at"),
  },
  (table) => [
    index("balance_recalculation_queue_workspace_ledger_idx").on(table.workspaceId, table.ledgerId),
    index("balance_recalculation_queue_account_id_idx").on(table.accountId),
    index("balance_recalculation_queue_status_idx").on(table.status),
    check(
      "balance_recalculation_queue_status_check",
      sql`${table.status} IN ('pending', 'processing', 'completed', 'failed')`,
    ),
    check(
      "balance_recalculation_queue_currency_code_check",
      sql`${table.currencyCode} IS NULL OR ${table.currencyCode} GLOB '[A-Z][A-Z][A-Z]'`,
    ),
  ],
);

export const sqliteSchema = {
  accountMeta: sqliteAccountMeta,
  accounts: sqliteAccounts,
  auditLog: sqliteAuditLog,
  balanceRecalculationQueue: sqliteBalanceRecalculationQueue,
  budgetLimits: sqliteBudgetLimits,
  budgets: sqliteBudgets,
  categories: sqliteCategories,
  currencies: sqliteCurrencies,
  devices: sqliteDevices,
  exchangeRates: sqliteExchangeRates,
  idempotencyReceipts: sqliteIdempotencyReceipts,
  importJobs: sqliteImportJobs,
  journalMeta: sqliteJournalMeta,
  jobQueue: sqliteJobQueue,
  ledgers: sqliteLedgers,
  passkeyChallenges: sqlitePasskeyChallenges,
  passkeys: sqlitePasskeys,
  payeeAliases: sqlitePayeeAliases,
  payeeMappings: sqlitePayeeMappings,
  payees: sqlitePayees,
  recurringTemplates: sqliteRecurringTemplates,
  recoveryCodes: sqliteRecoveryCodes,
  rules: sqliteRules,
  sessions: sqliteSessions,
  syncConflicts: sqliteSyncConflicts,
  syncOperations: sqliteSyncOperations,
  tags: sqliteTags,
  transactionGroups: sqliteTransactionGroups,
  transactionJournals: sqliteTransactionJournals,
  transactionPostings: sqliteTransactionPostings,
  transactionTags: sqliteTransactionTags,
  users: sqliteUsers,
  workspaceInvitations: sqliteWorkspaceInvitations,
  workspaceLedgerRevisions: sqliteWorkspaceLedgerRevisions,
  workspaceMembers: sqliteWorkspaceMembers,
  workspaces: sqliteWorkspaces,
};
