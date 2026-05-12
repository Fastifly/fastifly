import { formatMoneyMinor, isUserHeldAccountKind } from "@fastifly/common";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { Button } from "@ui/button";
import { Menu } from "lucide-react";
import { type PropsWithChildren, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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
  const previousOpenConflictCountRef = useRef(0);
  const previousPendingOutboxCountRef = useRef(0);
  const updateToastShownRef = useRef(false);
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
  const openConflictCount = syncStatusQuery.data?.data.openConflicts ?? 0;
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
    if (isUpdateReady && !updateToastShownRef.current) {
      toast(en.shell.updateReady, {
        action: {
          label: en.shell.updateNow,
          onClick: () => {
            setIsUpdateReady(false);
            void activateServiceWorkerUpdate();
          },
        },
        duration: Number.POSITIVE_INFINITY,
        id: "app-update-ready",
      });
      updateToastShownRef.current = true;
      return;
    }

    if (!isUpdateReady && updateToastShownRef.current) {
      toast.dismiss("app-update-ready");
      updateToastShownRef.current = false;
    }
  }, [isUpdateReady]);

  useEffect(() => {
    const previous = previousOpenConflictCountRef.current;
    if (openConflictCount > 0 && openConflictCount !== previous) {
      toast.warning(formatOpenConflictMessage(openConflictCount), {
        action: {
          label: en.shell.reviewConflicts,
          onClick: () => {
            void navigate({ to: "/sync" });
          },
        },
        id: "sync-conflict-alert",
      });
    }
    if (openConflictCount === 0 && previous > 0) {
      toast.dismiss("sync-conflict-alert");
    }
    previousOpenConflictCountRef.current = openConflictCount;
  }, [navigate, openConflictCount]);

  useEffect(() => {
    const previous = previousPendingOutboxCountRef.current;
    if (pendingOutboxCount > 0 && pendingOutboxCount !== previous) {
      toast.info(formatPendingSyncMessage(pendingOutboxCount), {
        id: "pending-sync-alert",
      });
    }
    if (pendingOutboxCount === 0 && previous > 0) {
      toast.dismiss("pending-sync-alert");
    }
    previousPendingOutboxCountRef.current = pendingOutboxCount;
  }, [pendingOutboxCount]);

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
  const syncServerRevision = syncStatusQuery.data?.data.serverRevision ?? "0";
  const syncLastOperationAt = syncStatusQuery.data?.data.lastOperationAt ?? null;
  const syncConflicts = syncConflictsQuery.data?.data.conflicts ?? [];
  const transactions = transactionsQuery.data?.data ?? [];
  const userHeldAccounts = accounts.filter((account) => isUserHeldAccountKind(account.kind));
  const assetAccounts = userHeldAccounts.filter((account) => account.kind === "asset");
  const liabilityAccounts = userHeldAccounts.filter((account) => account.kind === "liability");
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
  const accountPreview = userHeldAccounts.slice(0, 5);

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
      className="h-dvh overflow-hidden bg-background text-foreground"
      data-testid={testIds.shell.app}
    >
      <main
        className="relative mx-auto flex h-full w-full max-w-[1500px] flex-col px-3 pt-3 md:px-5 xl:px-8"
        data-testid={testIds.shell.main}
      >
        <div className="shrink-0">
          <TopBar
            accountsCount={userHeldAccounts.length}
            currentNavigationItem={currentNavigationItem}
            isOnline={isOnline}
            onToggleTheme={() => setTheme(cycleTheme(theme))}
            theme={theme}
            transactionsCount={transactions.length}
          />
          <DesktopNavigation currentSlug={currentNavigationItem.slug} />
          {children}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-8 xl:pb-8">
          <PageBody
            accounts={accounts}
            accountPreview={accountPreview}
            accountsLoading={accountsQuery.isPending}
            apiStatus={apiStatus}
            cashAndBank={cashAndBank}
            cashflow={cashflow}
            income={income}
            isOnline={isOnline}
            isLoggingOut={logoutMutation.isPending}
            isUpdateReady={isUpdateReady}
            ledgerContext={ledgerContext}
            liabilities={liabilities}
            moneySummaryValue={moneySummaryValue}
            onApplyUpdate={() => {
              setIsUpdateReady(false);
              void activateServiceWorkerUpdate();
            }}
            onLogout={() => logoutMutation.mutate()}
            onThemeChange={(nextTheme) => setTheme(nextTheme)}
            pageSlug={currentNavigationItem.slug}
            pendingOutboxCount={pendingOutboxCount}
            openConflictCount={openConflictCount}
            syncConflicts={syncConflicts}
            syncLastOperationAt={syncLastOperationAt}
            syncServerRevision={syncServerRevision}
            spending={spending}
            spendingRate={spendingRate}
            transactionCount={transactions.length}
            theme={theme}
            transferCount={transferCount}
            workspaceId={meContext.data.data.activeWorkspace.id}
            workspaceName={meContext.data.data.activeWorkspace.name}
            workspaceRole={meContext.data.data.activeWorkspace.role}
            ledgerName={meContext.data.data.activeLedger.name}
            ledgerId={meContext.data.data.activeLedger.id}
          />
        </div>
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
