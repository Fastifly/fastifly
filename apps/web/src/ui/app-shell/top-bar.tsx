import { Button } from "@ui/button";
import { CheckCircle2, Landmark, Laptop, Moon, ReceiptText, Sun, XCircle } from "lucide-react";
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
