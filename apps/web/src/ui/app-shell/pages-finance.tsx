import type { AccountWithBalanceResponse } from "@fastifly/common";
import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  RefreshCcw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { en } from "../../i18n/en";
import { testIds } from "../../testing/testid-registry";
import { RuntimeStatusChips, SystemStatusRow } from "./navigation-components";
import { AccountBalanceCard, GlassSection, MetricTile } from "./shared-components";
import { formatDateTime, formatThemeLabel, type Theme } from "./utils";

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
    <section
      className="mt-2 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(22rem,0.8fr)]"
      data-testid={testIds.settings.page}
    >
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
