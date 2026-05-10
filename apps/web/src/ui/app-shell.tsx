import { Link, useLocation } from "@tanstack/react-router";
import {
  AlertTriangle,
  BarChart3,
  CircleDollarSign,
  Home,
  Landmark,
  ListChecks,
  Moon,
  PieChart,
  ReceiptText,
  Settings,
  Smartphone,
  Sun,
  Wifi,
  WifiOff,
} from "lucide-react";
import { type PropsWithChildren, useEffect, useMemo, useState } from "react";
import { useHealthQuery } from "../api/queries";
import { en } from "../i18n/en";
import { registerServiceWorker } from "../pwa";
import { readPendingOutboxCount } from "../sync/outbox";

type Theme = "light" | "dark";

const navigation = [
  { icon: Home, label: en.nav.dashboard, to: "/" },
  { icon: Landmark, label: en.nav.accounts, to: "/accounts" },
  { icon: ReceiptText, label: en.nav.transactions, to: "/transactions" },
  { icon: PieChart, label: en.nav.budgets, to: "/budgets" },
  { icon: BarChart3, label: en.nav.reports, to: "/reports" },
  { icon: Settings, label: en.nav.settings, to: "/settings" },
] as const;

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const isAuthRoute = location.pathname === "/login";
  const [theme, setTheme] = useState<Theme>(() => readInitialTheme());
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [pendingOutboxCount, setPendingOutboxCount] = useState(() =>
    readPendingOutboxCount(window.localStorage),
  );
  const health = useHealthQuery();

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

  const apiStatus = useMemo(() => {
    if (health.isPending) {
      return en.shell.checkingApi;
    }
    if (health.isError) {
      return en.status.apiOffline;
    }

    return en.status.apiOnline;
  }, [health.isError, health.isPending]);
  const syncRows = useMemo(
    () => [
      { label: en.shell.serverRevision, value: en.shell.notSynced },
      { label: en.shell.pendingOutbox, value: pendingOutboxCount.toString() },
      { label: en.shell.openConflicts, value: en.shell.zero },
    ],
    [pendingOutboxCount],
  );

  if (isAuthRoute) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <div className="grid min-h-screen lg:grid-cols-[248px_1fr]">
        <aside className="hidden border-slate-200 border-r bg-white lg:block dark:border-slate-800 dark:bg-slate-950">
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
              {navigation.map((item) => (
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

        <main className="min-w-0">
          <header className="sticky top-0 z-10 border-slate-200 border-b bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="font-semibold text-lg">{en.nav.dashboard}</h1>
                <p className="text-slate-500 text-sm dark:text-slate-400">{en.shell.subtitle}</p>
              </div>
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
            </div>
          </header>

          <section className="grid min-w-0 gap-4 p-4 pb-24 lg:grid-cols-[1fr_360px] lg:p-6">
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
                    <p className="text-slate-500 text-xs dark:text-slate-400">
                      {en.shell.netWorth}
                    </p>
                    <p className="font-semibold text-xl sm:text-2xl">{en.shell.notLoaded}</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  {syncRows.map((row) => (
                    <div
                      key={row.label}
                      className="rounded-md border border-slate-200 p-3 dark:border-slate-800"
                    >
                      <p className="text-slate-500 text-xs dark:text-slate-400">{row.label}</p>
                      <p className="mt-1 font-semibold text-xl">{row.value}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between border-slate-200 border-b p-4 dark:border-slate-800">
                  <h2 className="font-semibold text-base">{en.shell.recentTransactions}</h2>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 font-medium text-sm transition hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800"
                  >
                    <ListChecks className="size-4" aria-hidden="true" />
                    <span className="hidden sm:inline">{en.shell.review}</span>
                  </button>
                </div>
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  <div className="p-4">
                    <p className="font-medium text-sm">{en.shell.noTransactionsTitle}</p>
                    <p className="mt-1 text-slate-500 text-sm dark:text-slate-400">
                      {en.shell.noTransactionsBody}
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <aside className="space-y-4">
              <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-2">
                  <Smartphone className="size-4 text-emerald-600" aria-hidden="true" />
                  <h2 className="font-semibold text-base">{en.status.syncReady}</h2>
                </div>
                <p className="mt-2 text-slate-500 text-sm dark:text-slate-400">
                  {en.shell.syncReadyBody}
                </p>
                <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-900 text-sm dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
                  {en.shell.noPendingOutbox}
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-amber-600" aria-hidden="true" />
                  <h2 className="font-semibold text-base">{en.shell.conflicts}</h2>
                </div>
                <p className="mt-2 text-slate-500 text-sm dark:text-slate-400">
                  {en.shell.conflictsBody}
                </p>
                <button
                  type="button"
                  className="mt-4 w-full rounded-md bg-slate-900 px-3 py-2 font-medium text-sm text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                >
                  {en.shell.openConflictReview}
                </button>
              </section>
            </aside>
          </section>
          {children}
        </main>
      </div>
      <nav className="fixed bottom-0 left-0 z-20 grid w-screen grid-cols-4 border-slate-200 border-t bg-white lg:hidden dark:border-slate-800 dark:bg-slate-950">
        {navigation.slice(0, 4).map((item) => (
          <Link
            key={item.label}
            to={item.to}
            className="flex min-h-16 flex-col items-center justify-center gap-1 text-slate-500 text-xs [&.active]:text-emerald-700 dark:text-slate-400 dark:[&.active]:text-emerald-400"
          >
            <item.icon className="size-5" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

function readInitialTheme(): Theme {
  return window.localStorage.getItem("fastifly.theme") === "dark" ? "dark" : "light";
}
