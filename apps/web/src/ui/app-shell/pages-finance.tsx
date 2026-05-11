import type { AccountWithBalanceResponse } from "@fastifly/common";
import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  Landmark,
  Laptop,
  LogOut,
  Moon,
  RefreshCcw,
  ShieldCheck,
  Sun,
  WalletCards,
} from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { en } from "../../i18n/en";
import { testIds } from "../../testing/testid-registry";
import { RuntimeStatusChips, SystemStatusRow } from "./navigation-components";
import { AccountBalanceCard, GlassSection, MetricTile } from "./shared-components";
import { formatDateTime, type Theme } from "./utils";

export function ReportsPage({
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
    <section className="mt-2" data-testid={testIds.reports.page}>
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

export function SettingsPage({
  apiStatus,
  isOnline,
  isLoggingOut,
  isUpdateReady,
  ledgerName,
  onApplyUpdate,
  onLogout,
  onThemeChange,
  openConflictCount,
  pendingOutboxCount,
  theme,
  workspaceId,
  workspaceName,
  workspaceRole,
  ledgerId,
}: {
  readonly apiStatus: string;
  readonly isOnline: boolean;
  readonly isLoggingOut: boolean;
  readonly isUpdateReady: boolean;
  readonly ledgerName: string;
  readonly onApplyUpdate: () => void;
  readonly onLogout: () => void;
  readonly onThemeChange: (theme: Theme) => void;
  readonly openConflictCount: number;
  readonly pendingOutboxCount: number;
  readonly theme: Theme;
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly workspaceRole: "admin" | "editor" | "owner" | "viewer";
  readonly ledgerId: string;
}) {
  const roleLabel = `${workspaceRole.slice(0, 1).toUpperCase()}${workspaceRole.slice(1)}`;
  const diagnosticsSnapshot = useMemo(
    () =>
      [
        `capturedAt=${new Date().toISOString()}`,
        `online=${isOnline}`,
        `apiStatus=${apiStatus}`,
        `workspace=${workspaceName}`,
        `workspaceId=${workspaceId}`,
        `activeLedger=${ledgerName}`,
        `ledgerId=${ledgerId}`,
        `role=${workspaceRole}`,
        `theme=${theme}`,
        `pendingOutboxCount=${pendingOutboxCount}`,
        `openConflictCount=${openConflictCount}`,
      ].join("\n"),
    [
      apiStatus,
      isOnline,
      ledgerId,
      ledgerName,
      openConflictCount,
      pendingOutboxCount,
      theme,
      workspaceId,
      workspaceName,
      workspaceRole,
    ],
  );

  const handleCopyDiagnostics = async () => {
    if (!navigator.clipboard?.writeText) {
      toast.error(en.settings.copyDiagnosticsFailed);
      return;
    }

    try {
      await navigator.clipboard.writeText(diagnosticsSnapshot);
      toast.success(en.settings.copiedDiagnostics);
    } catch {
      toast.error(en.settings.copyDiagnosticsFailed);
    }
  };

  const handleCopyIdentifier = async (value: string) => {
    if (!navigator.clipboard?.writeText) {
      toast.error(en.settings.copyIdFailed);
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      toast.success(en.settings.copiedId);
    } catch {
      toast.error(en.settings.copyIdFailed);
    }
  };

  return (
    <section
      className="mt-2 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(22rem,0.8fr)]"
      data-testid={testIds.settings.page}
    >
      <div className="space-y-4" data-testid={testIds.settings.overview}>
        <header className="space-y-1">
          <h2 className="font-semibold text-lg leading-none tracking-tight">
            {en.settings.overviewTitle}
          </h2>
          <p className="text-muted-foreground text-sm">{en.settings.overviewBody}</p>
        </header>

        <GlassSection
          title={en.settings.workspaceTitle}
          description={en.settings.workspaceBody}
          testId={testIds.settings.workspaceCard}
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
              value={roleLabel}
              valueTestId={testIds.settings.rowValue("active-role")}
            />

            <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="mb-1 text-[12px]">{en.settings.workspaceId}</p>
                  <code className="break-all font-mono text-[12px] text-foreground">
                    {workspaceId}
                  </code>
                </div>
                <Button
                  aria-label={en.settings.copyWorkspaceId}
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                  data-testid={testIds.settings.copyWorkspaceIdButton}
                  onClick={() => void handleCopyIdentifier(workspaceId)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Copy aria-hidden="true" />
                </Button>
              </div>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="mb-1 text-[12px]">{en.settings.ledgerId}</p>
                  <code className="break-all font-mono text-[12px] text-foreground">
                    {ledgerId}
                  </code>
                </div>
                <Button
                  aria-label={en.settings.copyLedgerId}
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                  data-testid={testIds.settings.copyLedgerIdButton}
                  onClick={() => void handleCopyIdentifier(ledgerId)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Copy aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
        </GlassSection>

        <GlassSection
          title={en.settings.automationTitle}
          description={en.settings.automationBody}
          testId={testIds.settings.automationCard}
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button asChild className="justify-between" type="button" variant="outline">
              <Link to="/transactions">
                <span>{en.settings.automationTransactions}</span>
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild className="justify-between" type="button" variant="outline">
              <Link to="/rules">
                <span>{en.settings.automationRules}</span>
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild className="justify-between" type="button" variant="outline">
              <Link to="/recurring">
                <span>{en.settings.automationRecurring}</span>
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild className="justify-between" type="button" variant="outline">
              <Link to="/imports">
                <span>{en.settings.automationImports}</span>
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </GlassSection>
      </div>

      <aside className="flex flex-col gap-4">
        <GlassSection
          title={en.settings.appearanceTitle}
          description={en.settings.appearanceBody}
          testId={testIds.settings.appearance}
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button
              className="justify-start"
              data-testid={testIds.settings.themeLightButton}
              onClick={() => onThemeChange("light")}
              type="button"
              variant={theme === "light" ? "secondary" : "outline"}
            >
              <Sun aria-hidden="true" />
              {en.shell.lightTheme}
              {theme === "light" ? <Check aria-hidden="true" /> : null}
            </Button>
            <Button
              className="justify-start"
              data-testid={testIds.settings.themeDarkButton}
              onClick={() => onThemeChange("dark")}
              type="button"
              variant={theme === "dark" ? "secondary" : "outline"}
            >
              <Moon aria-hidden="true" />
              {en.shell.darkTheme}
              {theme === "dark" ? <Check aria-hidden="true" /> : null}
            </Button>
            <Button
              className="justify-start"
              data-testid={testIds.settings.themeSystemButton}
              onClick={() => onThemeChange("system")}
              type="button"
              variant={theme === "system" ? "secondary" : "outline"}
            >
              <Laptop aria-hidden="true" />
              {en.shell.systemTheme}
              {theme === "system" ? <Check aria-hidden="true" /> : null}
            </Button>
          </div>
        </GlassSection>

        <GlassSection
          title={en.settings.syncHealthTitle}
          description={en.settings.syncHealthBody}
          testId={testIds.settings.syncHealthCard}
        >
          <RuntimeStatusChips
            apiStatus={apiStatus}
            isOnline={isOnline}
            openConflictCount={openConflictCount}
            pendingOutboxCount={pendingOutboxCount}
            surface="settings"
          />
          <div className="mt-3 space-y-2">
            <SystemStatusRow
              label={en.settings.queuedChanges}
              value={pendingOutboxCount.toString()}
              rowTestId={testIds.settings.row("sync-mode")}
            />
            <SystemStatusRow
              label={en.settings.openConflicts}
              value={openConflictCount.toString()}
              rowTestId={testIds.settings.row("active-role")}
            />
          </div>
          <div className="mt-3">
            <Button asChild size="sm" type="button" variant="outline">
              <Link to="/sync">
                <RefreshCcw aria-hidden="true" />
                {en.shell.syncCenter}
              </Link>
            </Button>
          </div>
        </GlassSection>

        <GlassSection
          title={en.settings.maintenanceTitle}
          description={en.settings.maintenanceBody}
          testId={testIds.settings.maintenanceCard}
        >
          <SystemStatusRow
            label={en.settings.updateAvailable}
            value={isUpdateReady ? en.shell.enabled : en.settings.updateCurrent}
          />
          <div className="mt-3">
            <Button
              disabled={!isUpdateReady}
              onClick={onApplyUpdate}
              size="sm"
              type="button"
              variant="outline"
            >
              <RefreshCcw aria-hidden="true" />
              {en.shell.updateNow}
            </Button>
          </div>
        </GlassSection>

        <GlassSection
          title={en.settings.sessionTitle}
          description={en.settings.sessionBody}
          testId={testIds.settings.sessionCard}
        >
          <Button
            className="w-full border-rose-500/40 text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
            data-testid={testIds.settings.logoutButton}
            disabled={isLoggingOut}
            onClick={onLogout}
            type="button"
            variant="outline"
          >
            <LogOut aria-hidden="true" />
            <span>{isLoggingOut ? en.shell.loggingOut : en.shell.logout}</span>
          </Button>
        </GlassSection>

        <GlassSection
          title={en.settings.diagnosticsTitle}
          description={en.settings.diagnosticsBody}
          testId={testIds.settings.diagnosticsCard}
        >
          <Button
            className="w-full justify-start"
            data-testid={testIds.settings.copyDiagnosticsButton}
            onClick={() => void handleCopyDiagnostics()}
            type="button"
            variant="outline"
          >
            <Copy aria-hidden="true" />
            {en.settings.copyDiagnostics}
          </Button>
        </GlassSection>
      </aside>
    </section>
  );
}

export function SyncPage({
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
    <section className="mt-2 space-y-4" data-testid={testIds.sync.page}>
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
                className="border border-border bg-card p-4 text-card-foreground shadow-sm"
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

export function DashboardAside({
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
