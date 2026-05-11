import { formatMoneyMinor } from "@fastifly/common";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@ui/alert";
import { Button } from "@ui/button";
import { AlertTriangle, Menu } from "lucide-react";
import { type PropsWithChildren, useEffect, useMemo, useState } from "react";
import { apiClient } from "../../api/client";
import {
  useAccountsQuery,
  useHealthQuery,
  useMeContextQuery,
  useSyncConflictsQuery,
  useSyncStatusQuery,
  useTransactionsQuery,
} from "../../api/queries";
import { type AuthSessionState, getAuthRedirect } from "../../auth/flow";
import { SESSION_EXPIRED_EVENT, shouldShowSessionExpiredDialog } from "../../auth/session-events";
import { en } from "../../i18n/en";
import {
  activateServiceWorkerUpdate,
  PWA_UPDATE_AVAILABLE_EVENT,
  registerServiceWorker,
} from "../../pwa";
import { readPendingOutboxCount } from "../../sync/outbox";
import { testIds } from "../../testing/testid-registry";
import { getCurrentNavigationItem, getMobilePrimaryNavigation } from "../navigation";
import { SessionExpiredDialog } from "../session-expired-dialog";
import { DesktopNavigation, MobileMoreDrawer, MobileNavLink } from "./navigation-components";
import { PageBody } from "./pages-dashboard";
import { AuthGateScreen } from "./primitives";
import { TopBar } from "./top-bar";
import {
  cycleTheme,
  formatOpenConflictMessage,
  formatPendingSyncMessage,
  readInitialTheme,
  sumAccountBalances,
  sumTransactionAmounts,
} from "./utils";

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAuthRoute = location.pathname === "/login";
  const [theme, setTheme] = useState(() => readInitialTheme());
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
    const onKeyDown = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key === "Escape") {
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
      className="min-h-screen overflow-x-hidden bg-background text-foreground"
      data-testid={testIds.shell.app}
    >
      <main
        className="relative mx-auto min-h-screen w-full max-w-[1500px] px-3 pt-3 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:px-5 md:pb-8 xl:px-8 xl:pb-8"
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
        <DesktopNavigation currentSlug={currentNavigationItem.slug} />
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
        className="fixed right-3 bottom-3 left-3 z-20 grid grid-cols-5 gap-1 rounded-lg border border-border bg-background/95 p-1 pb-[max(0.375rem,env(safe-area-inset-bottom))] shadow-lg supports-backdrop-filter:backdrop-blur xl:hidden"
        aria-label={en.shell.navigation}
        data-testid={testIds.navigation.mobileTabbar}
      >
        {mobileTabs.map((item) => (
          <MobileNavLink key={item.label} item={item} onClick={() => setIsMoreOpen(false)} />
        ))}
        <Button
          type="button"
          variant="ghost"
          className="flex min-h-[3.25rem] min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-transparent text-[11px] font-extrabold text-muted-foreground hover:bg-muted hover:text-foreground"
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
