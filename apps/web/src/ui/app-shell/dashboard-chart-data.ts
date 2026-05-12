import {
  type CategoryResponse,
  getTransactionJournalAbsoluteMinor,
  type TransactionGroupResponse,
  toAbsoluteAmountMinor,
} from "@fastifly/common";

export type MonthlyCashflowPoint = {
  monthKey: string;
  monthLabel: string;
  incomeMinor: bigint;
  expenseMinor: bigint;
};

export type SpendingCategoryPoint = {
  categoryId: string;
  categoryColor: string | null;
  categoryIcon: string | null;
  categoryName: string;
  parentCategoryName: string | null;
  amountMinor: bigint;
};

const MONTH_KEY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});

export function buildMonthlyCashflowSeries(input: {
  readonly months: number;
  readonly now: Date;
  readonly transactions: readonly TransactionGroupResponse[];
}): readonly MonthlyCashflowPoint[] {
  const normalizedMonths = Math.max(1, input.months);
  const monthBuckets = createMonthBuckets(input.now, normalizedMonths);
  const monthMap = new Map(monthBuckets.map((bucket) => [bucket.monthKey, bucket]));

  for (const transaction of input.transactions) {
    for (const journal of transaction.journals) {
      if (journal.type !== "expense" && journal.type !== "income") {
        continue;
      }

      const occurredAt = new Date(journal.occurredAt);
      if (Number.isNaN(occurredAt.getTime())) {
        continue;
      }

      const monthKey = toMonthKey(occurredAt);
      const bucket = monthMap.get(monthKey);
      if (!bucket) {
        continue;
      }

      const amountMinor = getTransactionJournalAbsoluteMinor(journal.postings);
      if (journal.type === "income") {
        bucket.incomeMinor += amountMinor;
      } else {
        bucket.expenseMinor += amountMinor;
      }
    }
  }

  return monthBuckets;
}

export function buildSpendingByCategorySeries(input: {
  readonly categories: readonly CategoryResponse[];
  readonly days: number;
  readonly fallbackCategoryId: string;
  readonly fallbackCategoryLabel: string;
  readonly limit: number;
  readonly now: Date;
  readonly transactions: readonly TransactionGroupResponse[];
}): readonly SpendingCategoryPoint[] {
  const normalizedLimit = Math.max(1, input.limit);
  const windowStart = new Date(input.now);
  windowStart.setUTCHours(0, 0, 0, 0);
  windowStart.setUTCDate(windowStart.getUTCDate() - Math.max(1, input.days) + 1);

  const categoryByAccountId = new Map(
    input.categories
      .filter((category) => category.counterpartyAccountId)
      .map((category) => [category.counterpartyAccountId as string, category] as const),
  );
  const categoryNameById = new Map(
    input.categories.map((category) => [category.id, category.name] as const),
  );

  const totalByCategory = new Map<string, SpendingCategoryPoint>();

  for (const transaction of input.transactions) {
    for (const journal of transaction.journals) {
      if (journal.type !== "expense") {
        continue;
      }

      const occurredAt = new Date(journal.occurredAt);
      if (
        Number.isNaN(occurredAt.getTime()) ||
        occurredAt < windowStart ||
        occurredAt > input.now
      ) {
        continue;
      }

      const journalTotal = getTransactionJournalAbsoluteMinor(journal.postings);
      let categorizedTotal = 0n;

      for (const posting of journal.postings) {
        const category = categoryByAccountId.get(posting.accountId);
        if (!category) {
          continue;
        }

        const postingMinor = toAbsoluteAmountMinor(posting.amountMinor);
        if (postingMinor === 0n) {
          continue;
        }

        categorizedTotal += postingMinor;
        addCategoryAmount(totalByCategory, {
          amountMinor: postingMinor,
          categoryColor: category.color ?? null,
          categoryIcon: category.icon ?? null,
          categoryId: category.id,
          categoryName: category.name,
          parentCategoryName: category.parentId
            ? (categoryNameById.get(category.parentId) ?? null)
            : null,
        });
      }

      // Keep uncategorized spend visible when a journal has no mapped category
      // postings, or when mapped postings cover only part of the journal amount.
      const uncategorizedMinor = journalTotal - categorizedTotal;
      if (uncategorizedMinor > 0n) {
        addCategoryAmount(totalByCategory, {
          amountMinor: uncategorizedMinor,
          categoryColor: null,
          categoryIcon: null,
          categoryId: input.fallbackCategoryId,
          categoryName: input.fallbackCategoryLabel,
          parentCategoryName: null,
        });
      }
    }
  }

  return [...totalByCategory.values()]
    .filter((point) => point.amountMinor > 0n)
    .sort((left, right) => {
      if (left.amountMinor === right.amountMinor) {
        return left.categoryName.localeCompare(right.categoryName);
      }

      return left.amountMinor > right.amountMinor ? -1 : 1;
    })
    .slice(0, normalizedLimit);
}

function toMonthKey(date: Date): string {
  const year = date.getUTCFullYear().toString();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${year}-${month}`;
}

function createMonthBuckets(now: Date, months: number): MonthlyCashflowPoint[] {
  const startMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  startMonthDate.setUTCMonth(startMonthDate.getUTCMonth() - (months - 1));

  const buckets: MonthlyCashflowPoint[] = [];
  for (let offset = 0; offset < months; offset += 1) {
    const current = new Date(startMonthDate);
    current.setUTCMonth(startMonthDate.getUTCMonth() + offset);
    buckets.push({
      expenseMinor: 0n,
      incomeMinor: 0n,
      monthKey: toMonthKey(current),
      monthLabel: MONTH_KEY_FORMATTER.format(current),
    });
  }

  return buckets;
}

function addCategoryAmount(
  totals: Map<string, SpendingCategoryPoint>,
  input: {
    readonly amountMinor: bigint;
    readonly categoryColor: string | null;
    readonly categoryIcon: string | null;
    readonly categoryId: string;
    readonly categoryName: string;
    readonly parentCategoryName: string | null;
  },
): void {
  const current = totals.get(input.categoryId);
  if (current) {
    totals.set(input.categoryId, {
      ...current,
      amountMinor: current.amountMinor + input.amountMinor,
    });
    return;
  }

  totals.set(input.categoryId, {
    amountMinor: input.amountMinor,
    categoryColor: input.categoryColor,
    categoryIcon: input.categoryIcon,
    categoryId: input.categoryId,
    categoryName: input.categoryName,
    parentCategoryName: input.parentCategoryName,
  });
}
