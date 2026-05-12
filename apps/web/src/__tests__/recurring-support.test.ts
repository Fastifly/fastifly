import type { RecurringTemplateResponse } from "@fastifly/common";
import { describe, expect, it } from "vitest";
import { deriveRecurringCreateDefaults } from "../ui/app-shell/pages-accounts/recurring-support.js";

describe("deriveRecurringCreateDefaults", () => {
  it("prefers active templates and picks most common recent choices", () => {
    const defaults = deriveRecurringCreateDefaults([
      template({
        destinationAccountId: "acct_rent",
        id: "tmpl_expense_old",
        sourceAccountId: "acct_bank",
        status: "active",
        type: "expense",
        updatedAt: "2026-05-10T10:00:00.000Z",
      }),
      template({
        cadence: "weekly",
        destinationAccountId: "acct_food",
        id: "tmpl_expense_new",
        sourceAccountId: "acct_bank",
        status: "active",
        type: "expense",
        updatedAt: "2026-05-10T11:00:00.000Z",
      }),
      template({
        cadence: "daily",
        destinationAccountId: "acct_bank",
        id: "tmpl_income",
        sourceAccountId: "acct_salary",
        status: "active",
        type: "income",
        updatedAt: "2026-05-10T12:00:00.000Z",
      }),
      template({
        cadence: "daily",
        destinationAccountId: "acct_credit",
        id: "tmpl_paused_transfer",
        sourceAccountId: "acct_wallet",
        status: "paused",
        type: "transfer",
        updatedAt: "2026-05-10T13:00:00.000Z",
      }),
    ]);

    expect(defaults).toEqual({
      cadence: "weekly",
      categoryId: "cat_food",
      sourceAccountId: "acct_bank",
      type: "expense",
    });
  });

  it("returns empty defaults when no templates exist", () => {
    expect(deriveRecurringCreateDefaults([])).toEqual({});
  });
});

function template({
  cadence = "monthly",
  destinationAccountId,
  id,
  sourceAccountId,
  status,
  type,
  updatedAt,
}: {
  readonly cadence?: RecurringTemplateResponse["cadence"];
  readonly destinationAccountId: string;
  readonly id: string;
  readonly sourceAccountId: string;
  readonly status: RecurringTemplateResponse["status"];
  readonly type: RecurringTemplateResponse["payload"]["type"];
  readonly updatedAt: string;
}): RecurringTemplateResponse {
  return {
    archivedAt: null,
    cadence,
    createdAt: "2026-05-10T00:00:00.000Z",
    createdBy: "019dfbac-0000-7000-8000-000000000003",
    id,
    intervalCount: 1,
    lastGeneratedAt: null,
    ledgerId: "019dfbac-0000-7000-8000-000000000001",
    nextRunAt: "2026-05-15T12:00:00.000Z",
    payload: {
      currencyCode: "INR",
      description: "Seed template",
      lines: [
        {
          amountMinor: "10000",
          budgetId: null,
          categoryId: type === "expense" ? "cat_food" : null,
          description: "Seed template",
          destinationAccountId,
          reportingAmountMinor: null,
          reportingCurrencyCode: null,
        },
      ],
      sourceAccountId,
      title: "Seed template",
      type,
    },
    status,
    updatedAt,
    updatedBy: "019dfbac-0000-7000-8000-000000000003",
    workspaceId: "019dfbac-0000-7000-8000-000000000002",
  };
}
