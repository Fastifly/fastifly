import { Link } from "@tanstack/react-router";
import { Button } from "@ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@ui/sheet";
import { AlertTriangle, CheckCircle2, LogOut, RefreshCcw, X, XCircle } from "lucide-react";
import { en } from "../../i18n/en";
import { testIds } from "../../testing/testid-registry";
import { BlockedActionGate } from "../blocked-action-gate";
import { type NavigationItem, navigationItems } from "../navigation";
import { StatusCapsule } from "./primitives";
import {
  getPendingOutboxTone,
  getServerStatusIcon,
  getServerStatusTone,
  toNavigationTestIdSlug,
} from "./utils";

export function MobileNavLink({
  item,
  onClick,
}: {
  readonly item: NavigationItem;
  readonly onClick: () => void;
}) {
  return (
    <Button
      asChild
      className="flex min-h-[3.25rem] min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-transparent text-[11px] font-extrabold text-muted-foreground hover:bg-muted hover:text-foreground"
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

export function DesktopNavigation({ currentSlug }: { readonly currentSlug: string }) {
  return (
    <nav className="mb-4 hidden flex-wrap gap-2 xl:flex" aria-label={en.shell.navigation}>
      {navigationItems.map((item) => (
        <Button
          asChild
          className="rounded-lg border border-border"
          data-testid={testIds.navigation.moreNav(toNavigationTestIdSlug(item.slug))}
          key={item.slug}
          variant={item.slug === currentSlug ? "secondary" : "ghost"}
        >
          <Link aria-current={item.slug === currentSlug ? "page" : undefined} to={item.to}>
            <item.icon aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        </Button>
      ))}
    </nav>
  );
}

export function SystemStatusRow({
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
    <div
      className="flex items-center justify-between gap-4 rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground"
      data-testid={rowTestId}
    >
      <span data-testid={labelTestId}>{label}</span>
      <strong className="text-right text-foreground" data-testid={valueTestId}>
        {value}
      </strong>
    </div>
  );
}

export function RuntimeStatusChips({
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
    <div
      className="mt-4 border-y border-border py-3"
      data-testid={testIds.runtimeStatus.group(surface)}
    >
      <div className="flex max-w-full items-center gap-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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

export function MobileMoreDrawer({
  apiStatus,
  isOnline,
  isLoggingOut,
  onClose,
  onLogout,
  open,
  openConflictCount,
  pendingOutboxCount,
}: {
  readonly apiStatus: string;
  readonly isOnline: boolean;
  readonly isLoggingOut: boolean;
  readonly onClose: () => void;
  readonly onLogout: () => void;
  readonly open: boolean;
  readonly openConflictCount: number;
  readonly pendingOutboxCount: number;
}) {
  return (
    <Sheet open={open} onOpenChange={(nextOpen) => (nextOpen ? undefined : onClose())}>
      <SheetContent
        aria-label={en.shell.navigation}
        className="max-h-[min(90vh,42rem)] overflow-y-auto rounded-t-xl border border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg xl:hidden"
        data-testid={testIds.navigation.mobileMoreDrawer}
        showCloseButton={false}
        side="bottom"
      >
        <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-slate-300/80 dark:bg-white/24" />
        <SheetHeader className="flex-row items-center justify-between gap-3 p-0">
          <SheetTitle className="text-[22px]">Fastifly</SheetTitle>
          <SheetDescription className="sr-only">
            {en.shell.mobileNavigationDescription}
          </SheetDescription>
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
              className="min-w-0 justify-start gap-2 rounded-lg bg-muted p-3 font-bold text-foreground"
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

        <BlockedActionGate blocked={isLoggingOut} reason={en.actionGate.inProgress}>
          <Button
            className="mt-3 w-full border-rose-500/40 text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
            data-testid={testIds.navigation.logoutButton}
            onClick={onLogout}
            type="button"
            variant="outline"
          >
            <LogOut aria-hidden="true" data-icon="inline-start" />
            <span>{isLoggingOut ? en.shell.loggingOut : en.shell.logout}</span>
          </Button>
        </BlockedActionGate>
      </SheetContent>
    </Sheet>
  );
}
