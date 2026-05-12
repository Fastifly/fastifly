import type { SimpleTransactionType, TransactionQuickAddReason } from "../finance/transaction-form";
import { en } from "../i18n/en";

export function mapQuickAddReasonToMessage(reason: TransactionQuickAddReason): string {
  switch (reason) {
    case "ledger-required":
      return en.transactions.ledgerRequired;
    case "add-account":
      return en.transactions.prerequisites.addAccount;
    case "add-category":
      return en.transactions.prerequisites.addCategory;
    case "add-second-account":
      return en.transactions.prerequisites.addSecondAccount;
    case "add-compatible-setup":
      return en.transactions.prerequisites.addCompatibleSetup;
    case "categories-loading":
      return en.transactions.prerequisites.loadingCategories;
    case "ok":
      return "";
  }
}

export function mapQuickAddReasonToMessageForType({
  reason,
  type,
}: {
  readonly reason: TransactionQuickAddReason;
  readonly type: SimpleTransactionType;
}): string {
  switch (reason) {
    case "ledger-required":
      return en.transactions.ledgerRequired;
    case "add-account":
      return en.transactions.prerequisites.addAccount;
    case "add-category":
      return en.transactions.prerequisites.addCategory;
    case "add-second-account":
      return en.transactions.prerequisites.addSecondAccount;
    case "add-compatible-setup":
      return type === "expense"
        ? en.transactions.prerequisites.addCompatibleSetupExpense
        : type === "income"
          ? en.transactions.prerequisites.addCompatibleSetupIncome
          : en.transactions.prerequisites.addCompatibleSetupTransfer;
    case "categories-loading":
      return en.transactions.prerequisites.loadingCategories;
    case "ok":
      return "";
  }
}

export function getQuickAddSuggestion(
  reason: TransactionQuickAddReason,
): { label: string; to: "/accounts" | "/categories" } | undefined {
  if (reason === "add-category") {
    return { label: en.categories.addCategory, to: "/categories" };
  }
  if (reason === "ok") {
    return undefined;
  }

  return { label: en.shell.openAccounts, to: "/accounts" };
}
