import type {
  ListBudgetsQuery,
  ListTransactionsQuery,
  ListTransactionsResponse,
} from "@fastifly/common";
import { type InfiniteData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { apiClient } from "./client";

type LedgerQueryInput =
  | {
      readonly ledgerId: string;
      readonly workspaceId: string;
    }
  | null
  | undefined;

type TransactionListQueryInput = Partial<
  Pick<
    ListTransactionsQuery,
    "accountId" | "fromOccurredAt" | "limit" | "status" | "toOccurredAt" | "type"
  >
>;

type BudgetListQueryInput = Partial<Pick<ListBudgetsQuery, "asOfDate" | "cursor" | "limit">>;

export function useHealthQuery() {
  return useQuery({
    queryFn: apiClient.getHealth,
    queryKey: ["system", "health"],
    refetchInterval: 30_000,
  });
}

export function useMeContextQuery(enabled = true) {
  return useQuery({
    enabled,
    queryFn: apiClient.getMeContext,
    queryKey: ["me", "context"],
    retry: false,
  });
}

export function useAccountsQuery(input: LedgerQueryInput) {
  return useQuery({
    enabled: Boolean(input),
    queryFn: () => {
      if (!input) {
        throw new Error("Ledger context is required.");
      }
      return apiClient.listAccounts(input);
    },
    queryKey: ["finance", "accounts", input?.workspaceId, input?.ledgerId],
  });
}

export function useBudgetsQuery(input: LedgerQueryInput, query: BudgetListQueryInput = {}) {
  return useQuery({
    enabled: Boolean(input),
    queryFn: () => {
      if (!input) {
        throw new Error("Ledger context is required.");
      }
      return apiClient.listBudgets({ ...input, ...query });
    },
    queryKey: [
      "finance",
      "budgets",
      input?.workspaceId,
      input?.ledgerId,
      query.asOfDate ?? null,
      query.cursor ?? null,
      query.limit ?? null,
    ],
  });
}

export function useTransactionsQuery(
  input: LedgerQueryInput,
  query: TransactionListQueryInput = {},
) {
  return useQuery({
    enabled: Boolean(input),
    queryFn: () => {
      if (!input) {
        throw new Error("Ledger context is required.");
      }
      return apiClient.listTransactions({ ...input, ...query });
    },
    queryKey: makeTransactionsQueryKey(input, query),
  });
}

export function useInfiniteTransactionsQuery(
  input: LedgerQueryInput,
  query: TransactionListQueryInput = {},
) {
  return useInfiniteQuery<
    ListTransactionsResponse,
    Error,
    InfiniteData<ListTransactionsResponse>,
    readonly unknown[],
    string | null
  >({
    enabled: Boolean(input),
    getNextPageParam: (lastPage) => lastPage.pageInfo.nextCursor ?? undefined,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      if (!input) {
        throw new Error("Ledger context is required.");
      }
      return apiClient.listTransactions({
        ...input,
        ...query,
        ...(pageParam ? { cursor: pageParam } : {}),
      });
    },
    queryKey: [...makeTransactionsQueryKey(input, query), "infinite"],
  });
}

function makeTransactionsQueryKey(input: LedgerQueryInput, query: TransactionListQueryInput) {
  return [
    "finance",
    "transactions",
    input?.workspaceId,
    input?.ledgerId,
    query.accountId ?? null,
    query.fromOccurredAt ?? null,
    query.limit ?? null,
    query.status ?? null,
    query.toOccurredAt ?? null,
    query.type ?? null,
  ] as const;
}
