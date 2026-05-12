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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { Field, FieldLabel } from "@ui/field";
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
  Archive,
  CircleOff,
  Pencil,
  PlusCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { apiClient, FastiflyApiError } from "../../../api/client";
import { useCategoriesQuery } from "../../../api/queries";
import { en } from "../../../i18n/en";
import { testIds } from "../../../testing/testid-registry";
import { BlockedActionGate } from "../../blocked-action-gate";
import { CATEGORY_ICON_OPTIONS, getCategoryIconComponent } from "../../category-metadata";
import { GlassSection } from "../shared-components";
import type { CategoriesPageProps } from "./types";

const NO_PARENT_VALUE = "__no-parent__";
const DEFAULT_COLOR = "#4F46E5";

type CategoryDialogMode = "create" | "edit";

type CategoryDialogState = {
  readonly mode: CategoryDialogMode;
  readonly category: CategoryResponse | null;
};

type CategoryFormValues = {
  readonly color: string;
  readonly icon: string;
  readonly name: string;
  readonly parentId: string;
};
export function CategoriesPage({ ledgerContext }: CategoriesPageProps) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogState, setDialogState] = useState<CategoryDialogState>({
    mode: "create",
    category: null,
  });
  const [searchTerm, setSearchTerm] = useState("");

  const categoriesQuery = useCategoriesQuery(ledgerContext);
  const categories = categoriesQuery.data?.data ?? [];
  const sortedCategories = useMemo(
    () =>
      [...categories].sort(
        (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
      ),
    [categories],
  );

  const categoryNameById = useMemo(
    () => new Map(sortedCategories.map((category) => [category.id, category.name] as const)),
    [sortedCategories],
  );

  const filteredCategories = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return sortedCategories.filter((category) => {
      if (!normalizedSearch) {
        return true;
      }

      const parentName = category.parentId ? (categoryNameById.get(category.parentId) ?? "") : "";
      const haystack = [category.name, category.icon ?? "", category.color ?? "", parentName]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [categoryNameById, searchTerm, sortedCategories]);
  const groupedCategories = useMemo(() => {
    const groups = new Map<
      string,
      {
        readonly categories: CategoryResponse[];
        readonly label: string;
      }
    >();

    for (const category of filteredCategories) {
      const key = category.parentId ?? NO_PARENT_VALUE;
      const label = category.parentId
        ? (categoryNameById.get(category.parentId) ?? en.categories.categoryParentNone)
        : en.categories.categoryParentNone;
      const existing = groups.get(key);
      if (existing) {
        existing.categories.push(category);
        continue;
      }

      groups.set(key, { categories: [category], label });
    }

    return [...groups.entries()]
      .map(([key, value]) => ({
        categories: value.categories,
        key,
        label: value.label,
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [categoryNameById, filteredCategories]);

  const upsertMutation = useMutation({
    mutationFn: async (input: {
      readonly values: CategoryFormValues;
      readonly state: CategoryDialogState;
    }) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }

      const trimmedName = input.values.name.trim();
      if (!trimmedName) {
        throw new Error(en.categories.categoryNameRequired);
      }
      if (!isHexColor(input.values.color)) {
        throw new Error(en.categories.categoryColorInvalid);
      }

      const parentId = input.values.parentId === NO_PARENT_VALUE ? null : input.values.parentId;
      const icon = input.values.icon.trim();

      if (input.state.mode === "create") {
        await apiClient.createCategory({
          color: input.values.color,
          icon: icon ? icon : null,
          ledgerId: ledgerContext.ledgerId,
          name: trimmedName,
          parentId,
          workspaceId: ledgerContext.workspaceId,
        });
        return;
      }

      if (!input.state.category) {
        throw new Error("Category is required for edit.");
      }

      await apiClient.updateCategory({
        categoryId: input.state.category.id,
        color: input.values.color,
        icon: icon ? icon : null,
        ledgerId: ledgerContext.ledgerId,
        name: trimmedName,
        parentId,
        workspaceId: ledgerContext.workspaceId,
      });
    },
    onSuccess: async () => {
      toast.success(
        dialogState.mode === "create" ? en.categories.createSuccess : en.categories.updateSuccess,
      );
      setDialogOpen(false);
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

  const openCreateDialog = () => {
    setDialogState({ mode: "create", category: null });
    setDialogOpen(true);
  };

  const openEditDialog = useCallback((category: CategoryResponse) => {
    setDialogState({ mode: "edit", category });
    setDialogOpen(true);
  }, []);

  const archiveCategory = useCallback(
    async (category: CategoryResponse) => {
      try {
        await archiveMutation.mutateAsync(category);
      } catch (error) {
        toast.error(getCategoryError(error, en.categories.archiveFailed));
      }
    },
    [archiveMutation],
  );

  const archivingCategoryId = archiveMutation.variables?.id;

  return (
    <section className="mt-2 space-y-4" data-testid={testIds.categories.page}>
      <GlassSection title={en.shell.allCategories} description={en.shell.categoriesBody}>
        <div className="mb-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <Field className="gap-1.5">
            <FieldLabel>{en.categories.searchLabel}</FieldLabel>
            <Input
              data-testid={testIds.categories.filters.searchInput}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={en.categories.searchPlaceholder}
              value={searchTerm}
            />
          </Field>

          <div className="flex items-end">
            <BlockedActionGate
              blocked={!ledgerContext}
              reason={en.accounts.ledgerRequired}
              suggestion={{
                label: en.shell.openAccounts,
                to: "/accounts",
              }}
            >
              <Button
                data-testid={testIds.categories.create.openButton}
                onClick={openCreateDialog}
                type="button"
              >
                <PlusCircle aria-hidden="true" />
                {en.categories.addCategory}
              </Button>
            </BlockedActionGate>
          </div>
        </div>

        <div data-testid={testIds.categories.list}>
          {groupedCategories.length > 0 ? (
            <div className="space-y-4">
              {groupedCategories.map((group) => (
                <section className="space-y-2" key={group.key}>
                  <p className="text-[0.75rem] font-medium tracking-wide text-muted-foreground uppercase">
                    {group.label}
                  </p>
                  <ul className="space-y-2">
                    {group.categories.map((category) => {
                      const CategoryIcon = getCategoryIconComponent(category.icon);
                      const isArchiving =
                        archiveMutation.isPending && archivingCategoryId === category.id;

                      return (
                        <li
                          className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white/70 p-3 dark:border-white/10 dark:bg-white/5"
                          data-testid={testIds.categories.card(category.id)}
                          key={category.id}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-white"
                              style={{ color: category.color ?? DEFAULT_COLOR }}
                            >
                              {CategoryIcon ? (
                                <CategoryIcon aria-hidden="true" className="size-4" />
                              ) : (
                                <CircleOff aria-hidden="true" className="size-4" />
                              )}
                            </span>
                            <div className="min-w-0">
                              <p
                                className="truncate font-medium text-slate-900 dark:text-white"
                                data-testid={testIds.categories.cardName(category.id)}
                              >
                                {category.name}
                              </p>
                              <p
                                className="truncate text-xs text-slate-600 dark:text-white/65"
                                data-testid={testIds.categories.cardMeta(category.id)}
                              >
                                {category.color ?? DEFAULT_COLOR}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              data-testid={testIds.categories.edit.button(category.id)}
                              onClick={() => openEditDialog(category)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              <Pencil aria-hidden="true" />
                              {en.categories.edit}
                            </Button>
                            <CategoryArchiveAction
                              category={category}
                              disabled={isArchiving}
                              onArchive={archiveCategory}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <p
              className="text-[14px] text-slate-600 dark:text-white/62"
              data-testid={testIds.categories.emptyState}
            >
              {categoriesQuery.isPending
                ? en.shell.loadingData
                : categoriesQuery.isError
                  ? en.categories.loadFailed
                  : categories.length === 0
                    ? en.categories.noCategories
                    : en.categories.noFilteredCategories}
            </p>
          )}
        </div>
      </GlassSection>

      <CategoryUpsertDialog
        allCategories={sortedCategories}
        isPending={upsertMutation.isPending}
        ledgerContext={ledgerContext}
        onOpenChange={setDialogOpen}
        onSubmit={async (values) => {
          try {
            await upsertMutation.mutateAsync({ state: dialogState, values });
          } catch (error) {
            toast.error(
              getCategoryError(
                error,
                dialogState.mode === "create"
                  ? en.categories.createFailed
                  : en.categories.updateFailed,
              ),
            );
          }
        }}
        open={dialogOpen}
        state={dialogState}
      />
    </section>
  );
}

function CategoryUpsertDialog({
  allCategories,
  isPending,
  ledgerContext,
  onOpenChange,
  onSubmit,
  open,
  state,
}: {
  readonly allCategories: readonly CategoryResponse[];
  readonly isPending: boolean;
  readonly ledgerContext: CategoriesPageProps["ledgerContext"];
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (values: CategoryFormValues) => Promise<void>;
  readonly open: boolean;
  readonly state: CategoryDialogState;
}) {
  const [appearancePickerOpen, setAppearancePickerOpen] = useState(false);
  const [formValues, setFormValues] = useState<CategoryFormValues>(makeFormValues(state));

  useEffect(() => {
    if (!open) {
      return;
    }
    setAppearancePickerOpen(false);
    setFormValues(makeFormValues(state));
  }, [open, state]);

  const selectableParents = useMemo(
    () => allCategories.filter((category) => category.id !== state.category?.id),
    [allCategories, state.category?.id],
  );

  const submitLabel =
    state.mode === "create"
      ? isPending
        ? en.categories.saving
        : en.categories.save
      : isPending
        ? en.categories.updating
        : en.categories.update;
  const SelectedCategoryIcon = getCategoryIconComponent(formValues.icon);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[40rem]"
        data-testid={testIds.categories.create.dialog}
      >
        <DialogHeader>
          <DialogTitle data-testid={testIds.categories.create.dialogTitle}>
            {state.mode === "create" ? en.categories.addCategory : en.categories.editTitle}
          </DialogTitle>
          <DialogDescription data-testid={testIds.categories.create.dialogDescription}>
            {en.categories.addCategoryBody}
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-3"
          data-testid={testIds.categories.create.form}
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit(formValues);
          }}
        >
          <div className="grid items-start gap-3 md:grid-cols-[auto_minmax(0,1fr)]">
            <div className="flex gap-2 md:flex-col">
              <Button
                className="h-10 w-10 rounded-lg p-0"
                onClick={() => setAppearancePickerOpen(true)}
                style={{ backgroundColor: formValues.color }}
                type="button"
                variant="outline"
              >
                {SelectedCategoryIcon ? (
                  <SelectedCategoryIcon aria-hidden="true" className="size-4" />
                ) : (
                  <CircleOff aria-hidden="true" className="size-4" />
                )}
                <span className="sr-only">{en.categories.categoryIcon}</span>
              </Button>
            </div>
            <Field className="gap-1.5">
              <FieldLabel>{en.categories.categoryName}</FieldLabel>
              <Input
                data-testid={testIds.categories.create.nameInput}
                disabled={!ledgerContext || isPending}
                onChange={(event) =>
                  setFormValues((current) => ({ ...current, name: event.target.value }))
                }
                placeholder={en.categories.categoryNamePlaceholder}
                value={formValues.name}
              />
            </Field>
          </div>

          <Field className="gap-1.5">
            <FieldLabel>{en.categories.categoryParent}</FieldLabel>
            <Select
              disabled={!ledgerContext || isPending}
              onValueChange={(value) =>
                setFormValues((current) => ({
                  ...current,
                  parentId: value,
                }))
              }
              value={formValues.parentId}
            >
              <SelectTrigger data-testid={testIds.categories.create.parentSelect}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={NO_PARENT_VALUE}>{en.categories.categoryParentNone}</SelectItem>
                  {selectableParents.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <DialogFooter>
            <BlockedActionGate
              blocked={!ledgerContext || isPending}
              reason={!ledgerContext ? en.accounts.ledgerRequired : en.actionGate.inProgress}
              suggestion={
                !ledgerContext ? { label: en.shell.openAccounts, to: "/accounts" } : undefined
              }
            >
              <Button data-testid={testIds.categories.create.submitButton} type="submit">
                {state.mode === "create" ? (
                  <PlusCircle aria-hidden="true" />
                ) : (
                  <Pencil aria-hidden="true" />
                )}
                {submitLabel}
              </Button>
            </BlockedActionGate>
          </DialogFooter>
        </form>
      </DialogContent>

      <Dialog onOpenChange={setAppearancePickerOpen} open={appearancePickerOpen}>
        <DialogContent className="sm:max-w-[28rem]">
          <DialogHeader>
            <DialogTitle>{en.categories.categoryIcon}</DialogTitle>
            <DialogDescription>{en.categories.addCategoryBody}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div
              className="inline-flex h-12 w-12 items-center justify-center rounded-lg border"
              style={{ backgroundColor: formValues.color }}
            >
              {SelectedCategoryIcon ? (
                <SelectedCategoryIcon aria-hidden="true" className="size-5" />
              ) : (
                <CircleOff aria-hidden="true" className="size-5" />
              )}
            </div>
            <Input
              data-testid={testIds.categories.create.colorInput}
              onChange={(event) =>
                setFormValues((current) => ({
                  ...current,
                  color: event.target.value,
                }))
              }
              type="color"
              value={formValues.color}
            />
          </div>
          <div className="grid grid-cols-8 gap-1.5">
            <Button
              className="h-9 w-9 p-0"
              onClick={() => {
                setFormValues((current) => ({ ...current, icon: "" }));
              }}
              title={en.categories.iconNone}
              type="button"
              variant={formValues.icon === "" ? "default" : "outline"}
            >
              <CircleOff aria-hidden="true" className="size-3.5" />
              <span className="sr-only">{en.categories.iconNone}</span>
            </Button>
            {CATEGORY_ICON_OPTIONS.map((iconOption) => (
              <Button
                className="h-9 w-9 p-0"
                data-testid={`${testIds.categories.create.iconInput}-${iconOption.name}`}
                key={iconOption.name}
                onClick={() => {
                  setFormValues((current) => ({
                    ...current,
                    icon: iconOption.name,
                  }));
                }}
                title={iconOption.name}
                type="button"
                variant={formValues.icon === iconOption.name ? "default" : "outline"}
              >
                <iconOption.icon aria-hidden="true" className="size-3.5" />
                <span className="sr-only">{iconOption.name}</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
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
        <BlockedActionGate blocked={disabled} reason={en.actionGate.inProgress}>
          <Button
            data-testid={testIds.categories.archive.button(category.id)}
            size="sm"
            type="button"
            variant="destructive"
          >
            <Archive aria-hidden="true" />
            {disabled ? en.categories.archiving : en.categories.archive}
          </Button>
        </BlockedActionGate>
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
          <BlockedActionGate blocked={disabled} reason={en.actionGate.inProgress}>
            <AlertDialogAction
              data-testid={testIds.categories.archive.confirmButton(category.id)}
              onClick={() => {
                void onArchive(category);
              }}
              variant="destructive"
            >
              <Archive aria-hidden="true" />
              {disabled ? en.categories.archiving : en.categories.archiveConfirm}
            </AlertDialogAction>
          </BlockedActionGate>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function makeFormValues(state: CategoryDialogState): CategoryFormValues {
  const category = state.category;
  return {
    color: category?.color ?? DEFAULT_COLOR,
    icon: category?.icon ?? "",
    name: category?.name ?? "",
    parentId: category?.parentId ?? NO_PARENT_VALUE,
  };
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

function isHexColor(value: string): boolean {
  return /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(value);
}
