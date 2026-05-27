import type {
  AccountWithBalanceResponse,
  CategoryResponse,
  TransactionGroupResponse,
} from "@fastifly/common";
import { Link } from "@tanstack/react-router";
import { Button } from "@ui/button";
import { Card, CardContent } from "@ui/card";
import { Field, FieldLabel } from "@ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { Separator } from "@ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@ui/toggle-group";
import { ArrowRight, RefreshCcw } from "lucide-react";
import { useQueryStates } from "nuqs";
import { lazy, Suspense, useEffect, useMemo } from "react";
import {
  useCategoriesQuery,
  useInfiniteTransactionsQuery,
  useNetWorthTrendQuery,
} from "../../api/queries";
import {
  ALL_TRANSACTION_FILTER,
  buildTransactionListQuery,
  getFilterableTransactionAccounts,
  getFilterableTransactionCategories,
  makeTransactionListFilterDefaults,
  normalizeTransactionAccountFilter,
  normalizeTransactionCategoryFilter,
  type TransactionListFilterState,
  type TransactionStatusFilter,
  type TransactionTypeFilter,
} from "../../finance/transaction-list";
import { en } from "../../i18n/en";
import { testIds } from "../../testing/testid-registry";
import { AccountCreateDialog } from "../account-create-panel";
import { CategoryCreateDialog } from "../category-create-dialog";
import { TransactionCreatePanel } from "../transaction-create-panel";
import {
  AccountsPage,
  BudgetPage,
  CategoriesPage,
  ImportsPage,
  RecurringPage,
  RulesPage,
} from "./pages-accounts";
import { DashboardAside, ReportsPage, SettingsPage, SyncPage } from "./pages-finance";
import { TransactionsPanel } from "./transaction-components";
import {
  hasActiveTransactionFilters,
  type Theme,
  transactionFilterParsers,
  transactionStatusFilterOptions,
  transactionTypeFilterOptions,
} from "./utils";

const DashboardCharts = lazy(async () => {
  const module = await import("./dashboard-charts");
  return { default: module.DashboardCharts };
});

export function DashboardPage({
  accounts,
  accountPreview,
  accountsLoading,
  cashAndBank,
  ledgerContext,
  liabilities,
  reportingCurrencyCode,
  transactions,
  transactionCount,
  transactionsLoading,
}: {
  readonly accounts: readonly AccountWithBalanceResponse[];
  readonly accountPreview: readonly AccountWithBalanceResponse[];
  readonly accountsLoading: boolean;
  readonly cashAndBank: string;
  readonly ledgerContext: {
    readonly ledgerId: string;
    readonly workspaceId: string;
  } | null;
  readonly liabilities: string;
  readonly reportingCurrencyCode: string;
  readonly transactions: readonly TransactionGroupResponse[];
  readonly transactionCount: number;
  readonly transactionsLoading: boolean;
}) {
  const categoriesQuery = useCategoriesQuery(ledgerContext);
  const netWorthTrendQuery = useNetWorthTrendQuery(ledgerContext, { months: 6 });
  const categoryCount = categoriesQuery.data?.data.length;
  const categories = categoriesQuery.data?.data ?? [];
  const isCategoryChecklistLoading = categoriesQuery.isPending && categoryCount === undefined;
  const isChecklistLoading = accountsLoading || isCategoryChecklistLoading || transactionsLoading;
  const setupItems = useMemo(
    () => [
      {
        actionHref: "/accounts" as const,
        actionLabel: en.accounts.addAccount,
        completed: hasBankAccount(accounts),
        hint: en.shell.gettingStartedHints.bankAccount,
        key: "bankAccount",
        label: en.shell.gettingStartedItems.bankAccount,
      },
      {
        actionHref: "/categories" as const,
        actionLabel: en.categories.addCategory,
        completed: isCategoryChecklistLoading ? true : (categoryCount ?? 0) > 0,
        hint: en.shell.gettingStartedHints.expenseCategory,
        key: "expenseCategory",
        label: en.shell.gettingStartedItems.expenseCategory,
      },
      {
        actionHref: "/transactions" as const,
        actionLabel: en.shell.gettingStartedActions.openTransactions,
        completed: transactionsLoading ? true : transactionCount > 0,
        hint: en.shell.gettingStartedHints.firstTransaction,
        key: "firstTransaction",
        label: en.shell.gettingStartedItems.firstTransaction,
      },
    ],
    [accounts, categoryCount, isCategoryChecklistLoading, transactionCount, transactionsLoading],
  );
  const showGettingStarted = !isChecklistLoading && setupItems.some((item) => !item.completed);
  const completedSetupCount = setupItems.filter((item) => item.completed).length;
  const setupProgressPercent = Math.round((completedSetupCount / setupItems.length) * 100);
  const nextSetupItem = setupItems.find((item) => !item.completed);
  const isAddAccountStep = nextSetupItem?.key === "bankAccount";
  const isAddCategoryStep = nextSetupItem?.key === "expenseCategory";
  const isFirstTransactionStep = nextSetupItem?.key === "firstTransaction";

  return (
    <section
      className="mt-2 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(22rem,0.8fr)]"
      data-testid={testIds.dashboard.page}
    >
      {showGettingStarted && nextSetupItem ? (
        <Card
          className="relative overflow-hidden border border-amber-300/70 bg-gradient-to-br from-amber-50/95 via-amber-100/90 to-orange-100/70 text-card-foreground shadow-[0_10px_26px_-14px_rgba(146,64,14,0.42)] dark:border-amber-500/45 dark:from-[#2b1f11] dark:via-[#2a1c0f] dark:to-[#24170d] xl:col-span-2"
          data-testid={testIds.dashboard.gettingStartedCard}
        >
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <p
                  className="font-semibold text-[0.95rem] leading-none tracking-tight"
                  data-testid={testIds.dashboard.gettingStartedTitle}
                >
                  {en.shell.gettingStartedTitle}
                </p>
                <p
                  className="text-[0.8125rem] text-muted-foreground"
                  data-testid={testIds.dashboard.gettingStartedBody}
                >
                  {en.shell.gettingStartedBody}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-amber-300/60 bg-amber-50/80 px-2.5 py-1 text-[11px] font-medium text-amber-900 dark:border-amber-500/45 dark:bg-amber-300/12 dark:text-amber-100">
                  {completedSetupCount}/{setupItems.length} complete
                </span>
              </div>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-100 via-emerald-300 to-emerald-700 dark:from-emerald-300/35 dark:via-emerald-400/60 dark:to-emerald-500/95 transition-all"
                style={{ width: `${setupProgressPercent}%` }}
              />
            </div>
            <ul className="grid gap-2" data-testid={testIds.dashboard.gettingStartedList}>
              <li
                className={`rounded-xl border border-amber-300/90 bg-amber-50/90 px-3.5 py-2.5 text-[0.8125rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] transition-colors dark:border-amber-600/45 dark:bg-amber-500/10 ${
                  isFirstTransactionStep
                    ? "flex flex-col gap-2.5"
                    : "flex items-start justify-between gap-3"
                }`}
                data-testid={testIds.dashboard.gettingStartedItem(nextSetupItem.key)}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{nextSetupItem.label}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{nextSetupItem.hint}</p>
                </div>
                <div
                  className={isFirstTransactionStep ? "w-full" : "flex shrink-0 items-center gap-2"}
                >
                  {isAddAccountStep ? (
                    <AccountCreateDialog
                      ledgerContext={ledgerContext}
                      trigger={
                        <Button
                          className="bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:border-emerald-500/40 focus-visible:ring-emerald-500/25 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                          data-icon="inline-end"
                          data-testid={testIds.accounts.create.openButton}
                          size="sm"
                          type="button"
                        >
                          <span>{nextSetupItem.actionLabel}</span>
                          <ArrowRight aria-hidden="true" />
                        </Button>
                      }
                    />
                  ) : isAddCategoryStep ? (
                    <CategoryCreateDialog
                      ledgerContext={ledgerContext}
                      trigger={
                        <Button
                          className="bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:border-emerald-500/40 focus-visible:ring-emerald-500/25 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                          data-icon="inline-end"
                          data-testid={testIds.categories.create.openButton}
                          size="sm"
                          type="button"
                        >
                          <span>{nextSetupItem.actionLabel}</span>
                          <ArrowRight aria-hidden="true" />
                        </Button>
                      }
                    />
                  ) : isFirstTransactionStep ? (
                    <div className="w-full min-w-0">
                      <TransactionCreatePanel
                        accounts={accounts}
                        ledgerContext={ledgerContext}
                        variant="inline-actions"
                      />
                    </div>
                  ) : (
                    <Button
                      asChild
                      className="bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:border-emerald-500/40 focus-visible:ring-emerald-500/25 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                      data-icon="inline-end"
                      size="sm"
                      type="button"
                    >
                      <Link to={nextSetupItem.actionHref}>
                        <span>{nextSetupItem.actionLabel}</span>
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    </Button>
                  )}
                </div>
              </li>
            </ul>
          </CardContent>
        </Card>
      ) : null}
      <div className="flex flex-col gap-4">
        <Suspense fallback={<DashboardChartsShimmer />}>
          <DashboardCharts
            categories={categories}
            currencyCode={reportingCurrencyCode}
            netWorthTrend={netWorthTrendQuery.data?.points ?? []}
            transactions={transactions}
          />
        </Suspense>

        <TransactionCreatePanel accounts={accounts} ledgerContext={ledgerContext} />
      </div>

      <DashboardAside
        accountPreview={accountPreview}
        accountsLoading={accountsLoading}
        cashAndBank={cashAndBank}
        liabilities={liabilities}
      />
    </section>
  );
}
export function PageBody({
  accounts,
  accountPreview,
  accountsLoading,
  apiStatus,
  cashAndBank,
  cashflow,
  income,
  isOnline,
  isLoggingOut,
  isUpdateReady,
  ledgerContext,
  liabilities,
  onApplyUpdate,
  onLogout,
  onThemeChange,
  openConflictCount,
  pageSlug,
  pendingOutboxCount,
  syncConflicts,
  syncLastOperationAt,
  syncServerRevision,
  spending,
  spendingRate,
  reportingCurrencyCode,
  transactions,
  transactionCount,
  transactionsLoading,
  theme,
  transferCount,
  workspaceId,
  workspaceName,
  workspaceRole,
  ledgerName,
  ledgerId,
}: {
  readonly accounts: readonly AccountWithBalanceResponse[];
  readonly accountPreview: readonly AccountWithBalanceResponse[];
  readonly accountsLoading: boolean;
  readonly apiStatus: string;
  readonly cashAndBank: string;
  readonly cashflow: string;
  readonly income: string;
  readonly isOnline: boolean;
  readonly isLoggingOut: boolean;
  readonly isUpdateReady: boolean;
  readonly ledgerContext: {
    readonly ledgerId: string;
    readonly workspaceId: string;
  } | null;
  readonly liabilities: string;
  readonly openConflictCount: number;
  readonly pageSlug: string;
  readonly pendingOutboxCount: number;
  readonly syncConflicts: readonly {
    readonly id: string;
    readonly incomingOperationId: string;
    readonly conflictType:
      | "delete_after_update"
      | "duplicate_unique_value"
      | "invalid_operation"
      | "reconciled_record_blocked"
      | "stale_update"
      | "update_after_delete";
    readonly status: "dismissed" | "open" | "resolved";
  }[];
  readonly syncLastOperationAt: string | null;
  readonly syncServerRevision: string;
  readonly spending: string;
  readonly spendingRate: string;
  readonly reportingCurrencyCode: string;
  readonly transactions: readonly TransactionGroupResponse[];
  readonly transactionCount: number;
  readonly transactionsLoading: boolean;
  readonly theme: Theme;
  readonly onApplyUpdate: () => void;
  readonly onLogout: () => void;
  readonly onThemeChange: (theme: Theme) => void;
  readonly transferCount: number;
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly workspaceRole: "admin" | "editor" | "owner" | "viewer";
  readonly ledgerName: string;
  readonly ledgerId: string;
}) {
  if (pageSlug === "transactions") {
    return <TransactionsPage accounts={accounts} ledgerContext={ledgerContext} />;
  }
  if (pageSlug === "accounts") {
    return (
      <AccountsPage
        accounts={accounts}
        accountsLoading={accountsLoading}
        ledgerContext={ledgerContext}
      />
    );
  }
  if (pageSlug === "categories") {
    return <CategoriesPage ledgerContext={ledgerContext} />;
  }
  if (pageSlug === "budgets") {
    return (
      <BudgetPage
        cashflow={cashflow}
        income={income}
        ledgerContext={ledgerContext}
        spending={spending}
        spendingRate={spendingRate}
      />
    );
  }
  if (pageSlug === "imports") {
    return <ImportsPage accounts={accounts} ledgerContext={ledgerContext} />;
  }
  if (pageSlug === "rules") {
    return <RulesPage ledgerContext={ledgerContext} />;
  }
  if (pageSlug === "recurring") {
    return <RecurringPage accounts={accounts} ledgerContext={ledgerContext} />;
  }
  if (pageSlug === "reports") {
    return (
      <ReportsPage
        accounts={accounts}
        cashAndBank={cashAndBank}
        cashflow={cashflow}
        income={income}
        liabilities={liabilities}
        spending={spending}
        transferCount={transferCount}
      />
    );
  }
  if (pageSlug === "settings") {
    return (
      <SettingsPage
        apiStatus={apiStatus}
        isOnline={isOnline}
        isLoggingOut={isLoggingOut}
        isUpdateReady={isUpdateReady}
        ledgerName={ledgerName}
        ledgerId={ledgerId}
        onApplyUpdate={onApplyUpdate}
        onLogout={onLogout}
        onThemeChange={onThemeChange}
        openConflictCount={openConflictCount}
        pendingOutboxCount={pendingOutboxCount}
        theme={theme}
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        workspaceRole={workspaceRole}
      />
    );
  }
  if (pageSlug === "sync") {
    return (
      <SyncPage
        conflicts={syncConflicts}
        lastOperationAt={syncLastOperationAt}
        serverRevision={syncServerRevision}
      />
    );
  }

  return (
    <DashboardPage
      accounts={accounts}
      accountPreview={accountPreview}
      accountsLoading={accountsLoading}
      cashAndBank={cashAndBank}
      ledgerContext={ledgerContext}
      liabilities={liabilities}
      reportingCurrencyCode={reportingCurrencyCode}
      transactions={transactions}
      transactionCount={transactionCount}
      transactionsLoading={transactionsLoading}
    />
  );
}

const CHART_LABEL_SKELETON_KEYS = [
  "chart-label-1",
  "chart-label-2",
  "chart-label-3",
  "chart-label-4",
  "chart-label-5",
  "chart-label-6",
] as const;

const SPENDING_ROW_SKELETON_KEYS = [
  "spending-row-1",
  "spending-row-2",
  "spending-row-3",
  "spending-row-4",
] as const;

function hasBankAccount(accounts: readonly AccountWithBalanceResponse[]): boolean {
  return accounts.some(
    (account) =>
      account.kind === "asset" &&
      (account.subtype === "bank" ||
        account.subtype === "cash" ||
        account.subtype === "wallet" ||
        account.subtype === "investment"),
  );
}

function DashboardChartsShimmer() {
  return (
    <div
      className="grid items-start gap-3 lg:grid-cols-3"
      data-testid={testIds.dashboard.chartsSection}
    >
      <ChartCardShimmer className="lg:col-span-2" />
      <CategoryCardShimmer className="lg:row-span-2 lg:h-full lg:self-stretch" />
      <ChartCardShimmer className="lg:col-span-2" />
    </div>
  );
}

function ChartCardShimmer({ className }: { readonly className?: string }) {
  return (
    <Card className={className} size="sm">
      <CardContent className="space-y-2 px-3">
        <div className="flex items-center justify-between gap-2">
          <div className="h-4 w-44 animate-pulse rounded bg-muted/70" />
          <div className="h-4 w-24 animate-pulse rounded bg-muted/60" />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <div className="h-3 w-10 animate-pulse rounded bg-muted/60" />
            <div className="h-3 w-12 animate-pulse rounded bg-muted/60" />
          </div>
          <div className="h-3 w-20 animate-pulse rounded bg-muted/60" />
        </div>
        <div className="h-28 animate-pulse rounded-md border border-border bg-muted/30" />
        <div className="grid grid-cols-6 gap-2 px-2">
          {CHART_LABEL_SKELETON_KEYS.map((key) => (
            <div className="h-3 animate-pulse rounded bg-muted/60" key={key} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryCardShimmer({ className }: { readonly className?: string }) {
  return (
    <Card className={className} size="sm">
      <CardContent className="flex h-full flex-col gap-3 px-3">
        <div className="flex items-center justify-between gap-2">
          <div className="h-4 w-28 animate-pulse rounded bg-muted/70" />
          <div className="flex items-center gap-1.5">
            <div className="h-7 w-7 animate-pulse rounded-md border border-border bg-muted/40" />
            <div className="h-4 w-10 animate-pulse rounded bg-muted/60" />
            <div className="h-7 w-7 animate-pulse rounded-md border border-border bg-muted/40" />
          </div>
        </div>
        <div className="space-y-2.5">
          <div className="h-4 w-20 animate-pulse rounded bg-muted/60" />
          {SPENDING_ROW_SKELETON_KEYS.map((key) => (
            <div className="space-y-1.5" key={key}>
              <div className="flex items-center justify-between gap-2">
                <div className="h-3 w-28 animate-pulse rounded bg-muted/60" />
                <div className="h-3 w-16 animate-pulse rounded bg-muted/50" />
              </div>
              <div className="h-2 animate-pulse rounded bg-muted/45" />
            </div>
          ))}
          <Separator />
          <div className="ml-auto h-3 w-28 animate-pulse rounded bg-muted/55" />
        </div>
        <div className="space-y-2.5">
          <div className="h-4 w-16 animate-pulse rounded bg-muted/60" />
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="h-3 w-28 animate-pulse rounded bg-muted/60" />
              <div className="h-3 w-16 animate-pulse rounded bg-muted/50" />
            </div>
            <div className="h-2 animate-pulse rounded bg-muted/45" />
          </div>
          <Separator />
          <div className="ml-auto h-3 w-32 animate-pulse rounded bg-muted/55" />
        </div>
      </CardContent>
    </Card>
  );
}

export function TransactionsPage({
  accounts,
  ledgerContext,
}: {
  readonly accounts: readonly AccountWithBalanceResponse[];
  readonly ledgerContext: {
    readonly ledgerId: string;
    readonly workspaceId: string;
  } | null;
}) {
  const [urlFilters, setUrlFilters] = useQueryStates(transactionFilterParsers);
  const filters = useMemo<TransactionListFilterState>(
    () => ({
      ...makeTransactionListFilterDefaults(),
      ...urlFilters,
    }),
    [urlFilters],
  );
  const categoriesQuery = useCategoriesQuery(ledgerContext);
  const filterableCategories = useMemo(
    () => getFilterableTransactionCategories(categoriesQuery.data?.data ?? []),
    [categoriesQuery.data?.data],
  );
  const filterableAccounts = useMemo(() => getFilterableTransactionAccounts(accounts), [accounts]);
  const transactionQueryFilters = useMemo(() => buildTransactionListQuery(filters), [filters]);
  const transactionsQuery = useInfiniteTransactionsQuery(ledgerContext, transactionQueryFilters);
  const transactions = transactionsQuery.data?.pages.flatMap((page) => page.data) ?? [];

  useEffect(() => {
    const normalizedFilters = {
      accountId: normalizeTransactionAccountFilter(filters.accountId, filterableAccounts),
      categoryId: categoriesQuery.isPending
        ? filters.categoryId
        : normalizeTransactionCategoryFilter(filters.categoryId, filterableCategories),
    };

    if (
      normalizedFilters.accountId === filters.accountId &&
      normalizedFilters.categoryId === filters.categoryId
    ) {
      return;
    }

    void setUrlFilters({
      accountId: normalizedFilters.accountId,
      categoryId: normalizedFilters.categoryId,
      status: filters.status,
      type: filters.type,
    });
  }, [
    filterableAccounts,
    filterableCategories,
    filters.accountId,
    filters.categoryId,
    filters.status,
    filters.type,
    categoriesQuery.isPending,
    setUrlFilters,
  ]);

  return (
    <section
      className="mt-2 flex flex-col gap-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))] xl:mt-0 xl:h-full xl:min-h-0 xl:pb-0"
      data-testid={testIds.transactions.page}
    >
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)] xl:min-h-0 xl:flex-1 xl:items-start">
        <TransactionsPanel
          descriptionTestId={testIds.transactions.listDescription}
          description={en.shell.transactionsBody}
          emptyBodyId={testIds.transactions.emptyBody}
          emptyStateId={testIds.transactions.emptyState}
          emptyTitleId={testIds.transactions.emptyTitle}
          hasActiveFilters={hasActiveTransactionFilters(filters)}
          hasNextPage={Boolean(transactionsQuery.hasNextPage)}
          headerContent={
            <TransactionFilters
              accounts={filterableAccounts}
              categories={filterableCategories}
              filters={filters}
              onChange={(nextFilters) => {
                void setUrlFilters({
                  accountId: nextFilters.accountId,
                  categoryId: nextFilters.categoryId,
                  status: nextFilters.status,
                  type: nextFilters.type,
                });
              }}
            />
          }
          isFetchingNextPage={transactionsQuery.isFetchingNextPage}
          listClassName="xl:min-h-0 xl:flex-1 xl:overflow-y-auto"
          onLoadMore={() => {
            void transactionsQuery.fetchNextPage();
          }}
          onRetry={() => {
            void transactionsQuery.refetch();
          }}
          panelClassName="xl:flex xl:h-full xl:min-h-0 xl:flex-col"
          title={en.shell.allTransactions}
          titleTestId={testIds.transactions.listTitle}
          transactions={transactions}
          transactionsError={transactionsQuery.isError}
          transactionsLoading={transactionsQuery.isPending}
        />
        <TransactionCreatePanel
          accounts={accounts}
          ledgerContext={ledgerContext}
          variant="vertical-actions"
        />
      </div>
    </section>
  );
}

export function TransactionFilters({
  accounts,
  categories,
  filters,
  onChange,
}: {
  readonly accounts: readonly AccountWithBalanceResponse[];
  readonly categories: readonly CategoryResponse[];
  readonly filters: TransactionListFilterState;
  readonly onChange: (filters: TransactionListFilterState) => void;
}) {
  return (
    <div className="space-y-2" data-testid={testIds.transactions.filters.panel}>
      <Separator />
      <div className="grid gap-2 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <Field className="gap-1.5">
          <FieldLabel>{en.transactions.filters.types}</FieldLabel>
          <ToggleGroup
            className="flex w-full flex-wrap justify-start gap-1"
            data-testid={testIds.transactions.filters.typeGroup}
            onValueChange={(value) => {
              if (value) {
                onChange({ ...filters, type: value as TransactionTypeFilter });
              }
            }}
            size="sm"
            spacing={1}
            type="single"
            value={filters.type}
            variant="outline"
          >
            {transactionTypeFilterOptions.map((option) => (
              <ToggleGroupItem
                data-testid={testIds.transactions.filters.typeOption(option.value)}
                key={option.value}
                value={option.value}
              >
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        <Field className="gap-1.5">
          <FieldLabel>{en.transactions.filters.account}</FieldLabel>
          <Select
            onValueChange={(accountId) => onChange({ ...filters, accountId })}
            value={filters.accountId}
          >
            <SelectTrigger
              className="w-full"
              data-testid={testIds.transactions.filters.accountSelect}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={ALL_TRANSACTION_FILTER}>
                  {en.transactions.filters.allAccounts}
                </SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field className="gap-1.5">
          <FieldLabel>{en.transactions.filters.category}</FieldLabel>
          <Select
            onValueChange={(categoryId) => onChange({ ...filters, categoryId })}
            value={filters.categoryId}
          >
            <SelectTrigger
              className="w-full"
              data-testid={testIds.transactions.filters.categorySelect}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={ALL_TRANSACTION_FILTER}>
                  {en.transactions.filters.allCategories}
                </SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field className="gap-1.5">
          <FieldLabel>{en.transactions.filters.status}</FieldLabel>
          <Select
            onValueChange={(status) =>
              onChange({ ...filters, status: status as TransactionStatusFilter })
            }
            value={filters.status}
          >
            <SelectTrigger
              className="w-full"
              data-testid={testIds.transactions.filters.statusSelect}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {transactionStatusFilterOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <div className="flex justify-start md:justify-end">
          <Button
            data-testid={testIds.transactions.filters.resetButton}
            onClick={() => onChange(makeTransactionListFilterDefaults())}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCcw aria-hidden="true" />
            {en.transactions.filters.reset}
          </Button>
        </div>
      </div>
      <Separator />
    </div>
  );
}
