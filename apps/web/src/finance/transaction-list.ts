import {
  type AccountWithBalanceResponse,
  type CategoryResponse,
  isUserHeldAccountKind,
  type ListTransactionsQuery,
} from "@fastifly/common";

export type TransactionTypeFilter = "all" | "expense" | "income" | "transfer";
export type TransactionStatusFilter = "all" | "pending" | "cleared" | "reconciled";

export type TransactionListFilterState = {
  readonly accountId: string;
  readonly categoryId: string;
  readonly limit: number;
  readonly status: TransactionStatusFilter;
  readonly type: TransactionTypeFilter;
};

export const ALL_TRANSACTION_FILTER = "all";

export function makeTransactionListFilterDefaults(): TransactionListFilterState {
  return {
    accountId: ALL_TRANSACTION_FILTER,
    categoryId: ALL_TRANSACTION_FILTER,
    limit: 10,
    status: ALL_TRANSACTION_FILTER,
    type: ALL_TRANSACTION_FILTER,
  };
}

export function buildTransactionListQuery(
  filters: TransactionListFilterState,
): Pick<ListTransactionsQuery, "accountId" | "categoryId" | "limit" | "status" | "type"> {
  return {
    ...(filters.accountId !== ALL_TRANSACTION_FILTER ? { accountId: filters.accountId } : {}),
    ...(filters.categoryId !== ALL_TRANSACTION_FILTER ? { categoryId: filters.categoryId } : {}),
    limit: filters.limit,
    ...(filters.status !== ALL_TRANSACTION_FILTER ? { status: filters.status } : {}),
    ...(filters.type !== ALL_TRANSACTION_FILTER ? { type: filters.type } : {}),
  };
}

export function getFilterableTransactionAccounts(
  accounts: readonly AccountWithBalanceResponse[],
): readonly AccountWithBalanceResponse[] {
  return accounts.filter((account) => isUserHeldAccountKind(account.kind));
}

export function normalizeTransactionAccountFilter(
  accountId: string,
  accounts: readonly AccountWithBalanceResponse[],
): string {
  if (accountId === ALL_TRANSACTION_FILTER) {
    return accountId;
  }

  return accounts.some((account) => account.id === accountId) ? accountId : ALL_TRANSACTION_FILTER;
}

export function getFilterableTransactionCategories(
  categories: readonly CategoryResponse[],
): readonly CategoryResponse[] {
  return categories.filter((category) => category.archivedAt === null);
}

export function normalizeTransactionCategoryFilter(
  categoryId: string,
  categories: readonly CategoryResponse[],
): string {
  if (categoryId === ALL_TRANSACTION_FILTER) {
    return categoryId;
  }

  return categories.some((category) => category.id === categoryId)
    ? categoryId
    : ALL_TRANSACTION_FILTER;
}
