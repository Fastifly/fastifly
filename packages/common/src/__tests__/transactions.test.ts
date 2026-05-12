import { describe, expect, it } from "vitest";
import type { TransactionGroupResponse } from "../api/finance.js";
import {
  getTransactionAbsoluteMinor,
  getTransactionCurrencyCode,
  getTransactionDisplayType,
  getTransactionJournalAbsoluteMinor,
  getTransactionMinorTotals,
  getTransactionOccurredAt,
  getTransactionSignedMinor,
  sumTransactionJournalTypeMinor,
  sumTransactionsByJournalTypeMinor,
  toAbsoluteAmountMinor,
} from "../transactions.js";

describe("transaction domain helpers", () => {
  it("normalizes signed posting amounts to absolute minor units", () => {
    expect(toAbsoluteAmountMinor("0")).toBe(0n);
    expect(toAbsoluteAmountMinor("12500")).toBe(12500n);
    expect(toAbsoluteAmountMinor("-12500")).toBe(12500n);
  });

  it("extracts journal amount using largest absolute posting", () => {
    const postings = [
      posting("acct-bank", "-20000"),
      posting("acct-rent", "12000"),
      posting("acct-groceries", "8000"),
    ] as const;

    expect(getTransactionJournalAbsoluteMinor(postings)).toBe(20000n);
  });

  it("aggregates split groups by journal type without using group.type shortcuts", () => {
    const splitExpense = transactionGroup({
      journals: [
        journal({
          occurredAt: "2026-05-09T10:00:00.000Z",
          postings: [posting("acct-bank", "-12000"), posting("acct-groceries", "12000")],
          type: "expense",
        }),
        journal({
          occurredAt: "2026-05-09T10:00:00.000Z",
          postings: [posting("acct-bank", "-8000"), posting("acct-rent", "8000")],
          type: "expense",
        }),
      ],
      type: "split",
    });

    expect(sumTransactionJournalTypeMinor(splitExpense, "expense")).toBe(20000n);
    expect(sumTransactionJournalTypeMinor(splitExpense, "income")).toBe(0n);
    expect(sumTransactionJournalTypeMinor(splitExpense, "transfer")).toBe(0n);
  });

  it("computes signed and absolute transaction amounts from journal totals", () => {
    const income = transactionGroup({
      journals: [
        journal({
          occurredAt: "2026-05-10T10:00:00.000Z",
          postings: [posting("acct-income", "-450000"), posting("acct-bank", "450000")],
          type: "income",
        }),
      ],
      type: "income",
    });
    const expenseSplit = transactionGroup({
      journals: [
        journal({
          occurredAt: "2026-05-11T10:00:00.000Z",
          postings: [posting("acct-bank", "-14000"), posting("acct-food", "14000")],
          type: "expense",
        }),
        journal({
          occurredAt: "2026-05-11T10:00:00.000Z",
          postings: [posting("acct-bank", "-6000"), posting("acct-fuel", "6000")],
          type: "expense",
        }),
      ],
      type: "split",
    });
    const transfer = transactionGroup({
      journals: [
        journal({
          occurredAt: "2026-05-12T10:00:00.000Z",
          postings: [posting("acct-wallet", "-5000"), posting("acct-bank", "5000")],
          type: "transfer",
        }),
      ],
      type: "transfer",
    });

    expect(getTransactionMinorTotals(income)).toEqual({
      expenseMinor: 0n,
      incomeMinor: 450000n,
      transferMinor: 0n,
    });
    expect(getTransactionMinorTotals(expenseSplit)).toEqual({
      expenseMinor: 20000n,
      incomeMinor: 0n,
      transferMinor: 0n,
    });

    expect(getTransactionSignedMinor(income)).toBe(450000n);
    expect(getTransactionSignedMinor(expenseSplit)).toBe(-20000n);
    expect(getTransactionSignedMinor(transfer)).toBe(5000n);

    expect(getTransactionAbsoluteMinor(income)).toBe(450000n);
    expect(getTransactionAbsoluteMinor(expenseSplit)).toBe(20000n);
    expect(getTransactionAbsoluteMinor(transfer)).toBe(5000n);
  });

  it("sums transaction collections by journal type", () => {
    const transactions = [
      transactionGroup({
        journals: [
          journal({
            occurredAt: "2026-05-10T10:00:00.000Z",
            postings: [posting("acct-income", "-100000"), posting("acct-bank", "100000")],
            type: "income",
          }),
        ],
        type: "income",
      }),
      transactionGroup({
        journals: [
          journal({
            occurredAt: "2026-05-11T10:00:00.000Z",
            postings: [posting("acct-bank", "-12000"), posting("acct-food", "12000")],
            type: "expense",
          }),
        ],
        type: "expense",
      }),
      transactionGroup({
        journals: [
          journal({
            occurredAt: "2026-05-11T10:00:00.000Z",
            postings: [posting("acct-bank", "-8000"), posting("acct-fuel", "8000")],
            type: "expense",
          }),
        ],
        type: "split",
      }),
    ] as const;

    expect(sumTransactionsByJournalTypeMinor(transactions, "income")).toBe(100000n);
    expect(sumTransactionsByJournalTypeMinor(transactions, "expense")).toBe(20000n);
    expect(sumTransactionsByJournalTypeMinor(transactions, "transfer")).toBe(0n);
  });

  it("returns stable occurredAt and display type for UI consumers", () => {
    const transaction = transactionGroup({
      journals: [
        journal({
          occurredAt: "2026-05-12T10:00:00.000Z",
          postings: [posting("acct-bank", "-5000"), posting("acct-food", "5000")],
          type: "expense",
        }),
        journal({
          occurredAt: "2026-05-10T10:00:00.000Z",
          postings: [posting("acct-bank", "-3000"), posting("acct-fuel", "3000")],
          type: "expense",
        }),
      ],
      type: "split",
    });

    expect(getTransactionOccurredAt(transaction)).toBe("2026-05-10T10:00:00.000Z");
    expect(getTransactionDisplayType(transaction)).toBe("expense");
  });

  it("returns transaction currency with fallback for edge cases", () => {
    const income = transactionGroup({
      journals: [
        journal({
          occurredAt: "2026-05-10T10:00:00.000Z",
          postings: [
            posting("acct-income", "-100000", "INR"),
            posting("acct-bank", "100000", "INR"),
          ],
          type: "income",
        }),
      ],
      type: "income",
    });

    const empty = transactionGroup({
      journals: [],
      type: "transfer",
    });

    expect(getTransactionCurrencyCode(income, "USD")).toBe("INR");
    expect(getTransactionCurrencyCode(empty, "USD")).toBe("USD");
  });
});

function transactionGroup(input: {
  readonly journals: readonly {
    readonly occurredAt: string;
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
      occurredAt: journalEntry.occurredAt,
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

function journal(input: {
  readonly occurredAt: string;
  readonly postings: readonly {
    readonly accountId: string;
    readonly amountMinor: string;
    readonly currencyCode?: string;
  }[];
  readonly type: "expense" | "income" | "transfer";
}) {
  return {
    occurredAt: input.occurredAt,
    postings: input.postings.map((entry) => ({
      accountId: entry.accountId,
      amountMinor: entry.amountMinor,
      currencyCode: entry.currencyCode ?? "INR",
    })),
    type: input.type,
  };
}

function posting(accountId: string, amountMinor: string, currencyCode = "INR") {
  return {
    accountId,
    amountMinor,
    currencyCode,
  };
}
