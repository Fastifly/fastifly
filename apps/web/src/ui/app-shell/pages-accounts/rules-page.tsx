import type { ListTransactionsResponse, RuleResponse } from "@fastifly/common";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@ui/alert";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardContent } from "@ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@ui/tabs";
import { Archive, CircleHelp, PlayCircle, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { apiClient } from "../../../api/client";
import { useAccountsQuery, useRulesQuery } from "../../../api/queries";
import { en } from "../../../i18n/en";
import { testIds } from "../../../testing/testid-registry";
import { GlassSection } from "../shared-components";
import { formatDate, formatDateTime, formatTransactionAmount } from "../utils";
import {
  defaultRuleFormState,
  formatRuleAction,
  formatRuleCondition,
  formatRuleStatus,
  RULE_STATUS_OPTIONS,
  RULE_TYPE_OPTIONS,
  type RuleFormState,
  RuleInput,
  RuleSelect,
  type RuleTypeOption,
  ruleToFormState,
  toRuleCondition,
} from "./rules-support";
import type { RulesPageProps } from "./types";

type RuleTab = "active" | "archived";

export function RulesPage({ ledgerContext }: RulesPageProps) {
  const queryClient = useQueryClient();
  const accountsQuery = useAccountsQuery(ledgerContext);
  const rulesQuery = useRulesQuery(ledgerContext);
  const rules = rulesQuery.data ?? [];
  const rulesQueryKey = ["finance", "rules", ledgerContext?.workspaceId, ledgerContext?.ledgerId];
  const [testCounts, setTestCounts] = useState<Record<string, number>>({});
  const [applyCounts, setApplyCounts] = useState<Record<string, number>>({});
  const [previewExamples, setPreviewExamples] = useState<
    Record<string, readonly ListTransactionsResponse["data"][number][]>
  >({});
  const [createForm, setCreateForm] = useState<RuleFormState>(defaultRuleFormState());
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [activeRuleId, setActiveRuleId] = useState<string | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<RuleFormState>(defaultRuleFormState());
  const [ruleTab, setRuleTab] = useState<RuleTab>("active");
  const [createFeedback, setCreateFeedback] = useState<string | null>(null);
  const accountNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of accountsQuery.data?.data ?? []) {
      map.set(account.id, account.name);
    }
    return map;
  }, [accountsQuery.data?.data]);
  const createMutation = useMutation({
    onMutate: () => {
      setCreateFeedback(null);
    },
    mutationFn: async (form: RuleFormState) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }
      const condition = toRuleCondition(form);
      if (!condition || !form.name.trim()) {
        throw new Error(en.rules.createValidationFailed);
      }

      return await apiClient.createRule({
        action: {
          status: form.status,
          type: "set_transaction_status",
        },
        condition,
        enabled: form.enabled,
        name: form.name.trim(),
        ...ledgerContext,
      });
    },
    onSuccess: async () => {
      setCreateFeedback(en.rules.customCreated);
      setCreateForm(defaultRuleFormState());
      setIsCreateDialogOpen(false);
      if (!ledgerContext) {
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: rulesQueryKey,
      });
    },
  });
  const updateMutation = useMutation({
    mutationFn: async (input: { readonly form: RuleFormState; readonly ruleId: string }) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }
      const condition = toRuleCondition(input.form);
      if (!condition || !input.form.name.trim()) {
        throw new Error(en.rules.createValidationFailed);
      }

      return await apiClient.updateRule({
        action: {
          status: input.form.status,
          type: "set_transaction_status",
        },
        condition,
        enabled: input.form.enabled,
        ledgerId: ledgerContext.ledgerId,
        name: input.form.name.trim(),
        ruleId: input.ruleId,
        workspaceId: ledgerContext.workspaceId,
      });
    },
    onSuccess: async () => {
      setCreateFeedback(en.rules.updatedOk);
      setEditingRuleId(null);
      if (!ledgerContext) {
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: rulesQueryKey,
      });
    },
  });
  const archiveMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }
      return await apiClient.archiveRule({
        ledgerId: ledgerContext.ledgerId,
        ruleId,
        workspaceId: ledgerContext.workspaceId,
      });
    },
    onSuccess: async () => {
      setCreateFeedback(en.rules.archivedOk);
      if (!ledgerContext) {
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: rulesQueryKey,
      });
    },
  });
  const testMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }
      const matches = await apiClient.testRule({
        ruleId,
        ...ledgerContext,
      });
      return { matches, ruleId };
    },
    onSuccess: ({ matches, ruleId }) => {
      setTestCounts((current) => ({ ...current, [ruleId]: matches.length }));
      setPreviewExamples((current) => ({
        ...current,
        [ruleId]: matches.slice(0, PREVIEW_EXAMPLE_LIMIT),
      }));
    },
  });
  const applyMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }
      let matchedExamples: readonly ListTransactionsResponse["data"][number][] = [];
      try {
        matchedExamples = (
          await apiClient.testRule({
            limit: PREVIEW_EXAMPLE_LIMIT,
            ruleId,
            ...ledgerContext,
          })
        ).slice(0, PREVIEW_EXAMPLE_LIMIT);
      } catch {
        // Keep apply usable even if preview sampling fails.
      }
      const result = await apiClient.applyRule({
        ruleId,
        ...ledgerContext,
      });
      return { matchedExamples, result };
    },
    onSuccess: async ({ matchedExamples, result }, ruleId) => {
      setApplyCounts((current) => ({
        ...current,
        [ruleId]: result.updatedTransactionGroupIds.length,
      }));
      if (matchedExamples.length > 0) {
        setPreviewExamples((current) => ({
          ...current,
          [ruleId]: matchedExamples.slice(0, PREVIEW_EXAMPLE_LIMIT),
        }));
      }
      if (!ledgerContext) {
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: ["finance", "transactions", ledgerContext.workspaceId, ledgerContext.ledgerId],
      });
    },
  });
  const activeRules = useMemo(() => rules.filter((rule) => rule.archivedAt === null), [rules]);
  const archivedRules = useMemo(() => rules.filter((rule) => rule.archivedAt !== null), [rules]);
  const visibleRules = ruleTab === "active" ? activeRules : archivedRules;
  const hasVisibleRules = visibleRules.length > 0;
  const hasAnyRules = rules.length > 0;
  const showFirstTimeCreate = !rulesQuery.isPending && !rulesQuery.isError && !hasAnyRules;
  const rulesHelpTooltip = `${en.rules.quickGuideStepOne} ${en.rules.quickGuideStepTwo} ${en.rules.quickGuideStepThree}`;
  const activeRule = activeRuleId ? (rules.find((rule) => rule.id === activeRuleId) ?? null) : null;
  const activeRuleTitleTooltip = activeRule
    ? `${en.rules.updatedAt.replace("{value}", formatDateTime(activeRule.updatedAt))} • ${
        en.rules.triggerLabel
      }: ${formatRuleCondition(activeRule)} • ${en.rules.effectLabel}: ${formatRuleAction(
        activeRule,
      )}`
    : undefined;
  const createErrorMessage =
    createMutation.error instanceof Error ? createMutation.error.message : en.rules.createFailed;
  const mutationErrorMessage = createMutation.isError
    ? createErrorMessage
    : updateMutation.isError
      ? en.rules.updateFailed
      : archiveMutation.isError
        ? en.rules.archiveFailed
        : testMutation.isError
          ? en.rules.testFailed
          : applyMutation.isError
            ? en.rules.applyFailed
            : null;
  const resetManageDialogState = () => {
    setEditingRuleId(null);
    setEditForm(defaultRuleFormState());
    setTestCounts({});
    setApplyCounts({});
    setPreviewExamples({});
    updateMutation.reset();
    archiveMutation.reset();
    testMutation.reset();
    applyMutation.reset();
  };
  const closeManageDialog = () => {
    resetManageDialogState();
    setActiveRuleId(null);
  };

  return (
    <section className="mt-2 space-y-2" data-testid={testIds.rules.page}>
      <GlassSection
        headerAction={
          hasAnyRules ? (
            <Button
              className="h-8 rounded-full px-3"
              data-testid={testIds.rules.createButton}
              onClick={() => {
                setCreateFeedback(null);
                setCreateForm(defaultRuleFormState());
                setIsCreateDialogOpen(true);
              }}
              size="sm"
              type="button"
            >
              {en.rules.createCustom}
            </Button>
          ) : undefined
        }
        title={
          <span className="inline-flex items-center gap-1.5">
            <span>{en.shell.rulesTitle}</span>
            {hasAnyRules ? (
              <span className="inline-flex text-muted-foreground" title={rulesHelpTooltip}>
                <CircleHelp className="size-4" />
              </span>
            ) : null}
          </span>
        }
      >
        <div className="flex flex-col gap-2">
          {hasAnyRules ? (
            <Dialog
              onOpenChange={(open) => {
                setIsCreateDialogOpen(open);
                if (!open) {
                  setCreateForm(defaultRuleFormState());
                  createMutation.reset();
                }
              }}
              open={isCreateDialogOpen}
            >
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>{en.rules.createCustom}</DialogTitle>
                  <DialogDescription>{en.rules.createCustomHint}</DialogDescription>
                </DialogHeader>
                <RuleEditorPanel
                  dataTestIds={{
                    amountMax: testIds.rules.createAmountMaxInput,
                    amountMin: testIds.rules.createAmountMinInput,
                    description: testIds.rules.createDescriptionInput,
                    enabled: testIds.rules.createEnabledSelect,
                    form: testIds.rules.createForm,
                    name: testIds.rules.createNameInput,
                    status: testIds.rules.createStatusSelect,
                    submit: testIds.rules.createSubmitButton,
                    type: testIds.rules.createTypeSelect,
                  }}
                  form={createForm}
                  isSubmitting={createMutation.isPending}
                  onFormChange={setCreateForm}
                  onSubmit={() => createMutation.mutate(createForm)}
                  submitLabel={en.rules.createCustom}
                  submittingLabel={en.rules.creating}
                />
              </DialogContent>
            </Dialog>
          ) : null}

          <Dialog
            onOpenChange={(open) => {
              if (!open) {
                closeManageDialog();
              }
            }}
            open={activeRule !== null}
          >
            <DialogContent
              className={
                editingRuleId === activeRuleId
                  ? "max-h-[90vh] overflow-y-auto sm:max-w-lg"
                  : "max-h-[90vh] overflow-hidden sm:max-w-lg"
              }
            >
              {activeRule ? (
                <>
                  <DialogHeader>
                    <DialogTitle title={activeRuleTitleTooltip}>{activeRule.name}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {activeRule.archivedAt ? (
                        <Badge title={en.rules.archivedTooltip} variant="outline">
                          {en.rules.archived}
                        </Badge>
                      ) : null}
                      <Badge
                        title={
                          activeRule.enabled ? en.rules.enabledTooltip : en.rules.disabledTooltip
                        }
                        variant={activeRule.enabled ? "secondary" : "outline"}
                      >
                        {activeRule.enabled ? en.rules.enabled : en.rules.disabled}
                      </Badge>
                      <Badge title={formatRuleAction(activeRule)} variant="outline">
                        {formatRuleAction(activeRule)}
                      </Badge>
                    </div>

                    {activeRule.archivedAt === null && editingRuleId === activeRule.id ? (
                      <RuleEditorPanel
                        className="rounded-md border border-border bg-muted/40 p-2.5"
                        dataTestIds={{
                          amountMax: testIds.rules.editAmountMaxInput(activeRule.id),
                          amountMin: testIds.rules.editAmountMinInput(activeRule.id),
                          cancel: testIds.rules.cancelEditButton(activeRule.id),
                          description: testIds.rules.editDescriptionInput(activeRule.id),
                          enabled: testIds.rules.editEnabledSelect(activeRule.id),
                          form: testIds.rules.editForm(activeRule.id),
                          name: testIds.rules.editNameInput(activeRule.id),
                          status: testIds.rules.editStatusSelect(activeRule.id),
                          submit: testIds.rules.saveEditButton(activeRule.id),
                          type: testIds.rules.editTypeSelect(activeRule.id),
                        }}
                        form={editForm}
                        isSubmitting={
                          updateMutation.isPending &&
                          updateMutation.variables?.ruleId === activeRule.id
                        }
                        onCancel={() => {
                          setEditingRuleId(null);
                          setEditForm(defaultRuleFormState());
                        }}
                        onFormChange={setEditForm}
                        onSubmit={() =>
                          updateMutation.mutate({
                            form: editForm,
                            ruleId: activeRule.id,
                          })
                        }
                        submitLabel={en.rules.saveChanges}
                        submittingLabel={en.rules.savingChanges}
                      />
                    ) : null}

                    {testCounts[activeRule.id] !== undefined ||
                    applyCounts[activeRule.id] !== undefined ? (
                      <div className="rounded-md border border-border bg-muted/40 p-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {en.rules.lastResults}
                        </p>
                        <div className="mt-1 grid gap-1">
                          {testCounts[activeRule.id] !== undefined ? (
                            <p className="text-[13px] text-foreground">
                              {en.rules.previewResult.replace(
                                "{count}",
                                String(testCounts[activeRule.id]),
                              )}
                            </p>
                          ) : null}
                          {applyCounts[activeRule.id] !== undefined ? (
                            <p className="text-[13px] text-foreground">
                              {en.rules.applyResult.replace(
                                "{count}",
                                String(applyCounts[activeRule.id]),
                              )}
                            </p>
                          ) : null}
                        </div>
                        {previewExamples[activeRule.id]?.length ? (
                          <div className="mt-2 space-y-1.5">
                            <p className="text-[11px] text-muted-foreground">
                              {en.rules.previewExamplesHint}
                            </p>
                            <div className="max-h-[40vh] overflow-auto rounded-md border border-border bg-background sm:max-h-64">
                              <div className="divide-y divide-border">
                                {previewExamples[activeRule.id]?.map((group) => {
                                  const preview = formatRulePreview(group, accountNameById);
                                  const changes = buildRulePreviewChanges(activeRule, preview);
                                  return (
                                    <div className="space-y-1 px-2.5 py-1.5" key={group.id}>
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="truncate text-[13px] font-medium text-foreground">
                                          {group.title}
                                        </p>
                                        <p className="shrink-0 text-[12px] font-semibold text-foreground">
                                          {preview.amount}
                                        </p>
                                      </div>
                                      <p className="text-[11px] text-muted-foreground">
                                        {preview.occurredAt} · {preview.fromLabel} →{" "}
                                        {preview.toLabel}
                                      </p>
                                      <div className="flex flex-col gap-1">
                                        {changes.map((change) => (
                                          <div
                                            className="grid gap-1 sm:grid-cols-[7rem_minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center"
                                            key={`${group.id}-${change.fieldKey}-diff`}
                                          >
                                            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                              {change.fieldLabel}
                                            </span>
                                            <span className="inline-flex items-center justify-between gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-1 text-[11px] text-foreground">
                                              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                                {en.rules.previewBeforeTitle}
                                              </span>
                                              <span className="font-medium">
                                                {change.beforeValue}
                                              </span>
                                            </span>
                                            <span className="hidden text-center text-[11px] text-muted-foreground sm:block">
                                              →
                                            </span>
                                            <span className="inline-flex items-center justify-between gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-1 text-[11px] text-foreground">
                                              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                                {en.rules.previewAfterTitle}
                                              </span>
                                              <span className="font-medium">
                                                {change.afterValue}
                                              </span>
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              {applyCounts[activeRule.id] !== undefined
                                ? en.rules.previewAfterApplied.replace(
                                    "{count}",
                                    String(applyCounts[activeRule.id]),
                                  )
                                : en.rules.previewAfterPending}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {activeRule.archivedAt === null && editingRuleId !== activeRule.id ? (
                    <DialogFooter className="gap-2 sm:gap-2">
                      <Button
                        className="min-w-24 justify-center"
                        data-testid={testIds.rules.testButton(activeRule.id)}
                        disabled={
                          testMutation.isPending && testMutation.variables === activeRule.id
                        }
                        onClick={() => testMutation.mutate(activeRule.id)}
                        size="sm"
                        title={en.rules.testTooltip}
                        type="button"
                        variant="outline"
                      >
                        <PlayCircle className="size-4" />
                        {testMutation.isPending && testMutation.variables === activeRule.id
                          ? en.rules.testing
                          : en.rules.test}
                      </Button>
                      <Button
                        className="min-w-24 justify-center"
                        data-testid={testIds.rules.applyButton(activeRule.id)}
                        disabled={
                          applyMutation.isPending && applyMutation.variables === activeRule.id
                        }
                        onClick={() => applyMutation.mutate(activeRule.id)}
                        size="sm"
                        title={en.rules.applyTooltip}
                        type="button"
                      >
                        <Sparkles className="size-4" />
                        {applyMutation.isPending && applyMutation.variables === activeRule.id
                          ? en.rules.applying
                          : en.rules.apply}
                      </Button>
                    </DialogFooter>
                  ) : null}
                </>
              ) : null}
            </DialogContent>
          </Dialog>

          {showFirstTimeCreate ? (
            <div className="space-y-2">
              <div
                className="rounded-md border border-border bg-muted/40 p-2.5"
                data-testid={testIds.rules.quickGuide}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {en.rules.quickGuideTitle}
                </p>
                <ol className="mt-1 space-y-1 text-[13px] text-foreground">
                  <li>1. {en.rules.quickGuideStepOne}</li>
                  <li>2. {en.rules.quickGuideStepTwo}</li>
                  <li>3. {en.rules.quickGuideStepThree}</li>
                </ol>
              </div>
              <RuleEditorPanel
                dataTestIds={{
                  amountMax: testIds.rules.createAmountMaxInput,
                  amountMin: testIds.rules.createAmountMinInput,
                  description: testIds.rules.createDescriptionInput,
                  enabled: testIds.rules.createEnabledSelect,
                  form: testIds.rules.createForm,
                  name: testIds.rules.createNameInput,
                  status: testIds.rules.createStatusSelect,
                  submit: testIds.rules.createSubmitButton,
                  type: testIds.rules.createTypeSelect,
                }}
                description={en.rules.createCustomHint}
                form={createForm}
                isSubmitting={createMutation.isPending}
                onFormChange={setCreateForm}
                onSubmit={() => createMutation.mutate(createForm)}
                submitLabel={en.rules.createCustom}
                submittingLabel={en.rules.creating}
                title={en.rules.createCustom}
              />
            </div>
          ) : (
            <>
              <Tabs
                onValueChange={(value) => {
                  setRuleTab(value as RuleTab);
                }}
                value={ruleTab}
              >
                <TabsList>
                  <TabsTrigger data-testid={testIds.rules.tabActive} value="active">
                    {en.rules.tabActive} ({activeRules.length})
                  </TabsTrigger>
                  <TabsTrigger data-testid={testIds.rules.tabArchived} value="archived">
                    {en.rules.tabArchived} ({archivedRules.length})
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div
                className="overflow-hidden rounded-md border border-border"
                data-testid={testIds.rules.list}
              >
                {rulesQuery.isPending ? (
                  <div className="space-y-2 p-2">
                    {["rules-loading-a", "rules-loading-b"].map((placeholderKey) => (
                      <Card
                        className="border border-border bg-card text-card-foreground shadow-sm"
                        key={placeholderKey}
                      >
                        <CardContent className="space-y-2 py-3">
                          <div className="h-4 w-40 animate-pulse rounded bg-muted/40" />
                          <div className="h-3 w-56 animate-pulse rounded bg-muted/40" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : hasVisibleRules ? (
                  <>
                    <div className="hidden items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:grid md:grid-cols-[minmax(0,1fr)_16rem_14rem]">
                      <span>{en.rules.formName}</span>
                      <span>{en.rules.previewStatusField}</span>
                      <span>{en.rules.actionLabel}</span>
                    </div>
                    {visibleRules.map((rule) => (
                      <div
                        className="grid gap-2 border-t border-border px-3 py-2 first:border-t-0 md:grid-cols-[minmax(0,1fr)_16rem_14rem] md:items-center"
                        data-testid={testIds.rules.card(rule.id)}
                        key={rule.id}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-medium text-foreground">
                            {rule.name}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {rule.archivedAt ? (
                            <Badge title={en.rules.archivedTooltip} variant="outline">
                              {en.rules.archived}
                            </Badge>
                          ) : null}
                          <Badge variant={rule.enabled ? "secondary" : "outline"}>
                            {rule.enabled ? en.rules.enabled : en.rules.disabled}
                          </Badge>
                          <Badge title={formatRuleAction(rule)} variant="outline">
                            {formatRuleAction(rule)}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Button
                            className="h-8 px-2.5"
                            data-testid={testIds.rules.detailsButton(rule.id)}
                            onClick={() => {
                              setActiveRuleId(rule.id);
                              setEditingRuleId(null);
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            {en.rules.manage}
                          </Button>
                          {rule.archivedAt === null ? (
                            <>
                              <Button
                                className="h-8 px-2.5"
                                data-testid={testIds.rules.editListButton(rule.id)}
                                onClick={() => {
                                  setActiveRuleId(rule.id);
                                  setEditingRuleId(rule.id);
                                  setEditForm(ruleToFormState(rule));
                                }}
                                size="sm"
                                title={en.rules.editTooltip}
                                type="button"
                                variant="outline"
                              >
                                {en.rules.edit}
                              </Button>
                              <Button
                                className="h-8 px-2.5"
                                data-testid={testIds.rules.archiveButton(rule.id)}
                                disabled={
                                  archiveMutation.isPending && archiveMutation.variables === rule.id
                                }
                                onClick={() => archiveMutation.mutate(rule.id)}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                <Archive className="size-4" />
                                {archiveMutation.isPending && archiveMutation.variables === rule.id
                                  ? en.rules.archiving
                                  : en.rules.archive}
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="p-3" data-testid={testIds.rules.emptyState}>
                    <p className="font-medium text-[15px]">
                      {ruleTab === "active" ? en.rules.noRules : en.rules.noArchivedRules}
                    </p>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      {ruleTab === "active" ? en.rules.emptyBody : en.rules.noArchivedRulesHint}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {rulesQuery.isError ? (
            <Alert
              className="border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-200"
              data-testid={testIds.rules.loadError}
            >
              <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                <span>{en.rules.loadFailed}</span>
                <Button
                  data-testid={testIds.rules.retryButton}
                  onClick={() => void rulesQuery.refetch()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {en.rules.retry}
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {createFeedback ? (
            <Alert
              className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
              data-testid={testIds.rules.feedbackAlert}
            >
              <AlertDescription>{createFeedback}</AlertDescription>
            </Alert>
          ) : null}

          {mutationErrorMessage ? (
            <Alert className="border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-200">
              <AlertDescription>{mutationErrorMessage}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </GlassSection>
    </section>
  );
}

const PREVIEW_EXAMPLE_LIMIT = 40;

type RuleEditorPanelTestIds = {
  readonly amountMax: string;
  readonly amountMin: string;
  readonly cancel?: string;
  readonly description: string;
  readonly enabled: string;
  readonly form: string;
  readonly name: string;
  readonly status: string;
  readonly submit: string;
  readonly type: string;
};

function RuleEditorPanel({
  className,
  dataTestIds,
  description,
  form,
  isSubmitting,
  onCancel,
  onFormChange,
  onSubmit,
  submitLabel,
  submittingLabel,
  title,
}: {
  readonly className?: string;
  readonly dataTestIds: RuleEditorPanelTestIds;
  readonly description?: string;
  readonly form: RuleFormState;
  readonly isSubmitting: boolean;
  readonly onCancel?: () => void;
  readonly onFormChange: (
    value: RuleFormState | ((current: RuleFormState) => RuleFormState),
  ) => void;
  readonly onSubmit: () => void;
  readonly submitLabel: string;
  readonly submittingLabel: string;
  readonly title?: string;
}) {
  return (
    <div className={className ?? "grid gap-2 pt-3"} data-testid={dataTestIds.form}>
      {title ? (
        <div className="space-y-1 pt-0.5">
          <p className="font-semibold text-[14px] text-foreground">{title}</p>
          {description ? <p className="text-[12px] text-muted-foreground">{description}</p> : null}
        </div>
      ) : null}
      <div className="grid gap-2 rounded-md border border-border bg-background p-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {en.rules.basicsTitle}
        </p>
        <div className="grid gap-2 md:grid-cols-2">
          <RuleInput
            label={en.rules.formName}
            onChange={(value) => onFormChange((current) => ({ ...current, name: value }))}
            testId={dataTestIds.name}
            value={form.name}
          />
          <RuleSelect
            label={en.rules.formEnabled}
            onValueChange={(value) =>
              onFormChange((current) => ({
                ...current,
                enabled: value === "true",
              }))
            }
            options={[
              { label: en.rules.yes, value: "true" },
              { label: en.rules.no, value: "false" },
            ]}
            testId={dataTestIds.enabled}
            value={form.enabled ? "true" : "false"}
          />
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="grid gap-2 rounded-md border border-border bg-background p-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {en.rules.whenTitle}
            </p>
            <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
              {en.rules.whenHint}
            </p>
          </div>
          <RuleSelect
            label={en.rules.formConditionType}
            onValueChange={(value) =>
              onFormChange((current) => ({
                ...current,
                type: value as RuleTypeOption,
              }))
            }
            options={RULE_TYPE_OPTIONS}
            testId={dataTestIds.type}
            value={form.type}
          />
          <RuleInput
            label={en.rules.formDescriptionContains}
            onChange={(value) =>
              onFormChange((current) => ({ ...current, descriptionContains: value }))
            }
            testId={dataTestIds.description}
            value={form.descriptionContains}
          />
          <RuleInput
            label={en.rules.formAmountMin}
            onChange={(value) => onFormChange((current) => ({ ...current, amountMin: value }))}
            testId={dataTestIds.amountMin}
            value={form.amountMin}
          />
          <RuleInput
            label={en.rules.formAmountMax}
            onChange={(value) => onFormChange((current) => ({ ...current, amountMax: value }))}
            testId={dataTestIds.amountMax}
            value={form.amountMax}
          />
        </div>

        <div className="grid gap-2 rounded-md border border-border bg-background p-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {en.rules.thenTitle}
            </p>
            <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
              {en.rules.thenHint}
            </p>
          </div>
          <RuleSelect
            label={en.rules.formStatus}
            onValueChange={(value) =>
              onFormChange((current) => ({
                ...current,
                status: value as RuleResponse["action"]["status"],
              }))
            }
            options={RULE_STATUS_OPTIONS}
            testId={dataTestIds.status}
            value={form.status}
          />
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-1.5">
        {onCancel && dataTestIds.cancel ? (
          <Button
            data-testid={dataTestIds.cancel}
            onClick={onCancel}
            size="sm"
            type="button"
            variant="outline"
          >
            {en.rules.cancel}
          </Button>
        ) : null}
        <Button
          data-testid={dataTestIds.submit}
          disabled={isSubmitting}
          onClick={onSubmit}
          size="sm"
          type="button"
        >
          {isSubmitting ? submittingLabel : submitLabel}
        </Button>
      </div>
    </div>
  );
}

function formatRulePreview(
  group: ListTransactionsResponse["data"][number],
  accountNameById: ReadonlyMap<string, string>,
): {
  readonly amount: string;
  readonly currentStatus: string;
  readonly fromLabel: string;
  readonly occurredAt: string;
  readonly toLabel: string;
} {
  const journal = group.journals[0];
  const postings = journal?.postings ?? [];
  const fromAccountIds = postings
    .filter((posting) => isMinorAmountNegative(posting.amountMinor))
    .map((posting) => posting.accountId);
  const toAccountIds = postings
    .filter((posting) => isMinorAmountPositive(posting.amountMinor))
    .map((posting) => posting.accountId);

  return {
    amount: formatTransactionAmount(group),
    currentStatus: summarizeJournalStatus(group.journals),
    fromLabel: summarizeAccounts(fromAccountIds, accountNameById),
    occurredAt: journal?.occurredAt ? formatDate(journal.occurredAt) : en.rules.previewUnknownDate,
    toLabel: summarizeAccounts(toAccountIds, accountNameById),
  };
}

type RulePreviewChange = {
  readonly afterValue: string;
  readonly beforeValue: string;
  readonly fieldKey: string;
  readonly fieldLabel: string;
};

function buildRulePreviewChanges(
  rule: RuleResponse,
  preview: ReturnType<typeof formatRulePreview>,
): readonly RulePreviewChange[] {
  if (rule.action.type === "set_transaction_status") {
    return [
      {
        afterValue: formatRuleStatus(rule.action.status),
        beforeValue: preview.currentStatus,
        fieldKey: "status",
        fieldLabel: en.rules.previewStatusField,
      },
    ];
  }

  return [];
}

function summarizeJournalStatus(
  journals: readonly ListTransactionsResponse["data"][number]["journals"][number][],
): string {
  const statuses = Array.from(new Set(journals.map((journal) => journal.status))).filter(
    (status): status is RuleResponse["action"]["status"] => status !== undefined,
  );
  if (statuses.length === 0) {
    return en.rules.previewUnknownStatus;
  }
  const [singleStatus] = statuses;
  if (statuses.length === 1 && singleStatus) {
    return formatRuleStatus(singleStatus);
  }
  return en.rules.previewMixedStatus;
}

function isMinorAmountNegative(value: string): boolean {
  try {
    return BigInt(value) < 0n;
  } catch {
    return false;
  }
}

function isMinorAmountPositive(value: string): boolean {
  try {
    return BigInt(value) > 0n;
  } catch {
    return false;
  }
}

function summarizeAccounts(
  accountIds: readonly string[],
  accountNameById: ReadonlyMap<string, string>,
): string {
  const uniqueAccountIds = [...new Set(accountIds)];
  if (uniqueAccountIds.length === 0) {
    return en.rules.previewUnknownAccount;
  }

  const names = uniqueAccountIds.map(
    (accountId) => accountNameById.get(accountId) ?? en.rules.previewUnknownAccount,
  );
  const [firstName, ...restNames] = names;
  if (!firstName) {
    return en.rules.previewUnknownAccount;
  }
  if (restNames.length === 0) {
    return firstName;
  }
  return `${firstName} +${restNames.length}`;
}
