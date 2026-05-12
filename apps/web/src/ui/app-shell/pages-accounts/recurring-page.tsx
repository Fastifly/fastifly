import { formatMoneyMinor, type RecurringTemplateResponse } from "@fastifly/common";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardContent } from "@ui/card";
import { PauseCircle, PencilLine, PlayCircle, PlusCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { apiClient } from "../../../api/client";
import { useCategoriesQuery, useRecurringTemplatesQuery } from "../../../api/queries";
import {
  buildCreateRecurringTemplateRequest,
  makeRecurringFormValuesFromTemplate,
  type RecurringFormValues,
} from "../../../finance/recurring-form";
import { en } from "../../../i18n/en";
import { testIds } from "../../../testing/testid-registry";
import { BlockedActionGate } from "../../blocked-action-gate";
import { buildCategoryNameById, CategoryToken } from "../../category-metadata";
import { GlassSection } from "../shared-components";
import { formatDateTime } from "../utils";
import { RecurringCreateDialog } from "./recurring-create-dialog";
import {
  deriveRecurringCreateDefaults,
  getRecurringError,
  getRecurringStatusError,
  isDueSoon,
} from "./recurring-support";
import type { RecurringPageProps } from "./types";

export function RecurringPage({ accounts, ledgerContext }: RecurringPageProps) {
  const queryClient = useQueryClient();
  const categoriesQuery = useCategoriesQuery(ledgerContext);
  const categories = categoriesQuery.data?.data ?? [];
  const recurringQuery = useRecurringTemplatesQuery(ledgerContext);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RecurringTemplateResponse | null>(null);

  const createMutation = useMutation({
    mutationFn: async (values: RecurringFormValues) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }

      const request = buildCreateRecurringTemplateRequest(values, accounts, categories);
      return await apiClient.createRecurringTemplate({
        ...request,
        ledgerId: ledgerContext.ledgerId,
        workspaceId: ledgerContext.workspaceId,
      });
    },
    onSuccess: async () => {
      toast.success(en.recurring.createSuccess);
      await queryClient.invalidateQueries({
        queryKey: ["finance", "recurring", ledgerContext?.workspaceId, ledgerContext?.ledgerId],
      });
    },
    onError: (error) => {
      toast.error(getRecurringError(error));
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (input: {
      readonly status: RecurringTemplateResponse["status"];
      readonly template: RecurringTemplateResponse;
    }) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }

      return await apiClient.updateRecurringTemplate({
        cadence: input.template.cadence,
        intervalCount: input.template.intervalCount,
        ledgerId: ledgerContext.ledgerId,
        nextRunAt: input.template.nextRunAt,
        payload: input.template.payload,
        status: input.status,
        templateId: input.template.id,
        workspaceId: ledgerContext.workspaceId,
      });
    },
    onSuccess: async () => {
      toast.success(en.recurring.statusUpdated);
      await queryClient.invalidateQueries({
        queryKey: ["finance", "recurring", ledgerContext?.workspaceId, ledgerContext?.ledgerId],
      });
    },
    onError: (error) => {
      toast.error(getRecurringStatusError(error));
    },
  });

  const editMutation = useMutation({
    mutationFn: async (input: {
      readonly templateId: string;
      readonly values: RecurringFormValues;
    }) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }

      const request = buildCreateRecurringTemplateRequest(input.values, accounts, categories);
      return await apiClient.updateRecurringTemplate({
        cadence: request.cadence,
        intervalCount: request.intervalCount,
        ledgerId: ledgerContext.ledgerId,
        nextRunAt: request.nextRunAt,
        payload: request.payload,
        status: request.status,
        templateId: input.templateId,
        workspaceId: ledgerContext.workspaceId,
      });
    },
    onSuccess: async () => {
      toast.success(en.recurring.updateSuccess);
      await queryClient.invalidateQueries({
        queryKey: ["finance", "recurring", ledgerContext?.workspaceId, ledgerContext?.ledgerId],
      });
    },
    onError: (error) => {
      toast.error(getRecurringError(error));
    },
  });

  const accountNames = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name] as const)),
    [accounts],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category] as const)),
    [categories],
  );
  const categoryNameById = useMemo(() => buildCategoryNameById(categories), [categories]);
  const templates = useMemo(
    () =>
      [...(recurringQuery.data ?? [])].sort((left, right) => {
        const leftTime = Date.parse(left.nextRunAt);
        const rightTime = Date.parse(right.nextRunAt);
        return leftTime === rightTime
          ? left.updatedAt.localeCompare(right.updatedAt)
          : leftTime - rightTime;
      }),
    [recurringQuery.data],
  );
  const createDefaults = useMemo(() => deriveRecurringCreateDefaults(templates), [templates]);
  const activeCount = templates.filter((item) => item.status === "active").length;
  const pausedCount = templates.filter((item) => item.status === "paused").length;
  const dueSoonCount = templates.filter(
    (item) => item.status === "active" && isDueSoon(item.nextRunAt),
  ).length;

  return (
    <section className="mt-2 space-y-4" data-testid={testIds.recurring.page}>
      <GlassSection title={en.shell.recurringTitle} description={en.shell.recurringBody}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p
              className="text-[0.8125rem] text-muted-foreground"
              data-testid={testIds.recurring.summary}
            >
              {en.recurring.summaryActive}:{" "}
              <span
                className="font-medium text-foreground"
                data-testid={testIds.recurring.summaryActive}
              >
                {activeCount}
              </span>{" "}
              · {en.recurring.summaryDueSoon}:{" "}
              <span
                className="font-medium text-foreground"
                data-testid={testIds.recurring.summaryDueSoon}
              >
                {dueSoonCount}
              </span>{" "}
              · {en.recurring.summaryPaused}:{" "}
              <span
                className="font-medium text-foreground"
                data-testid={testIds.recurring.summaryPaused}
              >
                {pausedCount}
              </span>
            </p>
            <BlockedActionGate
              blocked={!ledgerContext || accounts.length < 2}
              reason={!ledgerContext ? en.accounts.ledgerRequired : en.shell.noAccountsForRecurring}
              suggestion={
                !ledgerContext || accounts.length < 2
                  ? { label: en.shell.openAccounts, to: "/accounts" }
                  : undefined
              }
            >
              <Button
                data-testid={testIds.recurring.createButton}
                onClick={() => {
                  setEditingTemplate(null);
                  setDialogOpen(true);
                }}
                size="sm"
                type="button"
              >
                <PlusCircle aria-hidden="true" />
                {en.recurring.create}
              </Button>
            </BlockedActionGate>
          </div>

          {!ledgerContext || accounts.length < 2 ? (
            <p
              className="rounded-lg border border-border bg-muted/50 px-2.5 py-2 text-[12px] text-muted-foreground"
              data-testid={testIds.recurring.createErrorAlert}
            >
              {ledgerContext ? (
                <>
                  {en.shell.noAccountsForRecurring}{" "}
                  <Link
                    className="font-medium text-primary underline underline-offset-2"
                    to="/accounts"
                  >
                    {en.accounts.addAccount}
                  </Link>
                </>
              ) : (
                en.accounts.ledgerRequired
              )}
            </p>
          ) : null}

          <div className="grid gap-3 xl:grid-cols-2" data-testid={testIds.recurring.list}>
            {templates.length > 0 ? (
              templates.map((template) => {
                const expenseCategoryId =
                  template.payload.type === "expense"
                    ? template.payload.lines[0]?.categoryId
                    : null;
                const expenseCategory = expenseCategoryId
                  ? (categoryById.get(expenseCategoryId) ?? null)
                  : null;
                const expenseCategoryParentName = expenseCategory?.parentId
                  ? (categoryNameById.get(expenseCategory.parentId) ?? null)
                  : null;

                return (
                  <Card
                    className="min-w-0 rounded-lg border border-border bg-card p-0 text-card-foreground shadow-sm"
                    data-testid={testIds.recurring.card(template.id)}
                    key={template.id}
                    size="sm"
                  >
                    <CardContent className="space-y-3 p-3.5 sm:p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-[0.9375rem]">
                          {template.payload.title ?? template.payload.description}
                        </p>
                        <StatusBadge
                          status={template.status}
                          testId={testIds.recurring.cardStatus(template.id)}
                        />
                      </div>
                      <p
                        className="font-semibold text-[1rem]"
                        data-testid={testIds.recurring.cardAmount(template.id)}
                      >
                        {formatMoneyMinor(
                          BigInt(template.payload.lines[0]?.amountMinor ?? "0"),
                          template.payload.currencyCode,
                        )}
                      </p>
                      <p
                        className="text-[0.8125rem] text-muted-foreground"
                        data-testid={testIds.recurring.cardFlow(template.id)}
                      >
                        {en.recurring.accountFlow
                          .replace(
                            "{source}",
                            accountNames.get(template.payload.sourceAccountId) ?? "—",
                          )
                          .replace(
                            "{destination}",
                            template.payload.type === "expense"
                              ? expenseCategory
                                ? expenseCategoryParentName
                                  ? `${expenseCategory.name} · ${expenseCategoryParentName}`
                                  : expenseCategory.name
                                : "—"
                              : (accountNames.get(
                                  template.payload.lines[0]?.destinationAccountId ?? "",
                                ) ?? "—"),
                          )}
                      </p>
                      {template.payload.type === "expense" ? (
                        <p className="text-[0.75rem] text-muted-foreground">
                          {expenseCategory
                            ? CategoryToken({
                                color: expenseCategory.color,
                                icon: expenseCategory.icon,
                                name: expenseCategory.name,
                                parentName: expenseCategoryParentName,
                              })
                            : "—"}
                        </p>
                      ) : null}
                      <p
                        className="text-[0.8125rem] text-muted-foreground"
                        data-testid={testIds.recurring.cardNextRun(template.id)}
                      >
                        {en.recurring.nextRun.replace(
                          "{value}",
                          formatDateTime(template.nextRunAt),
                        )}{" "}
                        · {en.recurring.cadenceLabel[template.cadence]}
                      </p>
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <Button
                          data-testid={testIds.recurring.editButton(template.id)}
                          onClick={() => {
                            setEditingTemplate(template);
                            setDialogOpen(true);
                          }}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <PencilLine aria-hidden="true" />
                          {en.recurring.edit}
                        </Button>
                        {template.status !== "archived" ? (
                          <BlockedActionGate
                            blocked={
                              statusMutation.isPending &&
                              statusMutation.variables?.template.id === template.id
                            }
                            reason={en.actionGate.inProgress}
                          >
                            <Button
                              data-testid={testIds.recurring.toggleStatusButton(template.id)}
                              onClick={() =>
                                statusMutation.mutate({
                                  status: template.status === "active" ? "paused" : "active",
                                  template,
                                })
                              }
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              {template.status === "active" ? (
                                <>
                                  <PauseCircle aria-hidden="true" />
                                  {en.recurring.pause}
                                </>
                              ) : (
                                <>
                                  <PlayCircle aria-hidden="true" />
                                  {en.recurring.resume}
                                </>
                              )}
                            </Button>
                          </BlockedActionGate>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            ) : (
              <p
                className="text-[14px] text-muted-foreground"
                data-testid={testIds.recurring.emptyState}
              >
                {recurringQuery.isPending
                  ? en.shell.loadingData
                  : recurringQuery.isError
                    ? en.recurring.loadFailed
                    : en.recurring.noTemplates}
              </p>
            )}
          </div>
        </div>
      </GlassSection>

      <RecurringCreateDialog
        accounts={accounts}
        categories={categories}
        createDefaults={createDefaults}
        initialValues={
          editingTemplate ? makeRecurringFormValuesFromTemplate(editingTemplate, categories) : null
        }
        isSubmitting={createMutation.isPending || editMutation.isPending}
        mode={editingTemplate ? "edit" : "create"}
        onOpenChange={setDialogOpen}
        onSubmit={async (values) => {
          if (editingTemplate) {
            await editMutation.mutateAsync({ templateId: editingTemplate.id, values });
            return;
          }

          await createMutation.mutateAsync(values);
        }}
        open={dialogOpen}
      />
    </section>
  );
}

function StatusBadge({
  status,
  testId,
}: {
  readonly status: RecurringTemplateResponse["status"];
  readonly testId: string;
}) {
  if (status === "active") {
    return (
      <Badge
        className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
        data-testid={testId}
        variant="outline"
      >
        {en.recurring.active}
      </Badge>
    );
  }

  if (status === "paused") {
    return (
      <Badge
        className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200"
        data-testid={testId}
        variant="outline"
      >
        {en.recurring.paused}
      </Badge>
    );
  }

  return (
    <Badge
      className="border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-200"
      data-testid={testId}
      variant="outline"
    >
      {en.recurring.archived}
    </Badge>
  );
}
