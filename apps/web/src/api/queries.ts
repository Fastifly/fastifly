import { useQuery } from "@tanstack/react-query";
import { apiClient } from "./client";

type LedgerQueryInput =
  | {
      readonly ledgerId: string;
      readonly workspaceId: string;
    }
  | null
  | undefined;

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

export function useTransactionsQuery(input: LedgerQueryInput) {
  return useQuery({
    enabled: Boolean(input),
    queryFn: () => {
      if (!input) {
        throw new Error("Ledger context is required.");
      }
      return apiClient.listTransactions(input);
    },
    queryKey: ["finance", "transactions", input?.workspaceId, input?.ledgerId],
  });
}
