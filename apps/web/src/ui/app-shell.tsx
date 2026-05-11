import {
  type AccountWithBalanceResponse,
  formatMoneyMinor,
  type RecurringTemplateResponse,
  type TransactionGroupResponse,
} from "@fastifly/common";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@ui/alert-dialog";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Field, FieldLabel } from "@ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@ui/toggle-group";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Archive,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Landmark,
  Laptop,
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
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { type PropsWithChildren, type ReactNode, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { apiClient } from "../api/client";
import {
  useAccountsQuery,
  useBudgetsQuery,
  useHealthQuery,
  useImportJobsQuery,
  useInfiniteTransactionsQuery,
  useMeContextQuery,
  useRecurringTemplatesQuery,
  useRulesQuery,
  useSyncConflictsQuery,
  useSyncStatusQuery,
  useTransactionsQuery,
} from "../api/queries";
import { type AuthSessionState, getAuthRedirect } from "../auth/flow";
import { SESSION_EXPIRED_EVENT, shouldShowSessionExpiredDialog } from "../auth/session-events";
import {
  ALL_TRANSACTION_FILTER,
  buildTransactionListQuery,
  makeTransactionListFilterDefaults,
  type TransactionListFilterState,
  type TransactionStatusFilter,
  type TransactionTypeFilter,
} from "../finance/transaction-list";
import { en } from "../i18n/en";
import {
  activateServiceWorkerUpdate,
  PWA_UPDATE_AVAILABLE_EVENT,
  registerServiceWorker,
} from "../pwa";
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

type Theme = "dark" | "light" | "system";
type Tone = "danger" | "neutral" | "success" | "warning";
type NavigationTestIdSlug = Parameters<typeof testIds.navigation.mobileNav>[0];

const transactionTypeFilterOptions: readonly {
  readonly label: string;
  readonly value: TransactionTypeFilter;
}[] = [
  { label: en.transactions.filters.allTypes, value: "all" },
  { label: en.transactions.types.expense, value: "expense" },
  { label: en.transactions.types.income, value: "income" },
  { label: en.transactions.types.transfer, value: "transfer" },
];

const transactionStatusFilterOptions: readonly {
  readonly label: string;
  readonly value: TransactionStatusFilter;
}[] = [
  { label: en.transactions.filters.allStatuses, value: "all" },
  { label: en.transactions.statuses.pending, value: "pending" },
  { label: en.transactions.statuses.cleared, value: "cleared" },
  { label: en.transactions.statuses.reconciled, value: "reconciled" },
];

const transactionFilterParsers = {
  accountId: parseAsString.withDefault(ALL_TRANSACTION_FILTER),
  limit: parseAsInteger.withDefault(10),
  status: parseAsStringLiteral(["all", "pending", "cleared", "reconciled"]).withDefault("all"),
  type: parseAsStringLiteral(["all", "expense", "income", "transfer"]).withDefault("all"),
};

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAuthRoute = location.pathname === "/login";
  const [theme, setTheme] = useState<Theme>(() => readInitialTheme());
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [isUpdateReady, setIsUpdateReady] = useState(false);
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
  const syncStatusQuery = useSyncStatusQuery(ledgerContext);
  const syncConflictsQuery = useSyncConflictsQuery(ledgerContext);
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
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolved = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.classList.toggle("dark", resolved === "dark");
    };

    applyTheme();
    window.localStorage.setItem("fastifly.theme", theme);

    if (theme === "system") {
      media.addEventListener("change", applyTheme);
      return () => media.removeEventListener("change", applyTheme);
    }

    return undefined;
  }, [theme]);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    const onUpdateReady = () => setIsUpdateReady(true);
    const onControllerChange = () => window.location.reload();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(PWA_UPDATE_AVAILABLE_EVENT, onUpdateReady);
    navigator.serviceWorker?.addEventListener("controllerchange", onControllerChange);
    setPendingOutboxCount(readPendingOutboxCount(window.localStorage));
    void registerServiceWorker();

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(PWA_UPDATE_AVAILABLE_EVENT, onUpdateReady);
      navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
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
  const reportingCurrencyCode = meContext.data?.data.activeLedger.baseCurrencyCode ?? "INR";
  const openConflictCount = syncStatusQuery.data?.data.openConflicts ?? 0;
  const syncServerRevision = syncStatusQuery.data?.data.serverRevision ?? "0";
  const syncLastOperationAt = syncStatusQuery.data?.data.lastOperationAt ?? null;
  const syncConflicts = syncConflictsQuery.data?.data.conflicts ?? [];
  const transactions = transactionsQuery.data?.data ?? [];
  const assetAccounts = accounts.filter((account) => account.kind === "asset");
  const liabilityAccounts = accounts.filter((account) => account.kind === "liability");
  const incomeMinor = sumTransactionAmounts(transactions, "income");
  const expenseMinor = sumTransactionAmounts(transactions, "expense");
  const transferCount = transactions.filter(
    (transaction) => transaction.type === "transfer",
  ).length;
  const netWorthMinor = sumAccountBalances([...assetAccounts, ...liabilityAccounts]);
  const netWorth = formatMoneyMinor(netWorthMinor, reportingCurrencyCode);
  const cashAndBank = formatMoneyMinor(sumAccountBalances(assetAccounts), reportingCurrencyCode);
  const liabilities = formatMoneyMinor(
    sumAccountBalances(liabilityAccounts),
    reportingCurrencyCode,
  );
  const income = formatMoneyMinor(incomeMinor, reportingCurrencyCode);
  const spending = formatMoneyMinor(-expenseMinor, reportingCurrencyCode);
  const cashflow = formatMoneyMinor(incomeMinor - expenseMinor, reportingCurrencyCode);
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
          onToggleTheme={() => setTheme(cycleTheme(theme))}
          theme={theme}
          transactionsCount={transactions.length}
        />
        {children}

        {isUpdateReady ? (
          <Alert
            className="mt-3 border-cyan-500/30 bg-cyan-500/10 text-cyan-800 dark:text-cyan-100"
            data-testid={testIds.shell.updateAlert}
          >
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{en.shell.updateReady}</span>
              <Button
                className="h-7 px-2.5"
                onClick={() => {
                  setIsUpdateReady(false);
                  void activateServiceWorkerUpdate();
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                {en.shell.updateNow}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {openConflictCount > 0 ? (
          <Alert
            className="mt-3 border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-200"
            data-testid={testIds.shell.syncConflictAlert}
          >
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{formatOpenConflictMessage(openConflictCount)}</span>
              <Button asChild className="h-7 px-2.5" size="sm" type="button" variant="outline">
                <Link to="/sync">{en.shell.reviewConflicts}</Link>
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

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
          openConflictCount={openConflictCount}
          syncConflicts={syncConflicts}
          syncLastOperationAt={syncLastOperationAt}
          syncServerRevision={syncServerRevision}
          spending={spending}
          spendingRate={spendingRate}
          theme={theme}
          transferCount={transferCount}
          workspaceName={meContext.data.data.activeWorkspace.name}
          workspaceRole={meContext.data.data.activeWorkspace.role}
          ledgerName={meContext.data.data.activeLedger.name}
        />
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
        openConflictCount={openConflictCount}
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
          aria-label={`${en.shell.toggleTheme}: ${formatThemeLabel(theme)}`}
        >
          {theme === "dark" ? <Sun /> : theme === "light" ? <Moon /> : <Laptop />}
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
  openConflictCount,
  pageSlug,
  pendingOutboxCount,
  syncConflicts,
  syncLastOperationAt,
  syncServerRevision,
  spending,
  spendingRate,
  theme,
  transferCount,
  workspaceName,
  workspaceRole,
  ledgerName,
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
  readonly theme: Theme;
  readonly transferCount: number;
  readonly workspaceName: string;
  readonly workspaceRole: "admin" | "editor" | "owner" | "viewer";
  readonly ledgerName: string;
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
        ledgerName={ledgerName}
        openConflictCount={openConflictCount}
        pendingOutboxCount={pendingOutboxCount}
        theme={theme}
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
  const transactionQueryFilters = useMemo(() => buildTransactionListQuery(filters), [filters]);
  const transactionsQuery = useInfiniteTransactionsQuery(ledgerContext, transactionQueryFilters);
  const transactions = transactionsQuery.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <section className="ff-single-page flex flex-col gap-4" data-testid={testIds.transactions.page}>
      <TransactionCreatePanel accounts={accounts} ledgerContext={ledgerContext} />
      <TransactionFilters
        accounts={accounts}
        filters={filters}
        onChange={(nextFilters) => {
          void setUrlFilters({
            accountId: nextFilters.accountId,
            status: nextFilters.status,
            type: nextFilters.type,
          });
        }}
      />
      <TransactionsPanel
        descriptionTestId={testIds.transactions.listDescription}
        description={en.shell.transactionsBody}
        emptyBodyId={testIds.transactions.emptyBody}
        emptyStateId={testIds.transactions.emptyState}
        emptyTitleId={testIds.transactions.emptyTitle}
        hasActiveFilters={hasActiveTransactionFilters(filters)}
        hasNextPage={Boolean(transactionsQuery.hasNextPage)}
        isFetchingNextPage={transactionsQuery.isFetchingNextPage}
        onLoadMore={() => {
          void transactionsQuery.fetchNextPage();
        }}
        title={en.shell.allTransactions}
        titleTestId={testIds.transactions.listTitle}
        transactions={transactions}
        transactionsError={transactionsQuery.isError}
        transactionsLoading={transactionsQuery.isPending}
      />
    </section>
  );
}

function TransactionFilters({
  accounts,
  filters,
  onChange,
}: {
  readonly accounts: readonly AccountWithBalanceResponse[];
  readonly filters: TransactionListFilterState;
  readonly onChange: (filters: TransactionListFilterState) => void;
}) {
  return (
    <Card className="ff-glass-panel" data-testid={testIds.transactions.filters.panel}>
      <CardHeader>
        <CardTitle>{en.transactions.filters.title}</CardTitle>
        <CardAction>
          <Button
            data-testid={testIds.transactions.filters.resetButton}
            onClick={() => onChange(makeTransactionListFilterDefaults())}
            size="sm"
            type="button"
            variant="outline"
          >
            {en.transactions.filters.reset}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Field>
          <FieldLabel>{en.transactions.filters.types}</FieldLabel>
          <ToggleGroup
            className="flex w-full flex-wrap justify-start"
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
        <div className="grid gap-3 md:grid-cols-2">
          <Field>
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
          <Field>
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
        </div>
      </CardContent>
    </Card>
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
  const queryClient = useQueryClient();
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveSuccess, setArchiveSuccess] = useState<string | null>(null);
  const archiveMutation = useMutation({
    mutationFn: async (account: AccountWithBalanceResponse) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }

      await apiClient.archiveAccount({
        accountId: account.id,
        ledgerId: ledgerContext.ledgerId,
        workspaceId: ledgerContext.workspaceId,
      });
    },
    onSuccess: async (_data, account) => {
      setArchiveSuccess(formatAccountArchiveSuccess(account.name));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["finance", "accounts", ledgerContext?.workspaceId, ledgerContext?.ledgerId],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            "finance",
            "transactions",
            ledgerContext?.workspaceId,
            ledgerContext?.ledgerId,
          ],
        }),
      ]);
    },
  });
  const archiveAccount = async (account: AccountWithBalanceResponse) => {
    setArchiveError(null);
    setArchiveSuccess(null);

    try {
      await archiveMutation.mutateAsync(account);
    } catch (error) {
      setArchiveError(getAccountArchiveError(error));
    }
  };

  return (
    <section className="ff-single-page space-y-4" data-testid={testIds.accounts.page}>
      <AccountCreatePanel ledgerContext={ledgerContext} />
      <GlassSection title={en.shell.allAccounts} description={en.shell.accountsBody}>
        <div className="flex flex-col gap-3">
          {archiveError ? (
            <Alert data-testid={testIds.accounts.archive.errorAlert} variant="destructive">
              <AlertDescription data-testid={testIds.accounts.archive.errorMessage}>
                {archiveError}
              </AlertDescription>
            </Alert>
          ) : null}
          {archiveSuccess ? (
            <Alert
              className="border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
              data-testid={testIds.accounts.archive.successAlert}
            >
              <AlertDescription data-testid={testIds.accounts.archive.successMessage}>
                {archiveSuccess}
              </AlertDescription>
            </Alert>
          ) : null}
          <div
            className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3"
            data-testid={testIds.accounts.list}
          >
            {accounts.length > 0 ? (
              accounts.map((account) => (
                <AccountCard
                  account={account}
                  isArchiving={
                    archiveMutation.isPending && archiveMutation.variables?.id === account.id
                  }
                  key={account.id}
                  onArchive={archiveAccount}
                />
              ))
            ) : (
              <p
                className="text-[14px] text-slate-600 dark:text-white/62"
                data-testid={testIds.accounts.emptyState}
              >
                {accountsLoading ? en.shell.loadingData : en.shell.noAccountsBody}
              </p>
            )}
          </div>
        </div>
      </GlassSection>
    </section>
  );
}

function BudgetPage({
  cashflow,
  income,
  ledgerContext,
  spending,
  spendingRate,
}: {
  readonly cashflow: string;
  readonly income: string;
  readonly ledgerContext: {
    readonly ledgerId: string;
    readonly workspaceId: string;
  } | null;
  readonly spending: string;
  readonly spendingRate: string;
}) {
  const budgetsQuery = useBudgetsQuery(ledgerContext, { limit: 50 });
  const budgets = budgetsQuery.data?.data ?? [];

  return (
    <section className="ff-single-page space-y-4" data-testid={testIds.budgets.page}>
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
      <GlassSection title={en.budgets.listTitle} description={en.budgets.listDescription}>
        <div className="grid gap-3 md:grid-cols-2" data-testid={testIds.budgets.list}>
          {budgets.length > 0 ? (
            budgets.map((budget) => <BudgetSummaryCard budget={budget} key={budget.id} />)
          ) : (
            <p
              className="text-[14px] text-slate-600 dark:text-white/62"
              data-testid={testIds.budgets.emptyState}
            >
              {budgetsQuery.isPending
                ? en.shell.loadingData
                : budgetsQuery.isError
                  ? en.budgets.loadError
                  : en.budgets.emptyState}
            </p>
          )}
        </div>
      </GlassSection>
    </section>
  );
}

function ImportsPage({
  accounts,
  ledgerContext,
}: {
  readonly accounts: readonly AccountWithBalanceResponse[];
  readonly ledgerContext: {
    readonly ledgerId: string;
    readonly workspaceId: string;
  } | null;
}) {
  const queryClient = useQueryClient();
  const importJobsQuery = useImportJobsQuery(ledgerContext);
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }
      const sample = makeSampleImportCsv(accounts);
      if (!sample) {
        throw new Error(en.imports.createFailed);
      }
      return await apiClient.createImportCsv({
        csvText: sample.csvText,
        fileName: sample.fileName,
        ...ledgerContext,
      });
    },
    onSuccess: async () => {
      if (!ledgerContext) {
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: ["finance", "imports", ledgerContext.workspaceId, ledgerContext.ledgerId],
      });
    },
  });
  const commitMutation = useMutation({
    mutationFn: async (importJobId: string) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }
      return await apiClient.commitImportJob({
        importJobId,
        ...ledgerContext,
      });
    },
    onSuccess: async () => {
      if (!ledgerContext) {
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["finance", "imports", ledgerContext.workspaceId, ledgerContext.ledgerId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["finance", "transactions", ledgerContext.workspaceId, ledgerContext.ledgerId],
        }),
      ]);
    },
  });
  const undoMutation = useMutation({
    mutationFn: async (importJobId: string) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }
      return await apiClient.undoImportJob({
        importJobId,
        ...ledgerContext,
      });
    },
    onSuccess: async () => {
      if (!ledgerContext) {
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["finance", "imports", ledgerContext.workspaceId, ledgerContext.ledgerId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["finance", "transactions", ledgerContext.workspaceId, ledgerContext.ledgerId],
        }),
      ]);
    },
  });
  const importJobs = importJobsQuery.data ?? [];

  return (
    <section className="ff-single-page space-y-4" data-testid={testIds.imports.page}>
      <GlassSection title={en.shell.importsTitle} description={en.shell.importsBody}>
        <div className="flex flex-col gap-3">
          <div className="flex justify-end">
            <Button
              data-testid={testIds.imports.uploadButton}
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
              size="sm"
              type="button"
            >
              {createMutation.isPending ? en.imports.uploading : en.imports.upload}
            </Button>
          </div>
          <div className="grid gap-3" data-testid={testIds.imports.list}>
            {importJobs.length > 0 ? (
              importJobs.map((importJob) => (
                <Card
                  className="ff-glass-panel"
                  data-testid={testIds.imports.card(importJob.id)}
                  key={importJob.id}
                >
                  <CardContent className="space-y-3 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-[15px]">{importJob.fileName ?? importJob.id}</p>
                      <Badge data-testid={testIds.imports.status(importJob.id)} variant="outline">
                        {importJob.status}
                      </Badge>
                    </div>
                    <p className="text-[13px] text-slate-600 dark:text-white/62">
                      {en.imports.previewRows}: {importJob.previewRows.length}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        data-testid={testIds.imports.commitButton(importJob.id)}
                        disabled={
                          importJob.status !== "preview_ready" ||
                          (commitMutation.isPending && commitMutation.variables === importJob.id)
                        }
                        onClick={() => commitMutation.mutate(importJob.id)}
                        size="sm"
                        type="button"
                      >
                        {en.imports.commit}
                      </Button>
                      <Button
                        data-testid={testIds.imports.undoButton(importJob.id)}
                        disabled={
                          importJob.status !== "committed" ||
                          (undoMutation.isPending && undoMutation.variables === importJob.id)
                        }
                        onClick={() => undoMutation.mutate(importJob.id)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {en.imports.undo}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <p
                className="text-[14px] text-slate-600 dark:text-white/62"
                data-testid={testIds.imports.emptyState}
              >
                {importJobsQuery.isPending
                  ? en.shell.loadingData
                  : importJobsQuery.isError
                    ? en.imports.createFailed
                    : en.imports.noImports}
              </p>
            )}
          </div>
          {createMutation.isError ? (
            <Alert className="border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-200">
              <AlertDescription>{en.imports.createFailed}</AlertDescription>
            </Alert>
          ) : null}
          {commitMutation.isError ? (
            <Alert className="border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-200">
              <AlertDescription>{en.imports.commitFailed}</AlertDescription>
            </Alert>
          ) : null}
          {undoMutation.isError ? (
            <Alert className="border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-200">
              <AlertDescription>{en.imports.undoFailed}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </GlassSection>
    </section>
  );
}

function RulesPage({
  ledgerContext,
}: {
  readonly ledgerContext: {
    readonly ledgerId: string;
    readonly workspaceId: string;
  } | null;
}) {
  const queryClient = useQueryClient();
  const rulesQuery = useRulesQuery(ledgerContext);
  const [testCounts, setTestCounts] = useState<Record<string, number>>({});
  const [applyCounts, setApplyCounts] = useState<Record<string, number>>({});
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }
      return await apiClient.createRule({
        action: { status: "cleared", type: "set_transaction_status" },
        condition: { type: "expense" },
        enabled: true,
        name: "Auto clear expenses",
        ...ledgerContext,
      });
    },
    onSuccess: async () => {
      if (!ledgerContext) {
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: ["finance", "rules", ledgerContext.workspaceId, ledgerContext.ledgerId],
      });
    },
  });
  const testMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }
      const matches = await apiClient.testRule({
        limit: 50,
        ruleId,
        ...ledgerContext,
      });
      return { matches, ruleId };
    },
    onSuccess: ({ matches, ruleId }) => {
      setTestCounts((current) => ({ ...current, [ruleId]: matches.length }));
    },
  });
  const applyMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }
      return await apiClient.applyRule({
        limit: 50,
        ruleId,
        ...ledgerContext,
      });
    },
    onSuccess: async (result, ruleId) => {
      setApplyCounts((current) => ({ ...current, [ruleId]: result.updatedTransactionGroupIds.length }));
      if (!ledgerContext) {
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: ["finance", "transactions", ledgerContext.workspaceId, ledgerContext.ledgerId],
      });
    },
  });
  const rules = rulesQuery.data ?? [];

  return (
    <section className="ff-single-page space-y-4" data-testid={testIds.rules.page}>
      <GlassSection title={en.shell.rulesTitle} description={en.shell.rulesBody}>
        <div className="flex flex-col gap-3">
          <div className="flex justify-end">
            <Button
              data-testid={testIds.rules.createButton}
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
              size="sm"
              type="button"
            >
              {createMutation.isPending ? en.rules.creating : en.rules.create}
            </Button>
          </div>
          <div className="grid gap-3" data-testid={testIds.rules.list}>
            {rules.length > 0 ? (
              rules.map((rule) => (
                <Card className="ff-glass-panel" data-testid={testIds.rules.card(rule.id)} key={rule.id}>
                  <CardContent className="space-y-3 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-[15px]">{rule.name}</p>
                      <Badge variant="outline">{rule.action.status}</Badge>
                    </div>
                    <p className="text-[13px] text-slate-600 dark:text-white/62">
                      {rule.enabled ? en.rules.enabled : en.rules.disabled}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        data-testid={testIds.rules.testButton(rule.id)}
                        disabled={testMutation.isPending && testMutation.variables === rule.id}
                        onClick={() => testMutation.mutate(rule.id)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {en.rules.test}
                      </Button>
                      <Button
                        data-testid={testIds.rules.applyButton(rule.id)}
                        disabled={applyMutation.isPending && applyMutation.variables === rule.id}
                        onClick={() => applyMutation.mutate(rule.id)}
                        size="sm"
                        type="button"
                      >
                        {applyMutation.isPending && applyMutation.variables === rule.id
                          ? en.rules.applying
                          : en.rules.apply}
                      </Button>
                    </div>
                    {testCounts[rule.id] !== undefined ? (
                      <p className="text-[12px] text-slate-600 dark:text-white/62">
                        {en.rules.matches.replace("{count}", String(testCounts[rule.id]))}
                      </p>
                    ) : null}
                    {applyCounts[rule.id] !== undefined ? (
                      <p className="text-[12px] text-slate-600 dark:text-white/62">
                        {en.rules.updated.replace("{count}", String(applyCounts[rule.id]))}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              ))
            ) : (
              <p
                className="text-[14px] text-slate-600 dark:text-white/62"
                data-testid={testIds.rules.emptyState}
              >
                {rulesQuery.isPending
                  ? en.shell.loadingData
                  : rulesQuery.isError
                    ? en.rules.createFailed
                    : en.rules.noRules}
              </p>
            )}
          </div>
          {createMutation.isError || applyMutation.isError ? (
            <Alert className="border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-200">
              <AlertDescription>
                {createMutation.isError ? en.rules.createFailed : en.rules.applyFailed}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      </GlassSection>
    </section>
  );
}

function RecurringPage({
  accounts,
  ledgerContext,
}: {
  readonly accounts: readonly AccountWithBalanceResponse[];
  readonly ledgerContext: {
    readonly ledgerId: string;
    readonly workspaceId: string;
  } | null;
}) {
  const queryClient = useQueryClient();
  const recurringQuery = useRecurringTemplatesQuery(ledgerContext);
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }
      const payload = makeSampleRecurringPayload(accounts);
      if (!payload) {
        throw new Error(en.recurring.createFailed);
      }
      return await apiClient.createRecurringTemplate({
        cadence: "monthly",
        intervalCount: 1,
        nextRunAt: new Date().toISOString(),
        payload,
        status: "active",
        ...ledgerContext,
      });
    },
    onSuccess: async () => {
      if (!ledgerContext) {
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: ["finance", "recurring", ledgerContext.workspaceId, ledgerContext.ledgerId],
      });
    },
  });
  const generateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }
      return await apiClient.generateRecurringTemplate({
        templateId,
        ...ledgerContext,
      });
    },
    onSuccess: async () => {
      if (!ledgerContext) {
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["finance", "recurring", ledgerContext.workspaceId, ledgerContext.ledgerId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["finance", "transactions", ledgerContext.workspaceId, ledgerContext.ledgerId],
        }),
      ]);
    },
  });
  const templates = recurringQuery.data ?? [];

  return (
    <section className="ff-single-page space-y-4" data-testid={testIds.recurring.page}>
      <GlassSection title={en.shell.recurringTitle} description={en.shell.recurringBody}>
        <div className="flex flex-col gap-3">
          <div className="flex justify-end">
            <Button
              data-testid={testIds.recurring.createButton}
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
              size="sm"
              type="button"
            >
              {createMutation.isPending ? en.recurring.creating : en.recurring.create}
            </Button>
          </div>
          <div className="grid gap-3" data-testid={testIds.recurring.list}>
            {templates.length > 0 ? (
              templates.map((template) => (
                <Card
                  className="ff-glass-panel"
                  data-testid={testIds.recurring.card(template.id)}
                  key={template.id}
                >
                  <CardContent className="space-y-3 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-[15px]">{template.payload.title ?? template.payload.description}</p>
                      <Badge variant="outline">{template.status}</Badge>
                    </div>
                    <p className="text-[13px] text-slate-600 dark:text-white/62">
                      {en.recurring.nextRun.replace("{value}", template.nextRunAt)}
                    </p>
                    <Button
                      data-testid={testIds.recurring.generateButton(template.id)}
                      disabled={generateMutation.isPending && generateMutation.variables === template.id}
                      onClick={() => generateMutation.mutate(template.id)}
                      size="sm"
                      type="button"
                    >
                      {generateMutation.isPending && generateMutation.variables === template.id
                        ? en.recurring.generating
                        : en.recurring.generate}
                    </Button>
                  </CardContent>
                </Card>
              ))
            ) : (
              <p
                className="text-[14px] text-slate-600 dark:text-white/62"
                data-testid={testIds.recurring.emptyState}
              >
                {recurringQuery.isPending
                  ? en.shell.loadingData
                  : recurringQuery.isError
                    ? en.recurring.createFailed
                    : en.recurring.noTemplates}
              </p>
            )}
          </div>
          {createMutation.isError || generateMutation.isError ? (
            <Alert className="border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-200">
              <AlertDescription>
                {createMutation.isError ? en.recurring.createFailed : en.recurring.generateFailed}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      </GlassSection>
    </section>
  );
}

function BudgetSummaryCard({
  budget,
}: {
  readonly budget: {
    readonly id: string;
    readonly limit: { readonly amountMinor: string; readonly currencyCode: string };
    readonly name: string;
    readonly period: string;
    readonly remaining: { readonly amountMinor: string; readonly currencyCode: string };
    readonly spent: { readonly amountMinor: string; readonly currencyCode: string };
  };
}) {
  const limitMinor = BigInt(budget.limit.amountMinor);
  const spentMinor = BigInt(budget.spent.amountMinor);
  const remainingMinor = BigInt(budget.remaining.amountMinor);
  const spentRatio = limitMinor > 0n ? Number((spentMinor * 100n) / limitMinor) : 0;

  return (
    <Card className="ff-glass-panel p-4" data-testid={testIds.budgets.card(budget.id)}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium text-[15px]" data-testid={testIds.budgets.cardName(budget.id)}>
          {budget.name}
        </h3>
        <Badge variant="outline" data-testid={testIds.budgets.cardPeriod(budget.id)}>
          {formatBudgetPeriodLabel(budget.period)}
        </Badge>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
        <BudgetAmountCell
          label={en.budgets.limit}
          testId={testIds.budgets.cardLimit(budget.id)}
          value={formatMoneyMinor(limitMinor, budget.limit.currencyCode)}
        />
        <BudgetAmountCell
          label={en.budgets.spent}
          testId={testIds.budgets.cardSpent(budget.id)}
          value={formatMoneyMinor(spentMinor, budget.spent.currencyCode)}
        />
        <BudgetAmountCell
          label={en.budgets.remaining}
          testId={testIds.budgets.cardRemaining(budget.id)}
          value={formatMoneyMinor(remainingMinor, budget.remaining.currencyCode)}
        />
      </div>
      <p
        className="mt-3 text-[12px] text-slate-600 dark:text-white/62"
        data-testid={testIds.budgets.cardSpentRate(budget.id)}
      >
        {en.budgets.spentRate.replace("{value}", `${spentRatio}%`)}
      </p>
    </Card>
  );
}

function BudgetAmountCell({
  label,
  testId,
  value,
}: {
  readonly label: string;
  readonly testId: string;
  readonly value: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-slate-500 dark:text-white/50">{label}</span>
      <span className="font-medium" data-testid={testId}>
        {value}
      </span>
    </div>
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
  ledgerName,
  openConflictCount,
  pendingOutboxCount,
  theme,
  workspaceName,
  workspaceRole,
}: {
  readonly apiStatus: string;
  readonly isOnline: boolean;
  readonly ledgerName: string;
  readonly openConflictCount: number;
  readonly pendingOutboxCount: number;
  readonly theme: Theme;
  readonly workspaceName: string;
  readonly workspaceRole: "admin" | "editor" | "owner" | "viewer";
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
            value={workspaceName}
            valueTestId={testIds.settings.rowValue("workspace")}
          />
          <SystemStatusRow
            label={en.shell.activeLedger}
            labelTestId={testIds.settings.rowLabel("active-ledger")}
            rowTestId={testIds.settings.row("active-ledger")}
            value={ledgerName}
            valueTestId={testIds.settings.rowValue("active-ledger")}
          />
          <SystemStatusRow
            label={en.shell.role}
            labelTestId={testIds.settings.rowLabel("active-role")}
            rowTestId={testIds.settings.row("active-role")}
            value={workspaceRole}
            valueTestId={testIds.settings.rowValue("active-role")}
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
            value={formatThemeLabel(theme)}
            valueTestId={testIds.settings.rowValue("theme-preference")}
          />
        </div>
      </GlassSection>
      <GlassSection title={en.shell.systemStatus} testId={testIds.settings.systemStatus}>
        <RuntimeStatusChips
          apiStatus={apiStatus}
          isOnline={isOnline}
          openConflictCount={openConflictCount}
          pendingOutboxCount={pendingOutboxCount}
          surface="settings"
        />
        <div className="mt-3">
          <Button asChild size="sm" type="button" variant="outline">
            <Link to="/sync">{en.shell.syncCenter}</Link>
          </Button>
        </div>
      </GlassSection>
    </section>
  );
}

function SyncPage({
  conflicts,
  lastOperationAt,
  serverRevision,
}: {
  readonly conflicts: readonly {
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
  readonly lastOperationAt: string | null;
  readonly serverRevision: string;
}) {
  const openConflicts = conflicts.filter((conflict) => conflict.status === "open");
  return (
    <section className="ff-single-page space-y-4" data-testid={testIds.sync.page}>
      <GlassSection
        description={en.shell.syncCenterBody}
        testId={testIds.sync.statusCard}
        title={en.shell.syncCenter}
      >
        <div className="space-y-2">
          <SystemStatusRow
            label={en.shell.openConflicts}
            value={openConflicts.length.toString()}
            valueTestId={testIds.sync.openConflictCount}
          />
          <SystemStatusRow
            label={en.shell.serverRevision}
            value={serverRevision}
            valueTestId={testIds.sync.serverRevision}
          />
          <SystemStatusRow
            label={en.shell.lastOperationAt}
            value={lastOperationAt ? formatDateTime(lastOperationAt) : "-"}
            valueTestId={testIds.sync.lastOperationAt}
          />
        </div>
      </GlassSection>
      <GlassSection
        description={en.shell.syncConflictsBody}
        testId={testIds.sync.conflictsCard}
        title={en.shell.syncConflicts}
      >
        {openConflicts.length > 0 ? (
          <div className="grid gap-3">
            {openConflicts.map((conflict) => (
              <Card
                className="ff-glass-panel p-4"
                data-testid={testIds.sync.conflictRow(conflict.id)}
                key={conflict.id}
              >
                <p
                  className="font-medium text-[14px]"
                  data-testid={testIds.sync.conflictType(conflict.id)}
                >
                  {conflict.conflictType}
                </p>
                <p
                  className="mt-1 text-[12px] text-slate-600 dark:text-white/62"
                  data-testid={testIds.sync.conflictOperation(conflict.id)}
                >
                  {conflict.incomingOperationId}
                </p>
                <Badge
                  className="mt-3 w-fit"
                  data-testid={testIds.sync.conflictStatus(conflict.id)}
                  variant="outline"
                >
                  {conflict.status}
                </Badge>
              </Card>
            ))}
          </div>
        ) : (
          <p
            className="text-[14px] text-slate-600 dark:text-white/62"
            data-testid={testIds.sync.emptyConflicts}
          >
            {en.shell.noSyncConflicts}
          </p>
        )}
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
  emptyBodyId,
  emptyStateId,
  emptyTitleId,
  hasActiveFilters,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  title,
  titleTestId,
  transactions,
  transactionsError,
  transactionsLoading,
}: {
  readonly descriptionTestId?: string | undefined;
  readonly description: string | null;
  readonly emptyBodyId?: string | undefined;
  readonly emptyStateId?: string | undefined;
  readonly emptyTitleId?: string | undefined;
  readonly hasActiveFilters: boolean;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly onLoadMore: () => void;
  readonly title: string;
  readonly titleTestId?: string | undefined;
  readonly transactions: readonly TransactionGroupResponse[];
  readonly transactionsError: boolean;
  readonly transactionsLoading: boolean;
}) {
  return (
    <Card className="ff-glass-panel overflow-hidden" data-testid={testIds.transactions.listPanel}>
      <CardHeader>
        <div>
          <CardTitle data-testid={titleTestId}>{title}</CardTitle>
          {description ? (
            <CardDescription data-testid={descriptionTestId}>{description}</CardDescription>
          ) : null}
        </div>
      </CardHeader>
      <div
        className="min-w-0 divide-y divide-white/45 dark:divide-white/10"
        data-testid={testIds.transactions.list}
      >
        {transactions.length > 0 ? (
          transactions.map((transaction) => (
            <TransactionRow key={transaction.id} transaction={transaction} />
          ))
        ) : (
          <div className="p-4" data-testid={emptyStateId}>
            <p className="font-medium text-[14px]" data-testid={emptyTitleId}>
              {transactionsLoading
                ? en.shell.loadingData
                : transactionsError
                  ? en.transactions.listErrorTitle
                  : en.shell.noTransactionsTitle}
            </p>
            <p
              className="mt-1 break-words text-[14px] text-slate-600 dark:text-white/62"
              data-testid={emptyBodyId}
            >
              {transactionsError
                ? en.transactions.listErrorBody
                : hasActiveFilters
                  ? en.transactions.noFilteredTransactionsBody
                  : en.shell.noTransactionsBody}
            </p>
          </div>
        )}
      </div>
      {transactions.length > 0 ? (
        <div className="border-t border-white/45 p-3 dark:border-white/10">
          {hasNextPage ? (
            <Button
              className="w-full"
              data-testid={testIds.transactions.loadMoreButton}
              disabled={isFetchingNextPage}
              onClick={onLoadMore}
              type="button"
              variant="outline"
            >
              {isFetchingNextPage ? en.transactions.loadingMore : en.transactions.loadMore}
            </Button>
          ) : (
            <p className="text-center text-[12px] text-slate-500 dark:text-white/50">
              {en.transactions.listEnd}
            </p>
          )}
        </div>
      ) : null}
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

function AccountCard({
  account,
  isArchiving,
  onArchive,
}: {
  readonly account: AccountWithBalanceResponse;
  readonly isArchiving: boolean;
  readonly onArchive: (account: AccountWithBalanceResponse) => Promise<void>;
}) {
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
        <div className="mt-6 flex items-end justify-between gap-3">
          <p
            className="min-w-0 break-words font-semibold text-[24px] leading-tight"
            data-testid={testIds.accounts.cardBalance(account.id)}
          >
            {formatMoneyMinor(BigInt(account.balance.amountMinor), account.balance.currencyCode)}
          </p>
          <AccountArchiveAction account={account} disabled={isArchiving} onArchive={onArchive} />
        </div>
      </CardContent>
    </Card>
  );
}

function AccountArchiveAction({
  account,
  disabled,
  onArchive,
}: {
  readonly account: AccountWithBalanceResponse;
  readonly disabled: boolean;
  readonly onArchive: (account: AccountWithBalanceResponse) => Promise<void>;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          data-testid={testIds.accounts.archive.button(account.id)}
          disabled={disabled}
          size="sm"
          type="button"
          variant="destructive"
        >
          <Archive aria-hidden="true" data-icon="inline-start" />
          {disabled ? en.accounts.archiving : en.accounts.archive}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent data-testid={testIds.accounts.archive.dialog(account.id)}>
        <AlertDialogHeader>
          <AlertDialogTitle data-testid={testIds.accounts.archive.title(account.id)}>
            {formatAccountArchiveTitle(account.name)}
          </AlertDialogTitle>
          <AlertDialogDescription data-testid={testIds.accounts.archive.description(account.id)}>
            {en.accounts.archiveDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid={testIds.accounts.archive.cancelButton(account.id)}>
            {en.accounts.archiveCancel}
          </AlertDialogCancel>
          <AlertDialogAction
            data-testid={testIds.accounts.archive.confirmButton(account.id)}
            disabled={disabled}
            onClick={() => {
              void onArchive(account);
            }}
            variant="destructive"
          >
            {disabled ? en.accounts.archiving : en.accounts.archiveConfirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
  openConflictCount,
  pendingOutboxCount,
  surface,
}: {
  readonly apiStatus: string;
  readonly isOnline: boolean;
  readonly openConflictCount: number;
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
        <StatusCapsule
          icon={AlertTriangle}
          label={`${en.shell.openConflicts}: ${openConflictCount}`}
          testId={testIds.runtimeStatus.openConflicts(surface)}
          tone={openConflictCount > 0 ? "danger" : "success"}
        />
      </div>
    </div>
  );
}

function MobileMoreDrawer({
  apiStatus,
  isOnline,
  isLoggingOut,
  openConflictCount,
  onClose,
  onLogout,
  open,
  pendingOutboxCount,
}: {
  readonly apiStatus: string;
  readonly isOnline: boolean;
  readonly isLoggingOut: boolean;
  readonly openConflictCount: number;
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
          openConflictCount={openConflictCount}
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

function makeSampleImportCsv(
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

function makeSampleRecurringPayload(
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

function formatOpenConflictMessage(count: number): string {
  return `${count} ${en.shell.openConflicts.toLowerCase()} need review.`;
}

function cycleTheme(current: Theme): Theme {
  if (current === "system") {
    return "dark";
  }
  if (current === "dark") {
    return "light";
  }
  return "system";
}

function formatThemeLabel(theme: Theme): string {
  if (theme === "dark") {
    return en.shell.darkTheme;
  }
  if (theme === "light") {
    return en.shell.lightTheme;
  }
  return en.shell.systemTheme;
}

function hasActiveTransactionFilters(filters: TransactionListFilterState): boolean {
  return (
    filters.accountId !== ALL_TRANSACTION_FILTER ||
    filters.status !== ALL_TRANSACTION_FILTER ||
    filters.type !== ALL_TRANSACTION_FILTER
  );
}

function formatBudgetPeriodLabel(period: string): string {
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

function formatAccountArchiveTitle(accountName: string): string {
  return en.accounts.archiveTitle.replace("{name}", accountName);
}

function formatAccountArchiveSuccess(accountName: string): string {
  return en.accounts.archiveSuccess.replace("{name}", accountName);
}

function getAccountArchiveError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return en.accounts.archiveFailed;
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

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function readInitialTheme(): Theme {
  const value = window.localStorage.getItem("fastifly.theme");
  return value === "dark" || value === "light" || value === "system" ? value : "system";
}
