import { createUuidV7, type LedgerScope, parseSyncedId, type SyncedId } from "@fastifly/common";
import { and, desc, eq, isNull } from "drizzle-orm";

import type { PostgresDatabase } from "../postgres/client.js";
import { pgImportJobs, pgRecurringTemplates, pgRules } from "../postgres/schema.js";
import type {
  ImportJobStatus,
  RecurringCadence,
  RecurringTemplateStatus,
  RuleActionType,
} from "../schema-types.js";
import type { SqliteClient } from "../sqlite/client.js";
import type { RepositoryClock } from "./base.js";
import { assertLedgerScope, makeTimestamp, systemClock } from "./base.js";

type PostgresTransaction = Parameters<Parameters<PostgresDatabase["transaction"]>[0]>[0];
type PostgresExecutor = PostgresDatabase | PostgresTransaction;

export type ImportPreviewRow = {
  readonly amountMinor: string;
  readonly currencyCode: string;
  readonly description: string;
  readonly destinationAccountId: SyncedId;
  readonly occurredAt: string;
  readonly rowNumber: number;
  readonly sourceAccountId: SyncedId;
  readonly type: "expense" | "income" | "transfer";
};

export type ImportJobRecord = {
  readonly committedAt: string | null;
  readonly committedGroupIds: readonly SyncedId[];
  readonly createdAt: string;
  readonly createdBy: SyncedId;
  readonly csvText: string;
  readonly fileName: string | null;
  readonly id: SyncedId;
  readonly ledgerId: SyncedId;
  readonly previewRows: readonly ImportPreviewRow[];
  readonly status: ImportJobStatus;
  readonly undoneAt: string | null;
  readonly updatedAt: string;
  readonly workspaceId: SyncedId;
};

export type RuleCondition = {
  readonly amountMaxMinor?: string;
  readonly amountMinMinor?: string;
  readonly descriptionContains?: string;
  readonly type?: "expense" | "income" | "transfer";
};

export type RuleAction = {
  readonly status: "pending" | "cleared" | "reconciled" | "void";
  readonly type: RuleActionType;
};

export type RuleRecord = {
  readonly action: RuleAction;
  readonly archivedAt: string | null;
  readonly condition: RuleCondition;
  readonly createdAt: string;
  readonly createdBy: SyncedId;
  readonly enabled: boolean;
  readonly id: SyncedId;
  readonly ledgerId: SyncedId;
  readonly name: string;
  readonly updatedAt: string;
  readonly updatedBy: SyncedId;
  readonly workspaceId: SyncedId;
};

export type RecurringTemplatePayload = {
  readonly currencyCode: string;
  readonly description: string;
  readonly lines: readonly {
    readonly amountMinor: string;
    readonly budgetId: SyncedId | null;
    readonly categoryId: SyncedId | null;
    readonly description: string | null;
    readonly destinationAccountId: SyncedId;
    readonly reportingAmountMinor: string | null;
    readonly reportingCurrencyCode: string | null;
  }[];
  readonly sourceAccountId: SyncedId;
  readonly title: string | null;
  readonly type: "expense" | "income" | "transfer";
};

export type RecurringTemplateRecord = {
  readonly archivedAt: string | null;
  readonly cadence: RecurringCadence;
  readonly createdAt: string;
  readonly createdBy: SyncedId;
  readonly id: SyncedId;
  readonly intervalCount: number;
  readonly lastGeneratedAt: string | null;
  readonly ledgerId: SyncedId;
  readonly nextRunAt: string;
  readonly payload: RecurringTemplatePayload;
  readonly status: RecurringTemplateStatus;
  readonly updatedAt: string;
  readonly updatedBy: SyncedId;
  readonly workspaceId: SyncedId;
};

export type CreateImportJobInput = LedgerScope & {
  readonly csvText: string;
  readonly fileName: string | null;
  readonly previewRows: readonly ImportPreviewRow[];
  readonly createdBy: SyncedId;
};

export type UpdateImportJobCommittedInput = LedgerScope & {
  readonly committedGroupIds: readonly SyncedId[];
  readonly importJobId: SyncedId;
};

export type UpdateImportJobUndoneInput = LedgerScope & {
  readonly importJobId: SyncedId;
};

export type CreateRuleInput = LedgerScope & {
  readonly action: RuleAction;
  readonly condition: RuleCondition;
  readonly createdBy: SyncedId;
  readonly enabled: boolean;
  readonly name: string;
};

export type UpdateRuleInput = LedgerScope & {
  readonly action: RuleAction;
  readonly condition: RuleCondition;
  readonly enabled: boolean;
  readonly name: string;
  readonly ruleId: SyncedId;
  readonly updatedBy: SyncedId;
};

export type CreateRecurringTemplateInput = LedgerScope & {
  readonly cadence: RecurringCadence;
  readonly createdBy: SyncedId;
  readonly intervalCount: number;
  readonly nextRunAt: string;
  readonly payload: RecurringTemplatePayload;
  readonly status: RecurringTemplateStatus;
};

export type UpdateRecurringTemplateInput = LedgerScope & {
  readonly cadence: RecurringCadence;
  readonly intervalCount: number;
  readonly nextRunAt: string;
  readonly payload: RecurringTemplatePayload;
  readonly recurringTemplateId: SyncedId;
  readonly status: RecurringTemplateStatus;
  readonly updatedBy: SyncedId;
};

export type WorkflowRepository = {
  readonly archiveRecurringTemplate: (
    input: LedgerScope & {
      readonly recurringTemplateId: SyncedId;
      readonly updatedBy: SyncedId;
    },
  ) => Promise<RecurringTemplateRecord | null>;
  readonly archiveRule: (
    input: LedgerScope & { readonly ruleId: SyncedId; readonly updatedBy: SyncedId },
  ) => Promise<RuleRecord | null>;
  readonly createImportJob: (input: CreateImportJobInput) => Promise<ImportJobRecord>;
  readonly createRecurringTemplate: (
    input: CreateRecurringTemplateInput,
  ) => Promise<RecurringTemplateRecord>;
  readonly createRule: (input: CreateRuleInput) => Promise<RuleRecord>;
  readonly findImportJob: (
    input: LedgerScope & { readonly importJobId: SyncedId },
  ) => Promise<ImportJobRecord | null>;
  readonly findRecurringTemplate: (
    input: LedgerScope & { readonly recurringTemplateId: SyncedId },
  ) => Promise<RecurringTemplateRecord | null>;
  readonly findRule: (
    input: LedgerScope & { readonly ruleId: SyncedId },
  ) => Promise<RuleRecord | null>;
  readonly listImportJobs: (input: LedgerScope) => Promise<readonly ImportJobRecord[]>;
  readonly listRecurringTemplates: (
    input: LedgerScope,
  ) => Promise<readonly RecurringTemplateRecord[]>;
  readonly listRules: (input: LedgerScope) => Promise<readonly RuleRecord[]>;
  readonly markImportJobCommitted: (
    input: UpdateImportJobCommittedInput,
  ) => Promise<ImportJobRecord | null>;
  readonly markImportJobUndone: (
    input: UpdateImportJobUndoneInput,
  ) => Promise<ImportJobRecord | null>;
  readonly markRecurringTemplateGenerated: (
    input: LedgerScope & { readonly recurringTemplateId: SyncedId; readonly nextRunAt: string },
  ) => Promise<RecurringTemplateRecord | null>;
  readonly updateRecurringTemplate: (
    input: UpdateRecurringTemplateInput,
  ) => Promise<RecurringTemplateRecord | null>;
  readonly updateRule: (input: UpdateRuleInput) => Promise<RuleRecord | null>;
};

export type WorkflowRepositoryOptions = {
  readonly clock?: RepositoryClock;
  readonly createId?: () => SyncedId;
};

type ResolvedOptions = {
  readonly clock: RepositoryClock;
  readonly createId: () => SyncedId;
};

type SqliteImportJobRow = {
  readonly committed_at: string | null;
  readonly committed_group_ids_json: unknown;
  readonly created_at: string;
  readonly created_by: string;
  readonly csv_text: string;
  readonly file_name: string | null;
  readonly id: string;
  readonly ledger_id: string;
  readonly preview_rows_json: unknown;
  readonly status: ImportJobStatus;
  readonly undone_at: string | null;
  readonly updated_at: string;
  readonly workspace_id: string;
};

type SqliteRuleRow = {
  readonly action_json: unknown;
  readonly action_type: RuleActionType;
  readonly archived_at: string | null;
  readonly condition_json: unknown;
  readonly created_at: string;
  readonly created_by: string;
  readonly enabled: number;
  readonly id: string;
  readonly ledger_id: string;
  readonly name: string;
  readonly updated_at: string;
  readonly updated_by: string;
  readonly workspace_id: string;
};

type SqliteRecurringTemplateRow = {
  readonly archived_at: string | null;
  readonly cadence: RecurringCadence;
  readonly created_at: string;
  readonly created_by: string;
  readonly id: string;
  readonly interval_count: number;
  readonly last_generated_at: string | null;
  readonly ledger_id: string;
  readonly next_run_at: string;
  readonly status: RecurringTemplateStatus;
  readonly template_json: unknown;
  readonly updated_at: string;
  readonly updated_by: string;
  readonly workspace_id: string;
};

function resolveOptions(options?: WorkflowRepositoryOptions): ResolvedOptions {
  return {
    clock: options?.clock ?? systemClock,
    createId: options?.createId ?? createUuidV7,
  };
}

export function createSqliteWorkflowRepository(
  client: SqliteClient,
  options?: WorkflowRepositoryOptions,
): WorkflowRepository {
  const resolved = resolveOptions(options);

  return {
    async createImportJob(input) {
      const scope = assertLedgerScope(input);
      const now = makeTimestamp(resolved.clock);
      const id = resolved.createId();
      client
        .prepare(
          `
            INSERT INTO import_jobs (
              id,
              workspace_id,
              ledger_id,
              file_name,
              csv_text,
              preview_rows_json,
              status,
              committed_group_ids_json,
              created_by,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          id,
          scope.workspaceId,
          scope.ledgerId,
          input.fileName,
          input.csvText,
          JSON.stringify(input.previewRows),
          "preview_ready",
          JSON.stringify([]),
          input.createdBy,
          now,
          now,
        );
      return (await this.findImportJob({ ...scope, importJobId: id })) as ImportJobRecord;
    },

    async listImportJobs(input) {
      const scope = assertLedgerScope(input);
      const rows = client
        .prepare(
          `
            SELECT *
            FROM import_jobs
            WHERE workspace_id = ?
              AND ledger_id = ?
            ORDER BY created_at DESC
          `,
        )
        .all(scope.workspaceId, scope.ledgerId) as readonly SqliteImportJobRow[];
      return rows.map(toImportJobRecord);
    },

    async findImportJob(input) {
      const scope = assertLedgerScope(input);
      const row = client
        .prepare(
          `
            SELECT *
            FROM import_jobs
            WHERE workspace_id = ?
              AND ledger_id = ?
              AND id = ?
            LIMIT 1
          `,
        )
        .get(scope.workspaceId, scope.ledgerId, input.importJobId) as
        | SqliteImportJobRow
        | undefined;
      return row ? toImportJobRecord(row) : null;
    },

    async markImportJobCommitted(input) {
      const scope = assertLedgerScope(input);
      const now = makeTimestamp(resolved.clock);
      client
        .prepare(
          `
            UPDATE import_jobs
            SET status = 'committed',
                committed_group_ids_json = ?,
                committed_at = ?,
                updated_at = ?
            WHERE workspace_id = ?
              AND ledger_id = ?
              AND id = ?
          `,
        )
        .run(
          JSON.stringify(input.committedGroupIds),
          now,
          now,
          scope.workspaceId,
          scope.ledgerId,
          input.importJobId,
        );
      return this.findImportJob({ ...scope, importJobId: input.importJobId });
    },

    async markImportJobUndone(input) {
      const scope = assertLedgerScope(input);
      const now = makeTimestamp(resolved.clock);
      client
        .prepare(
          `
            UPDATE import_jobs
            SET status = 'undone',
                undone_at = ?,
                updated_at = ?
            WHERE workspace_id = ?
              AND ledger_id = ?
              AND id = ?
          `,
        )
        .run(now, now, scope.workspaceId, scope.ledgerId, input.importJobId);
      return this.findImportJob({ ...scope, importJobId: input.importJobId });
    },

    async createRule(input) {
      const scope = assertLedgerScope(input);
      const id = resolved.createId();
      const now = makeTimestamp(resolved.clock);
      client
        .prepare(
          `
            INSERT INTO rules (
              id,
              workspace_id,
              ledger_id,
              name,
              enabled,
              condition_json,
              action_type,
              action_json,
              created_by,
              updated_by,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          id,
          scope.workspaceId,
          scope.ledgerId,
          input.name,
          input.enabled ? 1 : 0,
          JSON.stringify(input.condition),
          input.action.type,
          JSON.stringify(input.action),
          input.createdBy,
          input.createdBy,
          now,
          now,
        );
      return (await this.findRule({ ...scope, ruleId: id })) as RuleRecord;
    },

    async listRules(input) {
      const scope = assertLedgerScope(input);
      const rows = client
        .prepare(
          `
            SELECT *
            FROM rules
            WHERE workspace_id = ?
              AND ledger_id = ?
              AND archived_at IS NULL
            ORDER BY created_at DESC
          `,
        )
        .all(scope.workspaceId, scope.ledgerId) as readonly SqliteRuleRow[];
      return rows.map(toRuleRecord);
    },

    async findRule(input) {
      const scope = assertLedgerScope(input);
      const row = client
        .prepare(
          `
            SELECT *
            FROM rules
            WHERE workspace_id = ?
              AND ledger_id = ?
              AND id = ?
              AND archived_at IS NULL
            LIMIT 1
          `,
        )
        .get(scope.workspaceId, scope.ledgerId, input.ruleId) as SqliteRuleRow | undefined;
      return row ? toRuleRecord(row) : null;
    },

    async updateRule(input) {
      const scope = assertLedgerScope(input);
      const now = makeTimestamp(resolved.clock);
      client
        .prepare(
          `
            UPDATE rules
            SET name = ?,
                enabled = ?,
                condition_json = ?,
                action_type = ?,
                action_json = ?,
                updated_by = ?,
                updated_at = ?
            WHERE workspace_id = ?
              AND ledger_id = ?
              AND id = ?
              AND archived_at IS NULL
          `,
        )
        .run(
          input.name,
          input.enabled ? 1 : 0,
          JSON.stringify(input.condition),
          input.action.type,
          JSON.stringify(input.action),
          input.updatedBy,
          now,
          scope.workspaceId,
          scope.ledgerId,
          input.ruleId,
        );
      return this.findRule({ ...scope, ruleId: input.ruleId });
    },

    async archiveRule(input) {
      const scope = assertLedgerScope(input);
      const now = makeTimestamp(resolved.clock);
      const result = client
        .prepare(
          `
            UPDATE rules
            SET archived_at = ?,
                updated_by = ?,
                updated_at = ?
            WHERE workspace_id = ?
              AND ledger_id = ?
              AND id = ?
              AND archived_at IS NULL
          `,
        )
        .run(now, input.updatedBy, now, scope.workspaceId, scope.ledgerId, input.ruleId);
      if (result.changes === 0) {
        return null;
      }

      const row = client
        .prepare(
          `
            SELECT *
            FROM rules
            WHERE workspace_id = ?
              AND ledger_id = ?
              AND id = ?
            LIMIT 1
          `,
        )
        .get(scope.workspaceId, scope.ledgerId, input.ruleId) as SqliteRuleRow | undefined;

      return row ? toRuleRecord(row) : null;
    },

    async createRecurringTemplate(input) {
      const scope = assertLedgerScope(input);
      const id = resolved.createId();
      const now = makeTimestamp(resolved.clock);
      client
        .prepare(
          `
            INSERT INTO recurring_templates (
              id,
              workspace_id,
              ledger_id,
              type,
              cadence,
              interval_count,
              next_run_at,
              status,
              template_json,
              created_by,
              updated_by,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          id,
          scope.workspaceId,
          scope.ledgerId,
          input.payload.type,
          input.cadence,
          input.intervalCount,
          input.nextRunAt,
          input.status,
          JSON.stringify(input.payload),
          input.createdBy,
          input.createdBy,
          now,
          now,
        );
      return (await this.findRecurringTemplate({
        ...scope,
        recurringTemplateId: id,
      })) as RecurringTemplateRecord;
    },

    async listRecurringTemplates(input) {
      const scope = assertLedgerScope(input);
      const rows = client
        .prepare(
          `
            SELECT *
            FROM recurring_templates
            WHERE workspace_id = ?
              AND ledger_id = ?
              AND archived_at IS NULL
            ORDER BY created_at DESC
          `,
        )
        .all(scope.workspaceId, scope.ledgerId) as readonly SqliteRecurringTemplateRow[];
      return rows.map(toRecurringTemplateRecord);
    },

    async findRecurringTemplate(input) {
      const scope = assertLedgerScope(input);
      const row = client
        .prepare(
          `
            SELECT *
            FROM recurring_templates
            WHERE workspace_id = ?
              AND ledger_id = ?
              AND id = ?
              AND archived_at IS NULL
            LIMIT 1
          `,
        )
        .get(scope.workspaceId, scope.ledgerId, input.recurringTemplateId) as
        | SqliteRecurringTemplateRow
        | undefined;
      return row ? toRecurringTemplateRecord(row) : null;
    },

    async updateRecurringTemplate(input) {
      const scope = assertLedgerScope(input);
      const now = makeTimestamp(resolved.clock);
      client
        .prepare(
          `
            UPDATE recurring_templates
            SET type = ?,
                cadence = ?,
                interval_count = ?,
                next_run_at = ?,
                status = ?,
                template_json = ?,
                updated_by = ?,
                updated_at = ?
            WHERE workspace_id = ?
              AND ledger_id = ?
              AND id = ?
              AND archived_at IS NULL
          `,
        )
        .run(
          input.payload.type,
          input.cadence,
          input.intervalCount,
          input.nextRunAt,
          input.status,
          JSON.stringify(input.payload),
          input.updatedBy,
          now,
          scope.workspaceId,
          scope.ledgerId,
          input.recurringTemplateId,
        );
      return this.findRecurringTemplate({
        ...scope,
        recurringTemplateId: input.recurringTemplateId,
      });
    },

    async archiveRecurringTemplate(input) {
      const scope = assertLedgerScope(input);
      const now = makeTimestamp(resolved.clock);
      const result = client
        .prepare(
          `
            UPDATE recurring_templates
            SET status = 'archived',
                archived_at = ?,
                updated_by = ?,
                updated_at = ?
            WHERE workspace_id = ?
              AND ledger_id = ?
              AND id = ?
              AND archived_at IS NULL
          `,
        )
        .run(
          now,
          input.updatedBy,
          now,
          scope.workspaceId,
          scope.ledgerId,
          input.recurringTemplateId,
        );
      if (result.changes === 0) {
        return null;
      }

      const row = client
        .prepare(
          `
            SELECT *
            FROM recurring_templates
            WHERE workspace_id = ?
              AND ledger_id = ?
              AND id = ?
            LIMIT 1
          `,
        )
        .get(scope.workspaceId, scope.ledgerId, input.recurringTemplateId) as
        | SqliteRecurringTemplateRow
        | undefined;

      return row ? toRecurringTemplateRecord(row) : null;
    },

    async markRecurringTemplateGenerated(input) {
      const scope = assertLedgerScope(input);
      const now = makeTimestamp(resolved.clock);
      client
        .prepare(
          `
            UPDATE recurring_templates
            SET last_generated_at = ?,
                next_run_at = ?,
                updated_at = ?
            WHERE workspace_id = ?
              AND ledger_id = ?
              AND id = ?
              AND archived_at IS NULL
          `,
        )
        .run(
          now,
          input.nextRunAt,
          now,
          scope.workspaceId,
          scope.ledgerId,
          input.recurringTemplateId,
        );
      return this.findRecurringTemplate({
        ...scope,
        recurringTemplateId: input.recurringTemplateId,
      });
    },
  };
}

export function createPostgresWorkflowRepository(
  db: PostgresExecutor,
  options?: WorkflowRepositoryOptions,
): WorkflowRepository {
  const resolved = resolveOptions(options);

  return {
    async createImportJob(input) {
      const scope = assertLedgerScope(input);
      const now = resolved.clock.now();
      const id = resolved.createId();
      await db.insert(pgImportJobs).values({
        id,
        workspaceId: scope.workspaceId,
        ledgerId: scope.ledgerId,
        fileName: input.fileName,
        csvText: input.csvText,
        previewRowsJson: input.previewRows,
        status: "preview_ready",
        committedGroupIdsJson: [],
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
      });
      return (await this.findImportJob({ ...scope, importJobId: id })) as ImportJobRecord;
    },

    async listImportJobs(input) {
      const scope = assertLedgerScope(input);
      const rows = await db
        .select()
        .from(pgImportJobs)
        .where(
          and(
            eq(pgImportJobs.workspaceId, scope.workspaceId),
            eq(pgImportJobs.ledgerId, scope.ledgerId),
          ),
        )
        .orderBy(desc(pgImportJobs.createdAt));
      return rows.map(toImportJobRecord);
    },

    async findImportJob(input) {
      const scope = assertLedgerScope(input);
      const [row] = await db
        .select()
        .from(pgImportJobs)
        .where(
          and(
            eq(pgImportJobs.workspaceId, scope.workspaceId),
            eq(pgImportJobs.ledgerId, scope.ledgerId),
            eq(pgImportJobs.id, input.importJobId),
          ),
        )
        .limit(1);
      return row ? toImportJobRecord(row) : null;
    },

    async markImportJobCommitted(input) {
      const scope = assertLedgerScope(input);
      const now = resolved.clock.now();
      await db
        .update(pgImportJobs)
        .set({
          status: "committed",
          committedAt: now,
          committedGroupIdsJson: input.committedGroupIds,
          updatedAt: now,
        })
        .where(
          and(
            eq(pgImportJobs.workspaceId, scope.workspaceId),
            eq(pgImportJobs.ledgerId, scope.ledgerId),
            eq(pgImportJobs.id, input.importJobId),
          ),
        );
      return this.findImportJob({ ...scope, importJobId: input.importJobId });
    },

    async markImportJobUndone(input) {
      const scope = assertLedgerScope(input);
      const now = resolved.clock.now();
      await db
        .update(pgImportJobs)
        .set({
          status: "undone",
          undoneAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(pgImportJobs.workspaceId, scope.workspaceId),
            eq(pgImportJobs.ledgerId, scope.ledgerId),
            eq(pgImportJobs.id, input.importJobId),
          ),
        );
      return this.findImportJob({ ...scope, importJobId: input.importJobId });
    },

    async createRule(input) {
      const scope = assertLedgerScope(input);
      const now = resolved.clock.now();
      const id = resolved.createId();
      await db.insert(pgRules).values({
        id,
        workspaceId: scope.workspaceId,
        ledgerId: scope.ledgerId,
        name: input.name,
        enabled: input.enabled,
        conditionJson: input.condition,
        actionType: input.action.type,
        actionJson: input.action,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
      });
      return (await this.findRule({ ...scope, ruleId: id })) as RuleRecord;
    },

    async listRules(input) {
      const scope = assertLedgerScope(input);
      const rows = await db
        .select()
        .from(pgRules)
        .where(
          and(
            eq(pgRules.workspaceId, scope.workspaceId),
            eq(pgRules.ledgerId, scope.ledgerId),
            isNull(pgRules.archivedAt),
          ),
        )
        .orderBy(desc(pgRules.createdAt));
      return rows.map(toRuleRecord);
    },

    async findRule(input) {
      const scope = assertLedgerScope(input);
      const [row] = await db
        .select()
        .from(pgRules)
        .where(
          and(
            eq(pgRules.workspaceId, scope.workspaceId),
            eq(pgRules.ledgerId, scope.ledgerId),
            eq(pgRules.id, input.ruleId),
            isNull(pgRules.archivedAt),
          ),
        )
        .limit(1);
      return row ? toRuleRecord(row) : null;
    },

    async updateRule(input) {
      const scope = assertLedgerScope(input);
      const now = resolved.clock.now();
      await db
        .update(pgRules)
        .set({
          name: input.name,
          enabled: input.enabled,
          conditionJson: input.condition,
          actionType: input.action.type,
          actionJson: input.action,
          updatedBy: input.updatedBy,
          updatedAt: now,
        })
        .where(
          and(
            eq(pgRules.workspaceId, scope.workspaceId),
            eq(pgRules.ledgerId, scope.ledgerId),
            eq(pgRules.id, input.ruleId),
            isNull(pgRules.archivedAt),
          ),
        );
      return this.findRule({ ...scope, ruleId: input.ruleId });
    },

    async archiveRule(input) {
      const scope = assertLedgerScope(input);
      const now = resolved.clock.now();
      const [row] = await db
        .update(pgRules)
        .set({
          archivedAt: now,
          updatedBy: input.updatedBy,
          updatedAt: now,
        })
        .where(
          and(
            eq(pgRules.workspaceId, scope.workspaceId),
            eq(pgRules.ledgerId, scope.ledgerId),
            eq(pgRules.id, input.ruleId),
            isNull(pgRules.archivedAt),
          ),
        )
        .returning();
      return row ? toRuleRecord(row) : null;
    },

    async createRecurringTemplate(input) {
      const scope = assertLedgerScope(input);
      const now = resolved.clock.now();
      const id = resolved.createId();
      await db.insert(pgRecurringTemplates).values({
        id,
        workspaceId: scope.workspaceId,
        ledgerId: scope.ledgerId,
        type: input.payload.type,
        cadence: input.cadence,
        intervalCount: input.intervalCount,
        nextRunAt: new Date(input.nextRunAt),
        status: input.status,
        templateJson: input.payload,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
      });
      return (await this.findRecurringTemplate({
        ...scope,
        recurringTemplateId: id,
      })) as RecurringTemplateRecord;
    },

    async listRecurringTemplates(input) {
      const scope = assertLedgerScope(input);
      const rows = await db
        .select()
        .from(pgRecurringTemplates)
        .where(
          and(
            eq(pgRecurringTemplates.workspaceId, scope.workspaceId),
            eq(pgRecurringTemplates.ledgerId, scope.ledgerId),
            isNull(pgRecurringTemplates.archivedAt),
          ),
        )
        .orderBy(desc(pgRecurringTemplates.createdAt));
      return rows.map(toRecurringTemplateRecord);
    },

    async findRecurringTemplate(input) {
      const scope = assertLedgerScope(input);
      const [row] = await db
        .select()
        .from(pgRecurringTemplates)
        .where(
          and(
            eq(pgRecurringTemplates.workspaceId, scope.workspaceId),
            eq(pgRecurringTemplates.ledgerId, scope.ledgerId),
            eq(pgRecurringTemplates.id, input.recurringTemplateId),
            isNull(pgRecurringTemplates.archivedAt),
          ),
        )
        .limit(1);
      return row ? toRecurringTemplateRecord(row) : null;
    },

    async updateRecurringTemplate(input) {
      const scope = assertLedgerScope(input);
      const now = resolved.clock.now();
      await db
        .update(pgRecurringTemplates)
        .set({
          type: input.payload.type,
          cadence: input.cadence,
          intervalCount: input.intervalCount,
          nextRunAt: new Date(input.nextRunAt),
          status: input.status,
          templateJson: input.payload,
          updatedBy: input.updatedBy,
          updatedAt: now,
        })
        .where(
          and(
            eq(pgRecurringTemplates.workspaceId, scope.workspaceId),
            eq(pgRecurringTemplates.ledgerId, scope.ledgerId),
            eq(pgRecurringTemplates.id, input.recurringTemplateId),
            isNull(pgRecurringTemplates.archivedAt),
          ),
        );
      return this.findRecurringTemplate({
        ...scope,
        recurringTemplateId: input.recurringTemplateId,
      });
    },

    async archiveRecurringTemplate(input) {
      const scope = assertLedgerScope(input);
      const now = resolved.clock.now();
      const [row] = await db
        .update(pgRecurringTemplates)
        .set({
          status: "archived",
          archivedAt: now,
          updatedBy: input.updatedBy,
          updatedAt: now,
        })
        .where(
          and(
            eq(pgRecurringTemplates.workspaceId, scope.workspaceId),
            eq(pgRecurringTemplates.ledgerId, scope.ledgerId),
            eq(pgRecurringTemplates.id, input.recurringTemplateId),
            isNull(pgRecurringTemplates.archivedAt),
          ),
        )
        .returning();
      return row ? toRecurringTemplateRecord(row) : null;
    },

    async markRecurringTemplateGenerated(input) {
      const scope = assertLedgerScope(input);
      const now = resolved.clock.now();
      await db
        .update(pgRecurringTemplates)
        .set({
          lastGeneratedAt: now,
          nextRunAt: new Date(input.nextRunAt),
          updatedAt: now,
        })
        .where(
          and(
            eq(pgRecurringTemplates.workspaceId, scope.workspaceId),
            eq(pgRecurringTemplates.ledgerId, scope.ledgerId),
            eq(pgRecurringTemplates.id, input.recurringTemplateId),
            isNull(pgRecurringTemplates.archivedAt),
          ),
        );
      return this.findRecurringTemplate({
        ...scope,
        recurringTemplateId: input.recurringTemplateId,
      });
    },
  };
}

function toImportJobRecord(row: Record<string, unknown>): ImportJobRecord {
  return {
    committedAt: normalizeNullableTimestamp(readValue(row, "committed_at", "committedAt")),
    committedGroupIds: parseSyncedIdArray(
      readValue(row, "committed_group_ids_json", "committedGroupIdsJson"),
    ),
    createdAt: normalizeTimestamp(readRequiredValue(row, "created_at", "createdAt")),
    createdBy: parseSyncedId(readRequiredString(row, "created_by", "createdBy")),
    csvText: readRequiredString(row, "csv_text", "csvText"),
    fileName: readOptionalString(row, "file_name", "fileName"),
    id: parseSyncedId(readRequiredString(row, "id")),
    ledgerId: parseSyncedId(readRequiredString(row, "ledger_id", "ledgerId")),
    previewRows: parseImportPreviewRows(readValue(row, "preview_rows_json", "previewRowsJson")),
    status: readRequiredImportJobStatus(row, "status"),
    undoneAt: normalizeNullableTimestamp(readValue(row, "undone_at", "undoneAt")),
    updatedAt: normalizeTimestamp(readRequiredValue(row, "updated_at", "updatedAt")),
    workspaceId: parseSyncedId(readRequiredString(row, "workspace_id", "workspaceId")),
  };
}

function toRuleRecord(row: Record<string, unknown>): RuleRecord {
  return {
    action: parseRuleAction(readValue(row, "action_json", "actionJson")),
    archivedAt: normalizeNullableTimestamp(readValue(row, "archived_at", "archivedAt")),
    condition: parseRuleCondition(readValue(row, "condition_json", "conditionJson")),
    createdAt: normalizeTimestamp(readRequiredValue(row, "created_at", "createdAt")),
    createdBy: parseSyncedId(readRequiredString(row, "created_by", "createdBy")),
    enabled: readBooleanLike(row, "enabled"),
    id: parseSyncedId(readRequiredString(row, "id")),
    ledgerId: parseSyncedId(readRequiredString(row, "ledger_id", "ledgerId")),
    name: readRequiredString(row, "name"),
    updatedAt: normalizeTimestamp(readRequiredValue(row, "updated_at", "updatedAt")),
    updatedBy: parseSyncedId(readRequiredString(row, "updated_by", "updatedBy")),
    workspaceId: parseSyncedId(readRequiredString(row, "workspace_id", "workspaceId")),
  };
}

function toRecurringTemplateRecord(row: Record<string, unknown>): RecurringTemplateRecord {
  return {
    archivedAt: normalizeNullableTimestamp(readValue(row, "archived_at", "archivedAt")),
    cadence: readRequiredRecurringCadence(row, "cadence"),
    createdAt: normalizeTimestamp(readRequiredValue(row, "created_at", "createdAt")),
    createdBy: parseSyncedId(readRequiredString(row, "created_by", "createdBy")),
    id: parseSyncedId(readRequiredString(row, "id")),
    intervalCount: readRequiredNumber(row, "interval_count", "intervalCount"),
    lastGeneratedAt: normalizeNullableTimestamp(
      readValue(row, "last_generated_at", "lastGeneratedAt"),
    ),
    ledgerId: parseSyncedId(readRequiredString(row, "ledger_id", "ledgerId")),
    nextRunAt: normalizeTimestamp(readRequiredValue(row, "next_run_at", "nextRunAt")),
    payload: parseRecurringPayload(readValue(row, "template_json", "templateJson")),
    status: readRequiredRecurringStatus(row, "status"),
    updatedAt: normalizeTimestamp(readRequiredValue(row, "updated_at", "updatedAt")),
    updatedBy: parseSyncedId(readRequiredString(row, "updated_by", "updatedBy")),
    workspaceId: parseSyncedId(readRequiredString(row, "workspace_id", "workspaceId")),
  };
}

function normalizeTimestamp(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

function normalizeNullableTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

function parseJson(value: unknown): unknown {
  if (typeof value === "string") {
    return JSON.parse(value);
  }
  return value;
}

function parseSyncedIdArray(value: unknown): readonly SyncedId[] {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((item): item is string => typeof item === "string").map(parseSyncedId);
}

function parseImportPreviewRows(value: unknown): readonly ImportPreviewRow[] {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.map((row, index) => {
    const record = typeof row === "object" && row !== null ? row : {};
    const getString = (key: string) =>
      typeof (record as Record<string, unknown>)[key] === "string"
        ? ((record as Record<string, unknown>)[key] as string)
        : "";
    return {
      amountMinor: getString("amountMinor"),
      currencyCode: getString("currencyCode"),
      description: getString("description"),
      destinationAccountId: parseSyncedId(getString("destinationAccountId")),
      occurredAt: getString("occurredAt"),
      rowNumber:
        typeof (record as Record<string, unknown>).rowNumber === "number"
          ? ((record as Record<string, unknown>).rowNumber as number)
          : index + 1,
      sourceAccountId: parseSyncedId(getString("sourceAccountId")),
      type: ((): ImportPreviewRow["type"] => {
        const type = getString("type");
        return type === "income" || type === "transfer" ? type : "expense";
      })(),
    };
  });
}

function parseRuleCondition(value: unknown): RuleCondition {
  const parsed = parseJson(value);
  if (!parsed || typeof parsed !== "object") {
    return {};
  }
  const record = parsed as Record<string, unknown>;
  const amountMaxMinor =
    typeof record.amountMaxMinor === "string" ? record.amountMaxMinor : undefined;
  const amountMinMinor =
    typeof record.amountMinMinor === "string" ? record.amountMinMinor : undefined;
  const descriptionContains =
    typeof record.descriptionContains === "string" ? record.descriptionContains : undefined;
  const type =
    record.type === "expense" || record.type === "income" || record.type === "transfer"
      ? record.type
      : undefined;

  return {
    ...(amountMaxMinor !== undefined ? { amountMaxMinor } : {}),
    ...(amountMinMinor !== undefined ? { amountMinMinor } : {}),
    ...(descriptionContains !== undefined ? { descriptionContains } : {}),
    ...(type !== undefined ? { type } : {}),
  };
}

function parseRuleAction(value: unknown): RuleAction {
  const parsed = parseJson(value);
  const record = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const status =
    record.status === "pending" || record.status === "reconciled" || record.status === "void"
      ? (record.status as RuleAction["status"])
      : "cleared";
  return {
    status,
    type: "set_transaction_status",
  };
}

function parseRecurringPayload(value: unknown): RecurringTemplatePayload {
  const parsed = parseJson(value);
  const record = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const linesRaw = Array.isArray(record.lines) ? record.lines : [];
  return {
    currencyCode: typeof record.currencyCode === "string" ? record.currencyCode : "INR",
    description: typeof record.description === "string" ? record.description : "",
    lines: linesRaw.map((line) => {
      const lineRecord = line && typeof line === "object" ? (line as Record<string, unknown>) : {};
      return {
        amountMinor: typeof lineRecord.amountMinor === "string" ? lineRecord.amountMinor : "0",
        budgetId:
          typeof lineRecord.budgetId === "string" ? parseSyncedId(lineRecord.budgetId) : null,
        categoryId:
          typeof lineRecord.categoryId === "string" ? parseSyncedId(lineRecord.categoryId) : null,
        description: typeof lineRecord.description === "string" ? lineRecord.description : null,
        destinationAccountId: parseSyncedId(
          typeof lineRecord.destinationAccountId === "string"
            ? lineRecord.destinationAccountId
            : readRequiredString(record, "sourceAccountId"),
        ),
        reportingAmountMinor:
          typeof lineRecord.reportingAmountMinor === "string"
            ? lineRecord.reportingAmountMinor
            : null,
        reportingCurrencyCode:
          typeof lineRecord.reportingCurrencyCode === "string"
            ? lineRecord.reportingCurrencyCode
            : null,
      };
    }),
    sourceAccountId: parseSyncedId(readRequiredString(record, "sourceAccountId")),
    title: typeof record.title === "string" ? record.title : null,
    type:
      record.type === "income" || record.type === "transfer"
        ? (record.type as RecurringTemplatePayload["type"])
        : "expense",
  };
}

function readValue(record: Record<string, unknown>, key: string, altKey?: string): unknown {
  if (key in record) {
    return record[key];
  }
  if (altKey && altKey in record) {
    return record[altKey];
  }
  return undefined;
}

function readRequiredValue(
  record: Record<string, unknown>,
  key: string,
  altKey?: string,
): Date | string {
  const value = readValue(record, key, altKey);
  if (value instanceof Date || typeof value === "string") {
    return value;
  }
  throw new Error(`Missing required value: ${key}`);
}

function readRequiredString(record: Record<string, unknown>, key: string, altKey?: string): string {
  const value = readValue(record, key, altKey);
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw new Error(`Missing required string: ${key}`);
}

function readOptionalString(
  record: Record<string, unknown>,
  key: string,
  altKey?: string,
): string | null {
  const value = readValue(record, key, altKey);
  return typeof value === "string" ? value : null;
}

function readBooleanLike(record: Record<string, unknown>, key: string): boolean {
  const value = readValue(record, key);
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value === 1;
  }
  return false;
}

function readRequiredNumber(record: Record<string, unknown>, key: string, altKey?: string): number {
  const value = readValue(record, key, altKey);
  if (typeof value === "number") {
    return value;
  }
  throw new Error(`Missing required number: ${key}`);
}

function readRequiredImportJobStatus(
  record: Record<string, unknown>,
  key: string,
): ImportJobStatus {
  const value = readValue(record, key);
  if (
    value === "preview_ready" ||
    value === "committed" ||
    value === "undone" ||
    value === "failed"
  ) {
    return value;
  }
  throw new Error("Invalid import job status");
}

function readRequiredRecurringCadence(
  record: Record<string, unknown>,
  key: string,
): RecurringCadence {
  const value = readValue(record, key);
  if (value === "daily" || value === "weekly" || value === "monthly") {
    return value;
  }
  throw new Error("Invalid recurring cadence");
}

function readRequiredRecurringStatus(
  record: Record<string, unknown>,
  key: string,
): RecurringTemplateStatus {
  const value = readValue(record, key);
  if (value === "active" || value === "paused" || value === "archived") {
    return value;
  }
  throw new Error("Invalid recurring template status");
}
