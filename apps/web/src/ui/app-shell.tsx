import type { AccountWithBalanceResponse, TransactionGroupResponse } from "@fastifly/common";
import { Link, useLocation } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CircleDollarSign,
  Landmark,
  Menu,
  Moon,
  ReceiptText,
  Smartphone,
  Sun,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { type PropsWithChildren, useEffect, useMemo, useState } from "react";
import {
  useAccountsQuery,
  useHealthQuery,
  useMeContextQuery,
  useTransactionsQuery,
} from "../api/queries";
import { en } from "../i18n/en";
import { registerServiceWorker } from "../pwa";
import { readPendingOutboxCount } from "../sync/outbox";
import {
  getCurrentNavigationItem,
  getMobilePrimaryNavigation,
  type NavigationItem,
  navigationItems,
} from "./navigation";

type Theme = "light" | "dark";

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const isAuthRoute = location.pathname === "/login";
  const [theme, setTheme] = useState<Theme>(() => readInitialTheme());
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [pendingOutboxCount, setPendingOutboxCount] = useState(() =>
    readPendingOutboxCount(window.localStorage),
  );
  const health = useHealthQuery();
  const meContext = useMeContextQuery(!isAuthRoute);
  const ledgerContext = meContext.data
    ? {
        ledgerId: meContext.data.data.activeLedger.id,
        workspaceId: meContext.data.data.activeWorkspace.id,
      }
    : null;
  const accountsQuery = useAccountsQuery(ledgerContext);
  const transactionsQuery = useTransactionsQuery(ledgerContext);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("fastifly.theme", theme);
  }, [theme]);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    setPendingOutboxCount(readPendingOutboxCount(window.localStorage));
    void registerServiceWorker();

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMoreOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const apiStatus = useMemo(() => {
    if (health.isPending) {
      return en.shell.checkingApi;
    }
    if (health.isError) {
      return en.status.apiOffline;
    }

    return en.status.apiOnline;
  }, [health.isError, health.isPending]);
  const currentNavigationItem = getCurrentNavigationItem(location.pathname);
  const mobileTabs = getMobilePrimaryNavigation();
  const accounts = accountsQuery.data?.data ?? [];
  const transactions = transactionsQuery.data?.data ?? [];
  const assetAccounts = accounts.filter((account) => account.kind === "asset");
  const liabilityAccounts = accounts.filter((account) => account.kind === "liability");
  const incomeMinor = sumTransactionAmounts(transactions, "income");
  const expenseMinor = sumTransactionAmounts(transactions, "expense");
  const transferCount = transactions.filter(
    (transaction) => transaction.type === "transfer",
  ).length;
  const netWorth = formatMoney(sumAccountBalances([...assetAccounts, ...liabilityAccounts]), "INR");
  const cashAndBank = formatMoney(sumAccountBalances(assetAccounts), "INR");
  const liabilities = formatMoney(sumAccountBalances(liabilityAccounts), "INR");
  const income = formatMoney(incomeMinor, "INR");
  const spending = formatMoney(-expenseMinor, "INR");
  const cashflow = formatMoney(incomeMinor - expenseMinor, "INR");
  const spendingRate =
    incomeMinor > 0n ? `${((expenseMinor * 100n) / incomeMinor).toString()}%` : "0%";
  const moneySummaryValue =
    meContext.isPending || accountsQuery.isPending ? en.shell.loadingData : netWorth;
  const accountPreview = [...assetAccounts, ...liabilityAccounts].slice(0, 5);

  if (isAuthRoute) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <div className="grid min-h-screen xl:grid-cols-[248px_1fr]">
        <aside className="hidden border-slate-200 border-r bg-white xl:block dark:border-slate-800 dark:bg-slate-950">
          <div className="flex h-full flex-col px-4 py-5">
            <div className="flex items-center gap-3 px-2">
              <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-600 text-white">
                <CircleDollarSign className="size-5" aria-hidden="true" />
              </div>
              <div>
                <p className="font-semibold text-base">{en.appName}</p>
                <p className="text-slate-500 text-xs dark:text-slate-400">
                  {en.shell.personalFinance}
                </p>
              </div>
            </div>
            <nav className="mt-8 space-y-1">
              {navigationItems.map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  className="flex items-center gap-3 rounded-md px-3 py-2 font-medium text-slate-600 text-sm transition hover:bg-slate-100 hover:text-slate-950 [&.active]:bg-slate-900 [&.active]:text-white dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white dark:[&.active]:bg-slate-100 dark:[&.active]:text-slate-950"
                >
                  <item.icon className="size-4" aria-hidden="true" />
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="mt-auto rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-center gap-2 text-sm">
                {isOnline ? (
                  <Wifi className="size-4 text-emerald-600" aria-hidden="true" />
                ) : (
                  <WifiOff className="size-4 text-amber-600" aria-hidden="true" />
                )}
                <span>{isOnline ? en.status.browserOnline : en.status.browserOffline}</span>
              </div>
              <p className="mt-2 text-slate-500 text-xs dark:text-slate-400">{apiStatus}</p>
            </div>
          </div>
        </aside>

        <main className="min-w-0 overflow-x-hidden">
          <header className="sticky top-0 z-10 border-slate-200 border-b bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate font-semibold text-lg">{currentNavigationItem.label}</h1>
                <p className="max-w-[20rem] text-slate-500 text-sm dark:text-slate-400">
                  {en.shell.subtitle}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="inline-flex size-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  aria-label={en.shell.toggleTheme}
                >
                  {theme === "dark" ? (
                    <Sun className="size-4" aria-hidden="true" />
                  ) : (
                    <Moon className="size-4" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  className="inline-flex size-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100 xl:hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                  onClick={() => setIsMoreOpen(true)}
                  aria-label={en.nav.more}
                >
                  <Menu className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 xl:hidden">
              <StatusPill
                icon={isOnline ? Wifi : WifiOff}
                label={isOnline ? en.status.browserOnline : en.status.browserOffline}
                tone={isOnline ? "success" : "warning"}
              />
              <StatusPill
                icon={Landmark}
                label={`${en.shell.accounts}: ${accounts.length}`}
                tone="neutral"
              />
              <StatusPill
                icon={ReceiptText}
                label={`${en.shell.transactions}: ${transactions.length}`}
                tone="neutral"
              />
            </div>
          </header>
          {pendingOutboxCount > 0 ? (
            <div className="border-amber-200 border-b bg-amber-50 px-4 py-2 text-amber-950 text-sm dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
              <div className="mx-auto flex max-w-screen-2xl items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <p className="min-w-0">{formatPendingSyncMessage(pendingOutboxCount)}</p>
              </div>
            </div>
          ) : null}

          <PageBody
            accounts={accounts}
            accountPreview={accountPreview}
            accountsLoading={accountsQuery.isPending}
            apiStatus={apiStatus}
            cashAndBank={cashAndBank}
            cashflow={cashflow}
            income={income}
            liabilities={liabilities}
            moneySummaryValue={moneySummaryValue}
            pageSlug={currentNavigationItem.slug}
            pendingOutboxCount={pendingOutboxCount}
            spending={spending}
            spendingRate={spendingRate}
            transactions={transactions}
            transactionsError={meContext.isError}
            transferCount={transferCount}
          />
          {children}
        </main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-slate-200 border-t bg-white/95 px-2 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur xl:hidden dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto grid max-w-2xl grid-cols-5 gap-1">
          {mobileTabs.map((item) => (
            <MobileNavLink key={item.label} item={item} onClick={() => setIsMoreOpen(false)} />
          ))}
          <button
            type="button"
            className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-slate-500 text-xs transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900"
            onClick={() => setIsMoreOpen(true)}
            aria-label={en.nav.more}
          >
            <Menu className="size-5" aria-hidden="true" />
            <span className="max-w-full truncate">{en.nav.more}</span>
          </button>
        </div>
      </nav>
      <MobileMoreDrawer
        apiStatus={apiStatus}
        isOnline={isOnline}
        onClose={() => setIsMoreOpen(false)}
        open={isMoreOpen}
        pendingOutboxCount={pendingOutboxCount}
      />
    </div>
  );
}

function PageBody({
  accounts,
  accountPreview,
  accountsLoading,
  apiStatus,
  cashAndBank,
  cashflow,
  income,
  liabilities,
  moneySummaryValue,
  pageSlug,
  pendingOutboxCount,
  spending,
  spendingRate,
  transactions,
  transactionsError,
  transferCount,
}: {
  readonly accounts: readonly AccountWithBalanceResponse[];
  readonly accountPreview: readonly AccountWithBalanceResponse[];
  readonly accountsLoading: boolean;
  readonly apiStatus: string;
  readonly cashAndBank: string;
  readonly cashflow: string;
  readonly income: string;
  readonly liabilities: string;
  readonly moneySummaryValue: string;
  readonly pageSlug: string;
  readonly pendingOutboxCount: number;
  readonly spending: string;
  readonly spendingRate: string;
  readonly transactions: readonly TransactionGroupResponse[];
  readonly transactionsError: boolean;
  readonly transferCount: number;
}) {
  if (pageSlug === "transactions") {
    return <TransactionsPage transactions={transactions} />;
  }
  if (pageSlug === "accounts") {
    return <AccountsPage accounts={accounts} accountsLoading={accountsLoading} />;
  }
  if (pageSlug === "budgets") {
    return (
      <BudgetPage
        cashflow={cashflow}
        income={income}
        spending={spending}
        spendingRate={spendingRate}
      />
    );
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
    return <SettingsPage apiStatus={apiStatus} pendingOutboxCount={pendingOutboxCount} />;
  }

  return (
    <DashboardPage
      accountPreview={accountPreview}
      accountsLoading={accountsLoading}
      accountsTotal={accounts.length}
      apiStatus={apiStatus}
      cashAndBank={cashAndBank}
      income={income}
      liabilities={liabilities}
      moneySummaryValue={moneySummaryValue}
      pendingOutboxCount={pendingOutboxCount}
      spending={spending}
      transactions={transactions}
      transactionsError={transactionsError}
    />
  );
}

function DashboardPage({
  accountPreview,
  accountsLoading,
  accountsTotal,
  apiStatus,
  cashAndBank,
  income,
  liabilities,
  moneySummaryValue,
  pendingOutboxCount,
  spending,
  transactions,
  transactionsError,
}: {
  readonly accountPreview: readonly AccountWithBalanceResponse[];
  readonly accountsLoading: boolean;
  readonly accountsTotal: number;
  readonly apiStatus: string;
  readonly cashAndBank: string;
  readonly income: string;
  readonly liabilities: string;
  readonly moneySummaryValue: string;
  readonly pendingOutboxCount: number;
  readonly spending: string;
  readonly transactions: readonly TransactionGroupResponse[];
  readonly transactionsError: boolean;
}) {
  return (
    <section className="grid min-w-0 max-w-full gap-4 p-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:grid-cols-[minmax(0,1fr)_360px] lg:p-6 xl:pb-6">
      <div className="min-w-0 space-y-4">
        <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-base">{en.shell.moneyTitle}</h2>
              <p className="text-slate-500 text-sm dark:text-slate-400">
                {en.shell.derivedBalances}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-slate-500 text-xs dark:text-slate-400">{en.shell.netWorth}</p>
              <p className="font-semibold text-xl sm:text-2xl">{moneySummaryValue}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <MetricCard label={en.shell.cashAndBank} value={cashAndBank} />
            <MetricCard label={en.shell.liabilities} value={liabilities} />
            <MetricCard label={en.shell.accounts} value={accountsTotal.toString()} />
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 md:gap-4">
          <MetricCard label={en.shell.incomeThisMonth} value={income} />
          <MetricCard label={en.shell.spentThisMonth} value={spending} />
        </section>

        <TransactionsPanel
          description={null}
          limit={8}
          title={en.shell.recentTransactions}
          transactions={transactions}
          transactionsError={transactionsError}
          withViewAll
        />
      </div>

      <DashboardAside
        accountPreview={accountPreview}
        accountsLoading={accountsLoading}
        apiStatus={apiStatus}
        income={income}
        pendingOutboxCount={pendingOutboxCount}
        spending={spending}
      />
    </section>
  );
}

function TransactionsPage({
  transactions,
}: {
  readonly transactions: readonly TransactionGroupResponse[];
}) {
  return (
    <section className="grid min-w-0 max-w-full gap-4 p-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:p-6 xl:pb-6">
      <TransactionsPanel
        description={en.shell.transactionsBody}
        title={en.shell.allTransactions}
        transactions={transactions}
        transactionsError={false}
      />
    </section>
  );
}

function AccountsPage({
  accounts,
  accountsLoading,
}: {
  readonly accounts: readonly AccountWithBalanceResponse[];
  readonly accountsLoading: boolean;
}) {
  return (
    <section className="grid min-w-0 max-w-full gap-4 p-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:p-6 xl:pb-6">
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-semibold text-base">{en.shell.allAccounts}</h2>
        <p className="mt-1 text-slate-500 text-sm dark:text-slate-400">{en.shell.accountsBody}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {accounts.length > 0 ? (
            accounts.map((account) => <AccountCard key={account.id} account={account} />)
          ) : (
            <p className="text-slate-500 text-sm dark:text-slate-400">
              {accountsLoading ? en.shell.loadingData : en.shell.noAccountsBody}
            </p>
          )}
        </div>
      </section>
    </section>
  );
}

function BudgetPage({
  cashflow,
  income,
  spending,
  spendingRate,
}: {
  readonly cashflow: string;
  readonly income: string;
  readonly spending: string;
  readonly spendingRate: string;
}) {
  return (
    <section className="grid min-w-0 max-w-full gap-4 p-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:grid-cols-3 lg:p-6 xl:pb-6">
      <section className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-3 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-semibold text-base">{en.shell.budgetWatch}</h2>
        <p className="mt-1 text-slate-500 text-sm dark:text-slate-400">
          {en.shell.budgetWatchBody}
        </p>
      </section>
      <MetricCard label={en.shell.incomeThisMonth} value={income} />
      <MetricCard label={en.shell.spentThisMonth} value={spending} />
      <MetricCard label={en.shell.availableAfterSpending} value={cashflow} />
      <MetricCard label={en.shell.spendingRate} value={spendingRate} />
    </section>
  );
}

function ReportsPage({
  accounts,
  cashAndBank,
  cashflow,
  income,
  liabilities,
  spending,
  transferCount,
}: {
  readonly accounts: readonly AccountWithBalanceResponse[];
  readonly cashAndBank: string;
  readonly cashflow: string;
  readonly income: string;
  readonly liabilities: string;
  readonly spending: string;
  readonly transferCount: number;
}) {
  return (
    <section className="grid min-w-0 max-w-full gap-4 p-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:grid-cols-2 lg:p-6 xl:pb-6">
      <section className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-semibold text-base">{en.shell.reportSummary}</h2>
        <p className="mt-1 text-slate-500 text-sm dark:text-slate-400">
          {en.shell.reportSummaryBody}
        </p>
      </section>
      <MetricCard label={en.shell.cashflow} value={cashflow} />
      <MetricCard label={en.shell.cashAndBank} value={cashAndBank} />
      <MetricCard label={en.shell.liabilities} value={liabilities} />
      <MetricCard label={en.shell.accounts} value={accounts.length.toString()} />
      <MetricCard label={en.shell.income} value={income} />
      <MetricCard label={en.shell.spending} value={spending} />
      <MetricCard label={en.shell.transferCount} value={transferCount.toString()} />
    </section>
  );
}

function SettingsPage({
  apiStatus,
  pendingOutboxCount,
}: {
  readonly apiStatus: string;
  readonly pendingOutboxCount: number;
}) {
  return (
    <section className="grid min-w-0 max-w-full gap-4 p-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:grid-cols-[minmax(0,1fr)_360px] lg:p-6 xl:pb-6">
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-semibold text-base">{en.shell.settingsOverview}</h2>
        <p className="mt-1 text-slate-500 text-sm dark:text-slate-400">{en.shell.settingsBody}</p>
        <div className="mt-4 space-y-2 text-sm">
          <SystemStatusRow label={en.shell.workspace} value={en.shell.demoWorkspace} />
          <SystemStatusRow label={en.shell.activeLedger} value={en.shell.demoLedger} />
          <SystemStatusRow label={en.shell.syncMode} value={en.shell.enabled} />
          <SystemStatusRow
            label={en.shell.themePreference}
            value={readInitialTheme() === "dark" ? en.shell.darkTheme : en.shell.lightTheme}
          />
        </div>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-semibold text-base">{en.shell.systemStatus}</h2>
        <div className="mt-3 space-y-2 text-sm">
          <SystemStatusRow label={en.shell.api} value={apiStatus} />
          <SystemStatusRow label={en.shell.pendingOutbox} value={pendingOutboxCount.toString()} />
          <SystemStatusRow label={en.shell.openConflicts} value={en.shell.zero} />
        </div>
      </section>
    </section>
  );
}

function DashboardAside({
  accountPreview,
  accountsLoading,
  apiStatus,
  income,
  pendingOutboxCount,
  spending,
}: {
  readonly accountPreview: readonly AccountWithBalanceResponse[];
  readonly accountsLoading: boolean;
  readonly apiStatus: string;
  readonly income: string;
  readonly pendingOutboxCount: number;
  readonly spending: string;
}) {
  return (
    <aside className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-semibold text-base">{en.shell.accountBalances}</h2>
        <div className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
          {accountPreview.length > 0 ? (
            accountPreview.map((account) => (
              <AccountBalanceRow key={account.id} account={account} />
            ))
          ) : (
            <p className="py-3 text-slate-500 text-sm dark:text-slate-400">
              {accountsLoading ? en.shell.loadingData : en.shell.noAccountsBody}
            </p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-semibold text-base">{en.shell.monthlyActivity}</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <MetricCard label={en.shell.income} value={income} compact />
          <MetricCard label={en.shell.spending} value={spending} compact />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-semibold text-base">{en.shell.systemStatus}</h2>
        <div className="mt-3 space-y-2 text-sm">
          <SystemStatusRow label={en.shell.api} value={apiStatus} />
          <SystemStatusRow label={en.shell.pendingOutbox} value={pendingOutboxCount.toString()} />
          <SystemStatusRow label={en.shell.openConflicts} value={en.shell.zero} />
        </div>
      </section>
    </aside>
  );
}

function TransactionsPanel({
  description,
  limit,
  title,
  transactions,
  transactionsError,
  withViewAll = false,
}: {
  readonly description: string | null;
  readonly limit?: number;
  readonly title: string;
  readonly transactions: readonly TransactionGroupResponse[];
  readonly transactionsError: boolean;
  readonly withViewAll?: boolean;
}) {
  const visibleTransactions = limit ? transactions.slice(0, limit) : transactions;

  return (
    <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3 border-slate-200 border-b p-4 dark:border-slate-800">
        <div>
          <h2 className="font-semibold text-base">{title}</h2>
          {description ? (
            <p className="mt-1 text-slate-500 text-sm dark:text-slate-400">{description}</p>
          ) : null}
        </div>
        {withViewAll ? (
          <Link
            to="/transactions"
            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-slate-200 px-3 py-2 font-medium text-sm transition hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800"
          >
            <ReceiptText className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">{en.shell.viewAll}</span>
          </Link>
        ) : null}
      </div>
      <div className="min-w-0 divide-y divide-slate-200 dark:divide-slate-800">
        {visibleTransactions.length > 0 ? (
          visibleTransactions.map((transaction) => (
            <TransactionRow key={transaction.id} transaction={transaction} />
          ))
        ) : (
          <div className="p-4">
            <p className="font-medium text-sm">
              {transactionsError ? en.shell.signInForDemoData : en.shell.noTransactionsTitle}
            </p>
            <p className="mt-1 break-words text-slate-500 text-sm dark:text-slate-400">
              {en.shell.noTransactionsBody}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function MobileNavLink({
  item,
  onClick,
}: {
  readonly item: NavigationItem;
  readonly onClick: () => void;
}) {
  return (
    <Link
      to={item.to}
      onClick={onClick}
      className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-slate-500 text-xs transition hover:bg-slate-100 [&.active]:bg-emerald-50 [&.active]:text-emerald-700 dark:text-slate-400 dark:hover:bg-slate-900 dark:[&.active]:bg-emerald-950 dark:[&.active]:text-emerald-300"
    >
      <item.icon className="size-5" aria-hidden="true" />
      <span className="max-w-full truncate">{item.mobileLabel}</span>
    </Link>
  );
}

function MetricCard({
  compact = false,
  label,
  value,
}: {
  readonly compact?: boolean;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-slate-500 text-xs dark:text-slate-400">{label}</p>
      <p
        className={`mt-1 break-words font-semibold ${compact ? "text-base" : "text-lg sm:text-xl"}`}
      >
        {value}
      </p>
    </div>
  );
}

function TransactionRow({ transaction }: { readonly transaction: TransactionGroupResponse }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">{transaction.title}</p>
        <p className="mt-1 text-slate-500 text-xs dark:text-slate-400">
          {formatDate(transaction.journals[0]?.occurredAt)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-semibold text-sm">{formatTransactionAmount(transaction)}</p>
        <p className="mt-1 text-slate-500 text-xs capitalize dark:text-slate-400">
          {transaction.type}
        </p>
      </div>
    </div>
  );
}

function AccountCard({ account }: { readonly account: AccountWithBalanceResponse }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-sm">{account.name}</p>
          <p className="mt-1 text-slate-500 text-xs capitalize dark:text-slate-400">
            {account.kind} / {account.subtype}
          </p>
        </div>
        <span className="rounded-full border border-slate-200 px-2 py-1 text-slate-500 text-xs dark:border-slate-800 dark:text-slate-400">
          {account.currencyCode}
        </span>
      </div>
      <p className="mt-4 break-words font-semibold text-lg">
        {formatMoney(BigInt(account.balance.amountMinor), account.balance.currencyCode)}
      </p>
    </div>
  );
}

function AccountBalanceRow({ account }: { readonly account: AccountWithBalanceResponse }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">{account.name}</p>
        <p className="mt-1 text-slate-500 text-xs capitalize dark:text-slate-400">{account.kind}</p>
      </div>
      <p className="shrink-0 font-semibold text-sm">
        {formatMoney(BigInt(account.balance.amountMinor), account.balance.currencyCode)}
      </p>
    </div>
  );
}

function SystemStatusRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 dark:border-slate-800">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function MobileMoreDrawer({
  apiStatus,
  isOnline,
  onClose,
  open,
  pendingOutboxCount,
}: {
  readonly apiStatus: string;
  readonly isOnline: boolean;
  readonly onClose: () => void;
  readonly open: boolean;
  readonly pendingOutboxCount: number;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-30 xl:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/40"
        onClick={onClose}
        aria-label={en.shell.closeNavigation}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={en.shell.navigation}
        className="absolute right-0 bottom-0 left-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-slate-200 border-t bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl dark:border-slate-800 dark:bg-slate-950"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-base">{en.shell.navigation}</h2>
            <p className="text-slate-500 text-sm dark:text-slate-400">{en.shell.mobileSummary}</p>
          </div>
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-md border border-slate-200 dark:border-slate-800"
            onClick={onClose}
            aria-label={en.shell.closeNavigation}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 grid gap-2">
          <StatusPill
            icon={isOnline ? Wifi : WifiOff}
            label={isOnline ? en.status.browserOnline : en.status.browserOffline}
            tone={isOnline ? "success" : "warning"}
          />
          <StatusPill icon={Smartphone} label={apiStatus} tone="neutral" />
          <StatusPill
            icon={Smartphone}
            label={`${en.shell.pendingOutbox}: ${pendingOutboxCount}`}
            tone="neutral"
          />
        </div>

        <nav className="mt-5 grid grid-cols-2 gap-2" aria-label={en.shell.navigation}>
          {navigationItems.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              onClick={onClose}
              className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm transition hover:bg-slate-100 [&.active]:border-emerald-300 [&.active]:bg-emerald-50 [&.active]:text-emerald-700 dark:border-slate-800 dark:hover:bg-slate-900 dark:[&.active]:border-emerald-900 dark:[&.active]:bg-emerald-950 dark:[&.active]:text-emerald-300"
            >
              <item.icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>
    </div>
  );
}

function sumAccountBalances(accounts: readonly AccountWithBalanceResponse[]): bigint {
  return accounts.reduce((total, account) => total + BigInt(account.balance.amountMinor), 0n);
}

function formatPendingSyncMessage(count: number): string {
  return count === 1
    ? en.shell.pendingSyncOne
    : en.shell.pendingSyncMany.replace("{count}", count.toString());
}

function sumTransactionAmounts(
  transactions: readonly TransactionGroupResponse[],
  type: "expense" | "income",
): bigint {
  return transactions
    .filter((transaction) => transaction.type === type)
    .reduce((total, transaction) => total + getTransactionAbsoluteMinor(transaction), 0n);
}

function formatTransactionAmount(transaction: TransactionGroupResponse): string {
  const firstPosting = transaction.journals[0]?.postings[0];
  if (!firstPosting) {
    return formatMoney(0n, "INR");
  }

  const amountMinor =
    transaction.type === "income"
      ? absMinor(firstPosting.amountMinor)
      : transaction.type === "expense"
        ? -absMinor(firstPosting.amountMinor)
        : absMinor(firstPosting.amountMinor);

  return formatMoney(amountMinor, firstPosting.currencyCode);
}

function getTransactionAbsoluteMinor(transaction: TransactionGroupResponse): bigint {
  const firstPosting = transaction.journals[0]?.postings[0];
  return firstPosting ? absMinor(firstPosting.amountMinor) : 0n;
}

function absMinor(amountMinor: string): bigint {
  const value = BigInt(amountMinor);
  return value < 0n ? -value : value;
}

function formatMoney(amountMinor: bigint, currencyCode: string): string {
  const sign = amountMinor < 0n ? "-" : "";
  const absolute = amountMinor < 0n ? -amountMinor : amountMinor;
  const whole = absolute / 100n;
  const cents = absolute % 100n;
  return `${sign}${currencyCode} ${whole.toString()}.${cents.toString().padStart(2, "0")}`;
}

function formatDate(value: string | undefined): string {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function StatusPill({
  icon: Icon,
  label,
  tone,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly tone: "neutral" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
        : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300";

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${toneClass}`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

function readInitialTheme(): Theme {
  return window.localStorage.getItem("fastifly.theme") === "dark" ? "dark" : "light";
}
