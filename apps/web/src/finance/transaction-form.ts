import {
  type AccountWithBalanceResponse,
  type CategoryResponse,
  type CreateTransactionRequest,
  isCompatibleAccountPair,
  parseDecimalMoneyToMinor,
} from "@fastifly/common";

export type SimpleTransactionType = CreateTransactionRequest["type"];

export type TransactionFormValues = {
  readonly amount: string;
  readonly categoryId: string;
  readonly description: string;
  readonly destinationAccountId: string;
  readonly occurredOn: string;
  readonly sourceAccountId: string;
  readonly type: SimpleTransactionType;
};

export type TransactionQuickAddReason =
  | "ok"
  | "ledger-required"
  | "add-account"
  | "add-category"
  | "add-second-account"
  | "add-compatible-setup"
  | "categories-loading";

export type TransactionQuickAddState = {
  readonly availability: {
    readonly expense: boolean;
    readonly income: boolean;
    readonly transfer: boolean;
  };
  readonly canCreateAny: boolean;
  readonly reason: TransactionQuickAddReason;
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

export function getExpenseCategoriesForTransaction(
  categories: readonly CategoryResponse[],
  accounts: readonly AccountWithBalanceResponse[],
  sourceAccountId: string,
): readonly CategoryResponse[] {
  const sourceAccount = accounts.find((account) => account.id === sourceAccountId);
  if (!sourceAccount) {
    return [];
  }

  const accountById = new Map(accounts.map((account) => [account.id, account] as const));
  return categories.filter((category) => {
    if (!category.counterpartyAccountId) {
      return false;
    }
    const destinationAccount = accountById.get(category.counterpartyAccountId);
    if (!destinationAccount?.isActive) {
      return false;
    }
    if (destinationAccount.currencyCode !== sourceAccount.currencyCode) {
      return false;
    }

    return isCompatibleAccountPair(sourceAccount, destinationAccount);
  });
}

export function buildCreateTransactionRequest(
  values: TransactionFormValues,
  accounts: readonly AccountWithBalanceResponse[],
  categories: readonly CategoryResponse[],
): CreateTransactionRequest {
  const sourceAccount = accounts.find((account) => account.id === values.sourceAccountId);
  if (!sourceAccount) {
    throw new Error("Choose valid accounts for this transaction.");
  }

  let destinationAccount: AccountWithBalanceResponse | undefined;
  let categoryId: string | null = null;

  if (values.type === "expense") {
    const category = categories.find((item) => item.id === values.categoryId);
    if (!category?.counterpartyAccountId) {
      throw new Error("Choose a valid category for this expense.");
    }
    destinationAccount = accounts.find((account) => account.id === category.counterpartyAccountId);
    if (!destinationAccount) {
      throw new Error("Category account mapping is missing.");
    }
    categoryId = category.id;
  } else {
    destinationAccount = accounts.find((account) => account.id === values.destinationAccountId);
  }

  if (!destinationAccount) {
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
        ...(categoryId ? { categoryId } : {}),
        destinationAccountId: destinationAccount.id,
      },
    ],
    type: values.type,
  };
}

export function getTransactionQuickAddState({
  accounts,
  categories,
  categoriesLoading,
  hasLedgerContext,
}: {
  readonly accounts: readonly AccountWithBalanceResponse[];
  readonly categories: readonly CategoryResponse[];
  readonly categoriesLoading: boolean;
  readonly hasLedgerContext: boolean;
}): TransactionQuickAddState {
  if (!hasLedgerContext) {
    return {
      availability: {
        expense: false,
        income: false,
        transfer: false,
      },
      canCreateAny: false,
      reason: "ledger-required",
    };
  }

  const expenseSources = getSourceAccountsForTransaction(accounts, "expense");
  const incomeSources = getSourceAccountsForTransaction(accounts, "income");
  const transferSources = getSourceAccountsForTransaction(accounts, "transfer");
  const hasAnyExpenseCategoryOption = expenseSources.some(
    (sourceAccount) =>
      getExpenseCategoriesForTransaction(categories, accounts, sourceAccount.id).length > 0,
  );

  const expenseReady = !categoriesLoading && hasAnyExpenseCategoryOption;
  const incomeReady = incomeSources.some(
    (sourceAccount) =>
      getDestinationAccountsForTransaction(accounts, sourceAccount.id, "income").length > 0,
  );
  const transferReady = transferSources.some(
    (sourceAccount) =>
      getDestinationAccountsForTransaction(accounts, sourceAccount.id, "transfer").length > 0,
  );

  const canCreateAny = expenseReady || incomeReady || transferReady;
  if (canCreateAny) {
    return {
      availability: {
        expense: expenseReady,
        income: incomeReady,
        transfer: transferReady,
      },
      canCreateAny: true,
      reason: "ok",
    };
  }

  const assetOrLiabilityAccounts = accounts.filter(
    (account) => account.kind === "asset" || account.kind === "liability",
  );

  let reason: TransactionQuickAddReason = "add-compatible-setup";
  if (categoriesLoading && expenseSources.length > 0) {
    reason = "categories-loading";
  } else if (assetOrLiabilityAccounts.length === 0) {
    reason = "add-account";
  } else if (expenseSources.length > 0 && categories.length === 0) {
    reason = "add-category";
  } else if (expenseSources.length > 0 && categories.length > 0 && !hasAnyExpenseCategoryOption) {
    reason = "add-compatible-setup";
  } else if (assetOrLiabilityAccounts.length < 2) {
    reason = "add-second-account";
  }

  return {
    availability: {
      expense: false,
      income: false,
      transfer: false,
    },
    canCreateAny: false,
    reason,
  };
}

export function makeTransactionFormDefaults(
  accounts: readonly AccountWithBalanceResponse[],
  categories: readonly CategoryResponse[],
  type: SimpleTransactionType = "expense",
): TransactionFormValues {
  const sourceAccount = getSourceAccountsForTransaction(accounts, type)[0];
  const expenseCategory =
    sourceAccount && type === "expense"
      ? getExpenseCategoriesForTransaction(categories, accounts, sourceAccount.id)[0]
      : undefined;
  const destinationAccount =
    sourceAccount && type !== "expense"
      ? getDestinationAccountsForTransaction(accounts, sourceAccount.id, type)[0]
      : undefined;

  return {
    amount: "",
    categoryId: expenseCategory?.id ?? "",
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
