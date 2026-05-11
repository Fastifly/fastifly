import type { AccountWithBalanceResponse } from "@fastifly/common";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@ui/alert";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardContent } from "@ui/card";
import { ArrowDownLeft, ArrowUpRight, ShieldCheck, WalletCards } from "lucide-react";
import { useState } from "react";
import { apiClient } from "../../api/client";
import { useBudgetsQuery, useImportJobsQuery, useRulesQuery } from "../../api/queries";
import { en } from "../../i18n/en";
import { testIds } from "../../testing/testid-registry";
import { AccountCreatePanel } from "../account-create-panel";
import { BudgetSummaryCard } from "./budget-components";
import { AccountCard, GlassSection, MetricTile } from "./shared-components";
import { formatAccountArchiveSuccess, getAccountArchiveError, makeSampleImportCsv } from "./utils";

export function AccountsPage({
  accounts,
  accountsLoading,
  ledgerContext,
}: {
  readonly accounts: readonly AccountWithBalanceResponse[];
  readonly accountsLoading: boolean;
  readonly ledgerContext: {
    readonly ledgerId: string;
    readonly workspaceId: string;
  } | null;
}) {
  const queryClient = useQueryClient();
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveSuccess, setArchiveSuccess] = useState<string | null>(null);
  const archiveMutation = useMutation({
    mutationFn: async (account: AccountWithBalanceResponse) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }

      await apiClient.archiveAccount({
        accountId: account.id,
        ledgerId: ledgerContext.ledgerId,
        workspaceId: ledgerContext.workspaceId,
      });
    },
    onSuccess: async (_data, account) => {
      setArchiveSuccess(formatAccountArchiveSuccess(account.name));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["finance", "accounts", ledgerContext?.workspaceId, ledgerContext?.ledgerId],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            "finance",
            "transactions",
            ledgerContext?.workspaceId,
            ledgerContext?.ledgerId,
          ],
        }),
      ]);
    },
  });
  const archiveAccount = async (account: AccountWithBalanceResponse) => {
    setArchiveError(null);
    setArchiveSuccess(null);

    try {
      await archiveMutation.mutateAsync(account);
    } catch (error) {
      setArchiveError(getAccountArchiveError(error));
    }
  };

  return (
    <section className="ff-single-page space-y-4" data-testid={testIds.accounts.page}>
      <AccountCreatePanel ledgerContext={ledgerContext} />
      <GlassSection title={en.shell.allAccounts} description={en.shell.accountsBody}>
        <div className="flex flex-col gap-3">
          {archiveError ? (
            <Alert data-testid={testIds.accounts.archive.errorAlert} variant="destructive">
              <AlertDescription data-testid={testIds.accounts.archive.errorMessage}>
                {archiveError}
              </AlertDescription>
            </Alert>
          ) : null}
          {archiveSuccess ? (
            <Alert
              className="border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
              data-testid={testIds.accounts.archive.successAlert}
            >
              <AlertDescription data-testid={testIds.accounts.archive.successMessage}>
                {archiveSuccess}
              </AlertDescription>
            </Alert>
          ) : null}
          <div
            className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3"
            data-testid={testIds.accounts.list}
          >
            {accounts.length > 0 ? (
              accounts.map((account) => (
                <AccountCard
                  account={account}
                  isArchiving={
                    archiveMutation.isPending && archiveMutation.variables?.id === account.id
                  }
                  key={account.id}
                  onArchive={archiveAccount}
                />
              ))
            ) : (
              <p
                className="text-[14px] text-slate-600 dark:text-white/62"
                data-testid={testIds.accounts.emptyState}
              >
                {accountsLoading ? en.shell.loadingData : en.shell.noAccountsBody}
              </p>
            )}
          </div>
        </div>
      </GlassSection>
    </section>
  );
}

export function BudgetPage({
  cashflow,
  income,
  ledgerContext,
  spending,
  spendingRate,
}: {
  readonly cashflow: string;
  readonly income: string;
  readonly ledgerContext: {
    readonly ledgerId: string;
    readonly workspaceId: string;
  } | null;
  readonly spending: string;
  readonly spendingRate: string;
}) {
  const budgetsQuery = useBudgetsQuery(ledgerContext, { limit: 50 });
  const budgets = budgetsQuery.data?.data ?? [];

  return (
    <section className="ff-single-page space-y-4" data-testid={testIds.budgets.page}>
      <GlassSection title={en.shell.budgetWatch} description={en.shell.budgetWatchBody}>
        <div
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
          data-testid={testIds.budgets.summary}
        >
          <MetricTile
            icon={ArrowDownLeft}
            label={en.shell.incomeThisMonth}
            testId={testIds.budgets.incomeMetric}
            value={income}
            tone="green"
          />
          <MetricTile
            icon={ArrowUpRight}
            label={en.shell.spentThisMonth}
            testId={testIds.budgets.spendingMetric}
            value={spending}
            tone="rose"
          />
          <MetricTile
            icon={WalletCards}
            label={en.shell.availableAfterSpending}
            testId={testIds.budgets.availableMetric}
            value={cashflow}
          />
          <MetricTile
            icon={ShieldCheck}
            label={en.shell.spendingRate}
            testId={testIds.budgets.spendingRateMetric}
            value={spendingRate}
          />
        </div>
      </GlassSection>
      <GlassSection title={en.budgets.listTitle} description={en.budgets.listDescription}>
        <div className="grid gap-3 md:grid-cols-2" data-testid={testIds.budgets.list}>
          {budgets.length > 0 ? (
            budgets.map((budget) => <BudgetSummaryCard budget={budget} key={budget.id} />)
          ) : (
            <p
              className="text-[14px] text-slate-600 dark:text-white/62"
              data-testid={testIds.budgets.emptyState}
            >
              {budgetsQuery.isPending
                ? en.shell.loadingData
                : budgetsQuery.isError
                  ? en.budgets.loadError
                  : en.budgets.emptyState}
            </p>
          )}
        </div>
      </GlassSection>
    </section>
  );
}

export function ImportsPage({
  accounts,
  ledgerContext,
}: {
  readonly accounts: readonly AccountWithBalanceResponse[];
  readonly ledgerContext: {
    readonly ledgerId: string;
    readonly workspaceId: string;
  } | null;
}) {
  const queryClient = useQueryClient();
  const importJobsQuery = useImportJobsQuery(ledgerContext);
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }
      const sample = makeSampleImportCsv(accounts);
      if (!sample) {
        throw new Error(en.imports.createFailed);
      }
      return await apiClient.createImportCsv({
        csvText: sample.csvText,
        fileName: sample.fileName,
        ...ledgerContext,
      });
    },
    onSuccess: async () => {
      if (!ledgerContext) {
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: ["finance", "imports", ledgerContext.workspaceId, ledgerContext.ledgerId],
      });
    },
  });
  const commitMutation = useMutation({
    mutationFn: async (importJobId: string) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }
      return await apiClient.commitImportJob({
        importJobId,
        ...ledgerContext,
      });
    },
    onSuccess: async () => {
      if (!ledgerContext) {
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["finance", "imports", ledgerContext.workspaceId, ledgerContext.ledgerId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["finance", "transactions", ledgerContext.workspaceId, ledgerContext.ledgerId],
        }),
      ]);
    },
  });
  const undoMutation = useMutation({
    mutationFn: async (importJobId: string) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }
      return await apiClient.undoImportJob({
        importJobId,
        ...ledgerContext,
      });
    },
    onSuccess: async () => {
      if (!ledgerContext) {
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["finance", "imports", ledgerContext.workspaceId, ledgerContext.ledgerId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["finance", "transactions", ledgerContext.workspaceId, ledgerContext.ledgerId],
        }),
      ]);
    },
  });
  const importJobs = importJobsQuery.data ?? [];

  return (
    <section className="ff-single-page space-y-4" data-testid={testIds.imports.page}>
      <GlassSection title={en.shell.importsTitle} description={en.shell.importsBody}>
        <div className="flex flex-col gap-3">
          <div className="flex justify-end">
            <Button
              data-testid={testIds.imports.uploadButton}
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
              size="sm"
              type="button"
            >
              {createMutation.isPending ? en.imports.uploading : en.imports.upload}
            </Button>
          </div>
          <div className="grid gap-3" data-testid={testIds.imports.list}>
            {importJobs.length > 0 ? (
              importJobs.map((importJob) => (
                <Card
                  className="ff-glass-panel"
                  data-testid={testIds.imports.card(importJob.id)}
                  key={importJob.id}
                >
                  <CardContent className="space-y-3 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-[15px]">
                        {importJob.fileName ?? importJob.id}
                      </p>
                      <Badge data-testid={testIds.imports.status(importJob.id)} variant="outline">
                        {importJob.status}
                      </Badge>
                    </div>
                    <p className="text-[13px] text-slate-600 dark:text-white/62">
                      {en.imports.previewRows}: {importJob.previewRows.length}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        data-testid={testIds.imports.commitButton(importJob.id)}
                        disabled={
                          importJob.status !== "preview_ready" ||
                          (commitMutation.isPending && commitMutation.variables === importJob.id)
                        }
                        onClick={() => commitMutation.mutate(importJob.id)}
                        size="sm"
                        type="button"
                      >
                        {en.imports.commit}
                      </Button>
                      <Button
                        data-testid={testIds.imports.undoButton(importJob.id)}
                        disabled={
                          importJob.status !== "committed" ||
                          (undoMutation.isPending && undoMutation.variables === importJob.id)
                        }
                        onClick={() => undoMutation.mutate(importJob.id)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {en.imports.undo}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <p
                className="text-[14px] text-slate-600 dark:text-white/62"
                data-testid={testIds.imports.emptyState}
              >
                {importJobsQuery.isPending
                  ? en.shell.loadingData
                  : importJobsQuery.isError
                    ? en.imports.createFailed
                    : en.imports.noImports}
              </p>
            )}
          </div>
          {createMutation.isError ? (
            <Alert className="border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-200">
              <AlertDescription>{en.imports.createFailed}</AlertDescription>
            </Alert>
          ) : null}
          {commitMutation.isError ? (
            <Alert className="border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-200">
              <AlertDescription>{en.imports.commitFailed}</AlertDescription>
            </Alert>
          ) : null}
          {undoMutation.isError ? (
            <Alert className="border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-200">
              <AlertDescription>{en.imports.undoFailed}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </GlassSection>
    </section>
  );
}

export function RulesPage({
  ledgerContext,
}: {
  readonly ledgerContext: {
    readonly ledgerId: string;
    readonly workspaceId: string;
  } | null;
}) {
  const queryClient = useQueryClient();
  const rulesQuery = useRulesQuery(ledgerContext);
  const [testCounts, setTestCounts] = useState<Record<string, number>>({});
  const [applyCounts, setApplyCounts] = useState<Record<string, number>>({});
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }
      return await apiClient.createRule({
        action: { status: "cleared", type: "set_transaction_status" },
        condition: { type: "expense" },
        enabled: true,
        name: "Auto clear expenses",
        ...ledgerContext,
      });
    },
    onSuccess: async () => {
      if (!ledgerContext) {
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: ["finance", "rules", ledgerContext.workspaceId, ledgerContext.ledgerId],
      });
    },
  });
  const testMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }
      const matches = await apiClient.testRule({
        limit: 50,
        ruleId,
        ...ledgerContext,
      });
      return { matches, ruleId };
    },
    onSuccess: ({ matches, ruleId }) => {
      setTestCounts((current) => ({ ...current, [ruleId]: matches.length }));
    },
  });
  const applyMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }
      return await apiClient.applyRule({
        limit: 50,
        ruleId,
        ...ledgerContext,
      });
    },
    onSuccess: async (result, ruleId) => {
      setApplyCounts((current) => ({
        ...current,
        [ruleId]: result.updatedTransactionGroupIds.length,
      }));
      if (!ledgerContext) {
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: ["finance", "transactions", ledgerContext.workspaceId, ledgerContext.ledgerId],
      });
    },
  });
  const rules = rulesQuery.data ?? [];

  return (
    <section className="ff-single-page space-y-4" data-testid={testIds.rules.page}>
      <GlassSection title={en.shell.rulesTitle} description={en.shell.rulesBody}>
        <div className="flex flex-col gap-3">
          <div className="flex justify-end">
            <Button
              data-testid={testIds.rules.createButton}
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
              size="sm"
              type="button"
            >
              {createMutation.isPending ? en.rules.creating : en.rules.create}
            </Button>
          </div>
          <div className="grid gap-3" data-testid={testIds.rules.list}>
            {rules.length > 0 ? (
              rules.map((rule) => (
                <Card
                  className="ff-glass-panel"
                  data-testid={testIds.rules.card(rule.id)}
                  key={rule.id}
                >
                  <CardContent className="space-y-3 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-[15px]">{rule.name}</p>
                      <Badge variant="outline">{rule.action.status}</Badge>
                    </div>
                    <p className="text-[13px] text-slate-600 dark:text-white/62">
                      {rule.enabled ? en.rules.enabled : en.rules.disabled}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        data-testid={testIds.rules.testButton(rule.id)}
                        disabled={testMutation.isPending && testMutation.variables === rule.id}
                        onClick={() => testMutation.mutate(rule.id)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {en.rules.test}
                      </Button>
                      <Button
                        data-testid={testIds.rules.applyButton(rule.id)}
                        disabled={applyMutation.isPending && applyMutation.variables === rule.id}
                        onClick={() => applyMutation.mutate(rule.id)}
                        size="sm"
                        type="button"
                      >
                        {applyMutation.isPending && applyMutation.variables === rule.id
                          ? en.rules.applying
                          : en.rules.apply}
                      </Button>
                    </div>
                    {testCounts[rule.id] !== undefined ? (
                      <p className="text-[12px] text-slate-600 dark:text-white/62">
                        {en.rules.matches.replace("{count}", String(testCounts[rule.id]))}
                      </p>
                    ) : null}
                    {applyCounts[rule.id] !== undefined ? (
                      <p className="text-[12px] text-slate-600 dark:text-white/62">
                        {en.rules.updated.replace("{count}", String(applyCounts[rule.id]))}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              ))
            ) : (
              <p
                className="text-[14px] text-slate-600 dark:text-white/62"
                data-testid={testIds.rules.emptyState}
              >
                {rulesQuery.isPending
                  ? en.shell.loadingData
                  : rulesQuery.isError
                    ? en.rules.createFailed
                    : en.rules.noRules}
              </p>
            )}
          </div>
          {createMutation.isError || applyMutation.isError ? (
            <Alert className="border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-200">
              <AlertDescription>
                {createMutation.isError ? en.rules.createFailed : en.rules.applyFailed}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      </GlassSection>
    </section>
  );
}
