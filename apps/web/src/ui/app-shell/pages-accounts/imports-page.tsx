import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@ui/alert";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardContent } from "@ui/card";
import { apiClient } from "../../../api/client";
import { useImportJobsQuery } from "../../../api/queries";
import { en } from "../../../i18n/en";
import { testIds } from "../../../testing/testid-registry";
import { GlassSection } from "../shared-components";
import { makeSampleImportCsv } from "../utils";
import type { ImportsPageProps } from "./types";

export function ImportsPage({ accounts, ledgerContext }: ImportsPageProps) {
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
