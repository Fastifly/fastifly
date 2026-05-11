import { Link } from "@tanstack/react-router";
import { Button } from "@ui/button";
import {
  CheckCircle2,
  ChevronRight,
  Landmark,
  Laptop,
  Moon,
  ReceiptText,
  Sun,
  XCircle,
} from "lucide-react";
import { en } from "../../i18n/en";
import { testIds } from "../../testing/testid-registry";
import { FastiflyIcon } from "../fastifly-icon";
import type { NavigationItem } from "../navigation";
import { StatusCapsule } from "./primitives";
import { formatThemeLabel, type Theme } from "./utils";

export function TopBar({
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
  const isDashboard = currentNavigationItem.slug === "dashboard";
  const currentLabel = isDashboard ? en.nav.dashboardShort : currentNavigationItem.label;

  return (
    <header className="ff-topbar" data-testid={testIds.shell.topBar}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-[var(--ff-shadow-soft)] dark:bg-emerald-400 dark:text-black md:size-10">
          <FastiflyIcon className="size-6 md:size-7" />
        </span>
        <div className="min-w-0 flex-1">
          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 items-center gap-1 text-sm text-[var(--ff-text-muted)] md:hidden"
            data-testid={testIds.shell.breadcrumbsMobile}
          >
            {isDashboard ? (
              <span
                className="truncate font-semibold text-base text-[var(--ff-text)]"
                data-testid={testIds.shell.topBarTitle}
              >
                {currentLabel}
              </span>
            ) : (
              <>
                <Link
                  to="/"
                  className="shrink-0 rounded-md px-1 py-0.5 transition-colors hover:text-[var(--ff-text)]"
                >
                  {en.nav.dashboardShort}
                </Link>
                <ChevronRight className="size-3 shrink-0" />
                <span
                  className="truncate font-semibold text-[var(--ff-text)]"
                  data-testid={testIds.shell.topBarTitle}
                >
                  {currentNavigationItem.label}
                </span>
              </>
            )}
          </nav>

          <nav
            aria-label="Breadcrumb"
            className="hidden min-w-0 items-center gap-1 text-sm text-[var(--ff-text-muted)] md:flex"
            data-testid={testIds.shell.breadcrumbsDesktop}
          >
            {isDashboard ? (
              <span
                className="truncate font-semibold text-[var(--ff-text)]"
                data-testid={testIds.shell.topBarTitle}
              >
                {currentLabel}
              </span>
            ) : (
              <>
                <Link to="/" className="transition-colors hover:text-[var(--ff-text)]">
                  {en.nav.dashboardShort}
                </Link>
                <ChevronRight className="size-3" />
                <span
                  className="truncate font-semibold text-[var(--ff-text)]"
                  data-testid={testIds.shell.topBarTitle}
                >
                  {currentNavigationItem.label}
                </span>
              </>
            )}
          </nav>
        </div>
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
          className="h-11 min-w-11 gap-1.5 rounded-xl px-3 md:h-9 md:min-w-9 md:px-2"
          data-testid={testIds.shell.themeToggleButton}
          onClick={onToggleTheme}
          aria-label={`${en.shell.toggleTheme}: ${formatThemeLabel(theme)}`}
        >
          {theme === "dark" ? <Sun /> : theme === "light" ? <Moon /> : <Laptop />}
          <span className="text-xs font-semibold md:hidden">{en.shell.theme}</span>
        </Button>
      </div>
    </header>
  );
}
