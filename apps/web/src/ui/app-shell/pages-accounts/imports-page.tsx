import { ACTUAL_IMPORT_MAX_ARCHIVE_BYTES, type ImportJobResponse } from "@fastifly/common";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardContent } from "@ui/card";
import { AlertCircle, ArrowRight, Check, FileUp, RotateCcw, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { apiClient } from "../../../api/client";
import { useImportJobsQuery } from "../../../api/queries";
import { en } from "../../../i18n/en";
import { testIds } from "../../../testing/testid-registry";
import { BlockedActionGate } from "../../blocked-action-gate";
import { GlassSection } from "../shared-components";
import { makeSampleImportCsv } from "../utils";
import {
  formatFileSize,
  formatImportJobStatus,
  getImportErrorMessage,
  getImportErrorPresentation,
  getImportJobActions,
  type ImportErrorPresentation,
  type ImportFeedbackActionTarget,
  makeImportErrorPresentation,
  summarizeActualImport,
  validateActualImportFile,
} from "./imports-support";
import type { ImportsPageProps } from "./types";

export function ImportsPage({ accounts, ledgerContext }: ImportsPageProps) {
  const queryClient = useQueryClient();
  const importJobsQuery = useImportJobsQuery(ledgerContext);
  const actualFileInputRef = useRef<HTMLInputElement>(null);
  const [actualFeedback, setActualFeedback] = useState<ImportErrorPresentation | null>(null);
  const [selectedActualFile, setSelectedActualFile] = useState<{
    readonly name: string;
    readonly size: number;
  } | null>(null);
  const [jobFeedbackById, setJobFeedbackById] = useState<Record<string, ImportErrorPresentation>>(
    {},
  );
  const clearJobFeedback = (importJobId: string) => {
    setJobFeedbackById((current) => {
      if (!(importJobId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[importJobId];
      return next;
    });
  };
  const setJobFeedback = (importJobId: string, feedback: ImportErrorPresentation) => {
    setJobFeedbackById((current) => ({ ...current, [importJobId]: feedback }));
  };
  const invalidateImportQueries = async () => {
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
  };
  const actualImportMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }
      let fileBase64: string;
      try {
        fileBase64 = await fileToBase64(file);
      } catch {
        throw new Error(en.imports.actualReadFailed);
      }
      return await apiClient.createActualImport({
        fileBase64,
        fileName: file.name,
        ...ledgerContext,
      });
    },
    onMutate: () => {
      setActualFeedback(null);
    },
    onSuccess: async (importJob) => {
      const summary = summarizeActualImport(importJob);
      toast.success(summary ? `${en.imports.actualReady} ${summary}` : en.imports.actualReady);
      await invalidateImportQueries();
    },
    onError: (error) => {
      const feedback = getImportErrorPresentation(error, en.imports.actualFailed);
      setActualFeedback(feedback);
      toast.error(feedback.message);
    },
  });
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
      toast.success(en.imports.previewReady);
      if (!ledgerContext) {
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: ["finance", "imports", ledgerContext.workspaceId, ledgerContext.ledgerId],
      });
    },
    onError: (error) => {
      toast.error(getImportErrorMessage(error, en.imports.createFailed));
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
    onMutate: (importJobId) => {
      clearJobFeedback(importJobId);
    },
    onSuccess: async () => {
      toast.success(en.imports.commitSuccess);
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
    onError: (error, importJobId) => {
      const feedback = getImportErrorPresentation(error, en.imports.commitFailed);
      setJobFeedback(importJobId, feedback);
      toast.error(feedback.message);
      void invalidateImportQueries();
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
    onMutate: (importJobId) => {
      clearJobFeedback(importJobId);
    },
    onSuccess: async () => {
      toast.success(en.imports.undoSuccess);
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
    onError: (error, importJobId) => {
      const feedback = getImportErrorPresentation(error, en.imports.undoFailed);
      setJobFeedback(importJobId, feedback);
      toast.error(feedback.message);
      void invalidateImportQueries();
    },
  });
  const importJobs = importJobsQuery.data ?? [];
  const actualUploadLimit = formatFileSize(ACTUAL_IMPORT_MAX_ARCHIVE_BYTES);

  return (
    <section className="mt-2 space-y-4" data-testid={testIds.imports.page}>
      <GlassSection title={en.shell.importsTitle} description={en.shell.importsBody}>
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="font-medium text-[15px]">{en.imports.actualUploadTitle}</p>
                <p className="break-all text-[13px] text-slate-600 dark:text-white/62">
                  {selectedActualFile
                    ? en.imports.actualSelectedFile(
                        selectedActualFile.name,
                        formatFileSize(selectedActualFile.size),
                      )
                    : en.imports.actualUploadMeta(actualUploadLimit)}
                </p>
              </div>
              <BlockedActionGate
                blocked={actualImportMutation.isPending}
                reason={en.actionGate.inProgress}
              >
                <Button
                  className="w-full sm:w-auto"
                  data-testid={testIds.imports.actualUploadButton}
                  onClick={() => actualFileInputRef.current?.click()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <FileUp aria-hidden="true" />
                  {actualImportMutation.isPending
                    ? en.imports.importingActual
                    : en.imports.importActual}
                </Button>
              </BlockedActionGate>
            </div>
            <ImportFeedbackAlert
              className="mt-3"
              feedback={actualFeedback}
              linkTestId={testIds.imports.actualFeedbackLink}
              testId={testIds.imports.actualFeedback}
            />
            <input
              accept=".zip,application/zip,application/x-zip-compressed,application/octet-stream"
              className="hidden"
              data-testid={testIds.imports.actualFileInput}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) {
                  const validationError = validateActualImportFile(file);
                  setSelectedActualFile({ name: file.name, size: file.size });
                  if (validationError) {
                    const feedback = makeImportErrorPresentation(validationError);
                    setActualFeedback(feedback);
                    toast.error(feedback.message);
                    return;
                  }
                  actualImportMutation.mutate(file);
                }
              }}
              ref={actualFileInputRef}
              type="file"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <BlockedActionGate blocked={createMutation.isPending} reason={en.actionGate.inProgress}>
              <Button
                data-testid={testIds.imports.uploadButton}
                onClick={() => createMutation.mutate()}
                size="sm"
                type="button"
              >
                <Upload aria-hidden="true" />
                {createMutation.isPending ? en.imports.uploading : en.imports.upload}
              </Button>
            </BlockedActionGate>
          </div>
          <div className="grid gap-3" data-testid={testIds.imports.list}>
            {importJobs.length > 0 ? (
              importJobs.map((importJob) => (
                <Card
                  className="border border-border bg-card text-card-foreground shadow-sm"
                  data-testid={testIds.imports.card(importJob.id)}
                  key={importJob.id}
                >
                  <CardContent className="space-y-3 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="break-all font-medium text-[15px]">
                        {importJob.fileName ?? importJob.id}
                      </p>
                      <Badge data-testid={testIds.imports.status(importJob.id)} variant="outline">
                        {formatImportJobStatus(importJob.status)}
                      </Badge>
                    </div>
                    <ImportJobPlan importJob={importJob} />
                    <ImportJobFeedback
                      feedback={jobFeedbackById[importJob.id] ?? null}
                      importJobId={importJob.id}
                    />
                    <ImportJobActions
                      commitMutation={commitMutation}
                      importJob={importJob}
                      undoMutation={undoMutation}
                    />
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
        </div>
      </GlassSection>
    </section>
  );
}

type ImportJobMutation = {
  readonly isPending: boolean;
  readonly variables: string | undefined;
  readonly mutate: (importJobId: string) => void;
};

function ImportJobFeedback({
  importJobId,
  feedback,
}: {
  readonly importJobId: string;
  readonly feedback: ImportErrorPresentation | null;
}) {
  return (
    <ImportFeedbackAlert
      feedback={feedback}
      linkTestId={(target) => testIds.imports.jobFeedbackLink(importJobId, target)}
      testId={testIds.imports.jobFeedback(importJobId)}
    />
  );
}

function ImportFeedbackAlert({
  className,
  feedback,
  linkTestId,
  testId,
}: {
  readonly className?: string;
  readonly feedback: ImportErrorPresentation | null;
  readonly linkTestId: (target: ImportFeedbackActionTarget) => string;
  readonly testId: string;
}) {
  if (!feedback) {
    return null;
  }

  return (
    <div
      className={[
        "flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800 dark:border-red-500/35 dark:bg-red-500/12 dark:text-red-100",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid={testId}
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 space-y-2">
        <p>{feedback.message}</p>
        {feedback.actionLinks.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {feedback.actionLinks.map((link) => (
              <Link
                className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 font-medium text-red-800 text-xs hover:bg-red-100 dark:border-red-400/35 dark:bg-red-500/10 dark:text-red-100 dark:hover:bg-red-500/20"
                data-testid={linkTestId(link.target)}
                key={link.target}
                to={link.to}
              >
                {link.label}
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ImportJobActions({
  commitMutation,
  importJob,
  undoMutation,
}: {
  readonly commitMutation: ImportJobMutation;
  readonly importJob: ImportJobResponse;
  readonly undoMutation: ImportJobMutation;
}) {
  const actions = getImportJobActions(importJob.status);
  if (actions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {actions.includes("commit") ? (
        <BlockedActionGate
          blocked={commitMutation.isPending && commitMutation.variables === importJob.id}
          reason={en.actionGate.inProgress}
        >
          <Button
            data-testid={testIds.imports.commitButton(importJob.id)}
            onClick={() => commitMutation.mutate(importJob.id)}
            size="sm"
            type="button"
          >
            <Check aria-hidden="true" />
            {en.imports.commit}
          </Button>
        </BlockedActionGate>
      ) : null}
      {actions.includes("undo") ? (
        <BlockedActionGate
          blocked={undoMutation.isPending && undoMutation.variables === importJob.id}
          reason={en.actionGate.inProgress}
        >
          <Button
            data-testid={testIds.imports.undoButton(importJob.id)}
            onClick={() => undoMutation.mutate(importJob.id)}
            size="sm"
            type="button"
            variant="outline"
          >
            <RotateCcw aria-hidden="true" />
            {en.imports.undo}
          </Button>
        </BlockedActionGate>
      ) : null}
    </div>
  );
}

function ImportJobPlan({ importJob }: { readonly importJob: ImportJobResponse }) {
  const actualImport = importJob.actualImport;
  if (!actualImport) {
    return (
      <p className="text-[13px] text-slate-600 dark:text-white/62">
        {en.imports.previewRows}: {importJob.previewRows.length}
      </p>
    );
  }

  const { summary } = actualImport;
  const metrics = [
    { label: en.imports.actualMetricAccounts, value: summary.accountCount },
    { label: en.imports.actualMetricCategories, value: summary.expenseCategoryCount },
    { label: en.imports.actualMetricIncome, value: summary.incomeSourceCount },
    { label: en.imports.actualMetricTransactions, value: summary.transactionCount },
    { label: en.imports.actualMetricTransfers, value: summary.transferCount },
    { label: en.imports.actualMetricSkipped, value: summary.skippedCount },
  ];
  const visibleWarnings = actualImport.warnings.slice(0, 3);
  const hiddenWarningCount = Math.max(0, summary.warningCount - visibleWarnings.length);

  return (
    <div className="space-y-3" data-testid={testIds.imports.actualSummary(importJob.id)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/35 dark:bg-emerald-500/12 dark:text-emerald-200">
          {en.imports.actualImportPlan}
        </Badge>
        <span className="break-all text-[13px] text-slate-600 dark:text-white/62">
          {actualImport.budgetName ?? actualImport.targetCurrencyCode}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {metrics.map((metric) => (
          <div
            className="rounded-md border border-border bg-background px-3 py-2 dark:bg-white/5"
            key={metric.label}
          >
            <p className="text-[12px] text-slate-500 dark:text-white/55">{metric.label}</p>
            <p className="font-semibold text-[15px]">{metric.value}</p>
          </div>
        ))}
      </div>
      {summary.warningCount > 0 ? (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/12 dark:text-amber-100"
          data-testid={testIds.imports.actualWarnings(importJob.id)}
        >
          <p className="font-medium">{en.imports.actualWarnings}</p>
          <ul className="mt-1 space-y-1">
            {visibleWarnings.map((warning) => (
              <li key={`${warning.code}-${warning.actualTransactionId ?? warning.message}`}>
                {warning.message}
              </li>
            ))}
          </ul>
          {hiddenWarningCount > 0 ? (
            <p className="mt-1">{en.imports.actualWarningsMore(hiddenWarningCount)}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
