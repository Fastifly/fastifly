import type { AccountWithBalanceResponse } from "@fastifly/common";

export type LedgerContext = {
  readonly ledgerId: string;
  readonly workspaceId: string;
} | null;

export type AccountsPageProps = {
  readonly accounts: readonly AccountWithBalanceResponse[];
  readonly accountsLoading: boolean;
  readonly ledgerContext: LedgerContext;
};

export type CategoriesPageProps = {
  readonly ledgerContext: LedgerContext;
};

export type BudgetPageProps = {
  readonly cashflow: string;
  readonly income: string;
  readonly ledgerContext: LedgerContext;
  readonly spending: string;
  readonly spendingRate: string;
};

export type ImportsPageProps = {
  readonly accounts: readonly AccountWithBalanceResponse[];
  readonly ledgerContext: LedgerContext;
};

export type RulesPageProps = {
  readonly ledgerContext: LedgerContext;
};

export type RecurringPageProps = {
  readonly accounts: readonly AccountWithBalanceResponse[];
  readonly ledgerContext: LedgerContext;
};
