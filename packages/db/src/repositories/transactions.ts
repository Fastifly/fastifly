import {
  createUuidV7,
  inferTransactionType,
  type LedgerScope,
  parseSyncedId,
  type SyncedId,
  type UserFacingTransactionType,
} from "@fastifly/common";
import { and, eq, isNull, sql } from "drizzle-orm";

import type { PostgresDatabase } from "../postgres/client.js";
import {
  pgAccounts,
  pgBalanceRecalculationQueue,
  pgTransactionGroups,
  pgTransactionJournals,
  pgTransactionPostings,
} from "../postgres/schema.js";
import type { SqliteClient } from "../sqlite/client.js";
import { bindSqliteMoneyMinor, prepareSqliteMoneyStatement } from "../sqlite/money.js";
import type { RepositoryClock } from "./base.js";
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
  readonly createTransaction: (input: CreateTransactionInput) => Promise<TransactionGroupRecord>;
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
    async createTransaction(input) {
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
  db: PostgresDatabase,
  options?: TransactionWriteRepositoryOptions,
): TransactionWriteRepository {
  const resolved = resolveOptions(options);

  return {
    async createTransaction(input) {
      const scope = assertLedgerScope(input);
      const normalized = normalizeCreateTransactionInput(input);

      return db.transaction(async (tx) => {
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

function uniqueAccountIds(
  sourceAccount: AccountLookupRecord,
  destinationAccounts: readonly AccountLookupRecord[],
): readonly SyncedId[] {
  return Array.from(
    new Set([sourceAccount.id, ...destinationAccounts.map((account) => account.id)]),
  );
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
