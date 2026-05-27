import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@ui/alert-dialog";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { Field, FieldLabel } from "@ui/field";
import { Input } from "@ui/input";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { apiClient, FastiflyApiError } from "../api/client";
import { apiKeysQueryKey, useApiKeysQuery } from "../api/queries";
import { en } from "../i18n/en";
import { testIds } from "../testing/testid-registry";
import { GlassSection } from "./app-shell/shared-components";
import { formatDateTime } from "./app-shell/utils";

export function ApiKeysPanel() {
  const queryClient = useQueryClient();
  const apiKeysQuery = useApiKeysQuery();
  const apiKeys = apiKeysQuery.data?.data.apiKeys ?? [];

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  // Holds the freshly generated plaintext token so we can reveal it once.
  const [revealedToken, setRevealedToken] = useState<string | null>(null);

  const invalidateApiKeys = () => queryClient.invalidateQueries({ queryKey: apiKeysQueryKey });

  const createMutation = useMutation({
    mutationFn: (name: string) => apiClient.createApiKey({ name }),
    onSuccess: async (data) => {
      toast.success(en.apiKeys.createSuccess);
      setKeyName("");
      setCreateDialogOpen(false);
      setRevealedToken(data.token);
      await invalidateApiKeys();
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (apiKeyId: string) => apiClient.revokeApiKey({ apiKeyId }),
    onSuccess: async () => {
      toast.success(en.apiKeys.revokeSuccess);
      await invalidateApiKeys();
    },
  });

  const generateApiKey = async () => {
    const trimmedName = keyName.trim();
    if (!trimmedName) {
      toast.error(en.apiKeys.nameRequired);
      return;
    }

    try {
      await createMutation.mutateAsync(trimmedName);
    } catch (error) {
      toast.error(resolveError(error, en.apiKeys.createFailed));
    }
  };

  const revokeApiKey = async (apiKeyId: string) => {
    try {
      await revokeMutation.mutateAsync(apiKeyId);
    } catch (error) {
      toast.error(resolveError(error, en.apiKeys.revokeFailed));
    }
  };

  const copyToken = async (token: string) => {
    if (!navigator.clipboard?.writeText) {
      toast.error(en.apiKeys.copyFailed);
      return;
    }

    try {
      await navigator.clipboard.writeText(token);
      toast.success(en.apiKeys.copied);
    } catch {
      toast.error(en.apiKeys.copyFailed);
    }
  };

  return (
    <GlassSection
      title={en.apiKeys.title}
      description={en.apiKeys.body}
      testId={testIds.apiKeys.card}
      headerAction={
        <Dialog
          onOpenChange={(nextOpen) => {
            setCreateDialogOpen(nextOpen);
            if (!nextOpen) {
              setKeyName("");
            }
          }}
          open={createDialogOpen}
        >
          <Button
            data-testid={testIds.apiKeys.generateButton}
            onClick={() => setCreateDialogOpen(true)}
            size="sm"
            type="button"
          >
            <Plus aria-hidden="true" />
            {en.apiKeys.generate}
          </Button>

          <DialogContent data-testid={testIds.apiKeys.create.dialog}>
            <DialogHeader>
              <DialogTitle>{en.apiKeys.createTitle}</DialogTitle>
              <DialogDescription>{en.apiKeys.createBody}</DialogDescription>
            </DialogHeader>

            <form
              className="flex flex-col gap-4"
              data-testid={testIds.apiKeys.create.form}
              onSubmit={(event) => {
                event.preventDefault();
                void generateApiKey();
              }}
            >
              <Field className="gap-1.5">
                <FieldLabel>{en.apiKeys.nameLabel}</FieldLabel>
                <Input
                  data-testid={testIds.apiKeys.create.nameInput}
                  disabled={createMutation.isPending}
                  onChange={(event) => setKeyName(event.target.value)}
                  placeholder={en.apiKeys.namePlaceholder}
                  value={keyName}
                />
              </Field>

              <DialogFooter className="gap-2 sm:gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    {en.rules.cancel}
                  </Button>
                </DialogClose>
                <Button
                  data-testid={testIds.apiKeys.create.submitButton}
                  disabled={createMutation.isPending}
                  type="submit"
                >
                  <KeyRound aria-hidden="true" />
                  {createMutation.isPending ? en.apiKeys.generating : en.apiKeys.generate}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      {apiKeys.length === 0 ? (
        <p className="text-muted-foreground text-sm" data-testid={testIds.apiKeys.emptyState}>
          {en.apiKeys.empty}
        </p>
      ) : (
        <ul className="space-y-2" data-testid={testIds.apiKeys.list}>
          {apiKeys.map((apiKey) => {
            const isRevoked = apiKey.revokedAt !== null;
            return (
              <li
                className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 p-3"
                data-testid={testIds.apiKeys.row(apiKey.id)}
                key={apiKey.id}
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-sm">{apiKey.name}</span>
                    {isRevoked ? (
                      <Badge variant="outline" className="text-muted-foreground">
                        {en.apiKeys.revoke}
                      </Badge>
                    ) : null}
                  </div>
                  <code className="block font-mono text-[12px] text-muted-foreground">
                    {apiKey.tokenPrefix}…
                  </code>
                  <p className="text-[12px] text-muted-foreground">
                    {`${en.apiKeys.createdColumn}: ${formatDateTime(apiKey.createdAt)} · ${
                      en.apiKeys.lastUsedColumn
                    }: ${apiKey.lastUsedAt ? formatDateTime(apiKey.lastUsedAt) : en.apiKeys.neverUsed}`}
                  </p>
                </div>

                {isRevoked ? null : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        aria-label={en.apiKeys.revoke}
                        className="shrink-0 text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
                        data-testid={testIds.apiKeys.revokeButton(apiKey.id)}
                        disabled={revokeMutation.isPending}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{en.apiKeys.revoke}</AlertDialogTitle>
                        <AlertDialogDescription>{apiKey.name}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{en.rules.cancel}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void revokeApiKey(apiKey.id)}>
                          {revokeMutation.isPending ? en.apiKeys.revoking : en.apiKeys.revoke}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setRevealedToken(null);
          }
        }}
        open={revealedToken !== null}
      >
        <DialogContent data-testid={testIds.apiKeys.reveal.dialog}>
          <DialogHeader>
            <DialogTitle>{en.apiKeys.revealTitle}</DialogTitle>
            <DialogDescription>{en.apiKeys.revealBody}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <code
              className="block w-full break-all rounded-lg bg-muted/60 p-3 font-mono text-[12px] text-foreground"
              data-testid={testIds.apiKeys.reveal.token}
            >
              {revealedToken}
            </code>
            <p className="text-[12px] text-muted-foreground">{en.apiKeys.revealUsageHint}</p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              data-testid={testIds.apiKeys.reveal.copyButton}
              onClick={() => {
                if (revealedToken) {
                  void copyToken(revealedToken);
                }
              }}
              type="button"
              variant="outline"
            >
              <Copy aria-hidden="true" />
              {en.apiKeys.copy}
            </Button>
            <DialogClose asChild>
              <Button data-testid={testIds.apiKeys.reveal.doneButton} type="button">
                {en.apiKeys.done}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </GlassSection>
  );
}

function resolveError(error: unknown, fallback: string): string {
  if (error instanceof FastiflyApiError) {
    return error.response.error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}
