import type { AccountWithBalanceResponse, CategoryResponse } from "@fastifly/common";
import { describe, expect, it } from "vitest";

import {
  buildCreateTransactionRequest,
  getDestinationAccountsForTransaction,
  getExpenseCategoriesForTransaction,
  getSourceAccountsForTransaction,
  getTransactionQuickAddState,
} from "../finance/transaction-form.js";

const accounts = [
  account("acct_bank", "HDFC Checking", "asset", "bank"),
  account("acct_cash", "Cash Wallet", "asset", "cash"),
  account("acct_salary", "Salary", "revenue", "external"),
  account("acct_groceries", "Groceries", "expense", "external"),
] as const;
const categories = [
  category("cat_groceries", "Groceries", "acct_groceries"),
] as const;

describe("transaction form helpers", () => {
  it("offers compatible accounts for each simple transaction type", () => {
    expect(getSourceAccountsForTransaction(accounts, "expense").map((item) => item.id)).toEqual([
      "acct_bank",
      "acct_cash",
    ]);
    expect(getSourceAccountsForTransaction(accounts, "income").map((item) => item.id)).toEqual([
      "acct_salary",
    ]);
    expect(
      getExpenseCategoriesForTransaction(categories, accounts, "acct_bank").map((item) => item.id),
    ).toEqual(["cat_groceries"]);
    expect(
      getDestinationAccountsForTransaction(accounts, "acct_bank", "expense").map((item) => item.id),
    ).toEqual(["acct_groceries"]);
    expect(
      getDestinationAccountsForTransaction(accounts, "acct_bank", "transfer").map(
        (item) => item.id,
      ),
    ).toEqual(["acct_cash"]);
  });

  it("builds the API request without float money parsing", () => {
    expect(
      buildCreateTransactionRequest(
        {
          amount: "125.50",
          categoryId: "cat_groceries",
          description: "Groceries",
          destinationAccountId: "",
          occurredOn: "2026-05-10",
          sourceAccountId: "acct_bank",
          type: "expense",
        },
        accounts,
        categories,
      ),
    ).toMatchObject({
      currencyCode: "INR",
      description: "Groceries",
      occurredAt: "2026-05-10T12:00:00.000Z",
      source: "manual",
      sourceAccountId: "acct_bank",
      transactions: [
        {
          amountMinor: "12550",
          categoryId: "cat_groceries",
          destinationAccountId: "acct_groceries",
        },
      ],
      type: "expense",
    });
  });

  it("rejects incompatible or unsafe transaction input before submit", () => {
    expect(() =>
      buildCreateTransactionRequest(
        {
          amount: "1.234",
          categoryId: "cat_groceries",
          description: "Invalid",
          destinationAccountId: "",
          occurredOn: "2026-05-10",
          sourceAccountId: "acct_bank",
          type: "expense",
        },
        accounts,
        categories,
      ),
    ).toThrow();

    expect(() =>
      buildCreateTransactionRequest(
        {
          amount: "100",
          categoryId: "cat_missing",
          description: "Invalid pair",
          destinationAccountId: "acct_salary",
          occurredOn: "2026-05-10",
          sourceAccountId: "acct_bank",
          type: "expense",
        },
        accounts,
        categories,
      ),
    ).toThrow();
  });

  it("derives quick-add prerequisites from real setup state", () => {
    expect(
      getTransactionQuickAddState({
        accounts: [],
        categories: [],
        categoriesLoading: false,
        hasLedgerContext: true,
      }),
    ).toMatchObject({
      canCreateAny: false,
      reason: "add-account",
    });

    expect(
      getTransactionQuickAddState({
        accounts: [accounts[0]],
        categories: [],
        categoriesLoading: false,
        hasLedgerContext: true,
      }),
    ).toMatchObject({
      canCreateAny: false,
      reason: "add-category",
    });

    expect(
      getTransactionQuickAddState({
        accounts: [accounts[0]],
        categories,
        categoriesLoading: false,
        hasLedgerContext: true,
      }),
    ).toMatchObject({
      canCreateAny: false,
      reason: "add-compatible-setup",
    });

    expect(
      getTransactionQuickAddState({
        accounts: [accounts[0]],
        categories: [category("cat_unmapped", "Broken Category", "acct_missing")],
        categoriesLoading: false,
        hasLedgerContext: true,
      }),
    ).toMatchObject({
      canCreateAny: false,
      reason: "add-compatible-setup",
    });

    expect(
      getTransactionQuickAddState({
        accounts: [accounts[0]],
        categories: [],
        categoriesLoading: true,
        hasLedgerContext: true,
      }),
    ).toMatchObject({
      canCreateAny: false,
      reason: "categories-loading",
    });

    expect(
      getTransactionQuickAddState({
        accounts,
        categories,
        categoriesLoading: false,
        hasLedgerContext: true,
      }),
    ).toMatchObject({
      canCreateAny: true,
      reason: "ok",
    });
  });
});

function account(
  id: string,
  name: string,
  kind: AccountWithBalanceResponse["kind"],
  subtype: AccountWithBalanceResponse["subtype"],
): AccountWithBalanceResponse {
  return {
    archivedAt: null,
    balance: { amountMinor: "0", currencyCode: "INR" },
    createdAt: "2026-05-10T00:00:00.000Z",
    currencyCode: "INR",
    id,
    isActive: true,
    kind,
    ledgerId: "019dfbac-0000-7000-8000-000000000001",
    name,
    openingBalanceDate: null,
    openingBalanceMinor: null,
    reportingBalance: { amountMinor: "0", currencyCode: "INR" },
    subtype,
    updatedAt: "2026-05-10T00:00:00.000Z",
    workspaceId: "019dfbac-0000-7000-8000-000000000002",
  };
}

function category(
  id: string,
  name: string,
  counterpartyAccountId: string,
): CategoryResponse {
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
