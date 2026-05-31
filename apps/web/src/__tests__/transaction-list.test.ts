import type { AccountWithBalanceResponse, CategoryResponse } from "@fastifly/common";
import { describe, expect, it } from "vitest";

import {
  buildTransactionListQuery,
  getFilterableTransactionAccounts,
  getFilterableTransactionCategories,
  makeTransactionListFilterDefaults,
  normalizeTransactionAccountFilter,
  normalizeTransactionCategoryFilter,
} from "../finance/transaction-list";

describe("transaction list filters", () => {
  it("omits all-filters while keeping a small mobile-friendly page size", () => {
    expect(buildTransactionListQuery(makeTransactionListFilterDefaults())).toEqual({
      limit: 10,
    });
  });

  it("builds the shared API query parameters for selected filters", () => {
    expect(
      buildTransactionListQuery({
        accountId: "018f3f52-7d7e-7000-a000-000000000001",
        categoryId: "018f3f52-7d7e-7000-a000-000000000099",
        limit: 25,
        status: "cleared",
        type: "expense",
      }),
    ).toEqual({
      accountId: "018f3f52-7d7e-7000-a000-000000000001",
      categoryId: "018f3f52-7d7e-7000-a000-000000000099",
      limit: 25,
      status: "cleared",
      type: "expense",
    });
  });

  it("keeps only active user-held accounts in the transaction account filter", () => {
    const accounts = [
      account({ id: "asset-1", kind: "asset", name: "Checking" }),
      account({ id: "liability-1", kind: "liability", name: "Credit Card" }),
      account({
        archivedAt: "2026-03-01T00:00:00.000Z",
        id: "archived-asset",
        kind: "asset",
        name: "Old bank",
      }),
      account({ id: "inactive-asset", isActive: false, kind: "asset", name: "Closed wallet" }),
      account({ id: "expense-1", kind: "expense", name: "Groceries" }),
      account({ id: "revenue-1", kind: "revenue", name: "Salary" }),
    ] as const;

    expect(getFilterableTransactionAccounts(accounts).map((item) => item.id)).toEqual([
      "asset-1",
      "liability-1",
    ]);
  });

  it("normalizes stale account filters that are no longer user-held", () => {
    const accounts = [account({ id: "asset-1", kind: "asset", name: "Checking" })] as const;

    expect(normalizeTransactionAccountFilter("asset-1", accounts)).toBe("asset-1");
    expect(normalizeTransactionAccountFilter("expense-1", accounts)).toBe("all");
    expect(normalizeTransactionAccountFilter("all", accounts)).toBe("all");
  });

  it("keeps only active categories in transaction category filter", () => {
    const categories = [
      category({ id: "cat-active-1", name: "Groceries", archivedAt: null }),
      category({ id: "cat-archived", name: "Old", archivedAt: "2026-03-01T00:00:00.000Z" }),
    ] as const;

    expect(getFilterableTransactionCategories(categories).map((item) => item.id)).toEqual([
      "cat-active-1",
    ]);
  });

  it("normalizes stale category filters that are not active", () => {
    const categories = [category({ id: "cat-active-1", name: "Groceries", archivedAt: null })];

    expect(normalizeTransactionCategoryFilter("cat-active-1", categories)).toBe("cat-active-1");
    expect(normalizeTransactionCategoryFilter("cat-archived", categories)).toBe("all");
    expect(normalizeTransactionCategoryFilter("all", categories)).toBe("all");
  });
});

function account(input: {
  readonly archivedAt?: string | null;
  readonly id: string;
  readonly isActive?: boolean;
  readonly kind: AccountWithBalanceResponse["kind"];
  readonly name: string;
}): AccountWithBalanceResponse {
  return {
    archivedAt: input.archivedAt ?? null,
    balance: { amountMinor: "0", currencyCode: "INR" },
    createdAt: "2026-05-01T00:00:00.000Z",
    currencyCode: "INR",
    id: input.id,
    isActive: input.isActive ?? true,
    kind: input.kind,
    ledgerId: "00000000-0000-7000-a000-000000001201",
    name: input.name,
    openingBalanceDate: null,
    openingBalanceMinor: null,
    reportingBalance: { amountMinor: "0", currencyCode: "INR" },
    subtype: input.kind === "liability" ? "credit_card" : "bank",
    updatedAt: "2026-05-01T00:00:00.000Z",
    workspaceId: "00000000-0000-7000-a000-000000001101",
  };
}

function category(input: {
  readonly archivedAt: string | null;
  readonly id: string;
  readonly name: string;
}): CategoryResponse {
  return {
    archivedAt: input.archivedAt,
    color: null,
    counterpartyAccountId: null,
    createdAt: "2026-05-01T00:00:00.000Z",
    icon: null,
    id: input.id,
    ledgerId: "00000000-0000-7000-a000-000000001201",
    name: input.name,
    parentId: null,
    updatedAt: "2026-05-01T00:00:00.000Z",
    workspaceId: "00000000-0000-7000-a000-000000001101",
  };
}
