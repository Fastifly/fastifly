import type { AccountWithBalanceResponse, CreateTransactionRequest } from "@fastifly/common";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusCircle } from "lucide-react";
import { useState } from "react";
import { apiClient, FastiflyApiError } from "../api/client";
import {
  buildCreateTransactionRequest,
  getDestinationAccountsForTransaction,
  getSourceAccountsForTransaction,
  makeTransactionFormDefaults,
  type SimpleTransactionType,
} from "../finance/transaction-form";
import { en } from "../i18n/en";

type TransactionCreatePanelProps = {
  readonly accounts: readonly AccountWithBalanceResponse[];
  readonly ledgerContext: {
    readonly ledgerId: string;
    readonly workspaceId: string;
  } | null;
};

export function TransactionCreatePanel({ accounts, ledgerContext }: TransactionCreatePanelProps) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
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
      setSuccessMessage(en.transactions.createSuccess);
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
    defaultValues: makeTransactionFormDefaults(accounts),
    onSubmit: async ({ value }) => {
      setFormError(null);
      setSuccessMessage(null);
      try {
        await mutation.mutateAsync(buildCreateTransactionRequest(value, accounts));
        form.reset(makeTransactionFormDefaults(accounts));
      } catch (error) {
        setFormError(getTransactionFormError(error));
      }
    },
  });
  const canCreate = Boolean(ledgerContext) && accounts.length > 0;

  return (
    <section className="ff-glass-panel p-4 md:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[17px]">{en.transactions.addTransaction}</h2>
          <p className="mt-1 max-w-2xl text-[14px] text-slate-600 dark:text-white/62">
            {en.transactions.addTransactionBody}
          </p>
        </div>
        <div className="ff-metric-icon text-emerald-700 dark:text-emerald-200">
          <PlusCircle className="size-4" aria-hidden="true" />
        </div>
      </div>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <form.Field name="type">
          {(field) => (
            <fieldset>
              <legend className="ff-field-label">{en.transactions.type}</legend>
              <div className="ff-segmented">
                {(["expense", "income", "transfer"] as const).map((type) => (
                  <button
                    aria-pressed={field.state.value === type}
                    className="ff-segmented-button"
                    key={type}
                    onClick={() => {
                      const sourceAccount = getSourceAccountsForTransaction(accounts, type)[0];
                      const destinationAccount = sourceAccount
                        ? getDestinationAccountsForTransaction(accounts, sourceAccount.id, type)[0]
                        : undefined;
                      field.handleChange(type);
                      form.setFieldValue("sourceAccountId", sourceAccount?.id ?? "");
                      form.setFieldValue("destinationAccountId", destinationAccount?.id ?? "");
                    }}
                    type="button"
                  >
                    {en.transactions.types[type]}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
        </form.Field>

        <form.Subscribe selector={(state) => state.values}>
          {(values) => {
            const sourceAccounts = getSourceAccountsForTransaction(accounts, values.type);
            const destinationAccounts = getDestinationAccountsForTransaction(
              accounts,
              values.sourceAccountId,
              values.type,
            );

            return (
              <div className="ff-form-grid">
                <form.Field
                  name="amount"
                  validators={{
                    onChange: ({ value }) =>
                      value.trim() ? undefined : en.transactions.amountRequired,
                  }}
                >
                  {(field) => (
                    <label className="ff-field">
                      <span className="ff-field-label">{en.transactions.amount}</span>
                      <input
                        className="ff-form-input"
                        inputMode="decimal"
                        name={field.name}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        placeholder="1250.00"
                        value={field.state.value}
                      />
                      <FieldError errors={field.state.meta.errors} />
                    </label>
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
                    <label className="ff-field">
                      <span className="ff-field-label">{en.transactions.date}</span>
                      <input
                        className="ff-form-input"
                        name={field.name}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        type="date"
                        value={field.state.value}
                      />
                      <FieldError errors={field.state.meta.errors} />
                    </label>
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
                    <label className="ff-field">
                      <span className="ff-field-label">{sourceLabel(values.type)}</span>
                      <select
                        className="ff-form-input"
                        name={field.name}
                        onBlur={field.handleBlur}
                        onChange={(event) => {
                          const sourceAccountId = event.target.value;
                          const destinationAccount = getDestinationAccountsForTransaction(
                            accounts,
                            sourceAccountId,
                            values.type,
                          )[0];
                          field.handleChange(sourceAccountId);
                          form.setFieldValue("destinationAccountId", destinationAccount?.id ?? "");
                        }}
                        value={field.state.value}
                      >
                        <option value="">{en.transactions.chooseAccount}</option>
                        {sourceAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                      <FieldError errors={field.state.meta.errors} />
                    </label>
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
                    <label className="ff-field">
                      <span className="ff-field-label">{destinationLabel(values.type)}</span>
                      <select
                        className="ff-form-input"
                        name={field.name}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        value={field.state.value}
                      >
                        <option value="">{en.transactions.chooseAccount}</option>
                        {destinationAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                      <FieldError errors={field.state.meta.errors} />
                    </label>
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
            <label className="ff-field">
              <span className="ff-field-label">{en.transactions.description}</span>
              <input
                className="ff-form-input"
                name={field.name}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder={en.transactions.descriptionPlaceholder}
                value={field.state.value}
              />
              <FieldError errors={field.state.meta.errors} />
            </label>
          )}
        </form.Field>

        {formError ? <p className="ff-form-error">{formError}</p> : null}
        {successMessage ? <p className="ff-form-success">{successMessage}</p> : null}

        <button
          className="ff-auth-primary"
          disabled={!canCreate || mutation.isPending}
          type="submit"
        >
          {mutation.isPending ? en.transactions.saving : en.transactions.save}
        </button>
      </form>
    </section>
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

function FieldError({ errors }: { readonly errors: readonly unknown[] }) {
  const firstError = errors[0];

  if (!firstError) {
    return null;
  }

  return (
    <span className="mt-1 block text-red-700 text-xs dark:text-red-300">{String(firstError)}</span>
  );
}
