import type { CreateAccountRequest } from "@fastifly/common";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@ui/alert";
import { Button } from "@ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
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
import { PlusCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { apiClient, FastiflyApiError } from "../api/client";
import {
  ACCOUNT_FORM_TYPES,
  type AccountFormType,
  buildCreateAccountRequest,
  getAccountTypeDefinition,
  makeAccountFormDefaults,
} from "../finance/account-form";
import { en } from "../i18n/en";
import { testIds } from "../testing/testid-registry";

type AccountCreatePanelProps = {
  readonly ledgerContext: {
    readonly ledgerId: string;
    readonly workspaceId: string;
  } | null;
};

export function AccountCreatePanel({ ledgerContext }: AccountCreatePanelProps) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async (request: CreateAccountRequest) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }

      await apiClient.createAccount({
        ...request,
        ledgerId: ledgerContext.ledgerId,
        workspaceId: ledgerContext.workspaceId,
      });
    },
    onSuccess: async () => {
      setSuccessMessage(en.accounts.createSuccess);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["finance", "accounts", ledgerContext?.workspaceId, ledgerContext?.ledgerId],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            "finance",
            "transactions",
            ledgerContext?.workspaceId,
            ledgerContext?.ledgerId,
          ],
        }),
      ]);
    },
  });
  const form = useForm({
    defaultValues: makeAccountFormDefaults(),
    onSubmit: async ({ value }) => {
      setFormError(null);
      setSuccessMessage(null);
      try {
        await mutation.mutateAsync(buildCreateAccountRequest(value));
        form.reset(makeAccountFormDefaults(value.type));
        setDialogOpen(false);
      } catch (error) {
        setFormError(getAccountFormError(error));
      }
    },
  });

  useEffect(() => {
    if (!dialogOpen) {
      return;
    }

    form.reset(makeAccountFormDefaults(form.state.values.type));
    setFormError(null);
  }, [dialogOpen, form]);

  return (
    <>
      <Card className="gap-2 py-0" data-testid={testIds.accounts.create.panel}>
        <CardHeader className="gap-1 px-4 pt-3 pb-1">
          <div>
            <CardTitle className="text-[1rem]" data-testid={testIds.accounts.create.title}>
              {en.accounts.addAccount}
            </CardTitle>
            <CardDescription
              className="text-[0.8125rem] leading-snug"
              data-testid={testIds.accounts.create.description}
            >
              {en.accounts.addAccountBody}
            </CardDescription>
          </div>
          <CardAction>
            <Button
              data-testid={testIds.accounts.create.openButton}
              disabled={!ledgerContext}
              onClick={() => {
                setSuccessMessage(null);
                setDialogOpen(true);
              }}
              size="sm"
              type="button"
            >
              <PlusCircle aria-hidden="true" />
              {en.accounts.addAccount}
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent className="px-4 pb-3">
          {!ledgerContext ? (
            <Alert>
              <AlertDescription>{en.accounts.ledgerRequired}</AlertDescription>
            </Alert>
          ) : null}
          {successMessage ? (
            <Alert
              className="border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
              data-testid={testIds.accounts.create.successAlert}
            >
              <AlertDescription data-testid={testIds.accounts.create.successMessage}>
                {successMessage}
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[34rem]"
          data-testid={testIds.accounts.create.dialog}
        >
          <DialogHeader>
            <DialogTitle data-testid={testIds.accounts.create.dialogTitle}>
              {en.accounts.addAccount}
            </DialogTitle>
            <DialogDescription data-testid={testIds.accounts.create.dialogDescription}>
              {en.accounts.addAccountBody}
            </DialogDescription>
          </DialogHeader>

          <form
            className="flex flex-col gap-4"
            data-testid={testIds.accounts.create.form}
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <form.Field
              name="name"
              validators={{
                onChange: ({ value }) =>
                  value.trim() ? undefined : en.accounts.accountNameRequired,
              }}
            >
              {(field) => (
                <FormField
                  errors={field.state.meta.errors}
                  errorTestId={testIds.accounts.create.nameError}
                  inputId={field.name}
                  label={en.accounts.accountName}
                >
                  <Input
                    aria-invalid={field.state.meta.errors.length > 0}
                    autoComplete="off"
                    data-testid={testIds.accounts.create.nameInput}
                    id={field.name}
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={en.accounts.accountNamePlaceholder}
                    value={field.state.value}
                  />
                </FormField>
              )}
            </form.Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <form.Field name="type">
                {(field) => (
                  <Field>
                    <FieldLabel>{en.accounts.accountType}</FieldLabel>
                    <Select
                      onValueChange={(value) => {
                        const type = value as AccountFormType;
                        field.handleChange(type);
                        if (!getAccountTypeDefinition(type).supportsOpeningBalance) {
                          form.setFieldValue("openingBalance", "");
                        }
                      }}
                      value={field.state.value}
                    >
                      <SelectTrigger data-testid={testIds.accounts.create.typeSelect}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {ACCOUNT_FORM_TYPES.map((option) => (
                            <SelectItem key={option.type} value={option.type}>
                              {en.accounts.types[option.type]}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </form.Field>

              <form.Field name="currencyCode">
                {(field) => (
                  <Field>
                    <FieldLabel>{en.accounts.currency}</FieldLabel>
                    <Select onValueChange={field.handleChange} value={field.state.value}>
                      <SelectTrigger data-testid={testIds.accounts.create.currencySelect}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="INR">INR</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </form.Field>
            </div>

            <form.Subscribe selector={(state) => state.values.type}>
              {(type) =>
                getAccountTypeDefinition(type).supportsOpeningBalance ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <form.Field name="openingBalance">
                      {(field) => (
                        <FormField
                          errors={field.state.meta.errors}
                          inputId={field.name}
                          label={en.accounts.openingBalance}
                        >
                          <Input
                            data-testid={testIds.accounts.create.openingBalanceInput}
                            id={field.name}
                            inputMode="decimal"
                            name={field.name}
                            onBlur={field.handleBlur}
                            onChange={(event) => field.handleChange(event.target.value)}
                            placeholder="0.00"
                            value={field.state.value}
                          />
                        </FormField>
                      )}
                    </form.Field>

                    <form.Field name="openingBalanceDate">
                      {(field) => (
                        <FormField
                          errors={field.state.meta.errors}
                          inputId={field.name}
                          label={en.accounts.openingBalanceDate}
                        >
                          <Input
                            data-testid={testIds.accounts.create.openingBalanceDateInput}
                            id={field.name}
                            name={field.name}
                            onBlur={field.handleBlur}
                            onChange={(event) => field.handleChange(event.target.value)}
                            type="date"
                            value={field.state.value}
                          />
                        </FormField>
                      )}
                    </form.Field>
                  </div>
                ) : null
              }
            </form.Subscribe>

            {formError ? (
              <Alert data-testid={testIds.accounts.create.errorAlert} variant="destructive">
                <AlertDescription data-testid={testIds.accounts.create.errorMessage}>
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
                data-testid={testIds.accounts.create.saveButton}
                disabled={mutation.isPending}
                type="submit"
              >
                {mutation.isPending ? en.accounts.saving : en.accounts.save}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FormField({
  children,
  errors,
  errorTestId,
  inputId,
  label,
}: {
  readonly children: ReactNode;
  readonly errors: readonly unknown[];
  readonly errorTestId?: string | undefined;
  readonly inputId: string;
  readonly label: string;
}) {
  return (
    <Field data-invalid={errors.length > 0}>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      {children}
      <FieldError errors={errors} testId={errorTestId} />
    </Field>
  );
}

function FieldError({
  errors,
  testId,
}: {
  readonly errors: readonly unknown[];
  readonly testId?: string | undefined;
}) {
  const firstError = errors[0];
  if (!firstError) {
    return null;
  }

  return <ShadcnFieldError data-testid={testId}>{String(firstError)}</ShadcnFieldError>;
}

function getAccountFormError(error: unknown): string {
  if (error instanceof FastiflyApiError) {
    return error.response.error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }

  return en.accounts.createFailed;
}
