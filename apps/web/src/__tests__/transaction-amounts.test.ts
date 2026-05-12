import type { TransactionGroupResponse } from "@fastifly/common";
import { describe, expect, it } from "vitest";
import {
  formatTransactionAmount,
  getTransactionAbsoluteMinor,
  sumTransactionAmounts,
} from "../ui/app-shell/utils";

describe("transaction amount helpers", () => {
  it("counts split expense journals in monthly spending totals", () => {
    const transactions = [
      transaction({
        journals: [
          journal("expense", [posting("acct-bank", "-12000"), posting("acct-groceries", "12000")]),
        ],
        type: "expense",
      }),
      transaction({
        journals: [
          journal("expense", [posting("acct-bank", "-7000"), posting("acct-rent", "7000")]),
          journal("expense", [posting("acct-bank", "-5000"), posting("acct-food", "5000")]),
        ],
        type: "split",
      }),
      transaction({
        journals: [
          journal("income", [posting("acct-income", "-50000"), posting("acct-bank", "50000")]),
        ],
        type: "income",
      }),
    ] as const;

    expect(sumTransactionAmounts(transactions, "expense")).toBe(24000n);
    expect(sumTransactionAmounts(transactions, "income")).toBe(50000n);
  });

  it("formats amounts using signed direction from journal-level totals", () => {
    const splitExpense = transaction({
      journals: [
        journal("expense", [posting("acct-bank", "-9000"), posting("acct-food", "9000")]),
        journal("expense", [posting("acct-bank", "-3000"), posting("acct-fuel", "3000")]),
      ],
      type: "split",
    });

    const transfer = transaction({
      journals: [
        journal("transfer", [posting("acct-wallet", "-4000"), posting("acct-bank", "4000")]),
      ],
      type: "transfer",
    });

    expect(formatTransactionAmount(splitExpense)).toBe("-₹120.00");
    expect(formatTransactionAmount(transfer)).toBe("₹40.00");
    expect(getTransactionAbsoluteMinor(splitExpense)).toBe(12000n);
  });
});

function transaction(input: {
  readonly journals: readonly {
    readonly postings: readonly {
      readonly accountId: string;
      readonly amountMinor: string;
      readonly currencyCode: string;
    }[];
    readonly type: "expense" | "income" | "transfer";
  }[];
  readonly type: "expense" | "income" | "transfer" | "split";
}): TransactionGroupResponse {
  return {
    id: "019dfbac-3319-7773-9a7d-52fb8d9b73e6",
    journals: input.journals.map((journalEntry, journalIndex) => ({
      description: `journal-${journalIndex + 1}`,
      id: `019dfbac-3319-7773-9a7d-52fb8d9b73e${journalIndex}`,
      occurredAt: "2026-05-10T00:00:00.000Z",
      postings: journalEntry.postings.map((postingEntry, postingIndex) => ({
        accountId: postingEntry.accountId,
        amountMinor: postingEntry.amountMinor,
        currencyCode: postingEntry.currencyCode,
        id: `019dfbac-3319-7773-9a7d-52fb8d9b74${journalIndex}${postingIndex}`,
        reportingAmountMinor: postingEntry.amountMinor,
        reportingCurrencyCode: postingEntry.currencyCode,
      })),
      status: "cleared",
      type: journalEntry.type,
    })),
    ledgerId: "019dfbac-3319-7773-9a7d-52fb8d9b73e7",
    title: "Transaction title",
    type: input.type,
    workspaceId: "019dfbac-3319-7773-9a7d-52fb8d9b73e8",
  };
}

function journal(
  type: "expense" | "income" | "transfer",
  postings: readonly {
    readonly accountId: string;
    readonly amountMinor: string;
    readonly currencyCode?: string;
  }[],
) {
  return {
    postings: postings.map((entry) => ({
      accountId: entry.accountId,
      amountMinor: entry.amountMinor,
      currencyCode: entry.currencyCode ?? "INR",
    })),
    type,
  };
}

function posting(accountId: string, amountMinor: string, currencyCode = "INR") {
  return {
    accountId,
    amountMinor,
    currencyCode,
  };
}
