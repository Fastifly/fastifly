import type { AccountWithBalanceResponse } from "@fastifly/common";
import { describe, expect, it } from "vitest";

import {
  buildCreateRecurringTemplateRequest,
  getDestinationAccountsForRecurring,
  getMinimumFutureDateInput,
  getRecurringFormIssues,
  getSourceAccountsForRecurring,
  makeRecurringFormDefaults,
  makeRecurringFormValuesFromTemplate,
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

  it("returns guardrail issues for incomplete subscription draft", () => {
    const issues = getRecurringFormIssues(
      {
        amount: "",
        cadence: "monthly",
        description: "",
        destinationAccountId: "",
        nextRunOn: "",
        sourceAccountId: "",
        title: "",
        type: "expense",
      },
      accounts,
    );

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "amount-required",
        "destination-account-required",
        "next-run-on-invalid",
        "source-account-required",
        "title-or-description-required",
      ]),
    );
  });

  it("flags destination account mismatch before submit", () => {
    const issues = getRecurringFormIssues(
      {
        amount: "100",
        cadence: "monthly",
        description: "Mismatch",
        destinationAccountId: "acct_salary",
        nextRunOn: "2026-05-15",
        sourceAccountId: "acct_bank",
        title: "Mismatch",
        type: "expense",
      },
      accounts,
    );

    expect(issues.some((issue) => issue.code === "destination-account-invalid")).toBe(true);
  });

  it("requires subscription start date in the future", () => {
    const issues = getRecurringFormIssues(
      {
        amount: "100",
        cadence: "monthly",
        description: "Valid recurring",
        destinationAccountId: "acct_groceries",
        nextRunOn: "2000-01-01",
        sourceAccountId: "acct_bank",
        title: "Valid recurring",
        type: "expense",
      },
      accounts,
    );

    expect(issues.some((issue) => issue.code === "next-run-on-must-be-future")).toBe(true);
  });

  it("defaults start date to a future day", () => {
    const defaults = makeRecurringFormDefaults(accounts, "expense");
    expect(defaults.nextRunOn >= getMinimumFutureDateInput()).toBe(true);
  });

  it("applies valid create defaults when compatible", () => {
    const defaults = makeRecurringFormDefaults(accounts, "expense", {
      cadence: "weekly",
      destinationAccountId: "acct_bank",
      nextRunOn: "2099-01-01",
      sourceAccountId: "acct_salary",
      type: "income",
    });

    expect(defaults).toMatchObject({
      cadence: "weekly",
      destinationAccountId: "acct_bank",
      sourceAccountId: "acct_salary",
      type: "income",
    });
    expect(defaults.nextRunOn).toBe("2099-01-01");
  });

  it("falls back when create defaults are incompatible or stale", () => {
    const defaults = makeRecurringFormDefaults(accounts, "expense", {
      destinationAccountId: "acct_salary",
      nextRunOn: "2000-01-01",
      sourceAccountId: "acct_salary",
      type: "expense",
    });

    expect(defaults.sourceAccountId).toBe("acct_bank");
    expect(defaults.destinationAccountId).toBe("acct_groceries");
    expect(defaults.nextRunOn >= getMinimumFutureDateInput()).toBe(true);
  });

  it("maps existing template values for edit prefill", () => {
    const values = makeRecurringFormValuesFromTemplate({
      archivedAt: null,
      cadence: "monthly",
      createdAt: "2026-05-10T00:00:00.000Z",
      createdBy: "019dfbac-0000-7000-8000-000000000003",
      id: "019dfbac-0000-7000-8000-000000000004",
      intervalCount: 1,
      lastGeneratedAt: null,
      ledgerId: "019dfbac-0000-7000-8000-000000000001",
      nextRunAt: "2026-05-15T12:00:00.000Z",
      payload: {
        currencyCode: "INR",
        description: "Netflix",
        lines: [
          {
            amountMinor: "49999",
            budgetId: null,
            categoryId: null,
            description: "Netflix",
            destinationAccountId: "acct_groceries",
            reportingAmountMinor: null,
            reportingCurrencyCode: null,
          },
        ],
        sourceAccountId: "acct_bank",
        title: "Netflix subscription",
        type: "expense",
      },
      status: "active",
      updatedAt: "2026-05-10T00:00:00.000Z",
      updatedBy: "019dfbac-0000-7000-8000-000000000003",
      workspaceId: "019dfbac-0000-7000-8000-000000000002",
    });

    expect(values).toEqual({
      amount: "499.99",
      cadence: "monthly",
      description: "Netflix",
      destinationAccountId: "acct_groceries",
      nextRunOn: "2026-05-15",
      sourceAccountId: "acct_bank",
      title: "Netflix subscription",
      type: "expense",
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
