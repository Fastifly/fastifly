import type { LedgerScope } from "@fastifly/common";
import { and, eq, gte, isNull, lt, ne, sql } from "drizzle-orm";

import type { PostgresDatabase } from "../postgres/client.js";
import {
  pgAccounts,
  pgLedgers,
  pgTransactionJournals,
  pgTransactionPostings,
} from "../postgres/schema.js";
import type { SqliteClient } from "../sqlite/client.js";
import { prepareSqliteMoneyStatement, readRequiredSqliteMoneyMinor } from "../sqlite/money.js";
import { assertLedgerScope } from "./base.js";

const NET_WORTH_MONTHS_DEFAULT = 6;
const NET_WORTH_MONTHS_MAX = 24;

export type NetWorthTrendDirection = "down" | "flat" | "up";

export type NetWorthTrendPointRecord = {
  readonly changeMinor: bigint;
  readonly direction: NetWorthTrendDirection;
  readonly monthKey: string;
  readonly monthStart: string;
  readonly netWorthMinor: bigint;
};

export type NetWorthTrendRecord = {
  readonly currencyCode: string;
  readonly months: number;
  readonly points: readonly NetWorthTrendPointRecord[];
  readonly range: {
    readonly fromMonth: string;
    readonly toMonth: string;
  };
};

export type GetNetWorthTrendInput = LedgerScope & {
  readonly asOfDate?: string | null;
  readonly months?: number | null;
};

export type ReportQueryService = {
  readonly getNetWorthTrend: (input: GetNetWorthTrendInput) => Promise<NetWorthTrendRecord>;
};

type SqliteLedgerCurrencyRow = {
  readonly base_currency_code: string;
};

type SqliteMonthlyDeltaRow = {
  readonly delta_minor: bigint | number | string;
  readonly month_key: string;
};

export function createSqliteReportQueryService(client: SqliteClient): ReportQueryService {
  return {
    async getNetWorthTrend(scopeInput) {
      const scope = assertLedgerScope(scopeInput);
      const months = normalizeMonths(scopeInput.months);
      const buckets = createMonthBuckets(resolveReferenceDate(scopeInput.asOfDate), months);
      const range = makeRange(buckets);
      const endExclusive = addOneMonthIsoUtc(
        buckets[buckets.length - 1]?.monthStart ?? range.toMonth,
      );
      const ledgerCurrency = readSqliteLedgerCurrency(client, scope);

      const baselineMinor = readSqliteNetWorthBaseline(client, scope, range.fromMonth);
      const monthlyDeltas = readSqliteMonthlyNetWorthDeltas(
        client,
        scope,
        range.fromMonth,
        endExclusive,
      );

      return makeNetWorthTrendResult({
        baselineMinor,
        buckets,
        currencyCode: ledgerCurrency,
        monthlyDeltas,
      });
    },
  };
}

export function createPostgresReportQueryService(db: PostgresDatabase): ReportQueryService {
  return {
    async getNetWorthTrend(scopeInput) {
      const scope = assertLedgerScope(scopeInput);
      const months = normalizeMonths(scopeInput.months);
      const buckets = createMonthBuckets(resolveReferenceDate(scopeInput.asOfDate), months);
      const range = makeRange(buckets);
      const endExclusive = addOneMonthIsoUtc(
        buckets[buckets.length - 1]?.monthStart ?? range.toMonth,
      );
      const fromMonthDate = toUtcDayStart(range.fromMonth);
      const endExclusiveDate = new Date(endExclusive);

      const [ledgerRow] = await db
        .select({
          baseCurrencyCode: pgLedgers.baseCurrencyCode,
        })
        .from(pgLedgers)
        .where(and(eq(pgLedgers.id, scope.ledgerId), eq(pgLedgers.workspaceId, scope.workspaceId)))
        .limit(1);

      if (!ledgerRow) {
        throw new Error("Ledger was not found in report scope.");
      }

      const [baselineRow] = await db
        .select({
          baselineMinor: sql<string>`COALESCE(SUM(${pgTransactionPostings.reportingAmountMinor}), 0)::text`,
        })
        .from(pgTransactionPostings)
        .innerJoin(
          pgAccounts,
          and(
            eq(pgAccounts.id, pgTransactionPostings.accountId),
            eq(pgAccounts.workspaceId, pgTransactionPostings.workspaceId),
            eq(pgAccounts.ledgerId, pgTransactionPostings.ledgerId),
          ),
        )
        .innerJoin(
          pgTransactionJournals,
          and(
            eq(pgTransactionJournals.id, pgTransactionPostings.journalId),
            eq(pgTransactionJournals.workspaceId, pgTransactionPostings.workspaceId),
            eq(pgTransactionJournals.ledgerId, pgTransactionPostings.ledgerId),
          ),
        )
        .where(
          and(
            eq(pgTransactionPostings.workspaceId, scope.workspaceId),
            eq(pgTransactionPostings.ledgerId, scope.ledgerId),
            sql`${pgAccounts.kind} IN ('asset', 'liability')`,
            isNull(pgTransactionJournals.deletedAt),
            ne(pgTransactionJournals.status, "void"),
            lt(pgTransactionJournals.occurredAt, fromMonthDate),
          ),
        );

      const monthlyRows = await db
        .select({
          deltaMinor: sql<string>`COALESCE(SUM(${pgTransactionPostings.reportingAmountMinor}), 0)::text`,
          monthKey: sql<string>`to_char(date_trunc('month', ${pgTransactionJournals.occurredAt} AT TIME ZONE 'UTC'), 'YYYY-MM')`,
        })
        .from(pgTransactionPostings)
        .innerJoin(
          pgAccounts,
          and(
            eq(pgAccounts.id, pgTransactionPostings.accountId),
            eq(pgAccounts.workspaceId, pgTransactionPostings.workspaceId),
            eq(pgAccounts.ledgerId, pgTransactionPostings.ledgerId),
          ),
        )
        .innerJoin(
          pgTransactionJournals,
          and(
            eq(pgTransactionJournals.id, pgTransactionPostings.journalId),
            eq(pgTransactionJournals.workspaceId, pgTransactionPostings.workspaceId),
            eq(pgTransactionJournals.ledgerId, pgTransactionPostings.ledgerId),
          ),
        )
        .where(
          and(
            eq(pgTransactionPostings.workspaceId, scope.workspaceId),
            eq(pgTransactionPostings.ledgerId, scope.ledgerId),
            sql`${pgAccounts.kind} IN ('asset', 'liability')`,
            isNull(pgTransactionJournals.deletedAt),
            ne(pgTransactionJournals.status, "void"),
            gte(pgTransactionJournals.occurredAt, fromMonthDate),
            lt(pgTransactionJournals.occurredAt, endExclusiveDate),
          ),
        )
        .groupBy(sql`date_trunc('month', ${pgTransactionJournals.occurredAt} AT TIME ZONE 'UTC')`);

      const monthlyDeltas = new Map<string, bigint>();
      for (const row of monthlyRows) {
        monthlyDeltas.set(row.monthKey, toBigInt(row.deltaMinor));
      }

      return makeNetWorthTrendResult({
        baselineMinor: toBigInt(baselineRow?.baselineMinor ?? "0"),
        buckets,
        currencyCode: ledgerRow.baseCurrencyCode,
        monthlyDeltas,
      });
    },
  };
}

function normalizeMonths(input?: number | null): number {
  if (!input || Number.isNaN(input)) {
    return NET_WORTH_MONTHS_DEFAULT;
  }

  return Math.max(1, Math.min(NET_WORTH_MONTHS_MAX, Math.trunc(input)));
}

function resolveReferenceDate(asOfDate?: string | null): Date {
  if (!asOfDate) {
    return new Date();
  }

  return new Date(`${asOfDate}T00:00:00.000Z`);
}

function createMonthBuckets(
  now: Date,
  months: number,
): readonly { monthKey: string; monthStart: string }[] {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  start.setUTCMonth(start.getUTCMonth() - (months - 1));

  const buckets: { monthKey: string; monthStart: string }[] = [];
  for (let offset = 0; offset < months; offset += 1) {
    const current = new Date(start);
    current.setUTCMonth(start.getUTCMonth() + offset);
    const monthStart = toIsoDate(current);
    buckets.push({
      monthKey: monthStart.slice(0, 7),
      monthStart,
    });
  }

  return buckets;
}

function makeRange(buckets: readonly { monthStart: string }[]): {
  fromMonth: string;
  toMonth: string;
} {
  const fromMonth = buckets[0]?.monthStart ?? toIsoDate(new Date());
  const toMonth = buckets[buckets.length - 1]?.monthStart ?? fromMonth;

  return {
    fromMonth,
    toMonth,
  };
}

function addOneMonthIsoUtc(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString();
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toUtcDayStart(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function readSqliteLedgerCurrency(client: SqliteClient, scope: LedgerScope): string {
  const row = client
    .prepare<unknown[], SqliteLedgerCurrencyRow>(
      `
        SELECT base_currency_code
        FROM ledgers
        WHERE workspace_id = ?
          AND id = ?
        LIMIT 1
      `,
    )
    .get(scope.workspaceId, scope.ledgerId);

  if (!row) {
    throw new Error("Ledger was not found in report scope.");
  }

  return row.base_currency_code;
}

function readSqliteNetWorthBaseline(
  client: SqliteClient,
  scope: LedgerScope,
  fromMonth: string,
): bigint {
  const row = prepareSqliteMoneyStatement<{ baseline_minor: bigint | number | string }>(
    client,
    `
      SELECT COALESCE(SUM(transaction_postings.reporting_amount_minor), 0) AS baseline_minor
      FROM transaction_postings
      INNER JOIN accounts
        ON accounts.id = transaction_postings.account_id
       AND accounts.workspace_id = transaction_postings.workspace_id
       AND accounts.ledger_id = transaction_postings.ledger_id
      INNER JOIN transaction_journals
        ON transaction_journals.id = transaction_postings.journal_id
       AND transaction_journals.workspace_id = transaction_postings.workspace_id
       AND transaction_journals.ledger_id = transaction_postings.ledger_id
      WHERE transaction_postings.workspace_id = ?
        AND transaction_postings.ledger_id = ?
        AND accounts.kind IN ('asset', 'liability')
        AND transaction_journals.deleted_at IS NULL
        AND transaction_journals.status <> 'void'
        AND transaction_journals.occurred_at < ?
    `,
  ).get(scope.workspaceId, scope.ledgerId, `${fromMonth}T00:00:00.000Z`);

  return readRequiredSqliteMoneyMinor(row?.baseline_minor ?? 0, "reporting_amount_minor");
}

function readSqliteMonthlyNetWorthDeltas(
  client: SqliteClient,
  scope: LedgerScope,
  fromMonth: string,
  endExclusiveIso: string,
): Map<string, bigint> {
  const rows = prepareSqliteMoneyStatement<SqliteMonthlyDeltaRow>(
    client,
    `
      SELECT
        substr(transaction_journals.occurred_at, 1, 7) AS month_key,
        COALESCE(SUM(transaction_postings.reporting_amount_minor), 0) AS delta_minor
      FROM transaction_postings
      INNER JOIN accounts
        ON accounts.id = transaction_postings.account_id
       AND accounts.workspace_id = transaction_postings.workspace_id
       AND accounts.ledger_id = transaction_postings.ledger_id
      INNER JOIN transaction_journals
        ON transaction_journals.id = transaction_postings.journal_id
       AND transaction_journals.workspace_id = transaction_postings.workspace_id
       AND transaction_journals.ledger_id = transaction_postings.ledger_id
      WHERE transaction_postings.workspace_id = ?
        AND transaction_postings.ledger_id = ?
        AND accounts.kind IN ('asset', 'liability')
        AND transaction_journals.deleted_at IS NULL
        AND transaction_journals.status <> 'void'
        AND transaction_journals.occurred_at >= ?
        AND transaction_journals.occurred_at < ?
      GROUP BY month_key
    `,
  ).all(scope.workspaceId, scope.ledgerId, `${fromMonth}T00:00:00.000Z`, endExclusiveIso);

  const result = new Map<string, bigint>();
  for (const row of rows) {
    result.set(
      row.month_key,
      readRequiredSqliteMoneyMinor(row.delta_minor, "reporting_amount_minor"),
    );
  }

  return result;
}

function makeNetWorthTrendResult(input: {
  readonly baselineMinor: bigint;
  readonly buckets: readonly { monthKey: string; monthStart: string }[];
  readonly currencyCode: string;
  readonly monthlyDeltas: Map<string, bigint>;
}): NetWorthTrendRecord {
  let runningMinor = input.baselineMinor;
  const points: NetWorthTrendPointRecord[] = [];

  for (const bucket of input.buckets) {
    const changeMinor = input.monthlyDeltas.get(bucket.monthKey) ?? 0n;
    runningMinor += changeMinor;
    points.push({
      changeMinor,
      direction: toDirection(changeMinor),
      monthKey: bucket.monthKey,
      monthStart: bucket.monthStart,
      netWorthMinor: runningMinor,
    });
  }

  return {
    currencyCode: input.currencyCode,
    months: input.buckets.length,
    points,
    range: {
      fromMonth: input.buckets[0]?.monthStart ?? toIsoDate(new Date()),
      toMonth: input.buckets[input.buckets.length - 1]?.monthStart ?? toIsoDate(new Date()),
    },
  };
}

function toDirection(value: bigint): NetWorthTrendDirection {
  if (value > 0n) {
    return "up";
  }
  if (value < 0n) {
    return "down";
  }
  return "flat";
}

function toBigInt(value: string | number | bigint): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    return BigInt(Math.trunc(value));
  }
  return BigInt(value);
}
