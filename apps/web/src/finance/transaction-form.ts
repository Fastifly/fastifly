import {
  type AccountWithBalanceResponse,
  type CreateTransactionRequest,
  isCompatibleAccountPair,
  parseDecimalMoneyToMinor,
} from "@fastifly/common";

export type SimpleTransactionType = CreateTransactionRequest["type"];

export type TransactionFormValues = {
  readonly amount: string;
  readonly description: string;
  readonly destinationAccountId: string;
  readonly occurredOn: string;
  readonly sourceAccountId: string;
  readonly type: SimpleTransactionType;
};

export function getSourceAccountsForTransaction(
  accounts: readonly AccountWithBalanceResponse[],
  type: SimpleTransactionType,
): readonly AccountWithBalanceResponse[] {
  return accounts.filter((account) => {
    if (type === "income") {
      return account.kind === "revenue";
    }

    return account.kind === "asset" || account.kind === "liability";
  });
}

export function getDestinationAccountsForTransaction(
  accounts: readonly AccountWithBalanceResponse[],
  sourceAccountId: string,
  type: SimpleTransactionType,
): readonly AccountWithBalanceResponse[] {
  const sourceAccount = accounts.find((account) => account.id === sourceAccountId);
  if (!sourceAccount) {
    return [];
  }

  return accounts.filter((account) => {
    if (account.id === sourceAccount.id) {
      return false;
    }
    if (type === "expense" && account.kind !== "expense") {
      return false;
    }
    if (type === "income" && !(account.kind === "asset" || account.kind === "liability")) {
      return false;
    }
    if (type === "transfer" && !(account.kind === "asset" || account.kind === "liability")) {
      return false;
    }
    if (account.currencyCode !== sourceAccount.currencyCode) {
      return false;
    }

    return isCompatibleAccountPair(sourceAccount, account);
  });
}

export function buildCreateTransactionRequest(
  values: TransactionFormValues,
  accounts: readonly AccountWithBalanceResponse[],
): CreateTransactionRequest {
  const sourceAccount = accounts.find((account) => account.id === values.sourceAccountId);
  const destinationAccount = accounts.find((account) => account.id === values.destinationAccountId);
  if (!sourceAccount || !destinationAccount) {
    throw new Error("Choose valid accounts for this transaction.");
  }
  if (sourceAccount.currencyCode !== destinationAccount.currencyCode) {
    throw new Error("Source and destination accounts must use the same currency.");
  }
  if (!isCompatibleAccountPair(sourceAccount, destinationAccount)) {
    throw new Error("Choose accounts that match the transaction type.");
  }

  const amountMinor = parseDecimalMoneyToMinor(values.amount);
  if (BigInt(amountMinor) <= 0n) {
    throw new Error("Amount must be greater than zero.");
  }

  const description = values.description.trim();
  if (!description) {
    throw new Error("Description is required.");
  }

  return {
    currencyCode: sourceAccount.currencyCode,
    description,
    occurredAt: makeOccurredAt(values.occurredOn),
    options: {
      recalculateBalances: true,
    },
    source: "manual",
    sourceAccountId: sourceAccount.id,
    status: "cleared",
    title: description,
    transactions: [
      {
        amountMinor,
        destinationAccountId: destinationAccount.id,
      },
    ],
    type: values.type,
  };
}

export function makeTransactionFormDefaults(
  accounts: readonly AccountWithBalanceResponse[],
): TransactionFormValues {
  const type: SimpleTransactionType = "expense";
  const sourceAccount = getSourceAccountsForTransaction(accounts, type)[0];
  const destinationAccount = sourceAccount
    ? getDestinationAccountsForTransaction(accounts, sourceAccount.id, type)[0]
    : undefined;

  return {
    amount: "",
    description: "",
    destinationAccountId: destinationAccount?.id ?? "",
    occurredOn: new Date().toISOString().slice(0, 10),
    sourceAccountId: sourceAccount?.id ?? "",
    type,
  };
}

function makeOccurredAt(occurredOn: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    throw new Error("Date is required.");
  }

  return new Date(`${occurredOn}T12:00:00.000Z`).toISOString();
}
