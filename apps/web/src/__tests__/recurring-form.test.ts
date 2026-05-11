import type { AccountWithBalanceResponse } from "@fastifly/common";
import { describe, expect, it } from "vitest";

import {
  buildCreateRecurringTemplateRequest,
  getDestinationAccountsForRecurring,
  getSourceAccountsForRecurring,
} from "../finance/recurring-form.js";

const accounts = [
  account("acct_bank", "HDFC Checking", "asset", "bank"),
  account("acct_cash", "Cash Wallet", "asset", "cash"),
  account("acct_salary", "Salary", "revenue", "external"),
  account("acct_groceries", "Groceries", "expense", "external"),
] as const;

describe("recurring form helpers", () => {
  it("offers compatible account choices per recurring type", () => {
    expect(getSourceAccountsForRecurring(accounts, "expense").map((item) => item.id)).toEqual([
      "acct_bank",
      "acct_cash",
    ]);
    expect(getSourceAccountsForRecurring(accounts, "income").map((item) => item.id)).toEqual([
      "acct_salary",
    ]);
    expect(
      getDestinationAccountsForRecurring(accounts, "acct_bank", "expense").map((item) => item.id),
    ).toEqual(["acct_groceries"]);
    expect(
      getDestinationAccountsForRecurring(accounts, "acct_bank", "transfer").map((item) => item.id),
    ).toEqual(["acct_cash"]);
  });

  it("builds recurring template create request without float money parsing", () => {
    expect(
      buildCreateRecurringTemplateRequest(
        {
          amount: "499.99",
          cadence: "monthly",
          description: "Netflix",
          destinationAccountId: "acct_groceries",
          nextRunOn: "2026-05-15",
          sourceAccountId: "acct_bank",
          title: "Netflix subscription",
          type: "expense",
        },
        accounts,
      ),
    ).toMatchObject({
      cadence: "monthly",
      intervalCount: 1,
      nextRunAt: "2026-05-15T12:00:00.000Z",
      payload: {
        currencyCode: "INR",
        description: "Netflix",
        lines: [{ amountMinor: "49999", destinationAccountId: "acct_groceries" }],
        sourceAccountId: "acct_bank",
        title: "Netflix subscription",
        type: "expense",
      },
      status: "active",
    });
  });

  it("rejects unsafe amount and incompatible account pair", () => {
    expect(() =>
      buildCreateRecurringTemplateRequest(
        {
          amount: "1.234",
          cadence: "monthly",
          description: "Invalid",
          destinationAccountId: "acct_groceries",
          nextRunOn: "2026-05-15",
          sourceAccountId: "acct_bank",
          title: "Invalid",
          type: "expense",
        },
        accounts,
      ),
    ).toThrow();

    expect(() =>
      buildCreateRecurringTemplateRequest(
        {
          amount: "100",
          cadence: "monthly",
          description: "Wrong pair",
          destinationAccountId: "acct_salary",
          nextRunOn: "2026-05-15",
          sourceAccountId: "acct_bank",
          title: "Wrong pair",
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
