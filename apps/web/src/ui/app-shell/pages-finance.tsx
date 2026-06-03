import {
  type AccountWithBalanceResponse,
  formatMoneyMinor,
  isUserHeldAccountKind,
  type WorkspaceSummary,
} from "@fastifly/common";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@ui/field";
import { Input } from "@ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Copy,
  Landmark,
  Laptop,
  LogOut,
  Moon,
  RefreshCcw,
  ShieldCheck,
  Sun,
  Trash2,
  WalletCards,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { apiClient, FastiflyApiError } from "../../api/client";
import { en } from "../../i18n/en";
import { testIds } from "../../testing/testid-registry";
import { BlockedActionGate } from "../blocked-action-gate";
import { RuntimeStatusChips, SystemStatusRow } from "./navigation-components";
import { GlassSection, MetricTile } from "./shared-components";
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
  const userHeldAccountsCount = accounts.filter((account) =>
    isUserHeldAccountKind(account.kind),
  ).length;

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
            value={userHeldAccountsCount.toString()}
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
  onLedgerSelectionChange,
  onLogout,
  onThemeChange,
  openConflictCount,
  pendingOutboxCount,
  theme,
  workspaceId,
  workspaceName,
  workspaceRole,
  workspaces,
  ledgerId,
}: {
  readonly apiStatus: string;
  readonly isOnline: boolean;
  readonly isLoggingOut: boolean;
  readonly isUpdateReady: boolean;
  readonly ledgerName: string;
  readonly onApplyUpdate: () => void;
  readonly onLedgerSelectionChange: (selection: {
    readonly ledgerId: string;
    readonly workspaceId: string;
  }) => void;
  readonly onLogout: () => void;
  readonly onThemeChange: (theme: Theme) => void;
  readonly openConflictCount: number;
  readonly pendingOutboxCount: number;
  readonly theme: Theme;
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly workspaceRole: "admin" | "editor" | "owner" | "viewer";
  readonly workspaces: readonly WorkspaceSummary[];
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

        <WorkspaceLedgerManagement
          activeLedgerId={ledgerId}
          activeWorkspaceId={workspaceId}
          onLedgerSelectionChange={onLedgerSelectionChange}
          workspaces={workspaces}
        />

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
            <BlockedActionGate
              blocked={!isUpdateReady}
              reason={en.actionGate.updateUnavailable}
              suggestion={{
                label: en.shell.syncCenter,
                to: "/sync",
              }}
            >
              <Button onClick={onApplyUpdate} size="sm" type="button" variant="outline">
                <RefreshCcw aria-hidden="true" />
                {en.shell.updateNow}
              </Button>
            </BlockedActionGate>
          </div>
        </GlassSection>

        <GlassSection
          title={en.settings.sessionTitle}
          description={en.settings.sessionBody}
          testId={testIds.settings.sessionCard}
        >
          <BlockedActionGate blocked={isLoggingOut} reason={en.actionGate.inProgress}>
            <Button
              className="w-full border-rose-500/40 text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
              data-testid={testIds.settings.logoutButton}
              onClick={onLogout}
              type="button"
              variant="outline"
            >
              <LogOut aria-hidden="true" />
              <span>{isLoggingOut ? en.shell.loggingOut : en.shell.logout}</span>
            </Button>
          </BlockedActionGate>
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

type LedgerDialogState =
  | {
      readonly mode: "create";
      readonly workspaceId: string;
    }
  | {
      readonly ledger: WorkspaceSummary["ledgers"][number];
      readonly mode: "edit";
      readonly workspaceId: string;
    };

function WorkspaceLedgerManagement({
  activeLedgerId,
  activeWorkspaceId,
  onLedgerSelectionChange,
  workspaces,
}: {
  readonly activeLedgerId: string;
  readonly activeWorkspaceId: string;
  readonly onLedgerSelectionChange: (selection: {
    readonly ledgerId: string;
    readonly workspaceId: string;
  }) => void;
  readonly workspaces: readonly WorkspaceSummary[];
}) {
  const queryClient = useQueryClient();
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceLedgerName, setWorkspaceLedgerName] = useState("");
  const [workspaceCurrencyCode, setWorkspaceCurrencyCode] = useState("INR");
  const [ledgerDialog, setLedgerDialog] = useState<LedgerDialogState | null>(null);
  const [ledgerName, setLedgerName] = useState("");
  const [ledgerCurrencyCode, setLedgerCurrencyCode] = useState("INR");
  const [ledgerFirstDay, setLedgerFirstDay] = useState("1");

  const invalidateContext = async () => {
    await queryClient.invalidateQueries({ queryKey: ["me"] });
  };

  const createWorkspaceMutation = useMutation({
    mutationFn: async () =>
      apiClient.createWorkspace({
        baseCurrencyCode: workspaceCurrencyCode,
        ledgerName: workspaceLedgerName,
        name: workspaceName,
      }),
    onError: (error) => toast.error(resolveWorkspaceLedgerError(error)),
    onSuccess: async (workspace) => {
      const firstLedger = workspace.ledgers[0];
      toast.success(en.settings.workspaceCreated);
      setWorkspaceDialogOpen(false);
      setWorkspaceName("");
      setWorkspaceLedgerName("");
      await invalidateContext();
      if (firstLedger) {
        onLedgerSelectionChange({ ledgerId: firstLedger.id, workspaceId: workspace.id });
      }
    },
  });

  const saveLedgerMutation = useMutation({
    mutationFn: async () => {
      if (!ledgerDialog) {
        throw new Error(en.settings.ledgerSaveFailed);
      }
      const firstDayOfWeek = Number.parseInt(ledgerFirstDay, 10);
      if (ledgerDialog.mode === "create") {
        return apiClient.createLedger({
          baseCurrencyCode: ledgerCurrencyCode,
          firstDayOfWeek,
          name: ledgerName,
          workspaceId: ledgerDialog.workspaceId,
        });
      }
      return apiClient.updateLedger({
        firstDayOfWeek,
        ledgerId: ledgerDialog.ledger.id,
        name: ledgerName,
        workspaceId: ledgerDialog.workspaceId,
      });
    },
    onError: (error) => toast.error(resolveWorkspaceLedgerError(error)),
    onSuccess: async (ledger) => {
      toast.success(en.settings.ledgerSaved);
      setLedgerDialog(null);
      await invalidateContext();
      onLedgerSelectionChange({ ledgerId: ledger.id, workspaceId: ledger.workspaceId });
    },
  });

  const archiveLedgerMutation = useMutation({
    mutationFn: apiClient.archiveLedger,
    onError: (error) => toast.error(resolveWorkspaceLedgerError(error)),
    onSuccess: async (response) => {
      toast.success(en.settings.ledgerArchived);
      await invalidateContext();
      if (response.data.ledger.id === activeLedgerId) {
        const fallback = workspaces
          .find((workspace) => workspace.id === activeWorkspaceId)
          ?.ledgers.find((ledger) => ledger.id !== activeLedgerId);
        if (fallback) {
          onLedgerSelectionChange({ ledgerId: fallback.id, workspaceId: fallback.workspaceId });
        }
      }
    },
  });

  const openCreateLedger = (workspaceId: string) => {
    setLedgerDialog({ mode: "create", workspaceId });
    setLedgerName("");
    setLedgerCurrencyCode(
      workspaces.find((workspace) => workspace.id === workspaceId)?.ledgers[0]?.baseCurrencyCode ??
        "INR",
    );
    setLedgerFirstDay("1");
  };

  const openEditLedger = (workspaceId: string, ledger: WorkspaceSummary["ledgers"][number]) => {
    setLedgerDialog({ ledger, mode: "edit", workspaceId });
    setLedgerName(ledger.name);
    setLedgerCurrencyCode(ledger.baseCurrencyCode);
    setLedgerFirstDay(ledger.firstDayOfWeek.toString());
  };

  return (
    <>
      <GlassSection
        title={en.settings.workspaceLedgerTitle}
        description={en.settings.workspaceLedgerBody}
        testId={testIds.settings.workspaceLedgerCard}
        headerAction={
          <Button size="sm" type="button" onClick={() => setWorkspaceDialogOpen(true)}>
            <Landmark aria-hidden="true" />
            {en.settings.addWorkspace}
          </Button>
        }
      >
        <div className="space-y-3">
          {workspaces.map((workspace) => (
            <div key={workspace.id} className="rounded-lg border border-border bg-background p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-sm">{workspace.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {workspace.role} / {en.settings.ledgerCount(workspace.ledgers.length)}
                  </p>
                </div>
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => openCreateLedger(workspace.id)}
                >
                  <BookOpen aria-hidden="true" />
                  {en.settings.addLedger}
                </Button>
              </div>
              <div className="mt-3 grid gap-2">
                {workspace.ledgers.map((ledger) => {
                  const isActive = ledger.id === activeLedgerId;
                  const canArchive = workspace.ledgers.length > 1;
                  return (
                    <div
                      key={ledger.id}
                      className="flex flex-col gap-2 rounded-lg bg-muted/35 p-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium text-sm">{ledger.name}</p>
                          {isActive ? (
                            <Badge variant="secondary">{en.settings.active}</Badge>
                          ) : null}
                        </div>
                        <p className="text-muted-foreground text-xs">
                          {ledger.baseCurrencyCode} / {en.settings.weekStartsOn}{" "}
                          {formatWeekday(ledger.firstDayOfWeek)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          type="button"
                          variant={isActive ? "secondary" : "outline"}
                          onClick={() =>
                            onLedgerSelectionChange({
                              ledgerId: ledger.id,
                              workspaceId: workspace.id,
                            })
                          }
                        >
                          <Check aria-hidden="true" />
                          {isActive ? en.settings.active : en.settings.useLedger}
                        </Button>
                        <Button
                          size="sm"
                          type="button"
                          variant="outline"
                          onClick={() => openEditLedger(workspace.id, ledger)}
                        >
                          {en.settings.editLedger}
                        </Button>
                        <BlockedActionGate blocked={!canArchive} reason={en.settings.keepOneLedger}>
                          <Button
                            size="sm"
                            type="button"
                            variant="outline"
                            disabled={archiveLedgerMutation.isPending}
                            className="border-rose-500/40 text-rose-700 hover:bg-rose-50 dark:text-rose-300"
                            onClick={() =>
                              archiveLedgerMutation.mutate({
                                ledgerId: ledger.id,
                                workspaceId: workspace.id,
                              })
                            }
                          >
                            <Trash2 aria-hidden="true" />
                            {en.settings.archiveLedger}
                          </Button>
                        </BlockedActionGate>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </GlassSection>

      <Dialog open={workspaceDialogOpen} onOpenChange={setWorkspaceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{en.settings.addWorkspace}</DialogTitle>
            <DialogDescription>{en.settings.addWorkspaceBody}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>{en.settings.workspaceName}</FieldLabel>
              <Input
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>{en.settings.initialLedgerName}</FieldLabel>
              <Input
                value={workspaceLedgerName}
                onChange={(event) => setWorkspaceLedgerName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>{en.settings.baseCurrency}</FieldLabel>
              <Input
                maxLength={3}
                value={workspaceCurrencyCode}
                onChange={(event) => setWorkspaceCurrencyCode(event.target.value.toUpperCase())}
              />
            </Field>
            {createWorkspaceMutation.isError ? (
              <FieldError>{resolveWorkspaceLedgerError(createWorkspaceMutation.error)}</FieldError>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              disabled={createWorkspaceMutation.isPending}
              onClick={() => createWorkspaceMutation.mutate()}
            >
              {createWorkspaceMutation.isPending ? en.shell.loadingData : en.settings.saveWorkspace}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={ledgerDialog !== null}
        onOpenChange={(open) => (open ? undefined : setLedgerDialog(null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {ledgerDialog?.mode === "edit" ? en.settings.editLedger : en.settings.addLedger}
            </DialogTitle>
            <DialogDescription>{en.settings.ledgerDialogBody}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>{en.settings.ledgerName}</FieldLabel>
              <Input value={ledgerName} onChange={(event) => setLedgerName(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel>{en.settings.baseCurrency}</FieldLabel>
              <Input
                disabled={ledgerDialog?.mode === "edit"}
                maxLength={3}
                value={ledgerCurrencyCode}
                onChange={(event) => setLedgerCurrencyCode(event.target.value.toUpperCase())}
              />
            </Field>
            <Field>
              <FieldLabel>{en.settings.weekStartsOn}</FieldLabel>
              <Select value={ledgerFirstDay} onValueChange={setLedgerFirstDay}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                      <SelectItem key={day} value={day.toString()}>
                        {formatWeekday(day)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            {saveLedgerMutation.isError ? (
              <FieldError>{resolveWorkspaceLedgerError(saveLedgerMutation.error)}</FieldError>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              disabled={saveLedgerMutation.isPending}
              onClick={() => saveLedgerMutation.mutate()}
            >
              {saveLedgerMutation.isPending ? en.shell.loadingData : en.settings.saveLedger}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function resolveWorkspaceLedgerError(error: unknown): string {
  if (error instanceof FastiflyApiError) {
    return error.response.error.message;
  }
  return error instanceof Error ? error.message : en.settings.ledgerSaveFailed;
}

function formatWeekday(day: number): string {
  return en.settings.weekdays[day] ?? en.settings.weekdays[1] ?? "";
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
  cashAndBank,
  liabilities,
}: {
  readonly accountPreview: readonly AccountWithBalanceResponse[];
  readonly accountsLoading: boolean;
  readonly cashAndBank: string;
  readonly liabilities: string;
}) {
  return (
    <aside className="flex flex-col gap-4" data-testid={testIds.dashboard.aside}>
      <GlassSection title={en.shell.accountBalances} testId={testIds.dashboard.accountBalances}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2" data-testid={testIds.dashboard.summaryMetrics}>
            <Card
              className="min-w-0 rounded-xl border-border/70 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-0 shadow-none"
              data-testid={testIds.dashboard.cashAndBankMetric}
              size="sm"
            >
              <div className="space-y-2 p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-border bg-background/70">
                    <WalletCards
                      aria-hidden="true"
                      className="size-3.5 text-emerald-600 dark:text-emerald-300"
                    />
                  </span>
                  <span className="font-medium">{en.shell.cashAndBank}</span>
                </div>
                <p className="font-semibold text-[1.15rem] leading-tight text-foreground">
                  {cashAndBank}
                </p>
              </div>
            </Card>
            <Card
              className="min-w-0 rounded-xl border-border/70 bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent p-0 shadow-none"
              data-testid={testIds.dashboard.liabilitiesMetric}
              size="sm"
            >
              <div className="space-y-2 p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-border bg-background/70">
                    <RefreshCcw
                      aria-hidden="true"
                      className="size-3.5 text-rose-600 dark:text-rose-300"
                    />
                  </span>
                  <span className="font-medium">{en.shell.liabilities}</span>
                </div>
                <p className="font-semibold text-[1.15rem] leading-tight text-foreground">
                  {liabilities}
                </p>
              </div>
            </Card>
          </div>
          <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />
          <div
            className="grid grid-cols-2 gap-2"
            data-testid={testIds.dashboard.accountBalancesList}
          >
            {accountPreview.length > 0 ? (
              accountPreview.map((account) => {
                const isLiability = account.kind === "liability";
                return (
                  <Card
                    className={
                      isLiability
                        ? "min-w-0 rounded-xl border-rose-500/30 bg-gradient-to-br from-rose-500/15 via-rose-500/8 to-transparent p-0 shadow-none"
                        : "min-w-0 rounded-xl border-emerald-500/25 bg-gradient-to-br from-emerald-500/15 via-emerald-500/8 to-transparent p-0 shadow-none"
                    }
                    key={account.id}
                    size="sm"
                  >
                    <div className="space-y-3 p-3">
                      <div className="space-y-0.5">
                        <p className="truncate font-semibold text-[0.98rem] text-foreground">
                          {account.name}
                        </p>
                        <p className="text-[11px] capitalize text-muted-foreground">
                          {account.kind}
                        </p>
                      </div>
                      <div className="flex items-end justify-between gap-2">
                        <p className="font-semibold text-[1.05rem] leading-none text-foreground">
                          {formatMoneyMinor(
                            BigInt(account.balance.amountMinor),
                            account.balance.currencyCode,
                          )}
                        </p>
                        <Badge
                          className="rounded-md border-border/70 bg-background/60 text-[10px] text-muted-foreground"
                          variant="outline"
                        >
                          {account.currencyCode}
                        </Badge>
                      </div>
                    </div>
                  </Card>
                );
              })
            ) : (
              <p
                className="col-span-2 py-3 text-[14px] text-slate-600 dark:text-white/62"
                data-testid={testIds.dashboard.accountBalancesEmpty}
              >
                {accountsLoading ? (
                  en.shell.loadingData
                ) : (
                  <>
                    {en.shell.noAccountsBody}{" "}
                    <Link
                      className="font-medium text-primary underline underline-offset-2"
                      to="/accounts"
                    >
                      {en.accounts.addAccount}
                    </Link>
                  </>
                )}
              </p>
            )}
          </div>
        </div>
      </GlassSection>
    </aside>
  );
}
