import type { AccountWithBalanceResponse } from "@fastifly/common";
import { useForm } from "@tanstack/react-form";
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
import { Field, FieldLabel, FieldError as ShadcnFieldError } from "@ui/field";
import { Input } from "@ui/input";
import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getDestinationAccountsForRecurring,
  getMinimumFutureDateInput,
  getRecurringFormIssues,
  getSourceAccountsForRecurring,
  makeRecurringFormDefaults,
  type RecurringCreateDefaults,
  type RecurringFormValues,
} from "../../../finance/recurring-form";
import { en } from "../../../i18n/en";
import { testIds } from "../../../testing/testid-registry";
import {
  AccountChooser,
  FormField,
  getAmountFieldError,
  getNextRunOnFieldError,
  InlineChoiceGroup,
} from "./recurring-create-dialog-fields";
import { getRecurringError } from "./recurring-support";

type RecurringCreateDialogProps = {
  readonly accounts: readonly AccountWithBalanceResponse[];
  readonly createDefaults?: RecurringCreateDefaults;
  readonly initialValues?: RecurringFormValues | null;
  readonly isSubmitting: boolean;
  readonly mode: "create" | "edit";
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (values: RecurringFormValues) => Promise<void>;
  readonly open: boolean;
};

export function RecurringCreateDialog({
  accounts,
  createDefaults = {},
  initialValues = null,
  isSubmitting,
  mode,
  onOpenChange,
  onSubmit,
  open,
}: RecurringCreateDialogProps) {
  const [showDescription, setShowDescription] = useState(false);
  const minimumStartDate = useMemo(() => getMinimumFutureDateInput(), []);
  const defaultValues = useMemo(
    () =>
      initialValues ??
      makeRecurringFormDefaults(accounts, createDefaults.type ?? "expense", createDefaults),
    [accounts, createDefaults, initialValues],
  );
  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      try {
        await onSubmit(value);
        form.reset(
          mode === "create"
            ? makeRecurringFormDefaults(accounts, value.type, {
                cadence: value.cadence,
                destinationAccountId: value.destinationAccountId,
                sourceAccountId: value.sourceAccountId,
                type: value.type,
              })
            : value,
        );
        onOpenChange(false);
      } catch (error) {
        toast.error(getRecurringError(error));
      }
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    form.reset(defaultValues);
    setShowDescription(mode === "edit" || defaultValues.description.trim().length > 0);
  }, [defaultValues, form, mode, open]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[36rem]"
        data-testid={testIds.recurring.createDialog}
      >
        <DialogHeader>
          <DialogTitle>{mode === "create" ? en.recurring.create : en.recurring.edit}</DialogTitle>
          <DialogDescription>
            {mode === "create" ? en.recurring.createBody : en.recurring.editBody}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          data-testid={testIds.recurring.createForm}
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <form.Field name="title">
            {(field) => (
              <FormField
                errors={field.state.meta.errors}
                inputId={field.name}
                label={en.recurring.title}
              >
                <Input
                  data-testid={testIds.recurring.createTitleInput}
                  id={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="Netflix"
                  value={field.state.value}
                />
              </FormField>
            )}
          </form.Field>

          <form.Subscribe selector={(state) => state.values}>
            {(values) => {
              const sourceAccounts = getSourceAccountsForRecurring(accounts, values.type);
              const destinationAccounts = getDestinationAccountsForRecurring(
                accounts,
                values.sourceAccountId,
                values.type,
              );
              const sourcePreferredIds =
                values.type === "expense"
                  ? sourceAccounts
                      .filter((account) => account.subtype === "credit_card")
                      .map((account) => account.id)
                  : [];
              const destinationPreferredIds =
                values.type === "expense"
                  ? [
                      ...destinationAccounts
                        .filter((account) => hasNameToken(account.name, "utility", "utilities"))
                        .map((account) => account.id),
                      ...destinationAccounts
                        .filter((account) => hasNameToken(account.name, "entertainment"))
                        .map((account) => account.id),
                    ]
                  : [];

              return (
                <div className="grid gap-4 md:grid-cols-2">
                  <form.Field name="type">
                    {(field) => (
                      <Field>
                        <FieldLabel>{en.recurring.type}</FieldLabel>
                        <InlineChoiceGroup
                          onValueChange={(value) => {
                            const type = value as RecurringFormValues["type"];
                            const nextSource = getSourceAccountsForRecurring(accounts, type)[0];
                            const nextDestination = nextSource
                              ? getDestinationAccountsForRecurring(accounts, nextSource.id, type)[0]
                              : undefined;
                            field.handleChange(type);
                            form.setFieldValue("sourceAccountId", nextSource?.id ?? "");
                            form.setFieldValue("destinationAccountId", nextDestination?.id ?? "");
                          }}
                          options={[
                            { label: en.transactions.types.expense, value: "expense" },
                            { label: en.transactions.types.income, value: "income" },
                            { label: en.transactions.types.transfer, value: "transfer" },
                          ]}
                          testId={testIds.recurring.createTypeSelect}
                          value={field.state.value}
                        />
                      </Field>
                    )}
                  </form.Field>

                  <form.Field
                    name="amount"
                    validators={{
                      onChange: ({ value }) => getAmountFieldError(value),
                    }}
                  >
                    {(field) => (
                      <FormField
                        errors={field.state.meta.errors}
                        inputId={field.name}
                        label={en.recurring.amount}
                      >
                        <Input
                          data-testid={testIds.recurring.createAmountInput}
                          id={field.name}
                          inputMode="decimal"
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value)}
                          placeholder="999.00"
                          value={field.state.value}
                        />
                      </FormField>
                    )}
                  </form.Field>

                  <form.Field name="sourceAccountId">
                    {(field) => (
                      <Field>
                        <FieldLabel>{en.recurring.fromAccount}</FieldLabel>
                        <AccountChooser
                          onValueChange={(sourceAccountId) => {
                            const nextDestination = getDestinationAccountsForRecurring(
                              accounts,
                              sourceAccountId,
                              values.type,
                            )[0];
                            field.handleChange(sourceAccountId);
                            form.setFieldValue("destinationAccountId", nextDestination?.id ?? "");
                          }}
                          options={sourceAccounts}
                          preferredOptionIds={sourcePreferredIds}
                          selectTestId={testIds.recurring.createSourceAccountSelect}
                          value={field.state.value}
                        />
                        {sourceAccounts.length === 0 ? (
                          <ShadcnFieldError>
                            {en.recurring.noCompatibleSourceAccounts}
                          </ShadcnFieldError>
                        ) : null}
                      </Field>
                    )}
                  </form.Field>

                  <form.Field name="destinationAccountId">
                    {(field) => (
                      <Field>
                        <FieldLabel>{en.recurring.toAccount}</FieldLabel>
                        <AccountChooser
                          onValueChange={field.handleChange}
                          options={destinationAccounts}
                          preferredOptionIds={destinationPreferredIds}
                          selectTestId={testIds.recurring.createDestinationAccountSelect}
                          value={field.state.value}
                        />
                        {destinationAccounts.length === 0 ? (
                          <ShadcnFieldError>
                            {en.recurring.noCompatibleDestinationAccounts}
                          </ShadcnFieldError>
                        ) : null}
                      </Field>
                    )}
                  </form.Field>

                  <form.Field name="cadence">
                    {(field) => (
                      <Field>
                        <FieldLabel>{en.recurring.cadence}</FieldLabel>
                        <InlineChoiceGroup
                          onValueChange={(value) =>
                            field.handleChange(value as RecurringFormValues["cadence"])
                          }
                          options={[
                            { label: en.recurring.cadenceLabel.daily, value: "daily" },
                            { label: en.recurring.cadenceLabel.weekly, value: "weekly" },
                            { label: en.recurring.cadenceLabel.monthly, value: "monthly" },
                          ]}
                          testId={testIds.recurring.createCadenceSelect}
                          value={field.state.value}
                        />
                      </Field>
                    )}
                  </form.Field>

                  <form.Field
                    name="nextRunOn"
                    validators={{
                      onChange: ({ value }) => getNextRunOnFieldError(value, minimumStartDate),
                    }}
                  >
                    {(field) => (
                      <FormField
                        errors={field.state.meta.errors}
                        inputId={field.name}
                        label={en.recurring.nextRunOn}
                      >
                        <Input
                          data-testid={testIds.recurring.createNextRunInput}
                          id={field.name}
                          min={minimumStartDate}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value)}
                          type="date"
                          value={field.state.value}
                        />
                      </FormField>
                    )}
                  </form.Field>
                </div>
              );
            }}
          </form.Subscribe>

          {showDescription ? (
            <form.Field name="description">
              {(field) => (
                <Field>
                  <FieldLabel>{en.recurring.description}</FieldLabel>
                  <Input
                    data-testid={testIds.recurring.createDescriptionInput}
                    id={field.name}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={en.recurring.descriptionPlaceholder}
                    value={field.state.value}
                  />
                </Field>
              )}
            </form.Field>
          ) : (
            <div className="flex justify-start">
              <Button
                data-testid={testIds.recurring.createDescriptionToggleButton}
                onClick={() => setShowDescription(true)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {en.recurring.addOptionalNote}
              </Button>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {en.rules.cancel}
              </Button>
            </DialogClose>
            <form.Subscribe
              selector={(state) => ({ canSubmit: state.canSubmit, values: state.values })}
            >
              {({ canSubmit, values }) => {
                const hasGuardrailIssues = getRecurringFormIssues(values, accounts).length > 0;

                return (
                  <Button
                    data-testid={testIds.recurring.createSaveButton}
                    disabled={isSubmitting || !canSubmit || hasGuardrailIssues}
                    type="submit"
                  >
                    <Check aria-hidden="true" />
                    {isSubmitting
                      ? mode === "create"
                        ? en.recurring.creating
                        : en.recurring.updating
                      : mode === "create"
                        ? en.recurring.save
                        : en.recurring.update}
                  </Button>
                );
              }}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function hasNameToken(name: string, ...tokens: readonly string[]): boolean {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return tokens.some((token) => normalized.includes(token));
}
