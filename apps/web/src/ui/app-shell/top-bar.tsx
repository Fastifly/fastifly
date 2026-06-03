import type { WorkspaceSummary } from "@fastifly/common";
import { Link } from "@tanstack/react-router";
import { Button } from "@ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { BookOpen, CheckCircle2, ChevronRight, Laptop, Moon, Sun, XCircle } from "lucide-react";
import { en } from "../../i18n/en";
import { testIds } from "../../testing/testid-registry";
import { FastiflyIcon } from "../fastifly-icon";
import type { NavigationItem } from "../navigation";
import { StatusCapsule } from "./primitives";
import { formatThemeLabel, type Theme } from "./utils";

export function TopBar({
  activeLedgerId,
  activeWorkspaceId,
  currentNavigationItem,
  isOnline,
  onLedgerSelectionChange,
  onToggleTheme,
  theme,
  workspaces,
}: {
  readonly activeLedgerId: string;
  readonly activeWorkspaceId: string;
  readonly currentNavigationItem: NavigationItem;
  readonly isOnline: boolean;
  readonly onLedgerSelectionChange: (selection: {
    readonly ledgerId: string;
    readonly workspaceId: string;
  }) => void;
  readonly onToggleTheme: () => void;
  readonly theme: Theme;
  readonly workspaces: readonly WorkspaceSummary[];
}) {
  const isDashboard = currentNavigationItem.slug === "dashboard";
  const currentLabel = isDashboard ? en.nav.dashboardShort : currentNavigationItem.label;
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);
  const activeLedger = activeWorkspace?.ledgers.find((ledger) => ledger.id === activeLedgerId);
  const ledgerOptions = workspaces.flatMap((workspace) =>
    workspace.ledgers.map((ledger) => ({
      ledger,
      value: `${workspace.id}:${ledger.id}`,
      workspace,
    })),
  );
  const selectedValue = `${activeWorkspaceId}:${activeLedgerId}`;

  return (
    <header
      className="mb-1 flex items-center justify-between gap-3 xl:mb-2"
      data-testid={testIds.shell.topBar}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm dark:bg-emerald-400 dark:text-black md:size-10">
          <FastiflyIcon className="size-6 md:size-7" />
        </span>
        <div className="min-w-0 flex-1">
          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground md:hidden"
            data-testid={testIds.shell.breadcrumbsMobile}
          >
            {isDashboard ? (
              <span
                className="truncate font-semibold text-base text-foreground"
                data-testid={testIds.shell.topBarTitle}
              >
                {currentLabel}
              </span>
            ) : (
              <>
                <Link
                  to="/"
                  className="shrink-0 rounded-md px-1 py-0.5 transition-colors hover:text-foreground"
                >
                  {en.nav.dashboardShort}
                </Link>
                <ChevronRight className="size-3 shrink-0" />
                <span
                  className="truncate font-semibold text-foreground"
                  data-testid={testIds.shell.topBarTitle}
                >
                  {currentNavigationItem.label}
                </span>
              </>
            )}
          </nav>

          <nav
            aria-label="Breadcrumb"
            className="hidden min-w-0 items-center gap-1 text-sm text-muted-foreground md:flex"
            data-testid={testIds.shell.breadcrumbsDesktop}
          >
            {isDashboard ? (
              <span
                className="truncate font-semibold text-foreground"
                data-testid={testIds.shell.topBarTitle}
              >
                {currentLabel}
              </span>
            ) : (
              <>
                <Link to="/" className="transition-colors hover:text-foreground">
                  {en.nav.dashboardShort}
                </Link>
                <ChevronRight className="size-3" />
                <span
                  className="truncate font-semibold text-foreground"
                  data-testid={testIds.shell.topBarTitle}
                >
                  {currentNavigationItem.label}
                </span>
              </>
            )}
          </nav>
        </div>
      </div>
      <div className="hidden min-w-[18rem] max-w-[28rem] shrink items-center gap-2 md:flex">
        <Select
          value={selectedValue}
          onValueChange={(value) => {
            const option = ledgerOptions.find((item) => item.value === value);
            if (option) {
              onLedgerSelectionChange({
                ledgerId: option.ledger.id,
                workspaceId: option.workspace.id,
              });
            }
          }}
        >
          <SelectTrigger
            aria-label={en.shell.switchLedger}
            className="h-9 min-w-0 rounded-lg border-border bg-background"
            data-testid={testIds.shell.ledgerSwitcher}
          >
            <BookOpen aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <SelectValue
              placeholder={
                activeWorkspace && activeLedger
                  ? `${activeWorkspace.name} / ${activeLedger.name}`
                  : en.shell.switchLedger
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {ledgerOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.workspace.name} / {option.ledger.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
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
