import type { CategoryResponse } from "@fastifly/common";
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
import { Button } from "@ui/button";
import { Card, CardContent } from "@ui/card";
import { Field, FieldLabel } from "@ui/field";
import { Input } from "@ui/input";
import { Archive, PlusCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { apiClient, FastiflyApiError } from "../../../api/client";
import { useCategoriesQuery } from "../../../api/queries";
import { en } from "../../../i18n/en";
import { testIds } from "../../../testing/testid-registry";
import { GlassSection } from "../shared-components";
import type { CategoriesPageProps } from "./types";

export function CategoriesPage({ ledgerContext }: CategoriesPageProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const categoriesQuery = useCategoriesQuery(ledgerContext);
  const categories = categoriesQuery.data?.data ?? [];
  const categoryNameById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name] as const)),
    [categories],
  );
  const createMutation = useMutation({
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
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["finance", "categories", ledgerContext?.workspaceId, ledgerContext?.ledgerId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["finance", "accounts", ledgerContext?.workspaceId, ledgerContext?.ledgerId],
        }),
      ]);
    },
  });
  const archiveMutation = useMutation({
    mutationFn: async (category: CategoryResponse) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }
      await apiClient.archiveCategory({
        categoryId: category.id,
        ledgerId: ledgerContext.ledgerId,
        workspaceId: ledgerContext.workspaceId,
      });
      return category;
    },
    onSuccess: async (category) => {
      toast.success(en.categories.archiveSuccess.replace("{name}", category.name));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["finance", "categories", ledgerContext?.workspaceId, ledgerContext?.ledgerId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["finance", "accounts", ledgerContext?.workspaceId, ledgerContext?.ledgerId],
        }),
      ]);
    },
  });

  const createCategory = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error(en.categories.categoryNameRequired);
      return;
    }

    try {
      await createMutation.mutateAsync(trimmedName);
    } catch (error) {
      toast.error(getCategoryError(error, en.categories.createFailed));
    }
  };

  const archiveCategory = async (category: CategoryResponse) => {
    try {
      await archiveMutation.mutateAsync(category);
    } catch (error) {
      toast.error(getCategoryError(error, en.categories.archiveFailed));
    }
  };

  return (
    <section className="mt-2 space-y-4" data-testid={testIds.categories.page}>
      <GlassSection title={en.shell.allCategories} description={en.shell.categoriesBody}>
        <form
          className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]"
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
              disabled={!ledgerContext || createMutation.isPending}
              onChange={(event) => setName(event.target.value)}
              placeholder={en.categories.categoryNamePlaceholder}
              value={name}
            />
          </Field>
          <div className="flex items-end">
            <Button
              data-testid={testIds.categories.create.submitButton}
              disabled={!ledgerContext || createMutation.isPending}
              type="submit"
            >
              <PlusCircle aria-hidden="true" />
              {createMutation.isPending ? en.categories.saving : en.categories.save}
            </Button>
          </div>
        </form>
      </GlassSection>

      <GlassSection title={en.categories.addCategory} description={en.categories.addCategoryBody}>
        <div className="grid gap-3 md:grid-cols-2" data-testid={testIds.categories.list}>
          {categories.length > 0 ? (
            categories.map((category) => (
              <CategoryCard
                category={category}
                isArchiving={
                  archiveMutation.isPending && archiveMutation.variables?.id === category.id
                }
                key={category.id}
                onArchive={archiveCategory}
                parentName={
                  category.parentId ? (categoryNameById.get(category.parentId) ?? null) : null
                }
              />
            ))
          ) : (
            <p
              className="text-[14px] text-slate-600 dark:text-white/62"
              data-testid={testIds.categories.emptyState}
            >
              {categoriesQuery.isPending
                ? en.shell.loadingData
                : categoriesQuery.isError
                  ? en.categories.loadFailed
                  : en.categories.noCategories}
            </p>
          )}
        </div>
      </GlassSection>
    </section>
  );
}

function CategoryCard({
  category,
  isArchiving,
  onArchive,
  parentName,
}: {
  readonly category: CategoryResponse;
  readonly isArchiving: boolean;
  readonly onArchive: (category: CategoryResponse) => Promise<void>;
  readonly parentName: string | null;
}) {
  const meta = [
    category.icon,
    category.color,
    parentName ? `${en.categories.parentLabel}: ${parentName}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");

  return (
    <Card
      className="min-w-0 rounded-lg border border-border bg-card p-0 text-card-foreground shadow-sm"
      data-testid={testIds.categories.card(category.id)}
    >
      <CardContent className="p-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className="truncate font-semibold text-[15px]"
              data-testid={testIds.categories.cardName(category.id)}
            >
              {category.name}
            </p>
            <p
              className="mt-1 min-h-5 text-[12px] text-muted-foreground"
              data-testid={testIds.categories.cardMeta(category.id)}
            >
              {meta || en.categories.noParent}
            </p>
          </div>
          <CategoryArchiveAction category={category} disabled={isArchiving} onArchive={onArchive} />
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryArchiveAction({
  category,
  disabled,
  onArchive,
}: {
  readonly category: CategoryResponse;
  readonly disabled: boolean;
  readonly onArchive: (category: CategoryResponse) => Promise<void>;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          data-testid={testIds.categories.archive.button(category.id)}
          disabled={disabled}
          size="sm"
          type="button"
          variant="destructive"
        >
          <Archive aria-hidden="true" />
          {disabled ? en.categories.archiving : en.categories.archive}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent data-testid={testIds.categories.archive.dialog(category.id)}>
        <AlertDialogHeader>
          <AlertDialogTitle data-testid={testIds.categories.archive.title(category.id)}>
            {en.categories.archiveTitle.replace("{name}", category.name)}
          </AlertDialogTitle>
          <AlertDialogDescription data-testid={testIds.categories.archive.description(category.id)}>
            {en.categories.archiveDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid={testIds.categories.archive.cancelButton(category.id)}>
            {en.categories.archiveCancel}
          </AlertDialogCancel>
          <AlertDialogAction
            data-testid={testIds.categories.archive.confirmButton(category.id)}
            disabled={disabled}
            onClick={() => {
              void onArchive(category);
            }}
            variant="destructive"
          >
            <Archive aria-hidden="true" />
            {disabled ? en.categories.archiving : en.categories.archiveConfirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function getCategoryError(error: unknown, fallback: string): string {
  if (error instanceof FastiflyApiError) {
    return error.response.error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}
