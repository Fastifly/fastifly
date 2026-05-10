import {
  createUuidV7,
  encodeFinanceCursor,
  inferTransactionType,
  type LedgerScope,
  parseFinanceCursor,
  parseSyncedId,
  type SyncedId,
  type UserFacingTransactionType,
} from "@fastifly/common";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";

import type { PostgresDatabase } from "../postgres/client.js";
import {
  pgAccounts,
  pgBalanceRecalculationQueue,
  pgTransactionGroups,
  pgTransactionJournals,
  pgTransactionPostings,
} from "../postgres/schema.js";
import type { SqliteClient } from "../sqlite/client.js";
import {
  bindSqliteMoneyMinor,
  prepareSqliteMoneyStatement,
  readRequiredSqliteMoneyMinor,
} from "../sqlite/money.js";
import type { RepositoryClock, RepositoryListPage } from "./base.js";
import { assertLedgerScope, makeTimestamp, systemClock } from "./base.js";

const TRANSACTION_WRITE_REASON = "transaction.created";

export type TransactionWriteRepositoryOptions = {
  readonly clock?: RepositoryClock;
  readonly createId?: () => SyncedId;
};

export type CreateTransactionLineInput = {
  readonly amountMinor: bigint;
  readonly destinationAccountId: SyncedId;
  readonly description?: string | null;
  readonly categoryId?: SyncedId | null;
  readonly budgetId?: SyncedId | null;
  readonly reportingAmountMinor?: bigint | null;
  readonly reportingCurrencyCode?: string | null;
};

export type CreateTransactionInput = LedgerScope & {
  readonly type: Extract<UserFacingTransactionType, "expense" | "income" | "transfer">;
  readonly sourceAccountId: SyncedId;
  readonly title?: string | null;
  readonly description: string;
  readonly occurredAt: string;
  readonly currencyCode: string;
  readonly status?: "pending" | "cleared";
  readonly source?: "manual" | "import" | "recurring" | "rule" | "api";
  readonly createdBy?: SyncedId | null;
  readonly lines: readonly CreateTransactionLineInput[];
};

export type TransactionPostingRecord = {
  readonly id: SyncedId;
  readonly accountId: SyncedId;
  readonly amountMinor: bigint;
  readonly currencyCode: string;
  readonly reportingAmountMinor: bigint;
  readonly reportingCurrencyCode: string;
};

export type TransactionJournalRecord = {
  readonly id: SyncedId;
  readonly type: "expense" | "income" | "transfer";
  readonly occurredAt: string;
  readonly description: string;
  readonly postings: readonly TransactionPostingRecord[];
};

export type TransactionGroupRecord = {
  readonly id: SyncedId;
  readonly workspaceId: SyncedId;
  readonly ledgerId: SyncedId;
  readonly type: "expense" | "income" | "transfer" | "split";
  readonly title: string;
  readonly journals: readonly TransactionJournalRecord[];
};

export type TransactionWriteRepository = {
  readonly createTransaction: (
    input: CreateTransactionInput,
  ) => MaybePromise<TransactionGroupRecord>;
};

type MaybePromise<T> = T | Promise<T>;

export type TransactionQueryTypeFilter = Extract<
  UserFacingTransactionType,
  "expense" | "income" | "transfer"
>;

export type TransactionQueryStatusFilter = "pending" | "cleared" | "reconciled" | "void";

export type ListTransactionsInput = LedgerScope & {
  readonly accountId?: SyncedId | null;
  readonly cursor?: string | null;
  readonly fromOccurredAt?: string | null;
  readonly toOccurredAt?: string | null;
  readonly type?: TransactionQueryTypeFilter | null;
  readonly status?: TransactionQueryStatusFilter | null;
  readonly limit?: number | null;
};

export type GetTransactionGroupInput = LedgerScope & {
  readonly transactionGroupId: SyncedId;
};

export type TransactionQueryService = {
  readonly listTransactionGroups: (
    input: ListTransactionsInput,
  ) => Promise<RepositoryListPage<TransactionGroupRecord>>;
  readonly getTransactionGroup: (
    input: GetTransactionGroupInput,
  ) => Promise<TransactionGroupRecord | null>;
};

type NormalizedCreateTransactionInput = {
  readonly type: CreateTransactionInput["type"];
  readonly sourceAccountId: SyncedId;
  readonly title: string;
  readonly description: string;
  readonly occurredAt: string;
  readonly currencyCode: string;
  readonly status: "pending" | "cleared";
  readonly source: "manual" | "import" | "recurring" | "rule" | "api";
  readonly createdBy: SyncedId | null;
  readonly lines: readonly NormalizedTransactionLine[];
};

type NormalizedTransactionLine = {
  readonly amountMinor: bigint;
  readonly destinationAccountId: SyncedId;
  readonly description: string;
  readonly categoryId: SyncedId | null;
  readonly budgetId: SyncedId | null;
  readonly reportingAmountMinor: bigint;
  readonly reportingCurrencyCode: string;
};

type AccountLookupRecord = {
  readonly id: SyncedId;
  readonly kind: "asset" | "liability" | "expense" | "revenue" | "equity";
  readonly subtype:
    | "bank"
    | "cash"
    | "wallet"
    | "credit_card"
    | "loan"
    | "investment"
    | "income_source"
    | "expense_category"
    | "external"
    | "opening_helper"
    | "reconciliation_helper";
  readonly currencyCode: string;
};

type SqliteAccountLookupRow = {
  readonly id: string;
  readonly kind: AccountLookupRecord["kind"];
  readonly subtype: AccountLookupRecord["subtype"];
  readonly currency_code: string;
};

type SqliteTransactionGroupIdRow = {
  readonly id: string;
  readonly last_occurred_at: string;
};

type TransactionGroupCursorRow = {
  readonly id: SyncedId;
  readonly lastOccurredAt: string;
};

type SqliteTransactionFlatRow = {
  readonly group_id: string;
  readonly group_workspace_id: string;
  readonly group_ledger_id: string;
  readonly group_type: TransactionGroupRecord["type"];
  readonly group_title: string;
  readonly journal_id: string;
  readonly journal_type: TransactionJournalRecord["type"];
  readonly journal_occurred_at: string;
  readonly journal_description: string;
  readonly posting_id: string;
  readonly posting_account_id: string;
  readonly posting_amount_minor: bigint | number | string;
  readonly posting_currency_code: string;
  readonly posting_reporting_amount_minor: bigint | number | string;
  readonly posting_reporting_currency_code: string;
};

type ResolvedOptions = {
  readonly clock: RepositoryClock;
  readonly createId: () => SyncedId;
};

type PostgresTransaction = Parameters<Parameters<PostgresDatabase["transaction"]>[0]>[0];
type PostgresExecutor = PostgresDatabase | PostgresTransaction;

function defaultCreateId(): SyncedId {
  return createUuidV7();
}

function resolveOptions(options?: TransactionWriteRepositoryOptions): ResolvedOptions {
  return {
    clock: options?.clock ?? systemClock,
    createId: options?.createId ?? defaultCreateId,
  };
}

export function createSqliteTransactionWriteRepository(
  client: SqliteClient,
  options?: TransactionWriteRepositoryOptions,
): TransactionWriteRepository {
  const resolved = resolveOptions(options);

  return {
    createTransaction(input) {
      const scope = assertLedgerScope(input);
      const normalized = normalizeCreateTransactionInput(input);
      const now = makeTimestamp(resolved.clock);

      return client
        .transaction(() => {
          assertSqliteLedgerScope(client, scope);
          const sourceAccount = readSqliteAccountForTransaction(
            client,
            scope,
            normalized.sourceAccountId,
          );
          const destinationAccounts = normalized.lines.map((line) =>
            readSqliteAccountForTransaction(client, scope, line.destinationAccountId),
          );
          validateTransactionAccounts(normalized, sourceAccount, destinationAccounts);

          const group = createTransactionGroupRecord(scope, normalized, resolved.createId());
          insertSqliteTransactionGroup(client, { group, normalized, now });
          const journals = normalized.lines.map((line, index) =>
            insertSqliteTransactionJournal(client, {
              destinationAccount: destinationAccounts[index] as AccountLookupRecord,
              group,
              journalId: resolved.createId(),
              line,
              normalized,
              now,
              sourceAccount,
              sourcePostingId: resolved.createId(),
              destinationPostingId: resolved.createId(),
            }),
          );
          for (const accountId of uniqueAccountIds(sourceAccount, destinationAccounts)) {
            insertSqliteBalanceDirty(client, {
              accountId,
              currencyCode: normalized.currencyCode,
              fromOccurredAt: normalized.occurredAt,
              id: resolved.createId(),
              ledgerId: scope.ledgerId,
              now,
              workspaceId: scope.workspaceId,
            });
          }

          return { ...group, journals };
        })
        .immediate();
    },
  };
}

export function createPostgresTransactionWriteRepository(
  db: PostgresExecutor,
  options?: TransactionWriteRepositoryOptions,
): TransactionWriteRepository {
  const resolved = resolveOptions(options);

  return {
    async createTransaction(input) {
      const scope = assertLedgerScope(input);
      const normalized = normalizeCreateTransactionInput(input);

      return runPostgresWrite(db, async (tx) => {
        const now = resolved.clock.now();
        await assertPostgresLedgerScope(tx, scope);
        const sourceAccount = await readPostgresAccountForTransaction(
          tx,
          scope,
          normalized.sourceAccountId,
        );
        const destinationAccounts = await Promise.all(
          normalized.lines.map((line) =>
            readPostgresAccountForTransaction(tx, scope, line.destinationAccountId),
          ),
        );
        validateTransactionAccounts(normalized, sourceAccount, destinationAccounts);

        const group = createTransactionGroupRecord(scope, normalized, resolved.createId());
        await tx.insert(pgTransactionGroups).values({
          id: group.id,
          workspaceId: group.workspaceId,
          ledgerId: group.ledgerId,
          title: group.title,
          type: group.type,
          source: normalized.source,
          createdBy: normalized.createdBy,
          updatedBy: normalized.createdBy,
          createdAt: now,
          updatedAt: now,
        });
        const journals: TransactionJournalRecord[] = [];
        for (const [index, line] of normalized.lines.entries()) {
          journals.push(
            await insertPostgresTransactionJournal(tx, {
              destinationAccount: destinationAccounts[index] as AccountLookupRecord,
              group,
              journalId: resolved.createId(),
              line,
              normalized,
              now,
              sourceAccount,
              sourcePostingId: resolved.createId(),
              destinationPostingId: resolved.createId(),
            }),
          );
        }
        const balanceRows = uniqueAccountIds(sourceAccount, destinationAccounts).map(
          (accountId) => ({
            id: resolved.createId(),
            workspaceId: scope.workspaceId,
            ledgerId: scope.ledgerId,
            accountId,
            currencyCode: normalized.currencyCode,
            fromOccurredAt: new Date(normalized.occurredAt),
            reason: TRANSACTION_WRITE_REASON,
            status: "pending",
            createdAt: now,
          }),
        );
        if (balanceRows.length > 0) {
          await tx.insert(pgBalanceRecalculationQueue).values(balanceRows);
        }

        return { ...group, journals };
      });
    },
  };
}

export function createSqliteTransactionQueryService(client: SqliteClient): TransactionQueryService {
  return {
    async listTransactionGroups(input) {
      const scope = assertLedgerScope(input);
      const groupCursorRows = listSqliteTransactionGroupIds(client, input, scope);
      const groups = readSqliteTransactionGroupsByIds(
        client,
        scope,
        groupCursorRows.map((row) => row.id),
        input,
      );
      return makeTransactionGroupListPage(
        groups,
        groupCursorRows,
        normalizeTransactionQueryLimit(input.limit),
      );
    },

    async getTransactionGroup(input) {
      const scope = assertLedgerScope(input);
      const groups = readSqliteTransactionGroupsByIds(client, scope, [input.transactionGroupId]);
      return groups[0] ?? null;
    },
  };
}

export function createPostgresTransactionQueryService(
  db: PostgresDatabase,
): TransactionQueryService {
  return {
    async listTransactionGroups(input) {
      const scope = assertLedgerScope(input);
      const groupCursorRows = await listPostgresTransactionGroupIds(db, input, scope);
      const groups = await readPostgresTransactionGroupsByIds(
        db,
        scope,
        groupCursorRows.map((row) => row.id),
        input,
      );
      return makeTransactionGroupListPage(
        groups,
        groupCursorRows,
        normalizeTransactionQueryLimit(input.limit),
      );
    },

    async getTransactionGroup(input) {
      const scope = assertLedgerScope(input);
      const groups = await readPostgresTransactionGroupsByIds(db, scope, [
        input.transactionGroupId,
      ]);
      return groups[0] ?? null;
    },
  };
}

function normalizeCreateTransactionInput(
  input: CreateTransactionInput,
): NormalizedCreateTransactionInput {
  const lines = input.lines.map((line) => normalizeTransactionLine(input, line));
  if (lines.length === 0) {
    throw new Error("Transaction must contain at least one line.");
  }

  const description = normalizeText(input.description, "Transaction description");

  return {
    createdBy: input.createdBy ?? null,
    currencyCode: normalizeCurrencyCode(input.currencyCode),
    description,
    occurredAt: normalizeTimestamp(input.occurredAt, "Transaction occurredAt"),
    lines,
    source: input.source ?? "manual",
    sourceAccountId: input.sourceAccountId,
    status: input.status ?? "cleared",
    title: normalizeOptionalText(input.title) ?? description,
    type: input.type,
  };
}

function normalizeTransactionQueryLimit(limit: number | null | undefined): number {
  if (limit === null || limit === undefined) {
    return 50;
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("Transaction query limit must be an integer from 1 to 200.");
  }

  return limit;
}

function makeTransactionGroupListPage(
  groups: readonly TransactionGroupRecord[],
  cursorRows: readonly TransactionGroupCursorRow[],
  limit: number,
): RepositoryListPage<TransactionGroupRecord> {
  const visibleCursorRows = cursorRows.slice(0, limit);
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const items = visibleCursorRows
    .map((row) => groupsById.get(row.id))
    .filter((group): group is TransactionGroupRecord => Boolean(group));
  const lastCursorRow = visibleCursorRows.at(-1);

  return {
    hasNextPage: cursorRows.length > limit,
    items,
    nextCursor:
      cursorRows.length > limit && lastCursorRow
        ? encodeFinanceCursor({
            id: lastCursorRow.id,
            kind: "transaction.lastOccurredAt.desc",
            sortKey: lastCursorRow.lastOccurredAt,
            v: 1,
          })
        : null,
  };
}

function normalizeTransactionLine(
  transaction: CreateTransactionInput,
  line: CreateTransactionLineInput,
): NormalizedTransactionLine {
  if (line.amountMinor <= 0n) {
    throw new Error("Transaction line amount must be greater than zero.");
  }

  const currencyCode = normalizeCurrencyCode(transaction.currencyCode);
  const reportingCurrencyCode = normalizeCurrencyCode(line.reportingCurrencyCode ?? currencyCode);
  const reportingAmountMinor = line.reportingAmountMinor ?? line.amountMinor;
  if (reportingCurrencyCode !== currencyCode || reportingAmountMinor !== line.amountMinor) {
    throw new Error("Converted reporting amounts require cross-currency transaction support.");
  }
  const categoryId = transaction.type === "transfer" ? null : (line.categoryId ?? null);
  const budgetId = transaction.type === "transfer" ? null : (line.budgetId ?? null);

  return {
    amountMinor: line.amountMinor,
    budgetId,
    categoryId,
    description:
      normalizeOptionalText(line.description) ??
      normalizeText(transaction.description, "Transaction description"),
    destinationAccountId: line.destinationAccountId,
    reportingAmountMinor,
    reportingCurrencyCode,
  };
}

function normalizeText(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${fieldName} is required.`);
  }

  return trimmed;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeCurrencyCode(currencyCode: string): string {
  const normalized = currencyCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("Currency code must be a three-letter uppercase code.");
  }

  return normalized;
}

function normalizeTimestamp(value: string, fieldName: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.valueOf())) {
    throw new Error(`${fieldName} must be a valid timestamp.`);
  }

  return timestamp.toISOString();
}

function normalizeOptionalTimestamp(
  value: string | null | undefined,
  fieldName: string,
): string | null {
  return value ? normalizeTimestamp(value, fieldName) : null;
}

function createTransactionGroupRecord(
  scope: LedgerScope,
  normalized: NormalizedCreateTransactionInput,
  groupId: SyncedId,
): Omit<TransactionGroupRecord, "journals"> {
  return {
    id: groupId,
    workspaceId: scope.workspaceId,
    ledgerId: scope.ledgerId,
    title: normalized.title,
    type: normalized.lines.length === 1 ? normalized.type : "split",
  };
}

function validateTransactionAccounts(
  input: NormalizedCreateTransactionInput,
  sourceAccount: AccountLookupRecord,
  destinationAccounts: readonly AccountLookupRecord[],
): void {
  if (sourceAccount.currencyCode !== input.currencyCode) {
    throw new Error("Source account currency must match the transaction currency.");
  }

  for (const destinationAccount of destinationAccounts) {
    if (destinationAccount.currencyCode !== input.currencyCode) {
      throw new Error("Destination account currency must match the transaction currency.");
    }
    const inferredType = inferTransactionType(sourceAccount, destinationAccount);
    if (inferredType !== input.type) {
      throw new Error("Transaction accounts do not match the requested transaction type.");
    }
  }
}

function listSqliteTransactionGroupIds(
  client: SqliteClient,
  input: ListTransactionsInput,
  scope: LedgerScope,
): readonly TransactionGroupCursorRow[] {
  const params: unknown[] = [scope.workspaceId, scope.ledgerId];
  const conditions = [
    "transaction_groups.workspace_id = ?",
    "transaction_groups.ledger_id = ?",
    "transaction_groups.deleted_at IS NULL",
    "transaction_journals.deleted_at IS NULL",
  ];

  appendSqliteQueryFilters(conditions, params, input);
  const cursor = input.cursor
    ? parseFinanceCursor(input.cursor, "transaction.lastOccurredAt.desc")
    : null;
  const cursorClause = cursor
    ? "HAVING MAX(transaction_journals.occurred_at) < ? OR (MAX(transaction_journals.occurred_at) = ? AND transaction_groups.id < ?)"
    : "";
  if (cursor) {
    params.push(cursor.sortKey, cursor.sortKey, cursor.id);
  }
  params.push(normalizeTransactionQueryLimit(input.limit) + 1);

  const rows = client
    .prepare<unknown[], SqliteTransactionGroupIdRow>(
      `
        SELECT
          transaction_groups.id,
          MAX(transaction_journals.occurred_at) AS last_occurred_at
        FROM transaction_groups
        JOIN transaction_journals
          ON transaction_journals.group_id = transaction_groups.id
        JOIN transaction_postings
          ON transaction_postings.journal_id = transaction_journals.id
        WHERE ${conditions.join(" AND ")}
        GROUP BY transaction_groups.id
        ${cursorClause}
        ORDER BY MAX(transaction_journals.occurred_at) DESC, transaction_groups.id DESC
        LIMIT ?
      `,
    )
    .all(...params);

  return rows.map((row) => ({
    id: parseSyncedId(row.id),
    lastOccurredAt: normalizeTimestamp(row.last_occurred_at, "Transaction cursor occurredAt"),
  }));
}

function appendSqliteQueryFilters(
  conditions: string[],
  params: unknown[],
  input: ListTransactionsInput,
): void {
  if (input.accountId) {
    conditions.push("transaction_postings.account_id = ?");
    params.push(input.accountId);
  }
  const fromOccurredAt = normalizeOptionalTimestamp(
    input.fromOccurredAt,
    "Transaction query fromOccurredAt",
  );
  if (fromOccurredAt) {
    conditions.push("transaction_journals.occurred_at >= ?");
    params.push(fromOccurredAt);
  }
  const toOccurredAt = normalizeOptionalTimestamp(
    input.toOccurredAt,
    "Transaction query toOccurredAt",
  );
  if (toOccurredAt) {
    conditions.push("transaction_journals.occurred_at <= ?");
    params.push(toOccurredAt);
  }
  if (input.type) {
    conditions.push("transaction_journals.type = ?");
    params.push(input.type);
  }
  if (input.status) {
    conditions.push("transaction_journals.status = ?");
    params.push(input.status);
  } else {
    conditions.push("transaction_journals.status <> 'void'");
  }
}

function readSqliteTransactionGroupsByIds(
  client: SqliteClient,
  scope: LedgerScope,
  groupIds: readonly SyncedId[],
  filters?: ListTransactionsInput,
): readonly TransactionGroupRecord[] {
  if (groupIds.length === 0) {
    return [];
  }

  const placeholders = groupIds.map(() => "?").join(", ");
  const params: unknown[] = [scope.workspaceId, scope.ledgerId, ...groupIds];
  const filterConditions = buildSqliteHydrationFilterConditions(filters, params);
  const rows = prepareSqliteMoneyStatement<SqliteTransactionFlatRow>(
    client,
    `
      SELECT
        transaction_groups.id AS group_id,
        transaction_groups.workspace_id AS group_workspace_id,
        transaction_groups.ledger_id AS group_ledger_id,
        transaction_groups.type AS group_type,
        transaction_groups.title AS group_title,
        transaction_journals.id AS journal_id,
        transaction_journals.type AS journal_type,
        transaction_journals.occurred_at AS journal_occurred_at,
        transaction_journals.description AS journal_description,
        transaction_postings.id AS posting_id,
        transaction_postings.account_id AS posting_account_id,
        transaction_postings.amount_minor AS posting_amount_minor,
        transaction_postings.currency_code AS posting_currency_code,
        transaction_postings.reporting_amount_minor AS posting_reporting_amount_minor,
        transaction_postings.reporting_currency_code AS posting_reporting_currency_code
      FROM transaction_groups
      JOIN transaction_journals
        ON transaction_journals.group_id = transaction_groups.id
      JOIN transaction_postings
        ON transaction_postings.journal_id = transaction_journals.id
      WHERE transaction_groups.workspace_id = ?
        AND transaction_groups.ledger_id = ?
        AND transaction_groups.deleted_at IS NULL
        AND transaction_journals.deleted_at IS NULL
        AND transaction_groups.id IN (${placeholders})
        ${filterConditions.length > 0 ? `AND ${filterConditions.join(" AND ")}` : ""}
      ORDER BY transaction_journals.occurred_at DESC, transaction_groups.id DESC, transaction_journals.id ASC, transaction_postings.id ASC
    `,
  ).all(...params);

  return buildTransactionGroupsFromFlatRows(
    rows.map((row) => ({
      groupId: parseSyncedId(row.group_id),
      groupLedgerId: parseSyncedId(row.group_ledger_id),
      groupTitle: row.group_title,
      groupType: row.group_type,
      groupWorkspaceId: parseSyncedId(row.group_workspace_id),
      journalDescription: row.journal_description,
      journalId: parseSyncedId(row.journal_id),
      journalOccurredAt: row.journal_occurred_at,
      journalType: row.journal_type,
      postingAccountId: parseSyncedId(row.posting_account_id),
      postingAmountMinor: readRequiredSqliteMoneyMinor(row.posting_amount_minor, "amount_minor"),
      postingCurrencyCode: row.posting_currency_code,
      postingId: parseSyncedId(row.posting_id),
      postingReportingAmountMinor: readRequiredSqliteMoneyMinor(
        row.posting_reporting_amount_minor,
        "reporting_amount_minor",
      ),
      postingReportingCurrencyCode: row.posting_reporting_currency_code,
    })),
  );
}

function buildSqliteHydrationFilterConditions(
  input: ListTransactionsInput | undefined,
  params: unknown[],
): readonly string[] {
  if (!input) {
    return [];
  }

  const conditions: string[] = [];
  if (input.accountId) {
    conditions.push(
      "EXISTS (SELECT 1 FROM transaction_postings AS posting_filter WHERE posting_filter.journal_id = transaction_journals.id AND posting_filter.account_id = ?)",
    );
    params.push(input.accountId);
  }
  const fromOccurredAt = normalizeOptionalTimestamp(
    input.fromOccurredAt,
    "Transaction query fromOccurredAt",
  );
  if (fromOccurredAt) {
    conditions.push("transaction_journals.occurred_at >= ?");
    params.push(fromOccurredAt);
  }
  const toOccurredAt = normalizeOptionalTimestamp(
    input.toOccurredAt,
    "Transaction query toOccurredAt",
  );
  if (toOccurredAt) {
    conditions.push("transaction_journals.occurred_at <= ?");
    params.push(toOccurredAt);
  }
  if (input.type) {
    conditions.push("transaction_journals.type = ?");
    params.push(input.type);
  }
  if (input.status) {
    conditions.push("transaction_journals.status = ?");
    params.push(input.status);
  } else {
    conditions.push("transaction_journals.status <> 'void'");
  }

  return conditions;
}

function assertSqliteLedgerScope(client: SqliteClient, scope: LedgerScope): void {
  const row = client
    .prepare(
      `
        SELECT id
        FROM ledgers
        WHERE id = ?
          AND workspace_id = ?
          AND archived_at IS NULL
        LIMIT 1
      `,
    )
    .get(scope.ledgerId, scope.workspaceId);

  if (!row) {
    throw new Error("Ledger scope was not found.");
  }
}

function readSqliteAccountForTransaction(
  client: SqliteClient,
  scope: LedgerScope,
  accountId: SyncedId,
): AccountLookupRecord {
  const row = client
    .prepare<unknown[], SqliteAccountLookupRow>(
      `
        SELECT id, kind, subtype, currency_code
        FROM accounts
        WHERE id = ?
          AND workspace_id = ?
          AND ledger_id = ?
          AND is_active = 1
          AND archived_at IS NULL
        LIMIT 1
      `,
    )
    .get(accountId, scope.workspaceId, scope.ledgerId);

  if (!row) {
    throw new Error("Transaction account was not found or active.");
  }

  return {
    currencyCode: row.currency_code,
    id: parseSyncedId(row.id),
    kind: row.kind,
    subtype: row.subtype,
  };
}

function insertSqliteTransactionGroup(
  client: SqliteClient,
  input: {
    readonly group: Omit<TransactionGroupRecord, "journals">;
    readonly normalized: NormalizedCreateTransactionInput;
    readonly now: string;
  },
): void {
  client
    .prepare(
      `
        INSERT INTO transaction_groups (
          id, workspace_id, ledger_id, title, type, source, created_by, updated_by, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      input.group.id,
      input.group.workspaceId,
      input.group.ledgerId,
      input.group.title,
      input.group.type,
      input.normalized.source,
      input.normalized.createdBy,
      input.normalized.createdBy,
      input.now,
      input.now,
    );
}

function insertSqliteTransactionJournal(
  client: SqliteClient,
  input: InsertTransactionJournalInput<string>,
): TransactionJournalRecord {
  client
    .prepare(
      `
        INSERT INTO transaction_journals (
          id, workspace_id, ledger_id, group_id, type, occurred_at, description, status, source,
          created_by, updated_by, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      input.journalId,
      input.group.workspaceId,
      input.group.ledgerId,
      input.group.id,
      input.normalized.type,
      input.normalized.occurredAt,
      input.line.description,
      input.normalized.status,
      input.normalized.source,
      input.normalized.createdBy,
      input.normalized.createdBy,
      input.now,
      input.now,
    );

  const postings = buildPostings(input);
  for (const posting of postings) {
    prepareSqliteMoneyStatement(
      client,
      `
        INSERT INTO transaction_postings (
          id, workspace_id, ledger_id, journal_id, account_id, amount_minor, currency_code,
          reporting_amount_minor, reporting_currency_code, category_id, budget_id, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      posting.id,
      input.group.workspaceId,
      input.group.ledgerId,
      input.journalId,
      posting.accountId,
      bindSqliteMoneyMinor(posting.amountMinor, "amount_minor"),
      posting.currencyCode,
      bindSqliteMoneyMinor(posting.reportingAmountMinor, "reporting_amount_minor"),
      posting.reportingCurrencyCode,
      posting.accountId === input.destinationAccount.id ? input.line.categoryId : null,
      posting.accountId === input.destinationAccount.id ? input.line.budgetId : null,
      input.now,
    );
  }

  return {
    description: input.line.description,
    id: input.journalId,
    occurredAt: input.normalized.occurredAt,
    postings,
    type: input.normalized.type,
  };
}

function insertSqliteBalanceDirty(
  client: SqliteClient,
  input: {
    readonly id: SyncedId;
    readonly workspaceId: SyncedId;
    readonly ledgerId: SyncedId;
    readonly accountId: SyncedId;
    readonly currencyCode: string;
    readonly fromOccurredAt: string;
    readonly now: string;
  },
): void {
  client
    .prepare(
      `
        INSERT INTO balance_recalculation_queue (
          id, workspace_id, ledger_id, account_id, currency_code, from_occurred_at, reason, status, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `,
    )
    .run(
      input.id,
      input.workspaceId,
      input.ledgerId,
      input.accountId,
      input.currencyCode,
      input.fromOccurredAt,
      TRANSACTION_WRITE_REASON,
      input.now,
    );
}

async function assertPostgresLedgerScope(db: PostgresExecutor, scope: LedgerScope): Promise<void> {
  const rows = await db.execute(sql`
    SELECT id
    FROM ledgers
    WHERE id = ${scope.ledgerId}
      AND workspace_id = ${scope.workspaceId}
      AND archived_at IS NULL
    LIMIT 1
  `);

  if (extractRows(rows).length === 0) {
    throw new Error("Ledger scope was not found.");
  }
}

async function readPostgresAccountForTransaction(
  db: PostgresExecutor,
  scope: LedgerScope,
  accountId: SyncedId,
): Promise<AccountLookupRecord> {
  const rows = await db
    .select({
      currencyCode: pgAccounts.currencyCode,
      id: pgAccounts.id,
      kind: pgAccounts.kind,
      subtype: pgAccounts.subtype,
    })
    .from(pgAccounts)
    .where(
      and(
        eq(pgAccounts.id, accountId),
        eq(pgAccounts.workspaceId, scope.workspaceId),
        eq(pgAccounts.ledgerId, scope.ledgerId),
        eq(pgAccounts.isActive, true),
        isNull(pgAccounts.archivedAt),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error("Transaction account was not found or active.");
  }

  return {
    currencyCode: row.currencyCode,
    id: parseSyncedId(row.id),
    kind: row.kind as AccountLookupRecord["kind"],
    subtype: row.subtype as AccountLookupRecord["subtype"],
  };
}

async function listPostgresTransactionGroupIds(
  db: PostgresDatabase,
  input: ListTransactionsInput,
  scope: LedgerScope,
): Promise<readonly TransactionGroupCursorRow[]> {
  const conditions = [
    eq(pgTransactionGroups.workspaceId, scope.workspaceId),
    eq(pgTransactionGroups.ledgerId, scope.ledgerId),
    isNull(pgTransactionGroups.deletedAt),
    isNull(pgTransactionJournals.deletedAt),
  ];
  if (input.accountId) {
    conditions.push(eq(pgTransactionPostings.accountId, input.accountId));
  }
  const fromOccurredAt = normalizeOptionalTimestamp(
    input.fromOccurredAt,
    "Transaction query fromOccurredAt",
  );
  if (fromOccurredAt) {
    conditions.push(gte(pgTransactionJournals.occurredAt, new Date(fromOccurredAt)));
  }
  const toOccurredAt = normalizeOptionalTimestamp(
    input.toOccurredAt,
    "Transaction query toOccurredAt",
  );
  if (toOccurredAt) {
    conditions.push(lte(pgTransactionJournals.occurredAt, new Date(toOccurredAt)));
  }
  if (input.type) {
    conditions.push(eq(pgTransactionJournals.type, input.type));
  }
  if (input.status) {
    conditions.push(eq(pgTransactionJournals.status, input.status));
  } else {
    conditions.push(ne(pgTransactionJournals.status, "void"));
  }

  const maxOccurredAt = sql<Date>`MAX(${pgTransactionJournals.occurredAt})`;
  const cursor = input.cursor
    ? parseFinanceCursor(input.cursor, "transaction.lastOccurredAt.desc")
    : null;
  const rows = await db
    .select({ id: pgTransactionGroups.id, lastOccurredAt: maxOccurredAt })
    .from(pgTransactionGroups)
    .innerJoin(pgTransactionJournals, eq(pgTransactionJournals.groupId, pgTransactionGroups.id))
    .innerJoin(pgTransactionPostings, eq(pgTransactionPostings.journalId, pgTransactionJournals.id))
    .where(and(...conditions))
    .groupBy(pgTransactionGroups.id)
    .having(
      cursor
        ? or(
            lt(maxOccurredAt, new Date(cursor.sortKey)),
            and(eq(maxOccurredAt, new Date(cursor.sortKey)), lt(pgTransactionGroups.id, cursor.id)),
          )
        : undefined,
    )
    .orderBy(desc(maxOccurredAt), desc(pgTransactionGroups.id))
    .limit(normalizeTransactionQueryLimit(input.limit) + 1);

  return rows.map((row) => ({
    id: parseSyncedId(row.id),
    lastOccurredAt: normalizeTimestamp(
      row.lastOccurredAt instanceof Date ? row.lastOccurredAt.toISOString() : row.lastOccurredAt,
      "Transaction cursor occurredAt",
    ),
  }));
}

async function readPostgresTransactionGroupsByIds(
  db: PostgresDatabase,
  scope: LedgerScope,
  groupIds: readonly SyncedId[],
  filters?: ListTransactionsInput,
): Promise<readonly TransactionGroupRecord[]> {
  if (groupIds.length === 0) {
    return [];
  }
  const conditions: SQL[] = [
    eq(pgTransactionGroups.workspaceId, scope.workspaceId),
    eq(pgTransactionGroups.ledgerId, scope.ledgerId),
    isNull(pgTransactionGroups.deletedAt),
    isNull(pgTransactionJournals.deletedAt),
    inArray(pgTransactionGroups.id, groupIds),
    ...buildPostgresHydrationFilterConditions(filters),
  ];

  const rows = await db
    .select({
      groupId: pgTransactionGroups.id,
      groupWorkspaceId: pgTransactionGroups.workspaceId,
      groupLedgerId: pgTransactionGroups.ledgerId,
      groupType: pgTransactionGroups.type,
      groupTitle: pgTransactionGroups.title,
      journalId: pgTransactionJournals.id,
      journalType: pgTransactionJournals.type,
      journalOccurredAt: pgTransactionJournals.occurredAt,
      journalDescription: pgTransactionJournals.description,
      postingId: pgTransactionPostings.id,
      postingAccountId: pgTransactionPostings.accountId,
      postingAmountMinor: pgTransactionPostings.amountMinor,
      postingCurrencyCode: pgTransactionPostings.currencyCode,
      postingReportingAmountMinor: pgTransactionPostings.reportingAmountMinor,
      postingReportingCurrencyCode: pgTransactionPostings.reportingCurrencyCode,
    })
    .from(pgTransactionGroups)
    .innerJoin(pgTransactionJournals, eq(pgTransactionJournals.groupId, pgTransactionGroups.id))
    .innerJoin(pgTransactionPostings, eq(pgTransactionPostings.journalId, pgTransactionJournals.id))
    .where(and(...conditions))
    .orderBy(
      desc(pgTransactionJournals.occurredAt),
      desc(pgTransactionGroups.id),
      asc(pgTransactionJournals.id),
      asc(pgTransactionPostings.id),
    );

  return buildTransactionGroupsFromFlatRows(
    rows.map((row) => ({
      groupId: parseSyncedId(row.groupId),
      groupLedgerId: parseSyncedId(row.groupLedgerId),
      groupTitle: row.groupTitle,
      groupType: row.groupType as TransactionGroupRecord["type"],
      groupWorkspaceId: parseSyncedId(row.groupWorkspaceId),
      journalDescription: row.journalDescription,
      journalId: parseSyncedId(row.journalId),
      journalOccurredAt: toRequiredIsoString(row.journalOccurredAt),
      journalType: row.journalType as TransactionJournalRecord["type"],
      postingAccountId: parseSyncedId(row.postingAccountId),
      postingAmountMinor: readPostgresMoneyMinor(row.postingAmountMinor),
      postingCurrencyCode: row.postingCurrencyCode,
      postingId: parseSyncedId(row.postingId),
      postingReportingAmountMinor: readPostgresMoneyMinor(row.postingReportingAmountMinor),
      postingReportingCurrencyCode: row.postingReportingCurrencyCode,
    })),
  );
}

function buildPostgresHydrationFilterConditions(input: ListTransactionsInput | undefined): SQL[] {
  if (!input) {
    return [];
  }

  const conditions: SQL[] = [];
  if (input.accountId) {
    conditions.push(sql`
      EXISTS (
        SELECT 1
        FROM transaction_postings AS posting_filter
        WHERE posting_filter.journal_id = ${pgTransactionJournals.id}
          AND posting_filter.account_id = ${input.accountId}
      )
    `);
  }
  const fromOccurredAt = normalizeOptionalTimestamp(
    input.fromOccurredAt,
    "Transaction query fromOccurredAt",
  );
  if (fromOccurredAt) {
    conditions.push(gte(pgTransactionJournals.occurredAt, new Date(fromOccurredAt)));
  }
  const toOccurredAt = normalizeOptionalTimestamp(
    input.toOccurredAt,
    "Transaction query toOccurredAt",
  );
  if (toOccurredAt) {
    conditions.push(lte(pgTransactionJournals.occurredAt, new Date(toOccurredAt)));
  }
  if (input.type) {
    conditions.push(eq(pgTransactionJournals.type, input.type));
  }
  if (input.status) {
    conditions.push(eq(pgTransactionJournals.status, input.status));
  } else {
    conditions.push(ne(pgTransactionJournals.status, "void"));
  }

  return conditions;
}

type InsertTransactionJournalInput<TNow> = {
  readonly destinationAccount: AccountLookupRecord;
  readonly destinationPostingId: SyncedId;
  readonly group: Omit<TransactionGroupRecord, "journals">;
  readonly journalId: SyncedId;
  readonly line: NormalizedTransactionLine;
  readonly normalized: NormalizedCreateTransactionInput;
  readonly now: TNow;
  readonly sourceAccount: AccountLookupRecord;
  readonly sourcePostingId: SyncedId;
};

async function insertPostgresTransactionJournal(
  db: PostgresExecutor,
  input: InsertTransactionJournalInput<Date>,
): Promise<TransactionJournalRecord> {
  await db.insert(pgTransactionJournals).values({
    id: input.journalId,
    workspaceId: input.group.workspaceId,
    ledgerId: input.group.ledgerId,
    groupId: input.group.id,
    type: input.normalized.type,
    occurredAt: new Date(input.normalized.occurredAt),
    description: input.line.description,
    status: input.normalized.status,
    source: input.normalized.source,
    createdBy: input.normalized.createdBy,
    updatedBy: input.normalized.createdBy,
    createdAt: input.now,
    updatedAt: input.now,
  });

  const postings = buildPostings(input);
  await db.insert(pgTransactionPostings).values(
    postings.map((posting) => ({
      id: posting.id,
      workspaceId: input.group.workspaceId,
      ledgerId: input.group.ledgerId,
      journalId: input.journalId,
      accountId: posting.accountId,
      amountMinor: posting.amountMinor,
      currencyCode: posting.currencyCode,
      reportingAmountMinor: posting.reportingAmountMinor,
      reportingCurrencyCode: posting.reportingCurrencyCode,
      categoryId: posting.accountId === input.destinationAccount.id ? input.line.categoryId : null,
      budgetId: posting.accountId === input.destinationAccount.id ? input.line.budgetId : null,
      createdAt: input.now,
    })),
  );

  return {
    description: input.line.description,
    id: input.journalId,
    occurredAt: input.normalized.occurredAt,
    postings,
    type: input.normalized.type,
  };
}

function buildPostings(
  input: InsertTransactionJournalInput<unknown>,
): readonly TransactionPostingRecord[] {
  return [
    {
      accountId: input.sourceAccount.id,
      amountMinor: -input.line.amountMinor,
      currencyCode: input.normalized.currencyCode,
      id: input.sourcePostingId,
      reportingAmountMinor: -input.line.reportingAmountMinor,
      reportingCurrencyCode: input.line.reportingCurrencyCode,
    },
    {
      accountId: input.destinationAccount.id,
      amountMinor: input.line.amountMinor,
      currencyCode: input.normalized.currencyCode,
      id: input.destinationPostingId,
      reportingAmountMinor: input.line.reportingAmountMinor,
      reportingCurrencyCode: input.line.reportingCurrencyCode,
    },
  ];
}

type TransactionFlatRecord = {
  readonly groupId: SyncedId;
  readonly groupWorkspaceId: SyncedId;
  readonly groupLedgerId: SyncedId;
  readonly groupType: TransactionGroupRecord["type"];
  readonly groupTitle: string;
  readonly journalId: SyncedId;
  readonly journalType: TransactionJournalRecord["type"];
  readonly journalOccurredAt: string;
  readonly journalDescription: string;
  readonly postingId: SyncedId;
  readonly postingAccountId: SyncedId;
  readonly postingAmountMinor: bigint;
  readonly postingCurrencyCode: string;
  readonly postingReportingAmountMinor: bigint;
  readonly postingReportingCurrencyCode: string;
};

function buildTransactionGroupsFromFlatRows(
  rows: readonly TransactionFlatRecord[],
): readonly TransactionGroupRecord[] {
  const groups = new Map<
    SyncedId,
    Omit<TransactionGroupRecord, "journals"> & {
      readonly journals: Map<
        SyncedId,
        TransactionJournalRecord & { postings: TransactionPostingRecord[] }
      >;
    }
  >();

  for (const row of rows) {
    let group = groups.get(row.groupId);
    if (!group) {
      group = {
        id: row.groupId,
        workspaceId: row.groupWorkspaceId,
        ledgerId: row.groupLedgerId,
        title: row.groupTitle,
        type: row.groupType,
        journals: new Map(),
      };
      groups.set(row.groupId, group);
    }

    let journal = group.journals.get(row.journalId);
    if (!journal) {
      journal = {
        description: row.journalDescription,
        id: row.journalId,
        occurredAt: row.journalOccurredAt,
        postings: [],
        type: row.journalType,
      };
      group.journals.set(row.journalId, journal);
    }

    journal.postings.push({
      accountId: row.postingAccountId,
      amountMinor: row.postingAmountMinor,
      currencyCode: row.postingCurrencyCode,
      id: row.postingId,
      reportingAmountMinor: row.postingReportingAmountMinor,
      reportingCurrencyCode: row.postingReportingCurrencyCode,
    });
  }

  return Array.from(groups.values()).map((group) => ({
    id: group.id,
    workspaceId: group.workspaceId,
    ledgerId: group.ledgerId,
    title: group.title,
    type: group.type,
    journals: Array.from(group.journals.values()).map((journal) => ({
      description: journal.description,
      id: journal.id,
      occurredAt: journal.occurredAt,
      postings: journal.postings,
      type: journal.type,
    })),
  }));
}

function uniqueAccountIds(
  sourceAccount: AccountLookupRecord,
  destinationAccounts: readonly AccountLookupRecord[],
): readonly SyncedId[] {
  return Array.from(
    new Set([sourceAccount.id, ...destinationAccounts.map((account) => account.id)]),
  );
}

function readPostgresMoneyMinor(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === "string" && /^-?(0|[1-9][0-9]*)$/.test(value)) {
    return BigInt(value);
  }

  throw new TypeError("PostgreSQL money value must be an integer.");
}

function toRequiredIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function runPostgresWrite<TResult>(
  db: PostgresExecutor,
  callback: (tx: PostgresExecutor) => Promise<TResult>,
): Promise<TResult> {
  return "transaction" in db ? db.transaction(callback) : callback(db);
}

function extractRows(result: unknown): readonly unknown[] {
  if (Array.isArray(result)) {
    return result;
  }
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { readonly rows?: unknown }).rows;
    return Array.isArray(rows) ? rows : [];
  }

  return [];
}
