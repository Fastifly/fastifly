import type { AccountWithBalanceResponse } from "@fastifly/common";
import { describe, expect, it } from "vitest";

import {
  buildCreateTransactionRequest,
  getDestinationAccountsForTransaction,
  getSourceAccountsForTransaction,
} from "../finance/transaction-form.js";

const accounts = [
  account("acct_bank", "HDFC Checking", "asset", "bank"),
  account("acct_cash", "Cash Wallet", "asset", "cash"),
  account("acct_salary", "Salary", "revenue", "external"),
  account("acct_groceries", "Groceries", "expense", "external"),
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
          description: "Groceries",
          destinationAccountId: "acct_groceries",
          occurredOn: "2026-05-10",
          sourceAccountId: "acct_bank",
          type: "expense",
        },
        accounts,
      ),
    ).toMatchObject({
      currencyCode: "INR",
      description: "Groceries",
      occurredAt: "2026-05-10T12:00:00.000Z",
      source: "manual",
      sourceAccountId: "acct_bank",
      transactions: [{ amountMinor: "12550", destinationAccountId: "acct_groceries" }],
      type: "expense",
    });
  });

  it("rejects incompatible or unsafe transaction input before submit", () => {
    expect(() =>
      buildCreateTransactionRequest(
        {
          amount: "1.234",
          description: "Invalid",
          destinationAccountId: "acct_groceries",
          occurredOn: "2026-05-10",
          sourceAccountId: "acct_bank",
          type: "expense",
        },
        accounts,
      ),
    ).toThrow();

    expect(() =>
      buildCreateTransactionRequest(
        {
          amount: "100",
          description: "Invalid pair",
          destinationAccountId: "acct_salary",
          occurredOn: "2026-05-10",
          sourceAccountId: "acct_bank",
          type: "expense",
        },
        accounts,
      ),
    ).toThrow();
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
