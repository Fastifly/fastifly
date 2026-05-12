import type { TransactionGroupResponse } from "./api/finance.js";

type TransactionJournalLike = TransactionGroupResponse["journals"][number];
type TransactionPostingLike = TransactionJournalLike["postings"][number];

export type TransactionJournalType = TransactionJournalLike["type"];
export type TransactionGroupType = TransactionGroupResponse["type"];

type TransactionGroupLike = Pick<TransactionGroupResponse, "journals" | "type">;

export type TransactionMinorTotals = {
  readonly expenseMinor: bigint;
  readonly incomeMinor: bigint;
  readonly transferMinor: bigint;
};

export function toAbsoluteAmountMinor(amountMinor: string): bigint {
  const value = BigInt(amountMinor);
  return value < 0n ? -value : value;
}

export function getTransactionJournalAbsoluteMinor(
  postings: readonly TransactionPostingLike[],
): bigint {
  let largestMinor = 0n;
  for (const posting of postings) {
    const postingMinor = toAbsoluteAmountMinor(posting.amountMinor);
    if (postingMinor > largestMinor) {
      largestMinor = postingMinor;
    }
  }
  return largestMinor;
}

export function sumTransactionJournalTypeMinor(
  transaction: TransactionGroupLike,
  type: TransactionJournalType,
): bigint {
  let totalMinor = 0n;

  for (const journal of transaction.journals) {
    if (journal.type !== type) {
      continue;
    }

    totalMinor += getTransactionJournalAbsoluteMinor(journal.postings);
  }

  return totalMinor;
}

export function sumTransactionsByJournalTypeMinor(
  transactions: readonly TransactionGroupLike[],
  type: TransactionJournalType,
): bigint {
  let totalMinor = 0n;

  for (const transaction of transactions) {
    totalMinor += sumTransactionJournalTypeMinor(transaction, type);
  }

  return totalMinor;
}

export function getTransactionMinorTotals(
  transaction: TransactionGroupLike,
): TransactionMinorTotals {
  return {
    expenseMinor: sumTransactionJournalTypeMinor(transaction, "expense"),
    incomeMinor: sumTransactionJournalTypeMinor(transaction, "income"),
    transferMinor: sumTransactionJournalTypeMinor(transaction, "transfer"),
  };
}

export function getTransactionSignedMinor(transaction: TransactionGroupLike): bigint {
  const totals = getTransactionMinorTotals(transaction);

  if (totals.incomeMinor > 0n || totals.expenseMinor > 0n) {
    return totals.incomeMinor - totals.expenseMinor;
  }

  return totals.transferMinor;
}

export function getTransactionAbsoluteMinor(transaction: TransactionGroupLike): bigint {
  const signedMinor = getTransactionSignedMinor(transaction);
  return signedMinor < 0n ? -signedMinor : signedMinor;
}

export function getTransactionOccurredAt(transaction: TransactionGroupLike): string | null {
  let occurredAt: string | null = null;

  for (const journal of transaction.journals) {
    if (occurredAt === null || journal.occurredAt < occurredAt) {
      occurredAt = journal.occurredAt;
    }
  }

  return occurredAt;
}

export function getTransactionCurrencyCode(
  transaction: TransactionGroupLike,
  fallbackCurrencyCode: string,
): string {
  for (const journal of transaction.journals) {
    const posting = journal.postings[0];
    if (posting?.currencyCode) {
      return posting.currencyCode;
    }
  }

  return fallbackCurrencyCode;
}

export function getTransactionDisplayType(
  transaction: TransactionGroupLike,
): "expense" | "income" | "transfer" {
  const signedMinor = getTransactionSignedMinor(transaction);
  if (signedMinor > 0n) {
    return "income";
  }
  if (signedMinor < 0n) {
    return "expense";
  }
  return transaction.type === "transfer" ? "transfer" : "expense";
}
