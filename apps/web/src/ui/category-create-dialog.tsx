import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@ui/dialog";
import { Field, FieldLabel } from "@ui/field";
import { Input } from "@ui/input";
import { PlusCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { apiClient, FastiflyApiError } from "../api/client";
import { en } from "../i18n/en";
import { testIds } from "../testing/testid-registry";

type LedgerContext = {
  readonly ledgerId: string;
  readonly workspaceId: string;
} | null;

type CategoryCreateDialogProps = {
  readonly ledgerContext: LedgerContext;
  readonly trigger: ReactNode;
  readonly triggerDisabled?: boolean;
};

export function CategoryCreateDialog({
  ledgerContext,
  trigger,
  triggerDisabled = false,
}: CategoryCreateDialogProps) {
  const isTriggerDisabled = triggerDisabled || !ledgerContext;
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const mutation = useMutation({
    mutationFn: async (trimmedName: string) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }

      await apiClient.createCategory({
        ledgerId: ledgerContext.ledgerId,
        name: trimmedName,
        workspaceId: ledgerContext.workspaceId,
      });
    },
    onSuccess: async () => {
      toast.success(en.categories.createSuccess);
      setName("");
      setDialogOpen(false);
      await queryClient.invalidateQueries({
        queryKey: ["finance", "categories", ledgerContext?.workspaceId, ledgerContext?.ledgerId],
      });
    },
  });

  const createCategory = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error(en.categories.categoryNameRequired);
      return;
    }

    try {
      await mutation.mutateAsync(trimmedName);
    } catch (error) {
      toast.error(getCategoryCreateError(error));
    }
  };

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setDialogOpen(nextOpen);
        if (!nextOpen) {
          setName("");
        }
      }}
      open={dialogOpen}
    >
      <DialogTrigger asChild disabled={isTriggerDisabled}>
        {trigger}
      </DialogTrigger>

      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[30rem]"
        data-testid={testIds.categories.create.dialog}
      >
        <DialogHeader>
          <DialogTitle data-testid={testIds.categories.create.dialogTitle}>
            {en.categories.addCategory}
          </DialogTitle>
          <DialogDescription data-testid={testIds.categories.create.dialogDescription}>
            {en.categories.addCategoryBody}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          data-testid={testIds.categories.create.form}
          onSubmit={(event) => {
            event.preventDefault();
            void createCategory();
          }}
        >
          <Field className="gap-1.5">
            <FieldLabel>{en.categories.categoryName}</FieldLabel>
            <Input
              data-testid={testIds.categories.create.nameInput}
              disabled={!ledgerContext || mutation.isPending}
              onChange={(event) => setName(event.target.value)}
              placeholder={en.categories.categoryNamePlaceholder}
              value={name}
            />
          </Field>

          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {en.rules.cancel}
              </Button>
            </DialogClose>
            <Button
              data-testid={testIds.categories.create.submitButton}
              disabled={!ledgerContext || mutation.isPending}
              type="submit"
            >
              <PlusCircle aria-hidden="true" />
              {mutation.isPending ? en.categories.saving : en.categories.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function getCategoryCreateError(error: unknown): string {
  if (error instanceof FastiflyApiError) {
    return error.response.error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }

  return en.categories.createFailed;
}
