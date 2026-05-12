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
import { CircleOff, PlusCircle } from "lucide-react";
import {
  cloneElement,
  isValidElement,
  type MouseEvent,
  type ReactElement,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { apiClient, FastiflyApiError } from "../api/client";
import { useCategoriesQuery } from "../api/queries";
import { en } from "../i18n/en";
import { testIds } from "../testing/testid-registry";
import { BlockedActionGate } from "./blocked-action-gate";
import { CATEGORY_ICON_OPTIONS, getCategoryIconComponent } from "./category-metadata";

const NO_PARENT_VALUE = "__no-parent__";
const DEFAULT_COLOR = "#4F46E5";

type LedgerContext = {
  readonly ledgerId: string;
  readonly workspaceId: string;
} | null;

type CategoryCreateDialogProps = {
  readonly ledgerContext: LedgerContext;
  readonly trigger: ReactElement<{
    readonly onClick?: (event: MouseEvent<HTMLElement>) => void;
    [key: string]: unknown;
  }>;
  readonly triggerDisabled?: boolean;
};

export function CategoryCreateDialog({
  ledgerContext,
  trigger,
  triggerDisabled = false,
}: CategoryCreateDialogProps) {
  const queryClient = useQueryClient();
  const categoriesQuery = useCategoriesQuery(ledgerContext);
  const categories = categoriesQuery.data?.data ?? [];
  const sortedCategories = useMemo(
    () =>
      [...categories].sort(
        (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
      ),
    [categories],
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [appearancePickerOpen, setAppearancePickerOpen] = useState(false);
  const isTriggerDisabled = triggerDisabled || !ledgerContext;
  const triggerNode = isValidElement(trigger)
    ? cloneElement(trigger, {
        onClick: (event: MouseEvent<HTMLElement>) => {
          const handleTriggerClick = trigger.props.onClick;

          handleTriggerClick?.(event);
          if (event.defaultPrevented) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          setDialogOpen(true);
        },
      })
    : trigger;
  const [formValues, setFormValues] = useState({
    color: DEFAULT_COLOR,
    icon: "",
    name: "",
    parentId: NO_PARENT_VALUE,
  });
  const mutation = useMutation({
    mutationFn: async (values: {
      readonly color: string;
      readonly icon: string;
      readonly name: string;
      readonly parentId: string;
    }) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }

      const trimmedName = values.name.trim();
      if (!trimmedName) {
        throw new Error(en.categories.categoryNameRequired);
      }
      if (!isHexColor(values.color)) {
        throw new Error(en.categories.categoryColorInvalid);
      }

      await apiClient.createCategory({
        color: values.color,
        icon: values.icon ? values.icon : null,
        ledgerId: ledgerContext.ledgerId,
        name: trimmedName,
        parentId: values.parentId === NO_PARENT_VALUE ? null : values.parentId,
        workspaceId: ledgerContext.workspaceId,
      });
    },
    onSuccess: async () => {
      toast.success(en.categories.createSuccess);
      setFormValues({
        color: DEFAULT_COLOR,
        icon: "",
        name: "",
        parentId: NO_PARENT_VALUE,
      });
      setAppearancePickerOpen(false);
      setDialogOpen(false);
      await queryClient.invalidateQueries({
        queryKey: ["finance", "categories", ledgerContext?.workspaceId, ledgerContext?.ledgerId],
      });
    },
  });

  const createCategory = async () => {
    const trimmedName = formValues.name.trim();
    if (!trimmedName) {
      toast.error(en.categories.categoryNameRequired);
      return;
    }
    if (!isHexColor(formValues.color)) {
      toast.error(en.categories.categoryColorInvalid);
      return;
    }

    try {
      await mutation.mutateAsync(formValues);
    } catch (error) {
      toast.error(getCategoryCreateError(error));
    }
  };
  const SelectedCategoryIcon = getCategoryIconComponent(formValues.icon);

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setDialogOpen(nextOpen);
        if (!nextOpen) {
          setAppearancePickerOpen(false);
          setFormValues({
            color: DEFAULT_COLOR,
            icon: "",
            name: "",
            parentId: NO_PARENT_VALUE,
          });
        }
      }}
      open={dialogOpen}
    >
      <BlockedActionGate
        blocked={isTriggerDisabled}
        reason={en.accounts.ledgerRequired}
        suggestion={{
          label: en.shell.openAccounts,
          to: "/accounts",
        }}
      >
        {triggerNode}
      </BlockedActionGate>

      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[40rem]"
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
                disabled={!ledgerContext || mutation.isPending}
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
              disabled={!ledgerContext || mutation.isPending}
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
                  <SelectItem value={NO_PARENT_VALUE}>
                    {en.categories.categoryParentNone}
                  </SelectItem>
                  {sortedCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {en.rules.cancel}
              </Button>
            </DialogClose>
            <BlockedActionGate blocked={mutation.isPending} reason={en.actionGate.inProgress}>
              <Button data-testid={testIds.categories.create.submitButton} type="submit">
                <PlusCircle aria-hidden="true" />
                {mutation.isPending ? en.categories.saving : en.categories.save}
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

function getCategoryCreateError(error: unknown): string {
  if (error instanceof FastiflyApiError) {
    return error.response.error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }

  return en.categories.createFailed;
}

function isHexColor(value: string): boolean {
  return /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(value);
}
