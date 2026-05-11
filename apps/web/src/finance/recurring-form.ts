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

export type RecurringCreateDefaults = Partial<
  Pick<
    RecurringFormValues,
    "cadence" | "destinationAccountId" | "nextRunOn" | "sourceAccountId" | "type"
  >
>;

export type RecurringFormIssueCode =
  | "amount-invalid"
  | "amount-required"
  | "amount-too-low"
  | "destination-account-invalid"
  | "destination-account-required"
  | "next-run-on-invalid"
  | "next-run-on-must-be-future"
  | "no-compatible-destination-account"
  | "no-compatible-source-account"
  | "source-account-required"
  | "title-or-description-required";

export type RecurringFormIssue = {
  readonly code: RecurringFormIssueCode;
  readonly field:
    | "amount"
    | "destinationAccountId"
    | "nextRunOn"
    | "sourceAccountId"
    | "title"
    | "type";
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
  const issue = getRecurringFormIssues(values, accounts)[0];
  if (issue) {
    throw new Error(formatRecurringFormIssue(issue.code));
  }

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

export function getRecurringFormIssues(
  values: RecurringFormValues,
  accounts: readonly AccountWithBalanceResponse[],
): readonly RecurringFormIssue[] {
  const issues: RecurringFormIssue[] = [];
  const sourceOptions = getSourceAccountsForRecurring(accounts, values.type);
  if (sourceOptions.length === 0) {
    issues.push({ code: "no-compatible-source-account", field: "type" });
  }

  const sourceAccount = sourceOptions.find((account) => account.id === values.sourceAccountId);
  if (!values.sourceAccountId || !sourceAccount) {
    issues.push({ code: "source-account-required", field: "sourceAccountId" });
  }

  const destinationOptions = sourceAccount
    ? getDestinationAccountsForRecurring(accounts, sourceAccount.id, values.type)
    : [];
  if (sourceAccount && destinationOptions.length === 0) {
    issues.push({
      code: "no-compatible-destination-account",
      field: "destinationAccountId",
    });
  }

  const destinationAccount = destinationOptions.find(
    (account) => account.id === values.destinationAccountId,
  );
  if (!values.destinationAccountId) {
    issues.push({ code: "destination-account-required", field: "destinationAccountId" });
  } else if (!destinationAccount) {
    issues.push({ code: "destination-account-invalid", field: "destinationAccountId" });
  }

  const amount = values.amount.trim();
  if (!amount) {
    issues.push({ code: "amount-required", field: "amount" });
  } else {
    try {
      const amountMinor = parseDecimalMoneyToMinor(amount);
      if (BigInt(amountMinor) <= 0n) {
        issues.push({ code: "amount-too-low", field: "amount" });
      }
    } catch {
      issues.push({ code: "amount-invalid", field: "amount" });
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.nextRunOn.trim())) {
    issues.push({ code: "next-run-on-invalid", field: "nextRunOn" });
  } else if (!isFutureDateInput(values.nextRunOn.trim())) {
    issues.push({ code: "next-run-on-must-be-future", field: "nextRunOn" });
  }

  const title = values.title.trim();
  const description = values.description.trim();
  if (!title && !description) {
    issues.push({
      code: "title-or-description-required",
      field: "title",
    });
  }

  return issues;
}

export function makeRecurringFormDefaults(
  accounts: readonly AccountWithBalanceResponse[],
  type: SimpleTransactionType = "expense",
  createDefaults: RecurringCreateDefaults = {},
): RecurringFormValues {
  const resolvedType = createDefaults.type ?? type;
  const sourceOptions = getSourceAccountsForRecurring(accounts, resolvedType);
  const sourceAccount =
    (createDefaults.sourceAccountId
      ? sourceOptions.find((account) => account.id === createDefaults.sourceAccountId)
      : null) ?? sourceOptions[0];
  const destinationOptions = sourceAccount
    ? getDestinationAccountsForRecurring(accounts, sourceAccount.id, resolvedType)
    : undefined;
  const destinationAccount =
    (createDefaults.destinationAccountId
      ? destinationOptions?.find((account) => account.id === createDefaults.destinationAccountId)
      : null) ?? destinationOptions?.[0];

  const nextRunOn =
    createDefaults.nextRunOn &&
    /^\d{4}-\d{2}-\d{2}$/.test(createDefaults.nextRunOn) &&
    isFutureDateInput(createDefaults.nextRunOn)
      ? createDefaults.nextRunOn
      : getMinimumFutureDateInput();

  return {
    amount: "",
    cadence: createDefaults.cadence ?? "monthly",
    description: "",
    destinationAccountId: destinationAccount?.id ?? "",
    nextRunOn,
    sourceAccountId: sourceAccount?.id ?? "",
    title: "",
    type: resolvedType,
  };
}

export function makeRecurringFormValuesFromTemplate(
  template: RecurringTemplateResponse,
): RecurringFormValues {
  return {
    amount: formatMinorToDecimalInput(template.payload.lines[0]?.amountMinor ?? "0"),
    cadence: template.cadence,
    description: template.payload.description,
    destinationAccountId: template.payload.lines[0]?.destinationAccountId ?? "",
    nextRunOn: template.nextRunAt.slice(0, 10),
    sourceAccountId: template.payload.sourceAccountId,
    title: template.payload.title ?? "",
    type: template.payload.type,
  };
}

export function getMinimumFutureDateInput(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return formatLocalDateInput(tomorrow);
}

function makeOccurredAt(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Next run date is required.");
  }

  return new Date(`${value}T12:00:00.000Z`).toISOString();
}

function formatRecurringFormIssue(code: RecurringFormIssueCode): string {
  switch (code) {
    case "amount-required":
      return "Amount is required.";
    case "amount-invalid":
      return "Use a valid amount with up to 2 decimal places.";
    case "amount-too-low":
      return "Amount must be greater than zero.";
    case "source-account-required":
      return "Choose a source account.";
    case "destination-account-required":
      return "Choose a destination account.";
    case "destination-account-invalid":
      return "Choose accounts that match this subscription type.";
    case "next-run-on-invalid":
      return "Choose a valid next date.";
    case "next-run-on-must-be-future":
      return "Choose a future start date.";
    case "title-or-description-required":
      return "Add a name or note for this subscription.";
    case "no-compatible-source-account":
      return "No matching source account exists for this subscription type.";
    case "no-compatible-destination-account":
      return "No matching destination account exists for this source account and type.";
    default:
      return "Subscription details are incomplete.";
  }
}

function formatMinorToDecimalInput(amountMinor: string): string {
  const value = BigInt(amountMinor);
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${sign}${whole.toString()}.${fraction}`;
}

function isFutureDateInput(value: string): boolean {
  return value > formatLocalDateInput(new Date());
}

function formatLocalDateInput(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
