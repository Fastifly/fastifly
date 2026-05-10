import type { ListTransactionsQuery } from "@fastifly/common";

export type TransactionTypeFilter = "all" | "expense" | "income" | "transfer";
export type TransactionStatusFilter = "all" | "pending" | "cleared" | "reconciled";

export type TransactionListFilterState = {
  readonly accountId: string;
  readonly limit: number;
  readonly status: TransactionStatusFilter;
  readonly type: TransactionTypeFilter;
};

export const ALL_TRANSACTION_FILTER = "all";

export function makeTransactionListFilterDefaults(): TransactionListFilterState {
  return {
    accountId: ALL_TRANSACTION_FILTER,
    limit: 10,
    status: ALL_TRANSACTION_FILTER,
    type: ALL_TRANSACTION_FILTER,
  };
}

export function buildTransactionListQuery(
  filters: TransactionListFilterState,
): Pick<ListTransactionsQuery, "accountId" | "limit" | "status" | "type"> {
  return {
    ...(filters.accountId !== ALL_TRANSACTION_FILTER ? { accountId: filters.accountId } : {}),
    limit: filters.limit,
    ...(filters.status !== ALL_TRANSACTION_FILTER ? { status: filters.status } : {}),
    ...(filters.type !== ALL_TRANSACTION_FILTER ? { type: filters.type } : {}),
  };
}
