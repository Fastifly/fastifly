import type { AccountWithBalanceResponse, CreateTransactionRequest } from "@fastifly/common";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
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
import { Label } from "@ui/label";
import { RadioGroup, RadioGroupItem } from "@ui/radio-group";
import type { LucideIcon } from "lucide-react";
import { ArrowDownLeft, ArrowUpRight, Check, PlusCircle, RefreshCcw } from "lucide-react";
import {
  type ComponentProps,
  forwardRef,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { apiClient, FastiflyApiError } from "../api/client";
import { useCategoriesQuery } from "../api/queries";
import {
  buildCreateTransactionRequest,
  getDestinationAccountsForTransaction,
  getExpenseCategoriesForTransaction,
  getSourceAccountsForTransaction,
  getTransactionQuickAddState,
  makeTransactionFormDefaults,
  type SimpleTransactionType,
  type TransactionQuickAddReason,
} from "../finance/transaction-form";
import { en } from "../i18n/en";
import { testIds } from "../testing/testid-registry";
import { BlockedActionGate } from "./blocked-action-gate";
import { buildCategoryNameById, CategoryToken } from "./category-metadata";
import {
  mapQuickAddReasonToMessage,
  mapQuickAddReasonToMessageForType,
} from "./quick-add-guidance";

type TransactionCreatePanelProps = {
  readonly accounts: readonly AccountWithBalanceResponse[];
  readonly ledgerContext: {
    readonly ledgerId: string;
    readonly workspaceId: string;
  } | null;
  readonly variant?: "default" | "inline-actions" | "vertical-actions";
};

export function TransactionCreatePanel({
  accounts,
  ledgerContext,
  variant = "default",
}: TransactionCreatePanelProps) {
  const queryClient = useQueryClient();
  const categoriesQuery = useCategoriesQuery(ledgerContext);
  const categories = categoriesQuery.data?.data ?? [];
  const categoryNameById = useMemo(() => buildCategoryNameById(categories), [categories]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<SimpleTransactionType>("expense");
  const amountInputRef = useRef<HTMLInputElement | null>(null);
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
    defaultValues: makeTransactionFormDefaults(accounts, categories, selectedType),
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync(buildCreateTransactionRequest(value, accounts, categories));
        form.reset(makeTransactionFormDefaults(accounts, categories, selectedType));
        setDialogOpen(false);
      } catch (error) {
        toast.error(getTransactionFormError(error));
      }
    },
  });
  const quickAddState = getTransactionQuickAddState({
    accounts,
    categories,
    categoriesLoading: categoriesQuery.isPending,
    hasLedgerContext: Boolean(ledgerContext),
  });
  const canCreateExpense = quickAddState.availability.expense;
  const canCreateIncome = quickAddState.availability.income;
  const canCreateTransfer = quickAddState.availability.transfer;
  const canCreate = quickAddState.canCreateAny;
  const unavailableMessage = mapQuickAddReasonToMessage(quickAddState.reason);
  const dialogTitle = `Add ${en.transactions.types[selectedType].toLowerCase()}`;
  const isInlineActions = variant === "inline-actions";
  const isVerticalActions = variant === "vertical-actions";
  const actionLabels =
    isVerticalActions || isInlineActions ? en.transactions.quickAdd : en.transactions.types;

  useEffect(() => {
    if (!dialogOpen) {
      return;
    }

    const timeout = window.setTimeout(() => {
      amountInputRef.current?.focus();
    }, 0);
    form.reset(makeTransactionFormDefaults(accounts, categories, selectedType));

    return () => {
      window.clearTimeout(timeout);
    };
  }, [accounts, categories, dialogOpen, form, selectedType]);

  const openDialogForType = (type: SimpleTransactionType) => {
    setSelectedType(type);
    setDialogOpen(true);
  };

  const actionButtons = (
    <div
      className={cn(
        "grid gap-1.5",
        isVerticalActions
          ? "grid-cols-3 [&>button]:w-full xl:grid-cols-1"
          : isInlineActions
            ? "grid-cols-1 [&>button]:w-full sm:grid-cols-3"
            : "grid-cols-3",
      )}
      data-testid={testIds.transactionCreate.actions}
    >
      <QuickTransactionButton
        blocked={!canCreate || !canCreateExpense}
        colored={isVerticalActions || isInlineActions}
        fullWidth={isVerticalActions || isInlineActions}
        reasonCode={quickAddState.reasons.expense}
        reason={mapQuickAddReasonToMessageForType({
          reason: quickAddState.reasons.expense,
          type: "expense",
        })}
        icon={ArrowUpRight}
        label={actionLabels.expense}
        onClick={() => openDialogForType("expense")}
        type="expense"
      />
      <QuickTransactionButton
        blocked={!canCreate || !canCreateIncome}
        colored={isVerticalActions || isInlineActions}
        fullWidth={isVerticalActions || isInlineActions}
        reasonCode={quickAddState.reasons.income}
        reason={mapQuickAddReasonToMessageForType({
          reason: quickAddState.reasons.income,
          type: "income",
        })}
        icon={ArrowDownLeft}
        label={actionLabels.income}
        onClick={() => openDialogForType("income")}
        type="income"
      />
      <QuickTransactionButton
        blocked={!canCreate || !canCreateTransfer}
        colored={isVerticalActions || isInlineActions}
        fullWidth={isVerticalActions || isInlineActions}
        reasonCode={quickAddState.reasons.transfer}
        reason={mapQuickAddReasonToMessageForType({
          reason: quickAddState.reasons.transfer,
          type: "transfer",
        })}
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
          {quickAddState.reason === "add-account" ? (
            <>
              {en.transactions.prerequisites.addAccount}{" "}
              <Link
                className="font-medium text-primary underline underline-offset-2"
                to="/accounts"
              >
                {en.accounts.addAccount}
              </Link>
            </>
          ) : quickAddState.reason === "add-category" ? (
            <>
              {en.transactions.prerequisites.addCategory}{" "}
              <Link
                className="font-medium text-primary underline underline-offset-2"
                to="/categories"
              >
                {en.categories.addCategory}
              </Link>
            </>
          ) : quickAddState.reason === "add-second-account" ? (
            <>
              {en.transactions.prerequisites.addSecondAccount}{" "}
              <Link
                className="font-medium text-primary underline underline-offset-2"
                to="/accounts"
              >
                {en.accounts.addAccount}
              </Link>
            </>
          ) : quickAddState.reason === "add-compatible-setup" ? (
            <>
              {en.transactions.prerequisites.addCompatibleSetup}{" "}
              <Link
                className="font-medium text-primary underline underline-offset-2"
                to="/accounts"
              >
                {en.shell.openAccounts}
              </Link>{" "}
              ·{" "}
              <Link
                className="font-medium text-primary underline underline-offset-2"
                to="/categories"
              >
                {en.categories.addCategory}
              </Link>
            </>
          ) : (
            unavailableMessage
          )}
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
      ) : isInlineActions ? (
        <div className="flex flex-col gap-1" data-testid={testIds.transactionCreate.panel}>
          {actionButtons}
          {panelAlerts}
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
                const expenseCategories =
                  values.type === "expense"
                    ? getExpenseCategoriesForTransaction(
                        categories,
                        accounts,
                        values.sourceAccountId,
                      )
                    : [];
                const destinationAccounts =
                  values.type === "expense"
                    ? []
                    : getDestinationAccountsForTransaction(
                        accounts,
                        values.sourceAccountId,
                        values.type,
                      );

                return (
                  <div className="grid gap-4 grid-cols-2">
                    <div className="md:col-span-2 flex justify-center">
                      <div className="w-full max-w-[18rem]">
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
                              labelClassName="text-[0.82rem] font-medium text-foreground/85"
                            >
                              <AmountInput
                                ref={amountInputRef}
                                aria-invalid={field.state.meta.errors.length > 0}
                                data-testid={testIds.transactionCreate.amountInput}
                                id={field.name}
                                inputMode="decimal"
                                name={field.name}
                                onBlur={field.handleBlur}
                                onChange={(event) => field.handleChange(event.target.value)}
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="1250.00"
                                value={field.state.value}
                              />
                            </FormField>
                          )}
                        </form.Field>
                      </div>
                    </div>

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
                      name={values.type === "expense" ? "categoryId" : "destinationAccountId"}
                      validators={{
                        onChange: ({ value }) =>
                          value ? undefined : en.transactions.destinationAccountRequired,
                      }}
                    >
                      {(field) => (
                        <Field data-invalid={field.state.meta.errors.length > 0}>
                          <FieldLabel>{destinationLabel(values.type)}</FieldLabel>
                          <CompactChoiceGroup
                            idPrefix="transaction-destination"
                            options={
                              values.type === "expense"
                                ? expenseCategories.map((category) => ({
                                    label: renderCategoryChoiceLabel({
                                      category,
                                      categoryNameById,
                                    }),
                                    value: category.id,
                                  }))
                                : destinationAccounts.map((account) => ({
                                    label: account.name,
                                    value: account.id,
                                  }))
                            }
                            onValueChange={(value) => field.handleChange(value)}
                            testId={testIds.transactionCreate.destinationAccountSelect}
                            value={field.state.value}
                          />
                          <FieldError
                            errors={field.state.meta.errors}
                            testId={testIds.transactionCreate.destinationAccountError}
                          />
                        </Field>
                      )}
                    </form.Field>

                    {values.type === "income" ? null : (
                      <form.Field
                        name="sourceAccountId"
                        validators={{
                          onChange: ({ value }) =>
                            value ? undefined : en.transactions.sourceAccountRequired,
                        }}
                      >
                        {(field) => (
                          <Field data-invalid={field.state.meta.errors.length > 0}>
                            <FieldLabel>{sourceLabel(values.type)}</FieldLabel>
                            <CompactChoiceGroup
                              idPrefix="transaction-source"
                              options={sourceAccounts.map((account) => ({
                                label: account.name,
                                value: account.id,
                              }))}
                              onValueChange={(sourceAccountId) => {
                                if (values.type === "expense") {
                                  const firstCategory = getExpenseCategoriesForTransaction(
                                    categories,
                                    accounts,
                                    sourceAccountId,
                                  )[0];
                                  field.handleChange(sourceAccountId);
                                  form.setFieldValue("categoryId", firstCategory?.id ?? "");
                                  form.setFieldValue("destinationAccountId", "");
                                  return;
                                }

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
                                form.setFieldValue("categoryId", "");
                              }}
                              testId={testIds.transactionCreate.sourceAccountSelect}
                              value={field.state.value}
                            />
                            <FieldError
                              errors={field.state.meta.errors}
                              testId={testIds.transactionCreate.sourceAccountError}
                            />
                          </Field>
                        )}
                      </form.Field>
                    )}
                  </div>
                );
              }}
            </form.Subscribe>

            <DialogFooter className="gap-2 sm:gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {en.rules.cancel}
                </Button>
              </DialogClose>
              <BlockedActionGate blocked={mutation.isPending} reason={en.actionGate.inProgress}>
                <Button data-testid={testIds.transactionCreate.saveButton} type="submit">
                  <Check aria-hidden="true" />
                  {mutation.isPending ? en.transactions.saving : en.transactions.save}
                </Button>
              </BlockedActionGate>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function QuickTransactionButton({
  colored = false,
  blocked,
  reasonCode,
  reason,
  fullWidth = false,
  icon: Icon,
  label,
  onClick,
  type,
}: {
  readonly colored?: boolean;
  readonly blocked: boolean;
  readonly reasonCode: TransactionQuickAddReason | null;
  readonly reason: string;
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

  const quickButton = (
    <Button
      className={cn(
        "h-8 min-w-0 gap-1.5 px-2 text-[0.8125rem]",
        fullWidth ? "w-full justify-start" : "",
        colored ? toneClass : "",
      )}
      data-testid={testIds.transactionCreate.quickButton(type)}
      onClick={onClick}
      type="button"
      variant={colored ? "default" : "outline"}
    >
      <Icon aria-hidden="true" data-icon="inline-start" />
      {label}
    </Button>
  );

  const suggestion =
    blocked && reasonCode === "ledger-required"
      ? {
          label: en.shell.openAccounts,
          to: "/accounts",
        }
      : blocked && reasonCode === "add-account"
        ? {
            label: en.shell.openAccounts,
            to: "/accounts",
          }
        : blocked && reasonCode === "add-category"
          ? {
              label: en.categories.addCategory,
              to: "/categories",
            }
          : blocked && reasonCode === "add-second-account"
            ? {
                label: en.shell.openAccounts,
                to: "/accounts",
              }
            : blocked && reasonCode === "add-compatible-setup"
              ? type === "expense"
                ? {
                    label: en.categories.addCategory,
                    to: "/categories",
                  }
                : {
                    label: en.shell.openAccounts,
                    to: "/accounts",
                  }
              : undefined;

  return (
    <BlockedActionGate blocked={blocked} reason={reason} suggestion={suggestion}>
      {quickButton}
    </BlockedActionGate>
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
  labelClassName,
}: {
  readonly children: React.ReactNode;
  readonly errors: readonly unknown[];
  readonly errorTestId?: string | undefined;
  readonly inputId: string;
  readonly label: ReactNode;
  readonly labelClassName?: string | undefined;
}) {
  const hasError = errors.length > 0;

  return (
    <Field data-invalid={hasError}>
      <FieldLabel className={labelClassName} htmlFor={inputId}>
        {label}
      </FieldLabel>
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

function CompactChoiceGroup({
  idPrefix,
  onValueChange,
  options,
  testId,
  value,
}: {
  readonly idPrefix: string;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly {
    readonly label: ReactNode;
    readonly value: string;
  }[];
  readonly testId?: string;
  readonly value: string;
}) {
  return (
    <RadioGroup
      className="grid grid-cols-2 gap-1.5"
      data-testid={testId}
      onValueChange={onValueChange}
      value={value ?? undefined}
    >
      {options.map((option) => {
        const id = `${idPrefix}-${option.value}`;
        return (
          <Label
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-[0.8125rem] leading-none transition-colors hover:bg-accent/40"
            htmlFor={id}
            key={option.value}
          >
            <RadioGroupItem className="size-3.5" id={id} value={option.value} />
            <span className="min-w-0 truncate">{option.label}</span>
          </Label>
        );
      })}
    </RadioGroup>
  );
}

const AmountInput = forwardRef<HTMLInputElement, ComponentProps<typeof Input>>(
  ({ className, ...props }, ref) => {
    return (
      <div className="relative rounded-[1.15rem] border border-border/80 bg-muted/20 p-[1px] shadow-sm">
        <Input
          className={cn(
            "h-16 w-full rounded-[1.1rem] border-0 bg-background px-4 text-center text-3xl font-semibold tracking-tight text-foreground transition-all focus-visible:h-16 focus-visible:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary/40",
            "appearance-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
            "md:text-[2.125rem]",
            className,
          )}
          {...props}
          ref={ref}
        />
      </div>
    );
  },
);

AmountInput.displayName = "AmountInput";

function renderCategoryChoiceLabel(input: {
  readonly category: {
    readonly color?: string | null;
    readonly icon?: string | null;
    readonly name: string;
    readonly parentId?: string | null;
  };
  readonly categoryNameById: ReadonlyMap<string, string>;
}): ReactNode {
  const { category, categoryNameById } = input;
  const parentName = category.parentId ? (categoryNameById.get(category.parentId) ?? null) : null;
  return CategoryToken({
    color: category.color,
    icon: category.icon,
    name: category.name,
    parentName,
  });
}
