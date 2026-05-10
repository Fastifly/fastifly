import {
  type AccountWithBalanceResponse,
  formatMoneyMinor,
  type TransactionGroupResponse,
} from "@fastifly/common";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@ui/alert";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@ui/sheet";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Landmark,
  LogOut,
  Menu,
  Moon,
  ReceiptText,
  RefreshCcw,
  ShieldCheck,
  Sun,
  WalletCards,
  X,
  XCircle,
} from "lucide-react";
import { type PropsWithChildren, type ReactNode, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { apiClient } from "../api/client";
import {
  useAccountsQuery,
  useHealthQuery,
  useMeContextQuery,
  useTransactionsQuery,
} from "../api/queries";
import { type AuthSessionState, getAuthRedirect } from "../auth/flow";
import { SESSION_EXPIRED_EVENT, shouldShowSessionExpiredDialog } from "../auth/session-events";
import { en } from "../i18n/en";
import { registerServiceWorker } from "../pwa";
import { readPendingOutboxCount } from "../sync/outbox";
import { testIds } from "../testing/testid-registry";
import { AccountCreatePanel } from "./account-create-panel";
import { FastiflyIcon } from "./fastifly-icon";
import {
  getCurrentNavigationItem,
  getMobilePrimaryNavigation,
  type NavigationItem,
  navigationItems,
} from "./navigation";
import { SessionExpiredDialog } from "./session-expired-dialog";
import { TransactionCreatePanel } from "./transaction-create-panel";

type Theme = "light" | "dark";
type Tone = "danger" | "neutral" | "success" | "warning";
type NavigationTestIdSlug = Parameters<typeof testIds.navigation.mobileNav>[0];

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAuthRoute = location.pathname === "/login";
  const [theme, setTheme] = useState<Theme>(() => readInitialTheme());
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [hadAuthenticatedSession, setHadAuthenticatedSession] = useState(false);
  const [sessionExpiredFromEvent, setSessionExpiredFromEvent] = useState(false);
  const [pendingOutboxCount, setPendingOutboxCount] = useState(() =>
    readPendingOutboxCount(window.localStorage),
  );
  const health = useHealthQuery();
  const shouldLoadAuthContext = !isAuthRoute;
  const meContext = useMeContextQuery(shouldLoadAuthContext);
  const logoutMutation = useMutation({
    mutationFn: apiClient.logout,
    onSuccess: async () => {
      setHadAuthenticatedSession(false);
      setSessionExpiredFromEvent(false);
      queryClient.clear();
      await navigate({ replace: true, to: "/login" });
    },
  });
  const ledgerContext = meContext.data
    ? {
        ledgerId: meContext.data.data.activeLedger.id,
        workspaceId: meContext.data.data.activeWorkspace.id,
      }
    : null;
  const accountsQuery = useAccountsQuery(ledgerContext);
  const transactionsQuery = useTransactionsQuery(ledgerContext);
  const latestAuthError = meContext.error ?? accountsQuery.error ?? transactionsQuery.error;
  const sessionExpired =
    sessionExpiredFromEvent ||
    shouldShowSessionExpiredDialog({
      error: latestAuthError,
      hadAuthenticatedSession,
      pathname: location.pathname,
    });
  const sessionState: AuthSessionState = meContext.data
    ? "authenticated"
    : meContext.isError
      ? "unauthenticated"
      : shouldLoadAuthContext
        ? "pending"
        : "unauthenticated";

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

  useEffect(() => {
    if (meContext.data) {
      setHadAuthenticatedSession(true);
      setSessionExpiredFromEvent(false);
    }
  }, [meContext.data]);

  useEffect(() => {
    const onSessionExpired = () => {
      if (hadAuthenticatedSession && !isAuthRoute) {
        setSessionExpiredFromEvent(true);
      }
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
  }, [hadAuthenticatedSession, isAuthRoute]);

  useEffect(() => {
    if (sessionExpired) {
      return;
    }

    const redirectTo = getAuthRedirect({
      pathname: location.pathname,
      sessionState,
    });

    if (redirectTo) {
      void navigate({ replace: true, to: redirectTo });
    }
  }, [location.pathname, navigate, sessionExpired, sessionState]);

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
  const netWorthMinor = sumAccountBalances([...assetAccounts, ...liabilityAccounts]);
  const netWorth = formatMoneyMinor(netWorthMinor, "INR");
  const cashAndBank = formatMoneyMinor(sumAccountBalances(assetAccounts), "INR");
  const liabilities = formatMoneyMinor(sumAccountBalances(liabilityAccounts), "INR");
  const income = formatMoneyMinor(incomeMinor, "INR");
  const spending = formatMoneyMinor(-expenseMinor, "INR");
  const cashflow = formatMoneyMinor(incomeMinor - expenseMinor, "INR");
  const spendingRate =
    incomeMinor > 0n ? `${((expenseMinor * 100n) / incomeMinor).toString()}%` : "0%";
  const moneySummaryValue =
    meContext.isPending || accountsQuery.isPending ? en.shell.loadingData : netWorth;
  const accountPreview = [...assetAccounts, ...liabilityAccounts].slice(0, 5);

  if (isAuthRoute) {
    if (sessionState === "pending") {
      return <AuthGateScreen label={en.auth.checkingSession} />;
    }

    return <>{children}</>;
  }

  if (!meContext.data) {
    return (
      <>
        <AuthGateScreen
          label={
            sessionState === "unauthenticated"
              ? en.auth.redirectingToLogin
              : en.auth.checkingSession
          }
        />
        <SessionExpiredDialog
          onLoginSuccess={() => {
            setHadAuthenticatedSession(true);
            setSessionExpiredFromEvent(false);
          }}
          onSwitchAccount={() => {
            setHadAuthenticatedSession(false);
            setSessionExpiredFromEvent(false);
            queryClient.clear();
            void navigate({ replace: true, to: "/login" });
          }}
          open={sessionExpired}
        />
      </>
    );
  }

  const authenticatedUsername = meContext.data.data.user.username;

  return (
    <div
      className="ff-liquid-bg min-h-screen overflow-x-hidden text-white"
      data-testid={testIds.shell.app}
    >
      <main
        className="relative mx-auto min-h-screen w-full max-w-[1500px] px-3 pt-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] md:px-5 xl:px-8 xl:pb-10"
        data-testid={testIds.shell.main}
      >
        <TopBar
          accountsCount={accounts.length}
          currentNavigationItem={currentNavigationItem}
          isOnline={isOnline}
          onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
          theme={theme}
          transactionsCount={transactions.length}
        />
        {children}

        {pendingOutboxCount > 0 ? (
          <Alert
            className="mt-3 border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
            data-testid={testIds.shell.pendingSyncAlert}
          >
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            <AlertDescription>{formatPendingSyncMessage(pendingOutboxCount)}</AlertDescription>
          </Alert>
        ) : null}

        <PageBody
          accounts={accounts}
          accountPreview={accountPreview}
          accountsLoading={accountsQuery.isPending}
          apiStatus={apiStatus}
          cashAndBank={cashAndBank}
          cashflow={cashflow}
          income={income}
          isOnline={isOnline}
          ledgerContext={ledgerContext}
          liabilities={liabilities}
          moneySummaryValue={moneySummaryValue}
          pageSlug={currentNavigationItem.slug}
          pendingOutboxCount={pendingOutboxCount}
          spending={spending}
          spendingRate={spendingRate}
          transactions={transactions}
          transferCount={transferCount}
        />
        {children}
      </main>

      <nav
        className="ff-mobile-tabbar xl:hidden"
        aria-label={en.shell.navigation}
        data-testid={testIds.navigation.mobileTabbar}
      >
        {mobileTabs.map((item) => (
          <MobileNavLink key={item.label} item={item} onClick={() => setIsMoreOpen(false)} />
        ))}
        <Button
          type="button"
          variant="ghost"
          className="ff-mobile-tab"
          data-testid={testIds.navigation.mobileMoreButton}
          onClick={() => setIsMoreOpen(true)}
        >
          <Menu aria-hidden="true" />
          <span>{en.nav.more}</span>
        </Button>
      </nav>

      <MobileMoreDrawer
        apiStatus={apiStatus}
        isOnline={isOnline}
        isLoggingOut={logoutMutation.isPending}
        onClose={() => setIsMoreOpen(false)}
        onLogout={() => logoutMutation.mutate()}
        open={isMoreOpen}
        pendingOutboxCount={pendingOutboxCount}
      />
      <SessionExpiredDialog
        onLoginSuccess={() => {
          setHadAuthenticatedSession(true);
          setSessionExpiredFromEvent(false);
        }}
        onSwitchAccount={() => {
          setHadAuthenticatedSession(false);
          setSessionExpiredFromEvent(false);
          queryClient.clear();
          void navigate({ replace: true, to: "/login" });
        }}
        open={sessionExpired}
        username={authenticatedUsername}
      />
    </div>
  );
}

function TopBar({
  accountsCount,
  currentNavigationItem,
  isOnline,
  onToggleTheme,
  theme,
  transactionsCount,
}: {
  readonly accountsCount: number;
  readonly currentNavigationItem: NavigationItem;
  readonly isOnline: boolean;
  readonly onToggleTheme: () => void;
  readonly theme: Theme;
  readonly transactionsCount: number;
}) {
  return (
    <header className="ff-topbar" data-testid={testIds.shell.topBar}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-[var(--ff-shadow-soft)] dark:bg-emerald-400 dark:text-black">
          <FastiflyIcon className="size-7" />
        </span>
        <h1 className="truncate font-semibold text-[28px] leading-tight md:text-[34px]">
          <span data-testid={testIds.shell.topBarTitle}>{currentNavigationItem.label}</span>
        </h1>
      </div>
      <div
        className="hidden min-w-0 flex-wrap justify-end gap-2 md:flex"
        data-testid={testIds.shell.topBarStatus}
      >
        <StatusCapsule
          icon={isOnline ? CheckCircle2 : XCircle}
          label={isOnline ? en.status.browserOnline : en.status.browserOffline}
          testId={testIds.shell.topBarInternetStatus}
          tone={isOnline ? "success" : "danger"}
        />
        <StatusCapsule
          icon={Landmark}
          label={`${en.shell.accounts}: ${accountsCount}`}
          testId={testIds.shell.topBarAccountsStatus}
          tone="neutral"
        />
        <StatusCapsule
          icon={ReceiptText}
          label={`${en.shell.transactions}: ${transactionsCount}`}
          testId={testIds.shell.topBarTransactionsStatus}
          tone="neutral"
        />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          data-testid={testIds.shell.themeToggleButton}
          onClick={onToggleTheme}
          aria-label={en.shell.toggleTheme}
        >
          {theme === "dark" ? <Sun /> : <Moon />}
        </Button>
      </div>
    </header>
  );
}

function DashboardPage({
  accounts,
  accountPreview,
  accountsLoading,
  cashAndBank,
  income,
  ledgerContext,
  liabilities,
  moneySummaryValue,
  spending,
}: {
  readonly accounts: readonly AccountWithBalanceResponse[];
  readonly accountPreview: readonly AccountWithBalanceResponse[];
  readonly accountsLoading: boolean;
  readonly cashAndBank: string;
  readonly income: string;
  readonly ledgerContext: {
    readonly ledgerId: string;
    readonly workspaceId: string;
  } | null;
  readonly liabilities: string;
  readonly moneySummaryValue: string;
  readonly spending: string;
}) {
  return (
    <section className="ff-page-grid" data-testid={testIds.dashboard.page}>
      <div className="flex flex-col gap-4">
        <Card
          className="rounded-lg border-[color:var(--ff-border)] bg-[var(--ff-surface)] p-0 text-[var(--ff-text)] shadow-[var(--ff-shadow)] backdrop-blur-[18px]"
          data-testid={testIds.dashboard.netWorthCard}
        >
          <CardContent className="p-5 max-[380px]:p-4">
            <p
              className="font-bold text-[0.8125rem] text-[var(--ff-text-muted)]"
              data-testid={testIds.dashboard.netWorthLabel}
            >
              {en.shell.netWorth}
            </p>
            <p
              className="mt-2 break-words font-[750] text-[2.55rem] leading-none tracking-normal text-[var(--ff-text)] max-[380px]:text-[2.15rem]"
              data-testid={testIds.dashboard.netWorthValue}
            >
              {moneySummaryValue}
            </p>
            <p
              className="mt-3.5 max-w-xl text-[0.875rem] text-[var(--ff-text-muted)] leading-[1.45]"
              data-testid={testIds.dashboard.netWorthDescription}
            >
              {en.shell.derivedBalances}
            </p>
            <div
              className="mt-5 grid grid-cols-2 gap-2.5 max-[380px]:gap-2"
              data-testid={testIds.dashboard.summaryMetrics}
            >
              <MetricTile
                compact
                icon={WalletCards}
                label={en.shell.cashAndBank}
                testId={testIds.dashboard.cashAndBankMetric}
                value={cashAndBank}
              />
              <MetricTile
                compact
                icon={RefreshCcw}
                label={en.shell.liabilities}
                testId={testIds.dashboard.liabilitiesMetric}
                tone="rose"
                value={liabilities}
              />
            </div>
          </CardContent>
        </Card>

        <section className="grid grid-cols-2 gap-3" data-testid={testIds.dashboard.monthlyMetrics}>
          <MetricTile
            dense
            icon={ArrowDownLeft}
            label={en.shell.incomeThisMonth}
            testId={testIds.dashboard.incomeMetric}
            value={income}
            tone="green"
          />
          <MetricTile
            dense
            icon={ArrowUpRight}
            label={en.shell.spentThisMonth}
            testId={testIds.dashboard.spendingMetric}
            value={spending}
            tone="rose"
          />
        </section>

        <TransactionCreatePanel accounts={accounts} ledgerContext={ledgerContext} />
      </div>

      <DashboardAside accountPreview={accountPreview} accountsLoading={accountsLoading} />
    </section>
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
  isOnline,
  ledgerContext,
  liabilities,
  moneySummaryValue,
  pageSlug,
  pendingOutboxCount,
  spending,
  spendingRate,
  transactions,
  transferCount,
}: {
  readonly accounts: readonly AccountWithBalanceResponse[];
  readonly accountPreview: readonly AccountWithBalanceResponse[];
  readonly accountsLoading: boolean;
  readonly apiStatus: string;
  readonly cashAndBank: string;
  readonly cashflow: string;
  readonly income: string;
  readonly isOnline: boolean;
  readonly ledgerContext: {
    readonly ledgerId: string;
    readonly workspaceId: string;
  } | null;
  readonly liabilities: string;
  readonly moneySummaryValue: string;
  readonly pageSlug: string;
  readonly pendingOutboxCount: number;
  readonly spending: string;
  readonly spendingRate: string;
  readonly transactions: readonly TransactionGroupResponse[];
  readonly transferCount: number;
}) {
  if (pageSlug === "transactions") {
    return (
      <TransactionsPage
        accounts={accounts}
        ledgerContext={ledgerContext}
        transactions={transactions}
      />
    );
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
    return (
      <SettingsPage
        apiStatus={apiStatus}
        isOnline={isOnline}
        pendingOutboxCount={pendingOutboxCount}
      />
    );
  }

  return (
    <DashboardPage
      accounts={accounts}
      accountPreview={accountPreview}
      accountsLoading={accountsLoading}
      cashAndBank={cashAndBank}
      income={income}
      ledgerContext={ledgerContext}
      liabilities={liabilities}
      moneySummaryValue={moneySummaryValue}
      spending={spending}
    />
  );
}

function TransactionsPage({
  accounts,
  ledgerContext,
  transactions,
}: {
  readonly accounts: readonly AccountWithBalanceResponse[];
  readonly ledgerContext: {
    readonly ledgerId: string;
    readonly workspaceId: string;
  } | null;
  readonly transactions: readonly TransactionGroupResponse[];
}) {
  return (
    <section className="ff-single-page space-y-4" data-testid={testIds.transactions.page}>
      <TransactionCreatePanel accounts={accounts} ledgerContext={ledgerContext} />
      <TransactionsPanel
        descriptionTestId={testIds.transactions.listDescription}
        description={en.shell.transactionsBody}
        emptyBodyId={testIds.transactions.emptyBody}
        emptyStateId={testIds.transactions.emptyState}
        emptyTitleId={testIds.transactions.emptyTitle}
        title={en.shell.allTransactions}
        titleTestId={testIds.transactions.listTitle}
        transactions={transactions}
        transactionsError={false}
      />
    </section>
  );
}

function AccountsPage({
  accounts,
  accountsLoading,
  ledgerContext,
}: {
  readonly accounts: readonly AccountWithBalanceResponse[];
  readonly accountsLoading: boolean;
  readonly ledgerContext: {
    readonly ledgerId: string;
    readonly workspaceId: string;
  } | null;
}) {
  return (
    <section className="ff-single-page space-y-4" data-testid={testIds.accounts.page}>
      <AccountCreatePanel ledgerContext={ledgerContext} />
      <GlassSection title={en.shell.allAccounts} description={en.shell.accountsBody}>
        <div
          className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3"
          data-testid={testIds.accounts.list}
        >
          {accounts.length > 0 ? (
            accounts.map((account) => <AccountCard key={account.id} account={account} />)
          ) : (
            <p
              className="text-[14px] text-slate-600 dark:text-white/62"
              data-testid={testIds.accounts.emptyState}
            >
              {accountsLoading ? en.shell.loadingData : en.shell.noAccountsBody}
            </p>
          )}
        </div>
      </GlassSection>
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
    <section className="ff-single-page" data-testid={testIds.budgets.page}>
      <GlassSection title={en.shell.budgetWatch} description={en.shell.budgetWatchBody}>
        <div
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
          data-testid={testIds.budgets.summary}
        >
          <MetricTile
            icon={ArrowDownLeft}
            label={en.shell.incomeThisMonth}
            testId={testIds.budgets.incomeMetric}
            value={income}
            tone="green"
          />
          <MetricTile
            icon={ArrowUpRight}
            label={en.shell.spentThisMonth}
            testId={testIds.budgets.spendingMetric}
            value={spending}
            tone="rose"
          />
          <MetricTile
            icon={WalletCards}
            label={en.shell.availableAfterSpending}
            testId={testIds.budgets.availableMetric}
            value={cashflow}
          />
          <MetricTile
            icon={ShieldCheck}
            label={en.shell.spendingRate}
            testId={testIds.budgets.spendingRateMetric}
            value={spendingRate}
          />
        </div>
      </GlassSection>
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
    <section className="ff-single-page" data-testid={testIds.reports.page}>
      <GlassSection title={en.shell.reportSummary} description={en.shell.reportSummaryBody}>
        <div
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
          data-testid={testIds.reports.summary}
        >
          <MetricTile
            icon={ShieldCheck}
            label={en.shell.cashflow}
            testId={testIds.reports.cashflowMetric}
            value={cashflow}
            tone="blue"
          />
          <MetricTile
            icon={WalletCards}
            label={en.shell.cashAndBank}
            testId={testIds.reports.cashAndBankMetric}
            value={cashAndBank}
          />
          <MetricTile
            icon={RefreshCcw}
            label={en.shell.liabilities}
            testId={testIds.reports.liabilitiesMetric}
            value={liabilities}
            tone="rose"
          />
          <MetricTile
            icon={Landmark}
            label={en.shell.accounts}
            testId={testIds.reports.accountsMetric}
            value={accounts.length.toString()}
          />
          <MetricTile
            icon={ArrowDownLeft}
            label={en.shell.income}
            testId={testIds.reports.incomeMetric}
            value={income}
            tone="green"
          />
          <MetricTile
            icon={ArrowUpRight}
            label={en.shell.spending}
            testId={testIds.reports.spendingMetric}
            value={spending}
            tone="rose"
          />
          <MetricTile
            icon={RefreshCcw}
            label={en.shell.transferCount}
            testId={testIds.reports.transferCountMetric}
            value={transferCount.toString()}
            tone="blue"
          />
        </div>
      </GlassSection>
    </section>
  );
}

function SettingsPage({
  apiStatus,
  isOnline,
  pendingOutboxCount,
}: {
  readonly apiStatus: string;
  readonly isOnline: boolean;
  readonly pendingOutboxCount: number;
}) {
  return (
    <section className="ff-page-grid" data-testid={testIds.settings.page}>
      <GlassSection
        title={en.shell.settingsOverview}
        description={en.shell.settingsBody}
        testId={testIds.settings.overview}
      >
        <div className="space-y-2">
          <SystemStatusRow
            label={en.shell.workspace}
            labelTestId={testIds.settings.rowLabel("workspace")}
            rowTestId={testIds.settings.row("workspace")}
            value={en.shell.demoWorkspace}
            valueTestId={testIds.settings.rowValue("workspace")}
          />
          <SystemStatusRow
            label={en.shell.activeLedger}
            labelTestId={testIds.settings.rowLabel("active-ledger")}
            rowTestId={testIds.settings.row("active-ledger")}
            value={en.shell.demoLedger}
            valueTestId={testIds.settings.rowValue("active-ledger")}
          />
          <SystemStatusRow
            label={en.shell.syncMode}
            labelTestId={testIds.settings.rowLabel("sync-mode")}
            rowTestId={testIds.settings.row("sync-mode")}
            value={en.shell.enabled}
            valueTestId={testIds.settings.rowValue("sync-mode")}
          />
          <SystemStatusRow
            label={en.shell.themePreference}
            labelTestId={testIds.settings.rowLabel("theme-preference")}
            rowTestId={testIds.settings.row("theme-preference")}
            value={readInitialTheme() === "dark" ? en.shell.darkTheme : en.shell.lightTheme}
            valueTestId={testIds.settings.rowValue("theme-preference")}
          />
        </div>
      </GlassSection>
      <GlassSection title={en.shell.systemStatus} testId={testIds.settings.systemStatus}>
        <RuntimeStatusChips
          apiStatus={apiStatus}
          isOnline={isOnline}
          pendingOutboxCount={pendingOutboxCount}
          surface="settings"
        />
      </GlassSection>
    </section>
  );
}

function DashboardAside({
  accountPreview,
  accountsLoading,
}: {
  readonly accountPreview: readonly AccountWithBalanceResponse[];
  readonly accountsLoading: boolean;
}) {
  return (
    <aside className="flex flex-col gap-4" data-testid={testIds.dashboard.aside}>
      <GlassSection title={en.shell.accountBalances} testId={testIds.dashboard.accountBalances}>
        <div
          className="grid grid-cols-2 gap-2.5"
          data-testid={testIds.dashboard.accountBalancesList}
        >
          {accountPreview.length > 0 ? (
            accountPreview.map((account) => (
              <AccountBalanceCard key={account.id} account={account} />
            ))
          ) : (
            <p
              className="py-3 text-[14px] text-slate-600 dark:text-white/62"
              data-testid={testIds.dashboard.accountBalancesEmpty}
            >
              {accountsLoading ? en.shell.loadingData : en.shell.noAccountsBody}
            </p>
          )}
        </div>
      </GlassSection>
    </aside>
  );
}

function GlassSection({
  children,
  description,
  testId,
  title,
}: {
  readonly children: ReactNode;
  readonly description?: string;
  readonly testId?: string;
  readonly title: string;
}) {
  return (
    <Card className="ff-glass-panel" data-testid={testId}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? (
          <CardDescription className="max-w-2xl">{description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function TransactionsPanel({
  descriptionTestId,
  description,
  limit,
  emptyBodyId,
  emptyStateId,
  emptyTitleId,
  title,
  titleTestId,
  transactions,
  transactionsError,
  withViewAll = false,
}: {
  readonly descriptionTestId?: string | undefined;
  readonly description: string | null;
  readonly limit?: number;
  readonly emptyBodyId?: string | undefined;
  readonly emptyStateId?: string | undefined;
  readonly emptyTitleId?: string | undefined;
  readonly title: string;
  readonly titleTestId?: string | undefined;
  readonly transactions: readonly TransactionGroupResponse[];
  readonly transactionsError: boolean;
  readonly withViewAll?: boolean;
}) {
  const visibleTransactions = limit ? transactions.slice(0, limit) : transactions;

  return (
    <Card className="ff-glass-panel overflow-hidden" data-testid={testIds.transactions.listPanel}>
      <CardHeader>
        <div>
          <CardTitle data-testid={titleTestId}>{title}</CardTitle>
          {description ? (
            <CardDescription data-testid={descriptionTestId}>{description}</CardDescription>
          ) : null}
        </div>
        {withViewAll ? (
          <CardAction>
            <Button
              asChild
              size="sm"
              variant="outline"
              data-testid={testIds.transactions.viewAllButton}
            >
              <Link to="/transactions">
                <ReceiptText aria-hidden="true" data-icon="inline-start" />
                <span className="hidden sm:inline">{en.shell.viewAll}</span>
              </Link>
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <div
        className="min-w-0 divide-y divide-white/45 dark:divide-white/10"
        data-testid={testIds.transactions.list}
      >
        {visibleTransactions.length > 0 ? (
          visibleTransactions.map((transaction) => (
            <TransactionRow key={transaction.id} transaction={transaction} />
          ))
        ) : (
          <div className="p-4" data-testid={emptyStateId}>
            <p className="font-medium text-[14px]" data-testid={emptyTitleId}>
              {transactionsError ? en.shell.signInForDemoData : en.shell.noTransactionsTitle}
            </p>
            <p
              className="mt-1 break-words text-[14px] text-slate-600 dark:text-white/62"
              data-testid={emptyBodyId}
            >
              {en.shell.noTransactionsBody}
            </p>
          </div>
        )}
      </div>
    </Card>
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
    <Button
      asChild
      className="ff-mobile-tab"
      data-testid={testIds.navigation.mobileNav(toNavigationTestIdSlug(item.slug))}
      variant="ghost"
    >
      <Link to={item.to} onClick={onClick}>
        <item.icon aria-hidden="true" />
        <span>{item.mobileLabel}</span>
      </Link>
    </Button>
  );
}

function MetricTile({
  className,
  compact = false,
  dense = false,
  icon: Icon,
  label,
  testId,
  tone = "neutral",
  value,
}: {
  readonly compact?: boolean;
  readonly className?: string;
  readonly icon: LucideIcon;
  readonly dense?: boolean;
  readonly label: string;
  readonly testId?: string | undefined;
  readonly tone?: "neutral" | "green" | "rose" | "blue";
  readonly value: string;
}) {
  const toneClass =
    tone === "green"
      ? "text-emerald-700 dark:text-emerald-200"
      : tone === "rose"
        ? "text-rose-700 dark:text-rose-200"
        : tone === "blue"
          ? "text-sky-700 dark:text-sky-200"
          : "text-slate-700 dark:text-white/76";

  return (
    <Card
      className={cn(
        "min-w-0 rounded-lg border-[color:var(--ff-border)] bg-[var(--ff-surface)] p-0 text-[var(--ff-text)] shadow-[var(--ff-shadow-soft)] backdrop-blur-[18px]",
        compact &&
          "bg-[color-mix(in_oklab,var(--ff-surface-strong)_82%,var(--ff-surface-muted))] shadow-none",
        className,
      )}
      data-testid={testId}
      size="sm"
    >
      <CardContent
        className={cn(
          compact
            ? "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 p-3 text-left max-[380px]:p-2.5"
            : dense
              ? "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1.5 p-2.5 text-left"
              : "p-3.5",
        )}
      >
        <div
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-lg border border-[color:var(--ff-border)] bg-[var(--ff-surface-muted)]",
            compact && "size-7",
            dense && "size-7",
            toneClass,
          )}
        >
          <Icon aria-hidden="true" />
        </div>
        <p
          className={cn(
            "font-medium text-slate-500 dark:text-white/52",
            compact
              ? "m-0 text-[0.72rem] leading-tight"
              : dense
                ? "m-0 text-[0.75rem] leading-tight"
                : "mt-3 text-[12px]",
          )}
        >
          {label}
        </p>
        <p
          className={cn(
            "break-words font-semibold leading-[1.15] text-[var(--ff-text)]",
            compact
              ? "col-span-2 mt-0.5 text-base leading-tight max-[380px]:text-[0.875rem]"
              : dense
                ? "col-span-2 mt-0 text-[1.0625rem] leading-tight"
                : "mt-1 text-[clamp(1.05rem,4vw,1.35rem)]",
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function TransactionRow({ transaction }: { readonly transaction: TransactionGroupResponse }) {
  const signedAmount = formatTransactionAmount(transaction);
  const isIncome = transaction.type === "income";

  return (
    <div
      className="flex min-w-0 items-center justify-between gap-3 px-4 py-3.5 md:px-5"
      data-testid={testIds.transactions.row(transaction.id)}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`ff-row-icon ${isIncome ? "text-emerald-700 dark:text-emerald-200" : "text-slate-700 dark:text-white/72"}`}
        >
          {isIncome ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
        </div>
        <div className="min-w-0">
          <p
            className="truncate font-semibold text-[14px]"
            data-testid={testIds.transactions.rowTitle(transaction.id)}
          >
            {transaction.title}
          </p>
          <p
            className="mt-0.5 text-[12px] text-slate-500 capitalize dark:text-white/50"
            data-testid={testIds.transactions.rowMeta(transaction.id)}
          >
            {formatDate(transaction.journals[0]?.occurredAt)} · {transaction.type}
          </p>
        </div>
      </div>
      <p
        className="shrink-0 text-right font-semibold text-[14px]"
        data-testid={testIds.transactions.rowAmount(transaction.id)}
      >
        {signedAmount}
      </p>
    </div>
  );
}

function AccountCard({ account }: { readonly account: AccountWithBalanceResponse }) {
  return (
    <Card
      className="min-w-0 rounded-lg border-[color:var(--ff-border)] bg-[var(--ff-surface)] p-0 text-[var(--ff-text)] shadow-[var(--ff-shadow-soft)] backdrop-blur-[18px]"
      data-testid={testIds.accounts.card(account.id)}
      size="sm"
    >
      <CardContent className="p-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className="truncate font-semibold text-[15px]"
              data-testid={testIds.accounts.cardName(account.id)}
            >
              {account.name}
            </p>
            <p
              className="mt-1 text-[12px] text-slate-500 capitalize dark:text-white/50"
              data-testid={testIds.accounts.cardType(account.id)}
            >
              {account.kind} / {account.subtype}
            </p>
          </div>
          <Badge
            className="ff-currency-chip"
            data-testid={testIds.accounts.cardCurrency(account.id)}
            variant="secondary"
          >
            {account.currencyCode}
          </Badge>
        </div>
        <p
          className="mt-6 break-words font-semibold text-[24px]"
          data-testid={testIds.accounts.cardBalance(account.id)}
        >
          {formatMoneyMinor(BigInt(account.balance.amountMinor), account.balance.currencyCode)}
        </p>
      </CardContent>
    </Card>
  );
}

function AccountBalanceCard({ account }: { readonly account: AccountWithBalanceResponse }) {
  const toneClass =
    account.kind === "liability"
      ? "border-red-500/25 bg-red-500/[0.08]"
      : account.kind === "asset"
        ? "border-emerald-500/25 bg-emerald-500/[0.08]"
        : "bg-[var(--ff-surface-muted)]";

  return (
    <Card
      className={cn("min-w-0 p-0 shadow-none", toneClass)}
      data-testid={testIds.accounts.balanceCard(account.id)}
      size="sm"
    >
      <CardContent className="p-3.5">
        <div className="grid min-w-0 gap-3">
          <div className="min-w-0">
            <p
              className="truncate font-semibold text-[14px]"
              data-testid={testIds.accounts.balanceName(account.id)}
            >
              {account.name}
            </p>
            <p
              className="mt-0.5 text-[12px] text-muted-foreground capitalize"
              data-testid={testIds.accounts.balanceKind(account.id)}
            >
              {account.kind}
            </p>
          </div>
          <p
            className="break-words text-left font-bold text-[0.875rem] leading-[1.15]"
            data-testid={testIds.accounts.balanceAmount(account.id)}
          >
            {formatMoneyMinor(BigInt(account.balance.amountMinor), account.balance.currencyCode)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function SystemStatusRow({
  label,
  labelTestId,
  rowTestId,
  value,
  valueTestId,
}: {
  readonly label: string;
  readonly labelTestId?: string | undefined;
  readonly rowTestId?: string | undefined;
  readonly value: string;
  readonly valueTestId?: string | undefined;
}) {
  return (
    <div className="ff-status-row" data-testid={rowTestId}>
      <span data-testid={labelTestId}>{label}</span>
      <strong data-testid={valueTestId}>{value}</strong>
    </div>
  );
}

function RuntimeStatusChips({
  apiStatus,
  isOnline,
  pendingOutboxCount,
  surface,
}: {
  readonly apiStatus: string;
  readonly isOnline: boolean;
  readonly pendingOutboxCount: number;
  readonly surface: "drawer" | "settings";
}) {
  return (
    <div className="ff-runtime-status-group" data-testid={testIds.runtimeStatus.group(surface)}>
      <div className="ff-runtime-status-chips">
        <StatusCapsule
          icon={isOnline ? CheckCircle2 : XCircle}
          label={en.status.internet}
          testId={testIds.runtimeStatus.internet(surface)}
          tone={isOnline ? "success" : "danger"}
        />
        <StatusCapsule
          icon={getServerStatusIcon(apiStatus)}
          label={en.status.server}
          testId={testIds.runtimeStatus.server(surface)}
          tone={getServerStatusTone(apiStatus)}
        />
        <StatusCapsule
          icon={RefreshCcw}
          label={`${en.status.savingChanges}: ${pendingOutboxCount}`}
          testId={testIds.runtimeStatus.savingChanges(surface)}
          tone={getPendingOutboxTone(pendingOutboxCount)}
        />
      </div>
    </div>
  );
}

function MobileMoreDrawer({
  apiStatus,
  isOnline,
  isLoggingOut,
  onClose,
  onLogout,
  open,
  pendingOutboxCount,
}: {
  readonly apiStatus: string;
  readonly isOnline: boolean;
  readonly isLoggingOut: boolean;
  readonly onClose: () => void;
  readonly onLogout: () => void;
  readonly open: boolean;
  readonly pendingOutboxCount: number;
}) {
  return (
    <Sheet open={open} onOpenChange={(nextOpen) => (nextOpen ? undefined : onClose())}>
      <SheetContent
        aria-label={en.shell.navigation}
        className="ff-more-sheet xl:hidden"
        data-testid={testIds.navigation.mobileMoreDrawer}
        showCloseButton={false}
        side="bottom"
      >
        <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-slate-300/80 dark:bg-white/24" />
        <SheetHeader className="flex-row items-center justify-between gap-3 p-0">
          <SheetTitle className="text-[22px]">Fastifly</SheetTitle>
          <Button
            type="button"
            variant="outline"
            size="icon"
            data-testid={testIds.navigation.mobileMoreDrawerClose}
            onClick={onClose}
            aria-label={en.shell.closeNavigation}
          >
            <X aria-hidden="true" />
          </Button>
        </SheetHeader>

        <RuntimeStatusChips
          apiStatus={apiStatus}
          isOnline={isOnline}
          pendingOutboxCount={pendingOutboxCount}
          surface="drawer"
        />

        <nav
          className="mt-5 grid grid-cols-2 gap-2"
          aria-label={en.shell.navigation}
          data-testid={testIds.navigation.mobileMoreDrawerNav}
        >
          {navigationItems.map((item) => (
            <Button
              asChild
              key={item.label}
              className="ff-more-link"
              data-testid={testIds.navigation.moreNav(toNavigationTestIdSlug(item.slug))}
              variant="secondary"
            >
              <Link to={item.to} onClick={onClose}>
                <item.icon aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </Link>
            </Button>
          ))}
        </nav>

        <Button
          className="mt-3 w-full"
          disabled={isLoggingOut}
          data-testid={testIds.navigation.logoutButton}
          onClick={onLogout}
          type="button"
          variant="destructive"
        >
          <LogOut aria-hidden="true" data-icon="inline-start" />
          <span>{isLoggingOut ? en.shell.loggingOut : en.shell.logout}</span>
        </Button>
      </SheetContent>
    </Sheet>
  );
}

function AuthGateScreen({ label }: { readonly label: string }) {
  return (
    <main className="ff-liquid-bg flex min-h-screen items-center justify-center px-4 text-slate-950 dark:text-white">
      <Card
        className="ff-auth-panel w-full max-w-[22rem] p-5 text-center"
        data-testid={testIds.shell.authGate}
      >
        <div className="mx-auto inline-flex size-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-[var(--ff-shadow-soft)] dark:bg-emerald-400 dark:text-black">
          <FastiflyIcon className="size-7" />
        </div>
        <p className="mt-4 font-semibold" data-testid={testIds.shell.authGateMessage}>
          {label}
        </p>
      </Card>
    </main>
  );
}

function StatusCapsule({
  icon: Icon,
  label,
  testId,
  tone,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly testId?: string | undefined;
  readonly tone: Tone;
}) {
  const toneClass =
    tone === "success"
      ? "ff-status-capsule-success"
      : tone === "warning"
        ? "ff-status-capsule-warning"
        : tone === "danger"
          ? "ff-status-capsule-danger"
          : "ff-status-capsule-neutral";

  return (
    <Badge className={cn("ff-status-capsule", toneClass)} data-testid={testId} variant="outline">
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </Badge>
  );
}

function sumAccountBalances(accounts: readonly AccountWithBalanceResponse[]): bigint {
  return accounts.reduce((total, account) => total + BigInt(account.balance.amountMinor), 0n);
}

function getPendingOutboxTone(count: number): Tone {
  if (count === 0) {
    return "success";
  }

  if (count <= 2) {
    return "warning";
  }

  return "danger";
}

function toNavigationTestIdSlug(slug: NavigationItem["slug"]): NavigationTestIdSlug {
  return slug as NavigationTestIdSlug;
}

function getServerStatusIcon(apiStatus: string): LucideIcon {
  if (apiStatus === en.status.apiOffline) {
    return XCircle;
  }

  if (apiStatus === en.shell.checkingApi) {
    return RefreshCcw;
  }

  return CheckCircle2;
}

function getServerStatusTone(apiStatus: string): Tone {
  if (apiStatus === en.status.apiOffline) {
    return "danger";
  }

  if (apiStatus === en.shell.checkingApi) {
    return "neutral";
  }

  return "success";
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

function getTransactionAbsoluteMinor(transaction: TransactionGroupResponse): bigint {
  const firstPosting = transaction.journals[0]?.postings[0];
  return firstPosting ? absMinor(firstPosting.amountMinor) : 0n;
}

function absMinor(amountMinor: string): bigint {
  const value = BigInt(amountMinor);
  return value < 0n ? -value : value;
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

function readInitialTheme(): Theme {
  return window.localStorage.getItem("fastifly.theme") === "light" ? "light" : "dark";
}
