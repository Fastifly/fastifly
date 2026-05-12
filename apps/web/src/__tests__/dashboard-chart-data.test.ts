import type { CategoryResponse, TransactionGroupResponse } from "@fastifly/common";
import { describe, expect, it } from "vitest";
import {
  buildMonthlyCashflowSeries,
  buildSpendingByCategorySeries,
} from "../ui/app-shell/dashboard-chart-data";

describe("dashboard chart data helpers", () => {
  it("builds six-month income and spending series with zero-filled months", () => {
    const transactions = [
      transaction({
        id: "txn-1",
        occurredAt: "2026-03-12T10:00:00.000Z",
        postings: [posting("acct-salary", "-450000"), posting("acct-bank", "450000")],
        type: "income",
      }),
      transaction({
        id: "txn-2",
        occurredAt: "2026-03-14T10:00:00.000Z",
        postings: [posting("acct-bank", "-12000"), posting("acct-groceries", "12000")],
        type: "expense",
      }),
      transaction({
        id: "txn-2b-split",
        occurredAt: "2026-03-16T10:00:00.000Z",
        postings: [posting("acct-bank", "-5000"), posting("acct-utilities", "5000")],
        type: "split",
        journalType: "expense",
      }),
      transaction({
        id: "txn-3",
        occurredAt: "2026-05-05T10:00:00.000Z",
        postings: [posting("acct-bank", "-8000"), posting("acct-fuel", "8000")],
        type: "expense",
      }),
    ] as const;

    const series = buildMonthlyCashflowSeries({
      months: 6,
      now: new Date("2026-05-20T00:00:00.000Z"),
      transactions,
    });

    expect(series).toHaveLength(6);
    expect(series.map((point) => point.monthKey)).toEqual([
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
    ]);

    const march = series.find((point) => point.monthKey === "2026-03");
    const may = series.find((point) => point.monthKey === "2026-05");
    const april = series.find((point) => point.monthKey === "2026-04");

    expect(march).toMatchObject({
      incomeMinor: 450000n,
      expenseMinor: 17000n,
    });
    expect(may).toMatchObject({
      incomeMinor: 0n,
      expenseMinor: 8000n,
    });
    expect(april).toMatchObject({
      incomeMinor: 0n,
      expenseMinor: 0n,
    });
  });

  it("builds top spending categories using category counterparty account mapping", () => {
    const categories = [
      category("cat-groceries", "Groceries", "acct-groceries"),
      category("cat-utilities", "Utilities", "acct-utilities"),
    ] as const;
    const transactions = [
      transaction({
        id: "txn-1",
        occurredAt: "2026-05-10T10:00:00.000Z",
        postings: [posting("acct-bank", "-12000"), posting("acct-groceries", "12000")],
        type: "expense",
      }),
      transaction({
        id: "txn-2",
        occurredAt: "2026-05-11T10:00:00.000Z",
        postings: [posting("acct-bank", "-7000"), posting("acct-utilities", "7000")],
        type: "expense",
      }),
      transaction({
        id: "txn-3",
        occurredAt: "2026-05-12T10:00:00.000Z",
        postings: [posting("acct-bank", "-5000"), posting("acct-legacy", "5000")],
        type: "expense",
      }),
      transaction({
        id: "txn-4-split",
        occurredAt: "2026-05-13T10:00:00.000Z",
        postings: [
          posting("acct-bank", "-10000"),
          posting("acct-groceries", "7000"),
          posting("acct-utilities", "3000"),
        ],
        type: "expense",
      }),
      transaction({
        id: "txn-5-old",
        occurredAt: "2026-04-01T10:00:00.000Z",
        postings: [posting("acct-bank", "-9999"), posting("acct-groceries", "9999")],
        type: "expense",
      }),
      transaction({
        id: "txn-6-partial",
        occurredAt: "2026-05-14T10:00:00.000Z",
        postings: [
          posting("acct-bank", "-9000"),
          posting("acct-utilities", "4000"),
          posting("acct-legacy", "5000"),
        ],
        type: "expense",
      }),
    ] as const;

    const series = buildSpendingByCategorySeries({
      categories,
      days: 30,
      fallbackCategoryId: "uncategorized",
      fallbackCategoryLabel: "Uncategorized",
      limit: 5,
      now: new Date("2026-05-20T00:00:00.000Z"),
      transactions,
    });

    expect(series).toEqual([
      {
        amountMinor: 19000n,
        categoryColor: null,
        categoryIcon: null,
        categoryId: "cat-groceries",
        categoryName: "Groceries",
        parentCategoryName: null,
      },
      {
        amountMinor: 14000n,
        categoryColor: null,
        categoryIcon: null,
        categoryId: "cat-utilities",
        categoryName: "Utilities",
        parentCategoryName: null,
      },
      {
        amountMinor: 10000n,
        categoryColor: null,
        categoryIcon: null,
        categoryId: "uncategorized",
        categoryName: "Uncategorized",
        parentCategoryName: null,
      },
    ]);
  });
});

function transaction(input: {
  readonly id: string;
  readonly journalType?: "expense" | "income" | "transfer";
  readonly occurredAt: string;
  readonly postings: readonly {
    readonly accountId: string;
    readonly amountMinor: string;
  }[];
  readonly type: "expense" | "income" | "transfer" | "split";
}): TransactionGroupResponse {
  return {
    id: input.id,
    journals: [
      {
        description: input.id,
        id: `${input.id}-journal`,
        occurredAt: input.occurredAt,
        postings: input.postings.map((entry, index) => ({
          accountId: entry.accountId,
          amountMinor: entry.amountMinor,
          currencyCode: "INR",
          id: `${input.id}-posting-${index + 1}`,
          reportingAmountMinor: entry.amountMinor,
          reportingCurrencyCode: "INR",
        })),
        status: "cleared",
        type: input.journalType ?? (input.type === "split" ? "expense" : input.type),
      },
    ],
    ledgerId: "019dfbac-0000-7000-8000-000000000001",
    title: input.id,
    type: input.type,
    workspaceId: "019dfbac-0000-7000-8000-000000000002",
  };
}

function posting(accountId: string, amountMinor: string) {
  return {
    accountId,
    amountMinor,
  };
}

function category(id: string, name: string, counterpartyAccountId: string): CategoryResponse {
  return {
    archivedAt: null,
    color: null,
    counterpartyAccountId,
    createdAt: "2026-05-10T00:00:00.000Z",
    icon: null,
    id,
    ledgerId: "019dfbac-0000-7000-8000-000000000001",
    name,
    parentId: null,
    updatedAt: "2026-05-10T00:00:00.000Z",
    workspaceId: "019dfbac-0000-7000-8000-000000000002",
  };
}
