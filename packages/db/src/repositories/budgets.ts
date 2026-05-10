import {
  encodeFinanceCursor,
  type LedgerScope,
  parseFinanceCursor,
  parseSyncedId,
  type SyncedId,
} from "@fastifly/common";
import { and, asc, eq, gt, gte, isNull, lte, or, type SQL, sql } from "drizzle-orm";

import type { PostgresDatabase } from "../postgres/client.js";
import {
  pgBudgetLimits,
  pgBudgets,
  pgTransactionJournals,
  pgTransactionPostings,
} from "../postgres/schema.js";
import type { SqliteClient } from "../sqlite/client.js";
import { prepareSqliteMoneyStatement, readRequiredSqliteMoneyMinor } from "../sqlite/money.js";
import type { RepositoryListPage } from "./base.js";
import { assertLedgerScope } from "./base.js";

const BUDGET_QUERY_LIMIT_DEFAULT = 50;
const BUDGET_QUERY_LIMIT_MAX = 100;
const BUDGET_CURSOR_KIND = "budget.name.asc";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type BudgetPeriod =
  | "weekly"
  | "bi_weekly"
  | "semi_monthly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "custom";

export type BudgetSummaryRecord = {
  readonly id: SyncedId;
  readonly workspaceId: SyncedId;
  readonly ledgerId: SyncedId;
  readonly name: string;
  readonly currencyCode: string;
  readonly period: BudgetPeriod;
  readonly rolloverEnabled: boolean;
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly limitMinor: bigint;
  readonly spentMinor: bigint;
  readonly remainingMinor: bigint;
};

export type ListBudgetsInput = LedgerScope & {
  readonly asOfDate?: string | null;
  readonly cursor?: string | null;
  readonly limit?: number | null;
};

export type BudgetQueryService = {
  readonly listBudgets: (
    input: ListBudgetsInput,
  ) => Promise<RepositoryListPage<BudgetSummaryRecord>>;
};

type SqliteBudgetRow = {
  readonly id: string;
  readonly workspace_id: string;
  readonly ledger_id: string;
  readonly name: string;
  readonly currency_code: string;
  readonly period: string;
  readonly rollover_enabled: bigint | number | string | boolean;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

type SqliteBudgetWindowRow = {
  readonly limit_minor: bigint | number | string;
  readonly start_date: string | null;
  readonly end_date: string | null;
};

type SqliteBudgetSpentRow = {
  readonly spent_minor: bigint | number | string;
};

type PostgresBudgetSpentRow = {
  readonly spentMinor: string | bigint | number;
};

export function createSqliteBudgetQueryService(client: SqliteClient): BudgetQueryService {
  return {
    async listBudgets(scopeInput) {
      const scope = assertLedgerScope(scopeInput);
      const asOfDate = normalizeAsOfDate(scopeInput.asOfDate);
      const limit = normalizeLimit(scopeInput.limit);
      const cursor = scopeInput.cursor
        ? parseFinanceCursor(scopeInput.cursor, BUDGET_CURSOR_KIND)
        : null;
      const cursorClause = cursor ? "AND (name > ? OR (name = ? AND id > ?))" : "";
      const queryParams = cursor
        ? [scope.workspaceId, scope.ledgerId, cursor.sortKey, cursor.sortKey, cursor.id, limit + 1]
        : [scope.workspaceId, scope.ledgerId, limit + 1];
      const rows = client
        .prepare<unknown[], SqliteBudgetRow>(
          `
            SELECT id, workspace_id, ledger_id, name, currency_code, period, rollover_enabled, archived_at, created_at, updated_at
            FROM budgets
            WHERE workspace_id = ?
              AND ledger_id = ?
              AND archived_at IS NULL
              ${cursorClause}
            ORDER BY name, id
            LIMIT ?
          `,
        )
        .all(...queryParams);

      const pageRows = rows.slice(0, limit);
      const items = pageRows.map((row) => {
        const budget = toSqliteBudgetSummaryBase(row);
        const progress = readSqliteBudgetProgress(client, scope, budget.id, asOfDate);
        return {
          ...budget,
          limitMinor: progress.limitMinor,
          spentMinor: progress.spentMinor,
          remainingMinor: progress.limitMinor - progress.spentMinor,
        };
      });

      const hasNextPage = rows.length > limit;
      const last = items[items.length - 1];

      return {
        hasNextPage,
        items,
        nextCursor:
          hasNextPage && last
            ? encodeFinanceCursor({
                id: last.id,
                kind: BUDGET_CURSOR_KIND,
                sortKey: last.name,
                v: 1,
              })
            : null,
      };
    },
  };
}

export function createPostgresBudgetQueryService(db: PostgresDatabase): BudgetQueryService {
  return {
    async listBudgets(scopeInput) {
      const scope = assertLedgerScope(scopeInput);
      const asOfDate = normalizeAsOfDate(scopeInput.asOfDate);
      const limit = normalizeLimit(scopeInput.limit);
      const cursor = scopeInput.cursor
        ? parseFinanceCursor(scopeInput.cursor, BUDGET_CURSOR_KIND)
        : null;
      const conditions: SQL[] = [
        eq(pgBudgets.workspaceId, scope.workspaceId),
        eq(pgBudgets.ledgerId, scope.ledgerId),
        isNull(pgBudgets.archivedAt),
      ];
      if (cursor) {
        conditions.push(
          or(
            gt(pgBudgets.name, cursor.sortKey),
            and(eq(pgBudgets.name, cursor.sortKey), gt(pgBudgets.id, cursor.id)),
          ) as SQL,
        );
      }
      const rows = await db
        .select({
          id: pgBudgets.id,
          workspaceId: pgBudgets.workspaceId,
          ledgerId: pgBudgets.ledgerId,
          name: pgBudgets.name,
          currencyCode: pgBudgets.currencyCode,
          period: pgBudgets.period,
          rolloverEnabled: pgBudgets.rolloverEnabled,
          archivedAt: pgBudgets.archivedAt,
          createdAt: pgBudgets.createdAt,
          updatedAt: pgBudgets.updatedAt,
        })
        .from(pgBudgets)
        .where(and(...conditions))
        .orderBy(asc(pgBudgets.name), asc(pgBudgets.id))
        .limit(limit + 1);

      const pageRows = rows.slice(0, limit);
      const items = await Promise.all(
        pageRows.map(async (row) => {
          const budget = toPostgresBudgetSummaryBase(row);
          const progress = await readPostgresBudgetProgress(db, scope, budget.id, asOfDate);
          return {
            ...budget,
            limitMinor: progress.limitMinor,
            spentMinor: progress.spentMinor,
            remainingMinor: progress.limitMinor - progress.spentMinor,
          };
        }),
      );
      const hasNextPage = rows.length > limit;
      const last = items[items.length - 1];

      return {
        hasNextPage,
        items,
        nextCursor:
          hasNextPage && last
            ? encodeFinanceCursor({
                id: last.id,
                kind: BUDGET_CURSOR_KIND,
                sortKey: last.name,
                v: 1,
              })
            : null,
      };
    },
  };
}

function normalizeLimit(input?: number | null): number {
  if (!input) {
    return BUDGET_QUERY_LIMIT_DEFAULT;
  }

  return Math.max(1, Math.min(BUDGET_QUERY_LIMIT_MAX, Math.trunc(input)));
}

function normalizeAsOfDate(input?: string | null): string {
  if (!input) {
    return new Date().toISOString().slice(0, 10);
  }
  if (!ISO_DATE_PATTERN.test(input)) {
    throw new Error("Budget asOfDate must use YYYY-MM-DD format.");
  }

  return input;
}

function toSqliteBudgetSummaryBase(
  row: SqliteBudgetRow,
): Omit<BudgetSummaryRecord, "limitMinor" | "spentMinor" | "remainingMinor"> {
  return {
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    currencyCode: row.currency_code,
    id: parseSyncedId(row.id),
    ledgerId: parseSyncedId(row.ledger_id),
    name: row.name,
    period: row.period as BudgetSummaryRecord["period"],
    rolloverEnabled: readSqliteBoolean(row.rollover_enabled),
    updatedAt: row.updated_at,
    workspaceId: parseSyncedId(row.workspace_id),
  };
}

function toPostgresBudgetSummaryBase(row: {
  readonly id: string;
  readonly workspaceId: string;
  readonly ledgerId: string;
  readonly name: string;
  readonly currencyCode: string;
  readonly period: string;
  readonly rolloverEnabled: boolean;
  readonly archivedAt: Date | string | null;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
}): Omit<BudgetSummaryRecord, "limitMinor" | "spentMinor" | "remainingMinor"> {
  return {
    archivedAt: toIsoTimestamp(row.archivedAt),
    createdAt: toRequiredIsoTimestamp(row.createdAt, "budget.createdAt"),
    currencyCode: row.currencyCode,
    id: parseSyncedId(row.id),
    ledgerId: parseSyncedId(row.ledgerId),
    name: row.name,
    period: row.period as BudgetSummaryRecord["period"],
    rolloverEnabled: row.rolloverEnabled,
    updatedAt: toRequiredIsoTimestamp(row.updatedAt, "budget.updatedAt"),
    workspaceId: parseSyncedId(row.workspaceId),
  };
}

function readSqliteBudgetProgress(
  client: SqliteClient,
  scope: LedgerScope,
  budgetId: SyncedId,
  asOfDate: string,
): {
  readonly limitMinor: bigint;
  readonly spentMinor: bigint;
} {
  const window = prepareSqliteMoneyStatement<SqliteBudgetWindowRow>(
    client,
    `
      SELECT
        COALESCE(SUM(amount_minor), 0) AS limit_minor,
        MIN(start_date) AS start_date,
        MAX(end_date) AS end_date
      FROM budget_limits
      WHERE budget_id = ?
        AND start_date <= ?
        AND end_date >= ?
    `,
  ).get(budgetId, asOfDate, asOfDate);

  const limitMinor = readRequiredSqliteMoneyMinor(window?.limit_minor ?? 0, "amount_minor");

  if (!window?.start_date || !window.end_date) {
    return {
      limitMinor,
      spentMinor: 0n,
    };
  }

  const spent = prepareSqliteMoneyStatement<SqliteBudgetSpentRow>(
    client,
    `
      SELECT COALESCE(SUM(ABS(transaction_postings.amount_minor)), 0) AS spent_minor
      FROM transaction_postings
      INNER JOIN transaction_journals ON transaction_journals.id = transaction_postings.journal_id
      WHERE transaction_postings.workspace_id = ?
        AND transaction_postings.ledger_id = ?
        AND transaction_postings.budget_id = ?
        AND transaction_journals.workspace_id = ?
        AND transaction_journals.ledger_id = ?
        AND transaction_journals.deleted_at IS NULL
        AND transaction_journals.status <> 'void'
        AND date(transaction_journals.occurred_at) >= ?
        AND date(transaction_journals.occurred_at) <= ?
    `,
  ).get(
    scope.workspaceId,
    scope.ledgerId,
    budgetId,
    scope.workspaceId,
    scope.ledgerId,
    window.start_date,
    window.end_date,
  );

  return {
    limitMinor,
    spentMinor: readRequiredSqliteMoneyMinor(spent?.spent_minor ?? 0, "money"),
  };
}

async function readPostgresBudgetProgress(
  db: PostgresDatabase,
  scope: LedgerScope,
  budgetId: SyncedId,
  asOfDate: string,
): Promise<{
  readonly limitMinor: bigint;
  readonly spentMinor: bigint;
}> {
  const [window] = await db
    .select({
      limitMinor: sql<string>`COALESCE(SUM(${pgBudgetLimits.amountMinor}), 0)::text`,
      startDate: sql<string | null>`MIN(${pgBudgetLimits.startDate})`,
      endDate: sql<string | null>`MAX(${pgBudgetLimits.endDate})`,
    })
    .from(pgBudgetLimits)
    .where(
      and(
        eq(pgBudgetLimits.budgetId, budgetId),
        lte(pgBudgetLimits.startDate, asOfDate),
        gte(pgBudgetLimits.endDate, asOfDate),
      ),
    );

  const limitMinor = toBigInt(window?.limitMinor ?? "0");
  if (!window?.startDate || !window.endDate) {
    return {
      limitMinor,
      spentMinor: 0n,
    };
  }

  const [spent] = await db
    .select({
      spentMinor: sql<string>`COALESCE(SUM(ABS(${pgTransactionPostings.amountMinor})), 0)::text`,
    })
    .from(pgTransactionPostings)
    .innerJoin(pgTransactionJournals, eq(pgTransactionPostings.journalId, pgTransactionJournals.id))
    .where(
      and(
        eq(pgTransactionPostings.workspaceId, scope.workspaceId),
        eq(pgTransactionPostings.ledgerId, scope.ledgerId),
        eq(pgTransactionPostings.budgetId, budgetId),
        eq(pgTransactionJournals.workspaceId, scope.workspaceId),
        eq(pgTransactionJournals.ledgerId, scope.ledgerId),
        isNull(pgTransactionJournals.deletedAt),
        sql`${pgTransactionJournals.status} <> 'void'`,
        gte(sql`date(${pgTransactionJournals.occurredAt})`, window.startDate),
        lte(sql`date(${pgTransactionJournals.occurredAt})`, window.endDate),
      ),
    );

  return {
    limitMinor,
    spentMinor: toBigInt((spent as PostgresBudgetSpentRow | undefined)?.spentMinor ?? "0"),
  };
}

function readSqliteBoolean(value: bigint | number | string | boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") {
    return value !== 0n;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (value === "0") {
    return false;
  }
  if (value === "1") {
    return true;
  }

  return Boolean(value);
}

function toBigInt(value: string | number | bigint): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    return BigInt(value);
  }

  return BigInt(value);
}

function toIsoTimestamp(input: Date | string | null): string | null {
  if (input === null) {
    return null;
  }
  if (input instanceof Date) {
    return input.toISOString();
  }

  return input;
}

function toRequiredIsoTimestamp(input: Date | string, label: string): string {
  if (input instanceof Date) {
    return input.toISOString();
  }
  if (input.length < 1) {
    throw new Error(`${label} must not be empty.`);
  }

  return input;
}
