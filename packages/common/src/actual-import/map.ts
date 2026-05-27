import type { AccountKind, AccountSubtype } from "../product-rules/accounts.js";
import { actualDateToIsoDate, convertActualAmountMinor, isoDateToOccurredAt } from "./convert.js";
import {
  ACTUAL_IMPORTED_INCOME_KEY,
  ACTUAL_UNCATEGORIZED_EXPENSE_KEY,
  type ActualBudgetExport,
  type ActualImportPlan,
  type ActualImportWarning,
  type ActualImportWarningCode,
  type ActualRawCategory,
  type ActualRawPayee,
  type ActualRawTransaction,
  type BuildActualImportPlanInput,
  type PlannedAccount,
  type PlannedExpenseCategory,
  type PlannedIncomeSource,
  type PlannedRef,
  type PlannedTransaction,
  type PlannedTransactionLine,
} from "./types.js";

const UNCATEGORIZED_EXPENSE_NAME = "Imported Uncategorized";
const IMPORTED_INCOME_NAME = "Imported Income";
const DEFAULT_TRANSACTION_DESCRIPTION = "Imported transaction";
const MAX_DESCRIPTION_LENGTH = 500;

/**
 * Deterministically map a parsed Actual Budget export into a Fastifly import
 * plan. Pure: no I/O, no randomness. Every dropped row produces a structured
 * warning so the importer never silently corrupts the ledger.
 */
export function buildActualImportPlan(input: BuildActualImportPlanInput): ActualImportPlan {
  const builder = new PlanBuilder(input);
  return builder.build();
}

class PlanBuilder {
  private readonly ex: ActualBudgetExport;
  private readonly currencyCode: string;
  private readonly minorUnits: number;

  private readonly accountById = new Map<string, ActualBudgetExport["accounts"][number]>();
  private readonly categoryById = new Map<string, ActualRawCategory>();
  private readonly groupIsIncome = new Map<string, boolean>();
  private readonly payeeById = new Map<string, ActualRawPayee>();
  private readonly payeeMappingTargets = new Map<string, string>();
  private readonly txById = new Map<string, ActualRawTransaction>();

  private readonly consumed = new Set<string>();
  private readonly openingByAccount = new Map<string, { amount: bigint; date: string }>();

  private readonly transactions: PlannedTransaction[] = [];
  private readonly warnings: ActualImportWarning[] = [];
  private skippedCount = 0;
  private usedUncategorizedExpense = false;
  private usedImportedIncome = false;

  constructor(input: BuildActualImportPlanInput) {
    this.ex = input.export;
    this.currencyCode = input.targetCurrencyCode;
    this.minorUnits = input.targetCurrencyMinorUnits;

    for (const account of this.ex.accounts) {
      if (!toBool(account.tombstone)) {
        this.accountById.set(account.id, account);
      }
    }
    for (const group of this.ex.categoryGroups) {
      if (!toBool(group.tombstone)) {
        this.groupIsIncome.set(group.id, toBool(group.is_income));
      }
    }
    for (const category of this.ex.categories) {
      if (!toBool(category.tombstone)) {
        this.categoryById.set(category.id, category);
      }
    }
    for (const payee of this.ex.payees) {
      if (!toBool(payee.tombstone)) {
        this.payeeById.set(payee.id, payee);
      }
    }
    for (const mapping of this.ex.payeeMappings) {
      this.payeeMappingTargets.set(mapping.id, mapping.targetId);
    }
    for (const transaction of this.ex.transactions) {
      if (!toBool(transaction.tombstone)) {
        this.txById.set(transaction.id, transaction);
      }
    }
  }

  build(): ActualImportPlan {
    this.collectOpeningBalances();
    this.planTransfers();
    this.planSplits();
    this.planStandalones();

    const accounts = this.buildAccounts();
    const expenseCategories = this.buildExpenseCategories();
    const incomeSources = this.buildIncomeSources();

    const transferCount = this.transactions.filter((t) => t.type === "transfer").length;
    const splitCount = this.transactions.filter((t) => t.lines.length > 1).length;

    return {
      accounts,
      budgetName: this.ex.budgetName,
      expenseCategories,
      incomeSources,
      summary: {
        accountCount: accounts.length,
        expenseCategoryCount: expenseCategories.length,
        incomeSourceCount: incomeSources.length,
        skippedCount: this.skippedCount,
        splitCount,
        transactionCount: this.transactions.length,
        transferCount,
        warningCount: this.warnings.length,
      },
      targetCurrencyCode: this.currencyCode,
      transactions: this.transactions,
      warnings: this.warnings,
    };
  }

  private aliveTransactions(): readonly ActualRawTransaction[] {
    return [...this.txById.values()];
  }

  private collectOpeningBalances(): void {
    for (const transaction of this.aliveTransactions()) {
      if (!toBool(transaction.starting_balance_flag) || toBool(transaction.isChild)) {
        continue;
      }
      const accountId = transaction.acct;
      if (!accountId || !this.accountById.has(accountId)) {
        continue;
      }
      const amount = convertActualAmountMinor(transaction.amount ?? 0, this.minorUnits);
      const isoDate = actualDateToIsoDate(transaction.date);
      if (amount === null || isoDate === null) {
        // Cannot represent natively as an opening balance; let it fall through
        // to the standalone pass so the money is still captured.
        continue;
      }
      this.consumed.add(transaction.id);
      const existing = this.openingByAccount.get(accountId);
      const nextAmount = (existing?.amount ?? 0n) + amount;
      const nextDate = existing && existing.date < isoDate ? existing.date : isoDate;
      this.openingByAccount.set(accountId, { amount: nextAmount, date: nextDate });
    }
  }

  private planTransfers(): void {
    for (const transaction of this.aliveTransactions()) {
      if (this.consumed.has(transaction.id) || !transaction.transferred_id) {
        continue;
      }
      const counterpart = this.txById.get(transaction.transferred_id);
      const mutual = Boolean(counterpart) && counterpart?.transferred_id === transaction.id;

      if (!counterpart || !mutual || this.consumed.has(counterpart.id)) {
        // Counterpart is missing, not mutually linked, or was already consumed
        // (e.g. as an opening balance). Import this leg single-sided rather than
        // dropping it, so no money is silently lost.
        this.consumed.add(transaction.id);
        this.addWarning(
          "TRANSFER_COUNTERPART_MISSING",
          "Transfer counterpart was unavailable; imported as a single-sided transaction.",
          transaction.id,
        );
        this.pushStandalone(transaction);
        continue;
      }

      this.consumed.add(transaction.id);
      this.consumed.add(counterpart.id);
      this.planTransferPair(transaction, counterpart);
    }
  }

  private planTransferPair(a: ActualRawTransaction, b: ActualRawTransaction): void {
    const aAmount = convertActualAmountMinor(a.amount ?? 0, this.minorUnits);
    const bAmount = convertActualAmountMinor(b.amount ?? 0, this.minorUnits);
    const aAccount = a.acct;
    const bAccount = b.acct;

    if (
      aAmount === null ||
      bAmount === null ||
      !aAccount ||
      !bAccount ||
      !this.accountById.has(aAccount) ||
      !this.accountById.has(bAccount) ||
      aAccount === bAccount
    ) {
      // Degrade: import each leg independently rather than drop the money.
      this.pushStandalone(a);
      this.pushStandalone(b);
      return;
    }

    // A well-formed transfer has exactly one outflow (negative) leg and one
    // inflow (positive) leg. If the legs are the same sign, this is not a clean
    // transfer; import each leg independently rather than guess a direction.
    let source: ActualRawTransaction;
    let destination: ActualRawTransaction;
    let amount: bigint;
    if (aAmount < 0n && bAmount >= 0n) {
      source = a;
      destination = b;
      amount = -aAmount;
    } else if (bAmount < 0n && aAmount >= 0n) {
      source = b;
      destination = a;
      amount = -bAmount;
    } else {
      this.addWarning(
        "TRANSFER_COUNTERPART_MISSING",
        "Transfer legs were not opposite-signed; imported as single-sided transactions.",
        a.id,
      );
      this.pushStandalone(a);
      this.pushStandalone(b);
      return;
    }

    if (amount === 0n) {
      this.skip("ZERO_AMOUNT_SKIPPED", "Transfer had a zero amount.", a.id);
      return;
    }

    const isoDate = actualDateToIsoDate(source.date) ?? actualDateToIsoDate(destination.date);
    if (isoDate === null) {
      this.skip("INVALID_DATE_SKIPPED", "Transfer had an invalid date.", a.id);
      return;
    }

    const description = this.describe(source) ?? "Transfer";
    this.transactions.push({
      currencyCode: this.currencyCode,
      description,
      lines: [
        {
          amountMinor: amount.toString(),
          description,
          destination: { actualId: destination.acct as string, kind: "account" },
        },
      ],
      occurredAt: isoDateToOccurredAt(isoDate),
      source: { actualId: source.acct as string, kind: "account" },
      status: clearedStatus(source),
      title: description,
      type: "transfer",
    });
  }

  private planSplits(): void {
    const childrenByParent = new Map<string, ActualRawTransaction[]>();
    for (const transaction of this.aliveTransactions()) {
      if (this.consumed.has(transaction.id) || !toBool(transaction.isChild)) {
        continue;
      }
      if (!transaction.parent_id) {
        continue;
      }
      const list = childrenByParent.get(transaction.parent_id) ?? [];
      list.push(transaction);
      childrenByParent.set(transaction.parent_id, list);
    }

    for (const parent of this.aliveTransactions()) {
      if (this.consumed.has(parent.id) || !toBool(parent.isParent)) {
        continue;
      }
      this.consumed.add(parent.id);

      const children = (childrenByParent.get(parent.id) ?? []).filter(
        (child) => !this.consumed.has(child.id),
      );
      for (const child of children) {
        this.consumed.add(child.id);
      }

      const representable: { child: ActualRawTransaction; amount: bigint }[] = [];
      for (const child of children) {
        const amount = convertActualAmountMinor(child.amount ?? 0, this.minorUnits);
        if (amount === null) {
          this.skip(
            "AMOUNT_NOT_REPRESENTABLE",
            "Split line amount was not representable.",
            child.id,
          );
          continue;
        }
        if (amount === 0n) {
          this.skip("ZERO_AMOUNT_SKIPPED", "Split line had a zero amount.", child.id);
          continue;
        }
        representable.push({ amount, child });
      }

      if (representable.length === 0) {
        this.addWarning("EMPTY_SPLIT_SKIPPED", "Split had no importable lines.", parent.id);
        continue;
      }

      const parentAccount = parent.acct;
      const parentDate = actualDateToIsoDate(parent.date);
      const groupable =
        Boolean(parentAccount) &&
        parentAccount !== null &&
        this.accountById.has(parentAccount) &&
        parentDate !== null &&
        representable.every((entry) => entry.amount < 0n);

      if (groupable && parentAccount && parentDate) {
        const description = this.describe(parent) ?? DEFAULT_TRANSACTION_DESCRIPTION;
        const lines: PlannedTransactionLine[] = representable.map((entry) => ({
          amountMinor: (-entry.amount).toString(),
          description: this.describe(entry.child) ?? description,
          destination: this.expenseDestination(entry.child),
        }));
        this.transactions.push({
          currencyCode: this.currencyCode,
          description,
          lines,
          occurredAt: isoDateToOccurredAt(parentDate),
          source: { actualId: parentAccount, kind: "account" },
          status: clearedStatus(parent),
          title: description,
          type: "expense",
        });
        continue;
      }

      if (representable.length > 1) {
        this.addWarning(
          "SPLIT_NOT_GROUPED",
          "Split lines were imported as individual transactions.",
          parent.id,
        );
      }
      for (const entry of representable) {
        this.pushStandaloneWithAmount(entry.child, entry.amount);
      }
    }
  }

  private planStandalones(): void {
    for (const transaction of this.aliveTransactions()) {
      if (this.consumed.has(transaction.id)) {
        continue;
      }
      this.consumed.add(transaction.id);
      this.pushStandalone(transaction);
    }
  }

  private pushStandalone(transaction: ActualRawTransaction): void {
    const amount = convertActualAmountMinor(transaction.amount ?? 0, this.minorUnits);
    if (amount === null) {
      this.skip(
        "AMOUNT_NOT_REPRESENTABLE",
        "Transaction amount was not representable in the target currency.",
        transaction.id,
      );
      return;
    }
    this.pushStandaloneWithAmount(transaction, amount);
  }

  private pushStandaloneWithAmount(transaction: ActualRawTransaction, amount: bigint): void {
    const accountId = transaction.acct;
    if (!accountId || !this.accountById.has(accountId)) {
      this.skip("ACCOUNT_MISSING", "Transaction referenced a missing account.", transaction.id);
      return;
    }
    const isoDate = actualDateToIsoDate(transaction.date);
    if (isoDate === null) {
      this.skip("INVALID_DATE_SKIPPED", "Transaction had an invalid date.", transaction.id);
      return;
    }
    if (amount === 0n) {
      this.skip("ZERO_AMOUNT_SKIPPED", "Transaction had a zero amount.", transaction.id);
      return;
    }

    const occurredAt = isoDateToOccurredAt(isoDate);
    const description = this.describe(transaction) ?? DEFAULT_TRANSACTION_DESCRIPTION;
    const status = clearedStatus(transaction);

    if (amount < 0n) {
      this.transactions.push({
        currencyCode: this.currencyCode,
        description,
        lines: [
          {
            amountMinor: (-amount).toString(),
            description,
            destination: this.expenseDestination(transaction),
          },
        ],
        occurredAt,
        source: { actualId: accountId, kind: "account" },
        status,
        title: description,
        type: "expense",
      });
      return;
    }

    this.transactions.push({
      currencyCode: this.currencyCode,
      description,
      lines: [
        {
          amountMinor: amount.toString(),
          description,
          destination: { actualId: accountId, kind: "account" },
        },
      ],
      occurredAt,
      source: this.incomeSource(transaction),
      status,
      title: description,
      type: "income",
    });
  }

  private expenseDestination(transaction: ActualRawTransaction): PlannedRef {
    const category = transaction.category ? this.categoryById.get(transaction.category) : undefined;
    if (category && !this.isIncomeCategory(category)) {
      return { actualId: category.id, kind: "expense_category" };
    }
    this.usedUncategorizedExpense = true;
    return { actualId: ACTUAL_UNCATEGORIZED_EXPENSE_KEY, kind: "expense_category" };
  }

  private incomeSource(transaction: ActualRawTransaction): PlannedRef {
    const category = transaction.category ? this.categoryById.get(transaction.category) : undefined;
    if (category && this.isIncomeCategory(category)) {
      return { actualId: category.id, kind: "income_source" };
    }
    this.usedImportedIncome = true;
    return { actualId: ACTUAL_IMPORTED_INCOME_KEY, kind: "income_source" };
  }

  private buildAccounts(): readonly PlannedAccount[] {
    return [...this.accountById.values()].map((account) => {
      const mapped = mapAccountKind(account.type);
      const opening = this.openingByAccount.get(account.id);
      const hasOpening = opening !== undefined && opening.amount !== 0n;
      return {
        actualId: account.id,
        closed: toBool(account.closed),
        kind: mapped.kind,
        name: nonEmpty(account.name) ?? "Imported account",
        openingBalanceDate: hasOpening ? opening.date : null,
        openingBalanceMinor: hasOpening ? opening.amount.toString() : null,
        subtype: mapped.subtype,
      };
    });
  }

  private buildExpenseCategories(): readonly PlannedExpenseCategory[] {
    const result: PlannedExpenseCategory[] = [];
    for (const category of this.categoryById.values()) {
      if (!this.isIncomeCategory(category)) {
        result.push({
          actualId: category.id,
          name: nonEmpty(category.name) ?? "Imported category",
        });
      }
    }
    if (this.usedUncategorizedExpense) {
      result.push({ actualId: ACTUAL_UNCATEGORIZED_EXPENSE_KEY, name: UNCATEGORIZED_EXPENSE_NAME });
    }
    return result;
  }

  private buildIncomeSources(): readonly PlannedIncomeSource[] {
    const result: PlannedIncomeSource[] = [];
    for (const category of this.categoryById.values()) {
      if (this.isIncomeCategory(category)) {
        result.push({ actualId: category.id, name: nonEmpty(category.name) ?? "Imported income" });
      }
    }
    if (this.usedImportedIncome) {
      result.push({ actualId: ACTUAL_IMPORTED_INCOME_KEY, name: IMPORTED_INCOME_NAME });
    }
    return result;
  }

  private isIncomeCategory(category: ActualRawCategory): boolean {
    if (toBool(category.is_income)) {
      return true;
    }
    return category.cat_group ? (this.groupIsIncome.get(category.cat_group) ?? false) : false;
  }

  private describe(transaction: ActualRawTransaction): string | null {
    const payeeName = transaction.description
      ? nonEmpty(this.resolvePayee(transaction.description)?.name)
      : null;
    const notes = nonEmpty(transaction.notes);
    if (payeeName && notes) {
      return truncate(`${payeeName} — ${notes}`);
    }
    return payeeName ?? notes ?? null;
  }

  private resolvePayee(payeeId: string): ActualRawPayee | null {
    let id = payeeId;
    const seen = new Set<string>();
    while (this.payeeMappingTargets.has(id) && !seen.has(id)) {
      seen.add(id);
      id = this.payeeMappingTargets.get(id) as string;
    }
    return this.payeeById.get(id) ?? null;
  }

  private addWarning(
    code: ActualImportWarningCode,
    message: string,
    actualTransactionId?: string,
  ): void {
    this.warnings.push(
      actualTransactionId ? { actualTransactionId, code, message } : { code, message },
    );
  }

  private skip(code: ActualImportWarningCode, message: string, actualTransactionId?: string): void {
    this.skippedCount += 1;
    this.addWarning(code, message, actualTransactionId);
  }
}

function mapAccountKind(type: string | null): {
  readonly kind: Extract<AccountKind, "asset" | "liability">;
  readonly subtype: AccountSubtype;
} {
  const normalized = (type ?? "").toLowerCase();
  if (normalized.includes("credit")) {
    return { kind: "liability", subtype: "credit_card" };
  }
  if (
    normalized === "loan" ||
    normalized === "mortgage" ||
    normalized === "debt" ||
    normalized.includes("loan") ||
    normalized.includes("mortgage") ||
    normalized.includes("line")
  ) {
    return { kind: "liability", subtype: "loan" };
  }
  if (normalized.includes("invest")) {
    return { kind: "asset", subtype: "investment" };
  }
  if (normalized === "cash") {
    return { kind: "asset", subtype: "cash" };
  }
  return { kind: "asset", subtype: "bank" };
}

function clearedStatus(transaction: ActualRawTransaction): "pending" | "cleared" {
  return toBool(transaction.cleared) || toBool(transaction.reconciled) ? "cleared" : "pending";
}

function toBool(value: number | boolean | null | undefined): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return value !== 0;
}

function nonEmpty(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function truncate(value: string): string {
  return value.length > MAX_DESCRIPTION_LENGTH ? value.slice(0, MAX_DESCRIPTION_LENGTH) : value;
}
