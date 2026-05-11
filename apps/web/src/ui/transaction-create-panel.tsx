import type { AccountWithBalanceResponse, CreateTransactionRequest } from "@fastifly/common";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import type { LucideIcon } from "lucide-react";
import { ArrowDownLeft, ArrowUpRight, Check, PlusCircle, RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { apiClient, FastiflyApiError } from "../api/client";
import {
  buildCreateTransactionRequest,
  getDestinationAccountsForTransaction,
  getSourceAccountsForTransaction,
  makeTransactionFormDefaults,
  type SimpleTransactionType,
} from "../finance/transaction-form";
import { en } from "../i18n/en";
import { testIds } from "../testing/testid-registry";

type TransactionCreatePanelProps = {
  readonly accounts: readonly AccountWithBalanceResponse[];
  readonly ledgerContext: {
    readonly ledgerId: string;
    readonly workspaceId: string;
  } | null;
  readonly variant?: "default" | "vertical-actions";
};

export function TransactionCreatePanel({
  accounts,
  ledgerContext,
  variant = "default",
}: TransactionCreatePanelProps) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<SimpleTransactionType>("expense");
  const mutation = useMutation({
    mutationFn: async (request: CreateTransactionRequest) => {
      if (!ledgerContext) {
        throw new Error(en.transactions.ledgerRequired);
      }

      await apiClient.createTransaction({
        ...request,
        ledgerId: ledgerContext.ledgerId,
        workspaceId: ledgerContext.workspaceId,
      });
    },
    onSuccess: async () => {
      toast.success(en.transactions.createSuccess);
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
    defaultValues: makeTransactionFormDefaults(accounts, selectedType),
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync(buildCreateTransactionRequest(value, accounts));
        form.reset(makeTransactionFormDefaults(accounts, selectedType));
        setDialogOpen(false);
      } catch (error) {
        toast.error(getTransactionFormError(error));
      }
    },
  });
  const canCreate = Boolean(ledgerContext) && accounts.length > 0;
  const canCreateExpense = canCreateTransactionType(accounts, "expense");
  const canCreateIncome = canCreateTransactionType(accounts, "income");
  const canCreateTransfer = canCreateTransactionType(accounts, "transfer");
  const dialogTitle = `Add ${en.transactions.types[selectedType].toLowerCase()}`;
  const isVerticalActions = variant === "vertical-actions";
  const actionLabels = isVerticalActions ? en.transactions.quickAdd : en.transactions.types;

  useEffect(() => {
    if (!dialogOpen) {
      return;
    }

    form.reset(makeTransactionFormDefaults(accounts, selectedType));
  }, [accounts, dialogOpen, form, selectedType]);

  const openDialogForType = (type: SimpleTransactionType) => {
    setSelectedType(type);
    setDialogOpen(true);
  };

  const actionButtons = (
    <div
      className={cn(
        "grid gap-1.5",
        isVerticalActions ? "grid-cols-3 [&>button]:w-full xl:grid-cols-1" : "grid-cols-3",
      )}
      data-testid={testIds.transactionCreate.actions}
    >
      <QuickTransactionButton
        colored={isVerticalActions}
        disabled={!canCreate || !canCreateExpense}
        fullWidth={isVerticalActions}
        icon={ArrowUpRight}
        label={actionLabels.expense}
        onClick={() => openDialogForType("expense")}
        type="expense"
      />
      <QuickTransactionButton
        colored={isVerticalActions}
        disabled={!canCreate || !canCreateIncome}
        fullWidth={isVerticalActions}
        icon={ArrowDownLeft}
        label={actionLabels.income}
        onClick={() => openDialogForType("income")}
        type="income"
      />
      <QuickTransactionButton
        colored={isVerticalActions}
        disabled={!canCreate || !canCreateTransfer}
        fullWidth={isVerticalActions}
        icon={RefreshCcw}
        label={actionLabels.transfer}
        onClick={() => openDialogForType("transfer")}
        type="transfer"
      />
    </div>
  );

  const panelAlerts = (
    <>
      {!canCreate ? (
        <p
          className="rounded-lg border border-border bg-muted/50 px-2.5 py-2 text-[12px] text-muted-foreground"
          data-testid={testIds.transactionCreate.unavailableAlert}
        >
          {ledgerContext ? en.shell.noAccountsBody : en.transactions.ledgerRequired}
        </p>
      ) : null}
    </>
  );

  return (
    <>
      {isVerticalActions ? (
        <div
          className="fixed right-3 bottom-[calc(5.35rem+env(safe-area-inset-bottom))] left-3 z-30 xl:static xl:z-auto"
          data-testid={testIds.transactionCreate.panel}
        >
          <div className="flex flex-col gap-1">
            {actionButtons}
            {panelAlerts}
          </div>
        </div>
      ) : (
        <Card size="sm" className="gap-1.5 py-0" data-testid={testIds.transactionCreate.panel}>
          <CardHeader className="gap-1 px-3.5 pt-3 pb-1 md:px-4">
            <div>
              <CardTitle className="text-[1rem]" data-testid={testIds.transactionCreate.title}>
                {en.transactions.addTransaction}
              </CardTitle>
              <CardDescription
                className="text-[0.8125rem] leading-snug"
                data-testid={testIds.transactionCreate.description}
              >
                {en.transactions.addTransactionBody}
              </CardDescription>
            </div>
            <CardAction>
              <div className="inline-flex size-7 items-center justify-center rounded-lg border border-border bg-muted/40 text-emerald-700 dark:text-emerald-200">
                <PlusCircle aria-hidden="true" />
              </div>
            </CardAction>
          </CardHeader>

          <CardContent className="flex flex-col gap-1.5 px-3.5 pb-3 md:px-4">
            {actionButtons}
            {panelAlerts}
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[36rem]"
          data-testid={testIds.transactionCreate.dialog}
        >
          <DialogHeader>
            <DialogTitle data-testid={testIds.transactionCreate.dialogTitle}>
              {dialogTitle}
            </DialogTitle>
            <DialogDescription data-testid={testIds.transactionCreate.dialogDescription}>
              {en.transactions.addTransactionBody}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            data-testid={testIds.transactionCreate.form}
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <form.Subscribe selector={(state) => state.values}>
              {(values) => {
                const sourceAccounts = getSourceAccountsForTransaction(accounts, values.type);
                const destinationAccounts = getDestinationAccountsForTransaction(
                  accounts,
                  values.sourceAccountId,
                  values.type,
                );

                return (
                  <div className="grid gap-4 md:grid-cols-2">
                    <form.Field
                      name="amount"
                      validators={{
                        onChange: ({ value }) =>
                          value.trim() ? undefined : en.transactions.amountRequired,
                      }}
                    >
                      {(field) => (
                        <FormField
                          errors={field.state.meta.errors}
                          errorTestId={testIds.transactionCreate.amountError}
                          inputId={field.name}
                          label={en.transactions.amount}
                        >
                          <Input
                            aria-invalid={field.state.meta.errors.length > 0}
                            data-testid={testIds.transactionCreate.amountInput}
                            id={field.name}
                            inputMode="decimal"
                            name={field.name}
                            onBlur={field.handleBlur}
                            onChange={(event) => field.handleChange(event.target.value)}
                            placeholder="1250.00"
                            value={field.state.value}
                          />
                        </FormField>
                      )}
                    </form.Field>

                    <form.Field
                      name="occurredOn"
                      validators={{
                        onChange: ({ value }) =>
                          value.trim() ? undefined : en.transactions.dateRequired,
                      }}
                    >
                      {(field) => (
                        <FormField
                          errors={field.state.meta.errors}
                          errorTestId={testIds.transactionCreate.dateError}
                          inputId={field.name}
                          label={en.transactions.date}
                        >
                          <Input
                            aria-invalid={field.state.meta.errors.length > 0}
                            data-testid={testIds.transactionCreate.dateInput}
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

                    <form.Field
                      name="sourceAccountId"
                      validators={{
                        onChange: ({ value }) =>
                          value ? undefined : en.transactions.sourceAccountRequired,
                      }}
                    >
                      {(field) => (
                        <FormField
                          errors={field.state.meta.errors}
                          errorTestId={testIds.transactionCreate.sourceAccountError}
                          inputId={field.name}
                          label={sourceLabel(values.type)}
                        >
                          <Select
                            {...(field.state.value ? { value: field.state.value } : {})}
                            onValueChange={(sourceAccountId) => {
                              const destinationAccount = getDestinationAccountsForTransaction(
                                accounts,
                                sourceAccountId,
                                values.type,
                              )[0];
                              field.handleChange(sourceAccountId);
                              form.setFieldValue(
                                "destinationAccountId",
                                destinationAccount?.id ?? "",
                              );
                            }}
                          >
                            <SelectTrigger
                              aria-invalid={field.state.meta.errors.length > 0}
                              className="w-full"
                              data-testid={testIds.transactionCreate.sourceAccountSelect}
                              id={field.name}
                            >
                              <SelectValue placeholder={en.transactions.chooseAccount} />
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
                        </FormField>
                      )}
                    </form.Field>

                    <form.Field
                      name="destinationAccountId"
                      validators={{
                        onChange: ({ value }) =>
                          value ? undefined : en.transactions.destinationAccountRequired,
                      }}
                    >
                      {(field) => (
                        <FormField
                          label={destinationLabel(values.type)}
                          errors={field.state.meta.errors}
                          errorTestId={testIds.transactionCreate.destinationAccountError}
                          inputId={field.name}
                        >
                          <Select
                            {...(field.state.value ? { value: field.state.value } : {})}
                            onValueChange={(value) => field.handleChange(value)}
                          >
                            <SelectTrigger
                              aria-invalid={field.state.meta.errors.length > 0}
                              className="w-full"
                              data-testid={testIds.transactionCreate.destinationAccountSelect}
                              id={field.name}
                            >
                              <SelectValue placeholder={en.transactions.chooseAccount} />
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
                        </FormField>
                      )}
                    </form.Field>
                  </div>
                );
              }}
            </form.Subscribe>

            <form.Field
              name="description"
              validators={{
                onChange: ({ value }) =>
                  value.trim() ? undefined : en.transactions.descriptionRequired,
              }}
            >
              {(field) => (
                <FormField
                  errors={field.state.meta.errors}
                  errorTestId={testIds.transactionCreate.descriptionError}
                  inputId={field.name}
                  label={en.transactions.description}
                >
                  <Input
                    aria-invalid={field.state.meta.errors.length > 0}
                    data-testid={testIds.transactionCreate.descriptionInput}
                    id={field.name}
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={en.transactions.descriptionPlaceholder}
                    value={field.state.value}
                  />
                </FormField>
              )}
            </form.Field>

            <DialogFooter className="gap-2 sm:gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {en.rules.cancel}
                </Button>
              </DialogClose>
              <Button
                data-testid={testIds.transactionCreate.saveButton}
                disabled={!canCreate || mutation.isPending}
                type="submit"
              >
                <Check aria-hidden="true" />
                {mutation.isPending ? en.transactions.saving : en.transactions.save}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function QuickTransactionButton({
  colored = false,
  disabled,
  fullWidth = false,
  icon: Icon,
  label,
  onClick,
  type,
}: {
  readonly colored?: boolean;
  readonly disabled: boolean;
  readonly fullWidth?: boolean;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onClick: () => void;
  readonly type: SimpleTransactionType;
}) {
  const toneClass =
    type === "expense"
      ? "border-transparent bg-[#cf5f50] text-white shadow-sm hover:bg-[#bc5547] dark:bg-[#c76759] dark:hover:bg-[#b75b4e]"
      : type === "income"
        ? "border-transparent bg-[#24845e] text-white shadow-sm hover:bg-[#1f7352] dark:bg-[#2a8e66] dark:hover:bg-[#247a58]"
        : "border-transparent bg-[#3f6f9f] text-white shadow-sm hover:bg-[#385f87] dark:bg-[#4a79a7] dark:hover:bg-[#416b95]";

  return (
    <Button
      className={cn(
        "h-8 min-w-0 gap-1.5 px-2 text-[0.8125rem]",
        fullWidth ? "w-full justify-start" : "",
        colored ? toneClass : "",
      )}
      data-testid={testIds.transactionCreate.quickButton(type)}
      disabled={disabled}
      onClick={onClick}
      type="button"
      variant={colored ? "default" : "outline"}
    >
      <Icon aria-hidden="true" data-icon="inline-start" />
      {label}
    </Button>
  );
}

function sourceLabel(type: SimpleTransactionType): string {
  if (type === "income") {
    return en.transactions.incomeSource;
  }

  return en.transactions.fromAccount;
}

function destinationLabel(type: SimpleTransactionType): string {
  if (type === "expense") {
    return en.transactions.category;
  }

  return en.transactions.toAccount;
}

function canCreateTransactionType(
  accounts: readonly AccountWithBalanceResponse[],
  type: SimpleTransactionType,
): boolean {
  const sourceAccount = getSourceAccountsForTransaction(accounts, type)[0];

  if (!sourceAccount) {
    return false;
  }

  return getDestinationAccountsForTransaction(accounts, sourceAccount.id, type).length > 0;
}

function getTransactionFormError(error: unknown): string {
  if (error instanceof FastiflyApiError) {
    return error.response.error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }

  return en.transactions.createFailed;
}

function FormField({
  children,
  errors,
  errorTestId,
  inputId,
  label,
}: {
  readonly children: React.ReactNode;
  readonly errors: readonly unknown[];
  readonly errorTestId?: string | undefined;
  readonly inputId: string;
  readonly label: string;
}) {
  const hasError = errors.length > 0;

  return (
    <Field data-invalid={hasError}>
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
