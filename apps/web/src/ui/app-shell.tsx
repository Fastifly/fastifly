import {
  type AccountWithBalanceResponse,
  formatMoneyMinor,
  type TransactionGroupResponse,
} from "@fastifly/common";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
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
import {
  getCurrentNavigationItem,
  getMobilePrimaryNavigation,
  type NavigationItem,
  navigationItems,
} from "./navigation";
import { SessionExpiredDialog } from "./session-expired-dialog";

type Theme = "light" | "dark";
type Tone = "danger" | "neutral" | "success" | "warning";

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
    <div className="ff-liquid-bg min-h-screen overflow-x-hidden text-white">
      <main className="relative mx-auto min-h-screen w-full max-w-[1500px] px-3 pt-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] md:px-5 xl:px-8 xl:pb-10">
        <TopBar
          accountsCount={accounts.length}
          currentNavigationItem={currentNavigationItem}
          isOnline={isOnline}
          onMore={() => setIsMoreOpen(true)}
          onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
          theme={theme}
          transactionsCount={transactions.length}
        />

        {pendingOutboxCount > 0 ? (
          <div className="ff-warning-bar mt-3">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            <p>{formatPendingSyncMessage(pendingOutboxCount)}</p>
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
          isOnline={isOnline}
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

      <nav className="ff-mobile-tabbar xl:hidden" aria-label={en.shell.navigation}>
        {mobileTabs.map((item) => (
          <MobileNavLink key={item.label} item={item} onClick={() => setIsMoreOpen(false)} />
        ))}
        <button type="button" className="ff-mobile-tab" onClick={() => setIsMoreOpen(true)}>
          <Menu className="size-5" aria-hidden="true" />
          <span>{en.nav.more}</span>
        </button>
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
  onMore,
  onToggleTheme,
  theme,
  transactionsCount,
}: {
  readonly accountsCount: number;
  readonly currentNavigationItem: NavigationItem;
  readonly isOnline: boolean;
  readonly onMore: () => void;
  readonly onToggleTheme: () => void;
  readonly theme: Theme;
  readonly transactionsCount: number;
}) {
  return (
    <header className="ff-topbar">
      <div className="min-w-0">
        <h1 className="truncate font-semibold text-[28px] leading-tight md:text-[34px]">
          {currentNavigationItem.label}
        </h1>
        <p className="mt-1 max-w-[30rem] text-[14px] text-slate-600 dark:text-white/62">
          {en.shell.subtitle}
        </p>
      </div>
      <div className="hidden min-w-0 flex-wrap justify-end gap-2 md:flex">
        <StatusCapsule
          icon={isOnline ? CheckCircle2 : XCircle}
          label={isOnline ? en.status.browserOnline : en.status.browserOffline}
          tone={isOnline ? "success" : "danger"}
        />
        <StatusCapsule
          icon={Landmark}
          label={`${en.shell.accounts}: ${accountsCount}`}
          tone="neutral"
        />
        <StatusCapsule
          icon={ReceiptText}
          label={`${en.shell.transactions}: ${transactionsCount}`}
          tone="neutral"
        />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className="ff-icon-button"
          onClick={onToggleTheme}
          aria-label={en.shell.toggleTheme}
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
        <button type="button" className="ff-icon-button" onClick={onMore} aria-label={en.nav.more}>
          <Menu className="size-4" aria-hidden="true" />
        </button>
      </div>
    </header>
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
  readonly isOnline: boolean;
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
      accountPreview={accountPreview}
      accountsLoading={accountsLoading}
      accountsTotal={accounts.length}
      cashAndBank={cashAndBank}
      income={income}
      liabilities={liabilities}
      moneySummaryValue={moneySummaryValue}
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
  cashAndBank,
  income,
  liabilities,
  moneySummaryValue,
  spending,
  transactions,
  transactionsError,
}: {
  readonly accountPreview: readonly AccountWithBalanceResponse[];
  readonly accountsLoading: boolean;
  readonly accountsTotal: number;
  readonly cashAndBank: string;
  readonly income: string;
  readonly liabilities: string;
  readonly moneySummaryValue: string;
  readonly spending: string;
  readonly transactions: readonly TransactionGroupResponse[];
  readonly transactionsError: boolean;
}) {
  return (
    <section className="ff-page-grid">
      <div className="space-y-4">
        <section className="ff-hero-glass">
          <div>
            <p className="ff-kicker">{en.shell.netWorth}</p>
            <p className="mt-2 break-words font-semibold text-[42px] leading-[0.95] sm:text-[64px]">
              {moneySummaryValue}
            </p>
            <p className="mt-4 max-w-[36rem] text-[14px] text-slate-600 dark:text-white/64">
              {en.shell.derivedBalances}
            </p>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">
            <MetricTile icon={WalletCards} label={en.shell.cashAndBank} value={cashAndBank} />
            <MetricTile icon={RefreshCcw} label={en.shell.liabilities} value={liabilities} />
            <MetricTile
              icon={Landmark}
              label={en.shell.accounts}
              value={accountsTotal.toString()}
            />
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <MetricTile
            icon={ArrowDownLeft}
            label={en.shell.incomeThisMonth}
            value={income}
            tone="green"
          />
          <MetricTile
            icon={ArrowUpRight}
            label={en.shell.spentThisMonth}
            value={spending}
            tone="rose"
          />
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

      <DashboardAside accountPreview={accountPreview} accountsLoading={accountsLoading} />
    </section>
  );
}

function TransactionsPage({
  transactions,
}: {
  readonly transactions: readonly TransactionGroupResponse[];
}) {
  return (
    <section className="ff-single-page">
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
    <section className="ff-single-page">
      <GlassSection title={en.shell.allAccounts} description={en.shell.accountsBody}>
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {accounts.length > 0 ? (
            accounts.map((account) => <AccountCard key={account.id} account={account} />)
          ) : (
            <p className="text-[14px] text-slate-600 dark:text-white/62">
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
    <section className="ff-single-page">
      <GlassSection title={en.shell.budgetWatch} description={en.shell.budgetWatchBody}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricTile
            icon={ArrowDownLeft}
            label={en.shell.incomeThisMonth}
            value={income}
            tone="green"
          />
          <MetricTile
            icon={ArrowUpRight}
            label={en.shell.spentThisMonth}
            value={spending}
            tone="rose"
          />
          <MetricTile icon={WalletCards} label={en.shell.availableAfterSpending} value={cashflow} />
          <MetricTile icon={ShieldCheck} label={en.shell.spendingRate} value={spendingRate} />
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
    <section className="ff-single-page">
      <GlassSection title={en.shell.reportSummary} description={en.shell.reportSummaryBody}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricTile icon={ShieldCheck} label={en.shell.cashflow} value={cashflow} tone="blue" />
          <MetricTile icon={WalletCards} label={en.shell.cashAndBank} value={cashAndBank} />
          <MetricTile
            icon={RefreshCcw}
            label={en.shell.liabilities}
            value={liabilities}
            tone="rose"
          />
          <MetricTile
            icon={Landmark}
            label={en.shell.accounts}
            value={accounts.length.toString()}
          />
          <MetricTile icon={ArrowDownLeft} label={en.shell.income} value={income} tone="green" />
          <MetricTile icon={ArrowUpRight} label={en.shell.spending} value={spending} tone="rose" />
          <MetricTile
            icon={RefreshCcw}
            label={en.shell.transferCount}
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
    <section className="ff-page-grid">
      <GlassSection title={en.shell.settingsOverview} description={en.shell.settingsBody}>
        <div className="space-y-2">
          <SystemStatusRow label={en.shell.workspace} value={en.shell.demoWorkspace} />
          <SystemStatusRow label={en.shell.activeLedger} value={en.shell.demoLedger} />
          <SystemStatusRow label={en.shell.syncMode} value={en.shell.enabled} />
          <SystemStatusRow
            label={en.shell.themePreference}
            value={readInitialTheme() === "dark" ? en.shell.darkTheme : en.shell.lightTheme}
          />
        </div>
      </GlassSection>
      <GlassSection title={en.shell.systemStatus}>
        <RuntimeStatusChips
          apiStatus={apiStatus}
          isOnline={isOnline}
          pendingOutboxCount={pendingOutboxCount}
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
    <aside className="space-y-4">
      <GlassSection title={en.shell.accountBalances}>
        <div className="divide-y divide-white/45 dark:divide-white/10">
          {accountPreview.length > 0 ? (
            accountPreview.map((account) => (
              <AccountBalanceRow key={account.id} account={account} />
            ))
          ) : (
            <p className="py-3 text-[14px] text-slate-600 dark:text-white/62">
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
  title,
}: {
  readonly children: ReactNode;
  readonly description?: string;
  readonly title: string;
}) {
  return (
    <section className="ff-glass-panel p-4 md:p-5">
      <div className="mb-4">
        <h2 className="font-semibold text-[17px]">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-[14px] text-slate-600 dark:text-white/62">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
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
    <section className="ff-glass-panel overflow-hidden">
      <div className="flex items-start justify-between gap-3 p-4 md:p-5">
        <div>
          <h2 className="font-semibold text-[17px]">{title}</h2>
          {description ? (
            <p className="mt-1 text-[14px] text-slate-600 dark:text-white/62">{description}</p>
          ) : null}
        </div>
        {withViewAll ? (
          <Link to="/transactions" className="ff-liquid-control">
            <ReceiptText className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">{en.shell.viewAll}</span>
          </Link>
        ) : null}
      </div>
      <div className="min-w-0 divide-y divide-white/45 dark:divide-white/10">
        {visibleTransactions.length > 0 ? (
          visibleTransactions.map((transaction) => (
            <TransactionRow key={transaction.id} transaction={transaction} />
          ))
        ) : (
          <div className="p-4">
            <p className="font-medium text-[14px]">
              {transactionsError ? en.shell.signInForDemoData : en.shell.noTransactionsTitle}
            </p>
            <p className="mt-1 break-words text-[14px] text-slate-600 dark:text-white/62">
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
    <Link to={item.to} onClick={onClick} className="ff-mobile-tab">
      <item.icon className="size-5" aria-hidden="true" />
      <span>{item.mobileLabel}</span>
    </Link>
  );
}

function MetricTile({
  compact = false,
  icon: Icon,
  label,
  tone = "neutral",
  value,
}: {
  readonly compact?: boolean;
  readonly icon: LucideIcon;
  readonly label: string;
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
    <div className="ff-metric-tile">
      <div className={`ff-metric-icon ${toneClass}`}>
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <p className="mt-3 text-[12px] font-medium text-slate-500 dark:text-white/52">{label}</p>
      <p className={`ff-money-value mt-1 font-semibold ${compact ? "ff-money-value-compact" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function TransactionRow({ transaction }: { readonly transaction: TransactionGroupResponse }) {
  const signedAmount = formatTransactionAmount(transaction);
  const isIncome = transaction.type === "income";

  return (
    <div className="flex min-w-0 items-center justify-between gap-3 px-4 py-3.5 md:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`ff-row-icon ${isIncome ? "text-emerald-700 dark:text-emerald-200" : "text-slate-700 dark:text-white/72"}`}
        >
          {isIncome ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-[14px]">{transaction.title}</p>
          <p className="mt-0.5 text-[12px] text-slate-500 capitalize dark:text-white/50">
            {formatDate(transaction.journals[0]?.occurredAt)} · {transaction.type}
          </p>
        </div>
      </div>
      <p className="shrink-0 text-right font-semibold text-[14px]">{signedAmount}</p>
    </div>
  );
}

function AccountCard({ account }: { readonly account: AccountWithBalanceResponse }) {
  return (
    <div className="ff-account-card">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-[15px]">{account.name}</p>
          <p className="mt-1 text-[12px] text-slate-500 capitalize dark:text-white/50">
            {account.kind} / {account.subtype}
          </p>
        </div>
        <span className="ff-currency-chip">{account.currencyCode}</span>
      </div>
      <p className="mt-6 break-words font-semibold text-[24px]">
        {formatMoneyMinor(BigInt(account.balance.amountMinor), account.balance.currencyCode)}
      </p>
    </div>
  );
}

function AccountBalanceRow({ account }: { readonly account: AccountWithBalanceResponse }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate font-semibold text-[14px]">{account.name}</p>
        <p className="mt-0.5 text-[12px] text-slate-500 capitalize dark:text-white/50">
          {account.kind}
        </p>
      </div>
      <p className="shrink-0 font-semibold text-[14px]">
        {formatMoneyMinor(BigInt(account.balance.amountMinor), account.balance.currencyCode)}
      </p>
    </div>
  );
}

function SystemStatusRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="ff-status-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RuntimeStatusChips({
  apiStatus,
  isOnline,
  pendingOutboxCount,
}: {
  readonly apiStatus: string;
  readonly isOnline: boolean;
  readonly pendingOutboxCount: number;
}) {
  return (
    <div className="ff-runtime-status-group">
      <div className="ff-runtime-status-chips">
        <StatusCapsule
          icon={isOnline ? CheckCircle2 : XCircle}
          label={en.status.internet}
          tone={isOnline ? "success" : "danger"}
        />
        <StatusCapsule
          icon={getServerStatusIcon(apiStatus)}
          label={en.status.server}
          tone={getServerStatusTone(apiStatus)}
        />
        <StatusCapsule
          icon={RefreshCcw}
          label={`${en.status.savingChanges}: ${pendingOutboxCount}`}
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
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-30 xl:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label={en.shell.closeNavigation}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={en.shell.navigation}
        className="ff-more-sheet"
      >
        <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-slate-300/80 dark:bg-white/24" />
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-[22px]">{en.shell.navigation}</h2>
          </div>
          <button
            type="button"
            className="ff-icon-button"
            onClick={onClose}
            aria-label={en.shell.closeNavigation}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <RuntimeStatusChips
          apiStatus={apiStatus}
          isOnline={isOnline}
          pendingOutboxCount={pendingOutboxCount}
        />

        <nav className="mt-5 grid grid-cols-2 gap-2" aria-label={en.shell.navigation}>
          {navigationItems.map((item) => (
            <Link key={item.label} to={item.to} onClick={onClose} className="ff-more-link">
              <item.icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </Link>
          ))}
        </nav>

        <button
          className="ff-more-action mt-3"
          disabled={isLoggingOut}
          onClick={onLogout}
          type="button"
        >
          <LogOut className="size-4 shrink-0" aria-hidden="true" />
          <span>{isLoggingOut ? en.shell.loggingOut : en.shell.logout}</span>
        </button>
      </aside>
    </div>
  );
}

function AuthGateScreen({ label }: { readonly label: string }) {
  return (
    <main className="ff-liquid-bg flex min-h-screen items-center justify-center px-4 text-slate-950 dark:text-white">
      <section className="ff-auth-panel w-full max-w-[22rem] p-5 text-center">
        <div className="ff-brand-mark mx-auto">
          <CircleDollarSign className="size-5" aria-hidden="true" />
        </div>
        <p className="mt-4 font-semibold">{label}</p>
      </section>
    </main>
  );
}

function StatusCapsule({
  icon: Icon,
  label,
  tone,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
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
    <span className={`ff-status-capsule ${toneClass}`}>
      <Icon className="size-3.5" aria-hidden="true" />
      <span>{label}</span>
    </span>
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
