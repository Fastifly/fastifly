import {
  type AccountWithBalanceResponse,
  formatMoneyMinor,
  type RecurringTemplateResponse,
  type TransactionGroupResponse,
} from "@fastifly/common";
import type { LucideIcon } from "lucide-react";
import { CheckCircle2, RefreshCcw, XCircle } from "lucide-react";
import { parseAsInteger, parseAsString, parseAsStringLiteral } from "nuqs";
import type {
  TransactionListFilterState,
  TransactionStatusFilter,
  TransactionTypeFilter,
} from "../../finance/transaction-list";
import { ALL_TRANSACTION_FILTER } from "../../finance/transaction-list";
import { en } from "../../i18n/en";
import type { testIds } from "../../testing/testid-registry";
import type { NavigationItem } from "../navigation";

export type Theme = "dark" | "light" | "system";
export type Tone = "danger" | "neutral" | "success" | "warning";
export type NavigationTestIdSlug = Parameters<typeof testIds.navigation.mobileNav>[0];

export const transactionTypeFilterOptions: readonly {
  readonly label: string;
  readonly value: TransactionTypeFilter;
}[] = [
  { label: en.transactions.filters.allTypes, value: "all" },
  { label: en.transactions.types.expense, value: "expense" },
  { label: en.transactions.types.income, value: "income" },
  { label: en.transactions.types.transfer, value: "transfer" },
];

export const transactionStatusFilterOptions: readonly {
  readonly label: string;
  readonly value: TransactionStatusFilter;
}[] = [
  { label: en.transactions.filters.allStatuses, value: "all" },
  { label: en.transactions.statuses.pending, value: "pending" },
  { label: en.transactions.statuses.cleared, value: "cleared" },
  { label: en.transactions.statuses.reconciled, value: "reconciled" },
];

export const transactionFilterParsers = {
  accountId: parseAsString.withDefault(ALL_TRANSACTION_FILTER),
  limit: parseAsInteger.withDefault(10),
  status: parseAsStringLiteral(["all", "pending", "cleared", "reconciled"]).withDefault("all"),
  type: parseAsStringLiteral(["all", "expense", "income", "transfer"]).withDefault("all"),
};

export function makeSampleImportCsv(
  accounts: readonly AccountWithBalanceResponse[],
): { readonly csvText: string; readonly fileName: string } | null {
  const sourceAccount = accounts[0];
  const destinationAccount = accounts[1];
  if (!sourceAccount || !destinationAccount || sourceAccount.id === destinationAccount.id) {
    return null;
  }

  const occurredAt = new Date().toISOString();
  return {
    csvText: [
      "type,sourceAccountId,destinationAccountId,amountMinor,currencyCode,occurredAt,description",
      `expense,${sourceAccount.id},${destinationAccount.id},12000,${sourceAccount.currencyCode},${occurredAt},Groceries`,
    ].join("\n"),
    fileName: "quick-import.csv",
  };
}

export function makeSampleRecurringPayload(
  accounts: readonly AccountWithBalanceResponse[],
): RecurringTemplateResponse["payload"] | null {
  const sourceAccount = accounts[0];
  const destinationAccount = accounts[1];
  if (!sourceAccount || !destinationAccount || sourceAccount.id === destinationAccount.id) {
    return null;
  }

  return {
    currencyCode: sourceAccount.currencyCode,
    description: "Monthly recurring entry",
    lines: [
      {
        amountMinor: "10000",
        budgetId: null,
        categoryId: null,
        description: "Recurring line",
        destinationAccountId: destinationAccount.id,
        reportingAmountMinor: null,
        reportingCurrencyCode: null,
      },
    ],
    sourceAccountId: sourceAccount.id,
    title: "Recurring template",
    type: "expense",
  };
}

export function sumAccountBalances(accounts: readonly AccountWithBalanceResponse[]): bigint {
  return accounts.reduce((total, account) => total + BigInt(account.balance.amountMinor), 0n);
}

export function getPendingOutboxTone(count: number): Tone {
  if (count === 0) {
    return "success";
  }

  if (count <= 2) {
    return "warning";
  }

  return "danger";
}

export function toNavigationTestIdSlug(slug: NavigationItem["slug"]): NavigationTestIdSlug {
  return slug as NavigationTestIdSlug;
}

export function getServerStatusIcon(apiStatus: string): LucideIcon {
  if (apiStatus === en.status.apiOffline) {
    return XCircle;
  }

  if (apiStatus === en.shell.checkingApi) {
    return RefreshCcw;
  }

  return CheckCircle2;
}

export function getServerStatusTone(apiStatus: string): Tone {
  if (apiStatus === en.status.apiOffline) {
    return "danger";
  }

  if (apiStatus === en.shell.checkingApi) {
    return "neutral";
  }

  return "success";
}

export function formatPendingSyncMessage(count: number): string {
  return count === 1
    ? en.shell.pendingSyncOne
    : en.shell.pendingSyncMany.replace("{count}", count.toString());
}

export function formatOpenConflictMessage(count: number): string {
  return `${count} ${en.shell.openConflicts.toLowerCase()} need review.`;
}

export function cycleTheme(current: Theme): Theme {
  if (current === "system") {
    return "dark";
  }
  if (current === "dark") {
    return "light";
  }
  return "system";
}

export function formatThemeLabel(theme: Theme): string {
  if (theme === "dark") {
    return en.shell.darkTheme;
  }
  if (theme === "light") {
    return en.shell.lightTheme;
  }
  return en.shell.systemTheme;
}

export function hasActiveTransactionFilters(filters: TransactionListFilterState): boolean {
  return (
    filters.accountId !== ALL_TRANSACTION_FILTER ||
    filters.status !== ALL_TRANSACTION_FILTER ||
    filters.type !== ALL_TRANSACTION_FILTER
  );
}

export function formatBudgetPeriodLabel(period: string): string {
  switch (period) {
    case "bi_weekly":
      return en.budgets.periods.bi_weekly;
    case "custom":
      return en.budgets.periods.custom;
    case "monthly":
      return en.budgets.periods.monthly;
    case "quarterly":
      return en.budgets.periods.quarterly;
    case "semi_monthly":
      return en.budgets.periods.semi_monthly;
    case "weekly":
      return en.budgets.periods.weekly;
    case "yearly":
      return en.budgets.periods.yearly;
    default:
      return period;
  }
}

export function formatAccountArchiveTitle(accountName: string): string {
  return en.accounts.archiveTitle.replace("{name}", accountName);
}

export function formatAccountArchiveSuccess(accountName: string): string {
  return en.accounts.archiveSuccess.replace("{name}", accountName);
}

export function getAccountArchiveError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return en.accounts.archiveFailed;
}

export function sumTransactionAmounts(
  transactions: readonly TransactionGroupResponse[],
  type: "expense" | "income",
): bigint {
  return transactions
    .filter((transaction) => transaction.type === type)
    .reduce((total, transaction) => total + getTransactionAbsoluteMinor(transaction), 0n);
}

export function formatTransactionAmount(transaction: TransactionGroupResponse): string {
  const firstPosting = transaction.journals[0]?.postings[0];
  if (!firstPosting) {
    return formatMoneyMinor(0n, "INR");
  }

  const amountMinor =
    transaction.type === "income"
      ? absMinor(firstPosting.amountMinor)
      : transaction.type === "expense"
        ? -absMinor(firstPosting.amountMinor)
        : absMinor(firstPosting.amountMinor);

  return formatMoneyMinor(amountMinor, firstPosting.currencyCode);
}

export function getTransactionAbsoluteMinor(transaction: TransactionGroupResponse): bigint {
  const firstPosting = transaction.journals[0]?.postings[0];
  return firstPosting ? absMinor(firstPosting.amountMinor) : 0n;
}

export function absMinor(amountMinor: string): bigint {
  const value = BigInt(amountMinor);
  return value < 0n ? -value : value;
}

export function formatDate(value: string | undefined): string {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function readInitialTheme(): Theme {
  const value = window.localStorage.getItem("fastifly.theme");
  return value === "dark" || value === "light" || value === "system" ? value : "system";
}
