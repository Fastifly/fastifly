import type { AccountKind, AccountSubtype } from "../product-rules/accounts.js";

/**
 * Raw rows read from an Actual Budget export `db.sqlite`. Only the columns the
 * importer relies on are modeled. Numeric flags use Actual's 0/1 integer
 * convention; `null` is tolerated for forward/backward schema compatibility.
 */
export type ActualRawAccount = {
  readonly id: string;
  readonly name: string | null;
  readonly offbudget: number | null;
  readonly closed: number | null;
  readonly type: string | null;
  readonly tombstone: number | null;
};

export type ActualRawCategory = {
  readonly id: string;
  readonly name: string | null;
  readonly is_income: number | null;
  readonly cat_group: string | null;
  readonly tombstone: number | null;
};

export type ActualRawCategoryGroup = {
  readonly id: string;
  readonly name: string | null;
  readonly is_income: number | null;
  readonly tombstone: number | null;
};

export type ActualRawPayee = {
  readonly id: string;
  readonly name: string | null;
  readonly transfer_acct: string | null;
  readonly tombstone: number | null;
};

export type ActualRawPayeeMapping = {
  readonly id: string;
  readonly targetId: string;
};

export type ActualRawTransaction = {
  readonly id: string;
  readonly isParent: number | null;
  readonly isChild: number | null;
  readonly parent_id: string | null;
  readonly acct: string | null;
  readonly category: string | null;
  /** Integer minor units (2 decimal places), signed. Negative = outflow. */
  readonly amount: number | null;
  /** Payee id (Actual stores the payee FK in `description`). */
  readonly description: string | null;
  readonly notes: string | null;
  /** Integer `YYYYMMDD`, or a `YYYY-MM-DD` string in some exports. */
  readonly date: number | string | null;
  readonly transferred_id: string | null;
  readonly starting_balance_flag: number | null;
  readonly cleared: number | null;
  readonly reconciled: number | null;
  readonly tombstone: number | null;
};

/** The fully-parsed contents of an Actual Budget export, before mapping. */
export type ActualBudgetExport = {
  readonly budgetName: string | null;
  readonly accounts: readonly ActualRawAccount[];
  readonly categories: readonly ActualRawCategory[];
  readonly categoryGroups: readonly ActualRawCategoryGroup[];
  readonly payees: readonly ActualRawPayee[];
  readonly payeeMappings: readonly ActualRawPayeeMapping[];
  readonly transactions: readonly ActualRawTransaction[];
};

/** Sentinel actual ids for the fallback category / income source. */
export const ACTUAL_UNCATEGORIZED_EXPENSE_KEY = "__fastifly_uncategorized_expense__";
export const ACTUAL_IMPORTED_INCOME_KEY = "__fastifly_imported_income__";

export type PlannedAccount = {
  readonly actualId: string;
  readonly name: string;
  readonly kind: Extract<AccountKind, "asset" | "liability">;
  readonly subtype: AccountSubtype;
  /** Target-currency minor units as a signed decimal string, or null. */
  readonly openingBalanceMinor: string | null;
  /** `YYYY-MM-DD`, present iff `openingBalanceMinor` is present. */
  readonly openingBalanceDate: string | null;
  readonly closed: boolean;
};

export type PlannedExpenseCategory = {
  readonly actualId: string;
  readonly name: string;
};

export type PlannedIncomeSource = {
  readonly actualId: string;
  readonly name: string;
};

export type PlannedRefKind = "account" | "expense_category" | "income_source";

/** A symbolic reference resolved to a created Fastifly id at commit time. */
export type PlannedRef = {
  readonly kind: PlannedRefKind;
  readonly actualId: string;
};

export type PlannedTransactionLine = {
  /** `account` (transfers/income) or `expense_category` (expenses). */
  readonly destination: PlannedRef;
  /** Positive target-currency minor units as a decimal string. */
  readonly amountMinor: string;
  readonly description: string;
};

export type PlannedTransaction = {
  readonly type: "expense" | "income" | "transfer";
  /** `account` (expense/transfer) or `income_source` (income). */
  readonly source: PlannedRef;
  readonly currencyCode: string;
  readonly occurredAt: string;
  readonly title: string;
  readonly description: string;
  readonly status: "pending" | "cleared";
  readonly lines: readonly PlannedTransactionLine[];
};

export type ActualImportWarningCode =
  | "ZERO_AMOUNT_SKIPPED"
  | "TRANSFER_COUNTERPART_MISSING"
  | "ACCOUNT_MISSING"
  | "SPLIT_NOT_GROUPED"
  | "EMPTY_SPLIT_SKIPPED"
  | "INVALID_DATE_SKIPPED"
  | "AMOUNT_NOT_REPRESENTABLE";

export type ActualImportWarning = {
  readonly code: ActualImportWarningCode;
  readonly message: string;
  readonly actualTransactionId?: string;
};

export type ActualImportPlanSummary = {
  readonly accountCount: number;
  readonly expenseCategoryCount: number;
  readonly incomeSourceCount: number;
  readonly transactionCount: number;
  readonly transferCount: number;
  readonly splitCount: number;
  readonly skippedCount: number;
  readonly warningCount: number;
};

/**
 * A deterministic, JSON-serializable plan for importing an Actual budget into
 * one Fastifly ledger. Symbolic refs (`PlannedRef`) are resolved to created
 * Fastifly ids during commit.
 */
export type ActualImportPlan = {
  readonly budgetName: string | null;
  readonly targetCurrencyCode: string;
  readonly accounts: readonly PlannedAccount[];
  readonly expenseCategories: readonly PlannedExpenseCategory[];
  readonly incomeSources: readonly PlannedIncomeSource[];
  readonly transactions: readonly PlannedTransaction[];
  readonly warnings: readonly ActualImportWarning[];
  readonly summary: ActualImportPlanSummary;
};

export type BuildActualImportPlanInput = {
  readonly export: ActualBudgetExport;
  readonly targetCurrencyCode: string;
  /** Minor-unit exponent of the target currency (e.g. 2 for USD, 0 for JPY). */
  readonly targetCurrencyMinorUnits: number;
};
