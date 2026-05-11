import { formatMoneyMinor, type RecurringTemplateResponse } from "@fastifly/common";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@ui/alert";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardContent } from "@ui/card";
import { PauseCircle, PlayCircle, PlusCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { apiClient } from "../../../api/client";
import { useRecurringTemplatesQuery } from "../../../api/queries";
import {
  buildCreateRecurringTemplateRequest,
  type RecurringFormValues,
} from "../../../finance/recurring-form";
import { en } from "../../../i18n/en";
import { testIds } from "../../../testing/testid-registry";
import { GlassSection } from "../shared-components";
import { formatDateTime } from "../utils";
import { RecurringCreateDialog } from "./recurring-create-dialog";
import { getRecurringError, getRecurringStatusError, isDueSoon } from "./recurring-support";
import type { RecurringPageProps } from "./types";

type FeedbackState = { readonly tone: "error" | "success"; readonly value: string } | null;

export function RecurringPage({ accounts, ledgerContext }: RecurringPageProps) {
  const queryClient = useQueryClient();
  const recurringQuery = useRecurringTemplatesQuery(ledgerContext);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  const createMutation = useMutation({
    mutationFn: async (values: RecurringFormValues) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }

      const request = buildCreateRecurringTemplateRequest(values, accounts);
      return await apiClient.createRecurringTemplate({
        ...request,
        ledgerId: ledgerContext.ledgerId,
        workspaceId: ledgerContext.workspaceId,
      });
    },
    onSuccess: async () => {
      setFeedback({ tone: "success", value: en.recurring.createSuccess });
      await queryClient.invalidateQueries({
        queryKey: ["finance", "recurring", ledgerContext?.workspaceId, ledgerContext?.ledgerId],
      });
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
      setFeedback({ tone: "success", value: en.recurring.statusUpdated });
      await queryClient.invalidateQueries({
        queryKey: ["finance", "recurring", ledgerContext?.workspaceId, ledgerContext?.ledgerId],
      });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }

      return await apiClient.generateRecurringTemplate({
        ledgerId: ledgerContext.ledgerId,
        templateId,
        workspaceId: ledgerContext.workspaceId,
      });
    },
    onSuccess: async () => {
      setFeedback({ tone: "success", value: en.recurring.runSuccess });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["finance", "recurring", ledgerContext?.workspaceId, ledgerContext?.ledgerId],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            "finance",
            "transactions",
            ledgerContext?.workspaceId,
            ledgerContext?.ledgerId,
          ],
        }),
        queryClient.invalidateQueries({
          queryKey: ["finance", "accounts", ledgerContext?.workspaceId, ledgerContext?.ledgerId],
        }),
      ]);
    },
  });

  const accountNames = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name] as const)),
    [accounts],
  );
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
  const activeCount = templates.filter((item) => item.status === "active").length;
  const pausedCount = templates.filter((item) => item.status === "paused").length;
  const dueSoonCount = templates.filter(
    (item) => item.status === "active" && isDueSoon(item.nextRunAt),
  ).length;

  return (
    <section className="mt-2 space-y-4" data-testid={testIds.recurring.page}>
      <GlassSection title={en.shell.recurringTitle} description={en.shell.recurringBody}>
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3" data-testid={testIds.recurring.summary}>
            <SummaryTile
              label={en.recurring.summaryActive}
              testId={testIds.recurring.summaryActive}
              value={activeCount}
            />
            <SummaryTile
              label={en.recurring.summaryDueSoon}
              testId={testIds.recurring.summaryDueSoon}
              value={dueSoonCount}
            />
            <SummaryTile
              label={en.recurring.summaryPaused}
              testId={testIds.recurring.summaryPaused}
              value={pausedCount}
            />
          </div>

          <div className="flex items-center justify-end">
            <Button
              data-testid={testIds.recurring.createButton}
              disabled={!ledgerContext || accounts.length < 2}
              onClick={() => {
                setFeedback(null);
                setDialogOpen(true);
              }}
              size="sm"
              type="button"
            >
              <PlusCircle aria-hidden="true" />
              {en.recurring.create}
            </Button>
          </div>

          {!ledgerContext || accounts.length < 2 ? (
            <Alert>
              <AlertDescription>
                {ledgerContext ? en.shell.noAccountsBody : en.accounts.ledgerRequired}
              </AlertDescription>
            </Alert>
          ) : null}

          {feedback ? (
            <Alert
              className={
                feedback.tone === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                  : undefined
              }
              data-testid={
                feedback.tone === "success"
                  ? testIds.recurring.createSuccessAlert
                  : testIds.recurring.createErrorAlert
              }
              variant={feedback.tone === "error" ? "destructive" : "default"}
            >
              <AlertDescription
                data-testid={
                  feedback.tone === "success"
                    ? testIds.recurring.createSuccessMessage
                    : testIds.recurring.createErrorMessage
                }
              >
                {feedback.value}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-3" data-testid={testIds.recurring.list}>
            {templates.length > 0 ? (
              templates.map((template) => (
                <Card
                  className="min-w-0 rounded-lg border border-border bg-card p-0 text-card-foreground shadow-sm"
                  data-testid={testIds.recurring.card(template.id)}
                  key={template.id}
                  size="sm"
                >
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-[15px]">
                        {template.payload.title ?? template.payload.description}
                      </p>
                      <StatusBadge
                        status={template.status}
                        testId={testIds.recurring.cardStatus(template.id)}
                      />
                    </div>
                    <p
                      className="font-semibold text-[1.05rem]"
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
                      {accountNames.get(template.payload.sourceAccountId) ?? "—"} →{" "}
                      {accountNames.get(template.payload.lines[0]?.destinationAccountId ?? "") ??
                        "—"}
                    </p>
                    <p
                      className="text-[0.8125rem] text-muted-foreground"
                      data-testid={testIds.recurring.cardNextRun(template.id)}
                    >
                      {en.recurring.nextRun.replace("{value}", formatDateTime(template.nextRunAt))}{" "}
                      · {en.recurring.cadenceLabel[template.cadence]}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        data-testid={testIds.recurring.generateButton(template.id)}
                        disabled={
                          template.status !== "active" ||
                          (generateMutation.isPending && generateMutation.variables === template.id)
                        }
                        onClick={() =>
                          generateMutation.mutate(template.id, {
                            onError: (error) =>
                              setFeedback({ tone: "error", value: getRecurringError(error) }),
                          })
                        }
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {generateMutation.isPending && generateMutation.variables === template.id
                          ? en.recurring.generating
                          : en.recurring.generate}
                      </Button>
                      {template.status !== "archived" ? (
                        <Button
                          data-testid={testIds.recurring.toggleStatusButton(template.id)}
                          disabled={
                            statusMutation.isPending &&
                            statusMutation.variables?.template.id === template.id
                          }
                          onClick={() =>
                            statusMutation.mutate(
                              {
                                status: template.status === "active" ? "paused" : "active",
                                template,
                              },
                              {
                                onError: (error) =>
                                  setFeedback({
                                    tone: "error",
                                    value: getRecurringStatusError(error),
                                  }),
                              },
                            )
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
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <p
                className="text-[14px] text-muted-foreground"
                data-testid={testIds.recurring.emptyState}
              >
                {recurringQuery.isPending
                  ? en.shell.loadingData
                  : recurringQuery.isError
                    ? en.recurring.createFailed
                    : en.recurring.noTemplates}
              </p>
            )}
          </div>
        </div>
      </GlassSection>

      <RecurringCreateDialog
        accounts={accounts}
        isSubmitting={createMutation.isPending}
        onOpenChange={setDialogOpen}
        onSubmit={async (values) => {
          setFeedback(null);
          await createMutation.mutateAsync(values);
        }}
        open={dialogOpen}
      />
    </section>
  );
}

function SummaryTile({
  label,
  testId,
  value,
}: {
  readonly label: string;
  readonly testId: string;
  readonly value: number;
}) {
  return (
    <Card className="border border-border bg-muted/20 shadow-none">
      <CardContent className="px-3 py-2">
        <p className="text-[0.75rem] text-muted-foreground">{label}</p>
        <p className="font-semibold text-[1.1rem]" data-testid={testId}>
          {value}
        </p>
      </CardContent>
    </Card>
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
