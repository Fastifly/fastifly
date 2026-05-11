import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type {
  AuditAction,
  JobQueueStatus,
  JsonObject,
  SyncConflictStatus,
  SyncConflictType,
  SyncOperationStatus,
} from "../schema-types.js";

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
    name: text("name").notNull(),
    createdAt: timestampTz("created_at"),
    lastUsedAt: optionalTimestampTz("last_used_at"),
  },
  (table) => [
    uniqueIndex("passkeys_credential_id_unique").on(table.credentialId),
    index("passkeys_user_id_idx").on(table.userId),
  ],
);

export const pgPasskeyChallenges = pgTable(
  "passkey_challenges",
  {
    id: idText(),
    userId: text("user_id").references(() => pgUsers.id),
    kind: text("kind").notNull(),
    challenge: text("challenge").notNull(),
    createdAt: timestampTz("created_at"),
    expiresAt: timestampTz("expires_at"),
    consumedAt: optionalTimestampTz("consumed_at"),
  },
  (table) => [
    index("passkey_challenges_user_id_idx").on(table.userId),
    index("passkey_challenges_kind_idx").on(table.kind),
    check("passkey_challenges_kind_check", sql`${table.kind} IN ('registration', 'login')`),
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

export const pgWorkspaces = pgTable(
  "workspaces",
  {
    id: idText(),
    name: text("name").notNull(),
    ownerUserId: requiredIdText("owner_user_id").references(() => pgUsers.id),
    status: text("status").notNull().default("active"),
    createdAt: timestampTz("created_at"),
    updatedAt: timestampTz("updated_at"),
    archivedAt: optionalTimestampTz("archived_at"),
  },
  (table) => [
    check(
      "workspaces_status_check",
      sql`${table.status} IN ('active', 'read_only', 'maintenance', 'archived', 'restore_preview', 'pending_restore', 'broken')`,
    ),
  ],
);

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
    status: text("status").notNull().default("active"),
    createdAt: timestampTz("created_at"),
    updatedAt: timestampTz("updated_at"),
    archivedAt: optionalTimestampTz("archived_at"),
  },
  (table) => [
    index("ledgers_workspace_id_idx").on(table.workspaceId),
    check(
      "ledgers_status_check",
      sql`${table.status} IN ('active', 'read_only', 'maintenance', 'archived', 'restore_preview', 'pending_restore', 'broken')`,
    ),
  ],
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
    deviceId: text("device_id").references(() => pgDevices.id),
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

export const pgWorkspaceLedgerRevisions = pgTable(
  "workspace_ledger_revisions",
  {
    workspaceId: requiredIdText("workspace_id").references(() => pgWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => pgLedgers.id),
    currentRevision: integer("current_revision").notNull().default(0),
    updatedAt: timestampTz("updated_at"),
  },
  (table) => [
    uniqueIndex("workspace_ledger_revisions_scope_unique").on(table.workspaceId, table.ledgerId),
    check("workspace_ledger_revisions_non_negative_check", sql`${table.currentRevision} >= 0`),
  ],
);

export const pgSyncOperations = pgTable(
  "sync_operations",
  {
    id: text("id").primaryKey().notNull(),
    workspaceId: requiredIdText("workspace_id").references(() => pgWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => pgLedgers.id),
    deviceId: requiredIdText("device_id").references(() => pgDevices.id),
    localSequence: text("local_sequence").notNull(),
    operationType: text("operation_type").notNull(),
    operationVersion: integer("operation_version").notNull(),
    baseRevision: integer("base_revision"),
    serverRevision: integer("server_revision"),
    idempotencyKey: text("idempotency_key").notNull(),
    payloadJson: jsonb("payload_json").$type<JsonObject>().notNull(),
    payloadEncoding: text("payload_encoding").notNull(),
    encryptedPayload: text("encrypted_payload"),
    keyVersion: integer("key_version"),
    status: text("status").$type<SyncOperationStatus>().notNull(),
    resultJson: jsonb("result_json").$type<JsonObject>().notNull(),
    createdBy: requiredIdText("created_by").references(() => pgUsers.id),
    createdAt: timestampTz("created_at"),
    receivedAt: timestampTz("received_at"),
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

export const pgSyncConflicts = pgTable(
  "sync_conflicts",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => pgWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => pgLedgers.id),
    objectType: text("object_type"),
    objectId: text("object_id"),
    incomingOperationId: requiredIdText("incoming_operation_id").references(
      () => pgSyncOperations.id,
    ),
    conflictType: text("conflict_type").$type<SyncConflictType>().notNull(),
    localRevision: integer("local_revision").notNull(),
    incomingBaseRevision: integer("incoming_base_revision"),
    localSnapshotJson: jsonb("local_snapshot_json").$type<JsonObject>().notNull(),
    incomingPayloadJson: jsonb("incoming_payload_json").$type<JsonObject>().notNull(),
    status: text("status").$type<SyncConflictStatus>().notNull(),
    resolutionOperationId: text("resolution_operation_id").references(() => pgSyncOperations.id),
    createdAt: timestampTz("created_at"),
    resolvedAt: optionalTimestampTz("resolved_at"),
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

export const pgCurrencies = pgTable(
  "currencies",
  {
    code: text("code").primaryKey().notNull(),
    name: text("name").notNull(),
    decimalPlaces: integer("decimal_places").notNull(),
    symbol: text("symbol"),
    createdAt: timestampTz("created_at"),
    updatedAt: timestampTz("updated_at"),
  },
  (table) => [
    check("currencies_code_check", sql`${table.code} ~ '^[A-Z]{3}$'`),
    check("currencies_decimal_places_check", sql`${table.decimalPlaces} BETWEEN 0 AND 8`),
  ],
);

export const pgExchangeRates = pgTable(
  "exchange_rates",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => pgWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => pgLedgers.id),
    baseCurrencyCode: text("base_currency_code")
      .notNull()
      .references(() => pgCurrencies.code),
    quoteCurrencyCode: text("quote_currency_code")
      .notNull()
      .references(() => pgCurrencies.code),
    rate: text("rate").notNull(),
    source: text("source").notNull(),
    rateDate: date("rate_date").notNull(),
    createdAt: timestampTz("created_at"),
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
    check("exchange_rates_base_code_check", sql`${table.baseCurrencyCode} ~ '^[A-Z]{3}$'`),
    check("exchange_rates_quote_code_check", sql`${table.quoteCurrencyCode} ~ '^[A-Z]{3}$'`),
    check("exchange_rates_rate_check", sql`${table.rate} ~ '^[0-9]+(\\.[0-9]+)?$'`),
  ],
);

export const pgAccounts = pgTable(
  "accounts",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => pgWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => pgLedgers.id),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    subtype: text("subtype").notNull(),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => pgCurrencies.code),
    openingBalanceMinor: bigint("opening_balance_minor", { mode: "bigint" }),
    openingBalanceDate: date("opening_balance_date"),
    isActive: boolean("is_active").notNull().default(true),
    archivedAt: optionalTimestampTz("archived_at"),
    createdAt: timestampTz("created_at"),
    updatedAt: timestampTz("updated_at"),
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
    check("accounts_currency_code_check", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
    check(
      "accounts_opening_balance_pair_check",
      sql`(${table.openingBalanceMinor} IS NULL AND ${table.openingBalanceDate} IS NULL) OR (${table.openingBalanceMinor} IS NOT NULL AND ${table.openingBalanceDate} IS NOT NULL)`,
    ),
    check(
      "accounts_archive_state_check",
      sql`${table.archivedAt} IS NULL OR ${table.isActive} = FALSE`,
    ),
  ],
);

export const pgCategories = pgTable(
  "categories",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => pgWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => pgLedgers.id),
    parentId: text("parent_id").references((): AnyPgColumn => pgCategories.id),
    name: text("name").notNull(),
    color: text("color"),
    icon: text("icon"),
    archivedAt: optionalTimestampTz("archived_at"),
    createdAt: timestampTz("created_at"),
    updatedAt: timestampTz("updated_at"),
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

export const pgTags = pgTable(
  "tags",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => pgWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => pgLedgers.id),
    name: text("name").notNull(),
    color: text("color"),
    createdAt: timestampTz("created_at"),
    updatedAt: timestampTz("updated_at"),
  },
  (table) => [
    index("tags_workspace_id_idx").on(table.workspaceId),
    index("tags_ledger_id_idx").on(table.ledgerId),
    uniqueIndex("tags_ledger_name_unique").on(table.ledgerId, table.name),
  ],
);

export const pgPayees = pgTable(
  "payees",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => pgWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => pgLedgers.id),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdAt: timestampTz("created_at"),
    updatedAt: timestampTz("updated_at"),
  },
  (table) => [
    index("payees_workspace_id_idx").on(table.workspaceId),
    index("payees_ledger_id_idx").on(table.ledgerId),
    uniqueIndex("payees_ledger_normalized_name_unique").on(table.ledgerId, table.normalizedName),
  ],
);

export const pgPayeeAliases = pgTable(
  "payee_aliases",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => pgWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => pgLedgers.id),
    payeeId: requiredIdText("payee_id").references(() => pgPayees.id),
    alias: text("alias").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),
    source: text("source").notNull(),
    createdAt: timestampTz("created_at"),
  },
  (table) => [
    index("payee_aliases_payee_id_idx").on(table.payeeId),
    uniqueIndex("payee_aliases_ledger_normalized_alias_unique").on(
      table.ledgerId,
      table.normalizedAlias,
    ),
  ],
);

export const pgPayeeMappings = pgTable(
  "payee_mappings",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => pgWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => pgLedgers.id),
    fromPayeeId: requiredIdText("from_payee_id").references(() => pgPayees.id),
    toPayeeId: requiredIdText("to_payee_id").references(() => pgPayees.id),
    reason: text("reason").notNull(),
    createdBy: text("created_by").references(() => pgUsers.id),
    createdAt: timestampTz("created_at"),
  },
  (table) => [
    index("payee_mappings_from_payee_id_idx").on(table.fromPayeeId),
    index("payee_mappings_to_payee_id_idx").on(table.toPayeeId),
    check("payee_mappings_no_self_merge_check", sql`${table.fromPayeeId} <> ${table.toPayeeId}`),
  ],
);

export const pgBudgets = pgTable(
  "budgets",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => pgWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => pgLedgers.id),
    name: text("name").notNull(),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => pgCurrencies.code),
    period: text("period").notNull(),
    rolloverEnabled: boolean("rollover_enabled").notNull().default(false),
    archivedAt: optionalTimestampTz("archived_at"),
    createdAt: timestampTz("created_at"),
    updatedAt: timestampTz("updated_at"),
  },
  (table) => [
    index("budgets_workspace_id_idx").on(table.workspaceId),
    index("budgets_ledger_id_idx").on(table.ledgerId),
    uniqueIndex("budgets_ledger_name_unique").on(table.ledgerId, table.name),
    check("budgets_currency_code_check", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
    check(
      "budgets_period_check",
      sql`${table.period} IN ('weekly', 'bi_weekly', 'semi_monthly', 'monthly', 'quarterly', 'yearly', 'custom')`,
    ),
  ],
);

export const pgBudgetLimits = pgTable(
  "budget_limits",
  {
    id: idText(),
    budgetId: requiredIdText("budget_id").references(() => pgBudgets.id),
    categoryId: text("category_id").references(() => pgCategories.id),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => pgCurrencies.code),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    createdAt: timestampTz("created_at"),
    updatedAt: timestampTz("updated_at"),
  },
  (table) => [
    index("budget_limits_budget_id_idx").on(table.budgetId),
    index("budget_limits_category_id_idx").on(table.categoryId),
    check("budget_limits_currency_code_check", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
    check("budget_limits_amount_non_negative_check", sql`${table.amountMinor} >= 0`),
    check("budget_limits_date_order_check", sql`${table.startDate} <= ${table.endDate}`),
  ],
);

export const pgTransactionGroups = pgTable(
  "transaction_groups",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => pgWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => pgLedgers.id),
    title: text("title").notNull(),
    type: text("type").notNull(),
    source: text("source").notNull(),
    externalId: text("external_id"),
    importJobId: text("import_job_id"),
    createdBy: text("created_by").references(() => pgUsers.id),
    updatedBy: text("updated_by").references(() => pgUsers.id),
    createdAt: timestampTz("created_at"),
    updatedAt: timestampTz("updated_at"),
    deletedAt: optionalTimestampTz("deleted_at"),
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

export const pgTransactionJournals = pgTable(
  "transaction_journals",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => pgWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => pgLedgers.id),
    groupId: requiredIdText("group_id").references(() => pgTransactionGroups.id),
    type: text("type").notNull(),
    occurredAt: timestampTz("occurred_at"),
    description: text("description").notNull(),
    notes: text("notes"),
    payeeId: text("payee_id").references(() => pgPayees.id),
    status: text("status").notNull(),
    source: text("source").notNull(),
    externalId: text("external_id"),
    importJobId: text("import_job_id"),
    recurrenceTemplateId: text("recurrence_template_id"),
    createdBy: text("created_by").references(() => pgUsers.id),
    updatedBy: text("updated_by").references(() => pgUsers.id),
    createdAt: timestampTz("created_at"),
    updatedAt: timestampTz("updated_at"),
    deletedAt: optionalTimestampTz("deleted_at"),
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

export const pgTransactionPostings = pgTable(
  "transaction_postings",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => pgWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => pgLedgers.id),
    journalId: requiredIdText("journal_id").references(() => pgTransactionJournals.id),
    accountId: requiredIdText("account_id").references(() => pgAccounts.id),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => pgCurrencies.code),
    foreignAmountMinor: bigint("foreign_amount_minor", { mode: "bigint" }),
    foreignCurrencyCode: text("foreign_currency_code").references(() => pgCurrencies.code),
    reportingAmountMinor: bigint("reporting_amount_minor", { mode: "bigint" }).notNull(),
    reportingCurrencyCode: text("reporting_currency_code")
      .notNull()
      .references(() => pgCurrencies.code),
    exchangeRateSnapshotJson: jsonb("exchange_rate_snapshot_json").$type<JsonObject | null>(),
    categoryId: text("category_id").references(() => pgCategories.id),
    budgetId: text("budget_id").references(() => pgBudgets.id),
    createdAt: timestampTz("created_at"),
  },
  (table) => [
    index("transaction_postings_workspace_id_idx").on(table.workspaceId),
    index("transaction_postings_ledger_id_idx").on(table.ledgerId),
    index("transaction_postings_journal_id_idx").on(table.journalId),
    index("transaction_postings_account_id_idx").on(table.accountId),
    index("transaction_postings_category_id_idx").on(table.categoryId),
    index("transaction_postings_budget_id_idx").on(table.budgetId),
    index("transaction_postings_currency_code_idx").on(table.currencyCode),
    check("transaction_postings_currency_code_check", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
    check(
      "transaction_postings_reporting_currency_code_check",
      sql`${table.reportingCurrencyCode} ~ '^[A-Z]{3}$'`,
    ),
    check(
      "transaction_postings_foreign_pair_check",
      sql`(${table.foreignAmountMinor} IS NULL AND ${table.foreignCurrencyCode} IS NULL) OR (${table.foreignAmountMinor} IS NOT NULL AND ${table.foreignCurrencyCode} IS NOT NULL AND ${table.foreignCurrencyCode} ~ '^[A-Z]{3}$')`,
    ),
  ],
);

export const pgTransactionTags = pgTable(
  "transaction_tags",
  {
    transactionJournalId: requiredIdText("transaction_journal_id").references(
      () => pgTransactionJournals.id,
    ),
    tagId: requiredIdText("tag_id").references(() => pgTags.id),
    createdAt: timestampTz("created_at"),
  },
  (table) => [
    uniqueIndex("transaction_tags_journal_tag_unique").on(table.transactionJournalId, table.tagId),
    index("transaction_tags_tag_id_idx").on(table.tagId),
  ],
);

export const pgJournalMeta = pgTable(
  "journal_meta",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => pgWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => pgLedgers.id),
    journalId: requiredIdText("journal_id").references(() => pgTransactionJournals.id),
    key: text("key").notNull(),
    valueJson: jsonb("value_json").$type<JsonObject>().notNull(),
    createdAt: timestampTz("created_at"),
    updatedAt: timestampTz("updated_at"),
  },
  (table) => [
    index("journal_meta_journal_id_idx").on(table.journalId),
    uniqueIndex("journal_meta_journal_key_unique").on(table.journalId, table.key),
  ],
);

export const pgAccountMeta = pgTable(
  "account_meta",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => pgWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => pgLedgers.id),
    accountId: requiredIdText("account_id").references(() => pgAccounts.id),
    key: text("key").notNull(),
    valueJson: jsonb("value_json").$type<JsonObject>().notNull(),
    createdAt: timestampTz("created_at"),
    updatedAt: timestampTz("updated_at"),
  },
  (table) => [
    index("account_meta_account_id_idx").on(table.accountId),
    uniqueIndex("account_meta_account_key_unique").on(table.accountId, table.key),
  ],
);

export const pgBalanceRecalculationQueue = pgTable(
  "balance_recalculation_queue",
  {
    id: idText(),
    workspaceId: requiredIdText("workspace_id").references(() => pgWorkspaces.id),
    ledgerId: requiredIdText("ledger_id").references(() => pgLedgers.id),
    accountId: text("account_id").references(() => pgAccounts.id),
    currencyCode: text("currency_code").references(() => pgCurrencies.code),
    fromOccurredAt: timestampTz("from_occurred_at"),
    reason: text("reason").notNull(),
    status: text("status").notNull(),
    createdAt: timestampTz("created_at"),
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
      sql`${table.currencyCode} IS NULL OR ${table.currencyCode} ~ '^[A-Z]{3}$'`,
    ),
  ],
);

export const pgSchema = {
  accountMeta: pgAccountMeta,
  accounts: pgAccounts,
  auditLog: pgAuditLog,
  balanceRecalculationQueue: pgBalanceRecalculationQueue,
  budgetLimits: pgBudgetLimits,
  budgets: pgBudgets,
  categories: pgCategories,
  currencies: pgCurrencies,
  devices: pgDevices,
  exchangeRates: pgExchangeRates,
  idempotencyReceipts: pgIdempotencyReceipts,
  journalMeta: pgJournalMeta,
  jobQueue: pgJobQueue,
  ledgers: pgLedgers,
  passkeyChallenges: pgPasskeyChallenges,
  passkeys: pgPasskeys,
  payeeAliases: pgPayeeAliases,
  payeeMappings: pgPayeeMappings,
  payees: pgPayees,
  recoveryCodes: pgRecoveryCodes,
  sessions: pgSessions,
  syncConflicts: pgSyncConflicts,
  syncOperations: pgSyncOperations,
  tags: pgTags,
  transactionGroups: pgTransactionGroups,
  transactionJournals: pgTransactionJournals,
  transactionPostings: pgTransactionPostings,
  transactionTags: pgTransactionTags,
  users: pgUsers,
  workspaceInvitations: pgWorkspaceInvitations,
  workspaceLedgerRevisions: pgWorkspaceLedgerRevisions,
  workspaceMembers: pgWorkspaceMembers,
  workspaces: pgWorkspaces,
};
