import type { AccountWithBalanceResponse } from "@fastifly/common";
import { useForm } from "@tanstack/react-form";
import { Alert, AlertDescription } from "@ui/alert";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { type ReactNode, useEffect, useState } from "react";
import {
  getDestinationAccountsForRecurring,
  getSourceAccountsForRecurring,
  makeRecurringFormDefaults,
  type RecurringFormValues,
} from "../../../finance/recurring-form";
import { en } from "../../../i18n/en";
import { testIds } from "../../../testing/testid-registry";
import { getRecurringError } from "./recurring-support";

type RecurringCreateDialogProps = {
  readonly accounts: readonly AccountWithBalanceResponse[];
  readonly isSubmitting: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (values: RecurringFormValues) => Promise<void>;
  readonly open: boolean;
};

export function RecurringCreateDialog({
  accounts,
  isSubmitting,
  onOpenChange,
  onSubmit,
  open,
}: RecurringCreateDialogProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: makeRecurringFormDefaults(accounts),
    onSubmit: async ({ value }) => {
      setFormError(null);

      try {
        await onSubmit(value);
        form.reset(makeRecurringFormDefaults(accounts, value.type));
        onOpenChange(false);
      } catch (error) {
        setFormError(getRecurringError(error));
      }
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    form.reset(makeRecurringFormDefaults(accounts, form.state.values.type));
    setFormError(null);
  }, [accounts, form, open]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[36rem]"
        data-testid={testIds.recurring.createDialog}
      >
        <DialogHeader>
          <DialogTitle>{en.recurring.create}</DialogTitle>
          <DialogDescription>{en.recurring.createBody}</DialogDescription>
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
          <form.Subscribe selector={(state) => state.values}>
            {(values) => {
              const sourceAccounts = getSourceAccountsForRecurring(accounts, values.type);
              const destinationAccounts = getDestinationAccountsForRecurring(
                accounts,
                values.sourceAccountId,
                values.type,
              );

              return (
                <div className="grid gap-4 md:grid-cols-2">
                  <form.Field name="type">
                    {(field) => (
                      <Field>
                        <FieldLabel>{en.recurring.type}</FieldLabel>
                        <Select
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
                          value={field.state.value}
                        >
                          <SelectTrigger data-testid={testIds.recurring.createTypeSelect}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="expense">
                                {en.transactions.types.expense}
                              </SelectItem>
                              <SelectItem value="income">{en.transactions.types.income}</SelectItem>
                              <SelectItem value="transfer">
                                {en.transactions.types.transfer}
                              </SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                    )}
                  </form.Field>

                  <form.Field
                    name="amount"
                    validators={{
                      onChange: ({ value }) =>
                        value.trim() ? undefined : en.recurring.amountRequired,
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
                        <Select
                          onValueChange={(sourceAccountId) => {
                            const nextDestination = getDestinationAccountsForRecurring(
                              accounts,
                              sourceAccountId,
                              values.type,
                            )[0];
                            field.handleChange(sourceAccountId);
                            form.setFieldValue("destinationAccountId", nextDestination?.id ?? "");
                          }}
                          {...(field.state.value ? { value: field.state.value } : {})}
                        >
                          <SelectTrigger data-testid={testIds.recurring.createSourceAccountSelect}>
                            <SelectValue placeholder={en.recurring.chooseAccount} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {sourceAccounts.map((account) => (
                                <SelectItem key={account.id} value={account.id}>
                                  {account.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                    )}
                  </form.Field>

                  <form.Field name="destinationAccountId">
                    {(field) => (
                      <Field>
                        <FieldLabel>{en.recurring.toAccount}</FieldLabel>
                        <Select
                          onValueChange={field.handleChange}
                          {...(field.state.value ? { value: field.state.value } : {})}
                        >
                          <SelectTrigger
                            data-testid={testIds.recurring.createDestinationAccountSelect}
                          >
                            <SelectValue placeholder={en.recurring.chooseAccount} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {destinationAccounts.map((account) => (
                                <SelectItem key={account.id} value={account.id}>
                                  {account.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                    )}
                  </form.Field>

                  <form.Field name="cadence">
                    {(field) => (
                      <Field>
                        <FieldLabel>{en.recurring.cadence}</FieldLabel>
                        <Select
                          onValueChange={(value) =>
                            field.handleChange(value as RecurringFormValues["cadence"])
                          }
                          value={field.state.value}
                        >
                          <SelectTrigger data-testid={testIds.recurring.createCadenceSelect}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="daily">
                                {en.recurring.cadenceLabel.daily}
                              </SelectItem>
                              <SelectItem value="weekly">
                                {en.recurring.cadenceLabel.weekly}
                              </SelectItem>
                              <SelectItem value="monthly">
                                {en.recurring.cadenceLabel.monthly}
                              </SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                    )}
                  </form.Field>

                  <form.Field
                    name="nextRunOn"
                    validators={{
                      onChange: ({ value }) =>
                        value.trim() ? undefined : en.recurring.nextRunOnRequired,
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

          <form.Field
            name="title"
            validators={{
              onChange: ({ value }) => (value.trim() ? undefined : en.recurring.titleRequired),
            }}
          >
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

          {formError ? (
            <Alert data-testid={testIds.recurring.createErrorAlert} variant="destructive">
              <AlertDescription data-testid={testIds.recurring.createErrorMessage}>
                {formError}
              </AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {en.rules.cancel}
              </Button>
            </DialogClose>
            <Button
              data-testid={testIds.recurring.createSaveButton}
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? en.recurring.creating : en.recurring.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormField({
  children,
  errors,
  inputId,
  label,
}: {
  readonly children: ReactNode;
  readonly errors: readonly unknown[];
  readonly inputId: string;
  readonly label: string;
}) {
  return (
    <Field data-invalid={errors.length > 0}>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      {children}
      <FieldError errors={errors} />
    </Field>
  );
}

function FieldError({ errors }: { readonly errors: readonly unknown[] }) {
  const firstError = errors[0];
  if (!firstError) {
    return null;
  }

  return <ShadcnFieldError>{String(firstError)}</ShadcnFieldError>;
}
