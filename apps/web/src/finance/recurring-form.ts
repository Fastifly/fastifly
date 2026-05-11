import type { AccountWithBalanceResponse, RecurringTemplateResponse } from "@fastifly/common";
import { parseDecimalMoneyToMinor } from "@fastifly/common";

import {
  getDestinationAccountsForTransaction,
  getSourceAccountsForTransaction,
  type SimpleTransactionType,
} from "./transaction-form";

export type RecurringFormValues = {
  readonly amount: string;
  readonly cadence: RecurringTemplateResponse["cadence"];
  readonly description: string;
  readonly destinationAccountId: string;
  readonly nextRunOn: string;
  readonly sourceAccountId: string;
  readonly title: string;
  readonly type: SimpleTransactionType;
};

type CreateRecurringTemplateInput = {
  readonly cadence: RecurringTemplateResponse["cadence"];
  readonly intervalCount: number;
  readonly nextRunAt: string;
  readonly payload: RecurringTemplateResponse["payload"];
  readonly status: RecurringTemplateResponse["status"];
};

export function getSourceAccountsForRecurring(
  accounts: readonly AccountWithBalanceResponse[],
  type: SimpleTransactionType,
): readonly AccountWithBalanceResponse[] {
  return getSourceAccountsForTransaction(accounts, type);
}

export function getDestinationAccountsForRecurring(
  accounts: readonly AccountWithBalanceResponse[],
  sourceAccountId: string,
  type: SimpleTransactionType,
): readonly AccountWithBalanceResponse[] {
  return getDestinationAccountsForTransaction(accounts, sourceAccountId, type);
}

export function buildCreateRecurringTemplateRequest(
  values: RecurringFormValues,
  accounts: readonly AccountWithBalanceResponse[],
): CreateRecurringTemplateInput {
  const sourceAccount = accounts.find((account) => account.id === values.sourceAccountId);
  const destinationAccount = accounts.find((account) => account.id === values.destinationAccountId);

  if (!sourceAccount || !destinationAccount) {
    throw new Error("Choose valid accounts for this subscription.");
  }

  const validDestinations = getDestinationAccountsForRecurring(
    accounts,
    sourceAccount.id,
    values.type,
  );
  if (!validDestinations.some((account) => account.id === destinationAccount.id)) {
    throw new Error("Choose accounts that match the subscription type.");
  }

  const amountMinor = parseDecimalMoneyToMinor(values.amount);
  if (BigInt(amountMinor) <= 0n) {
    throw new Error("Amount must be greater than zero.");
  }

  const title = values.title.trim();
  const description = values.description.trim();
  if (!title && !description) {
    throw new Error("Add a name or description for this subscription.");
  }

  const resolvedTitle = title || description;
  const resolvedDescription = description || title;
  if (!resolvedTitle || !resolvedDescription) {
    throw new Error("Add a valid subscription name and description.");
  }

  return {
    cadence: values.cadence,
    intervalCount: 1,
    nextRunAt: makeOccurredAt(values.nextRunOn),
    payload: {
      currencyCode: sourceAccount.currencyCode,
      description: resolvedDescription,
      lines: [
        {
          amountMinor,
          budgetId: null,
          categoryId: null,
          description: resolvedDescription,
          destinationAccountId: destinationAccount.id,
          reportingAmountMinor: null,
          reportingCurrencyCode: null,
        },
      ],
      sourceAccountId: sourceAccount.id,
      title: resolvedTitle,
      type: values.type,
    },
    status: "active",
  };
}

export function makeRecurringFormDefaults(
  accounts: readonly AccountWithBalanceResponse[],
  type: SimpleTransactionType = "expense",
): RecurringFormValues {
  const sourceAccount = getSourceAccountsForRecurring(accounts, type)[0];
  const destinationAccount = sourceAccount
    ? getDestinationAccountsForRecurring(accounts, sourceAccount.id, type)[0]
    : undefined;

  return {
    amount: "",
    cadence: "monthly",
    description: "",
    destinationAccountId: destinationAccount?.id ?? "",
    nextRunOn: new Date().toISOString().slice(0, 10),
    sourceAccountId: sourceAccount?.id ?? "",
    title: "",
    type,
  };
}

function makeOccurredAt(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Next run date is required.");
  }

  return new Date(`${value}T12:00:00.000Z`).toISOString();
}
