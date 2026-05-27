import { describe, expect, it } from "vitest";

import { actualDateToIsoDate, convertActualAmountMinor } from "../actual-import/convert.js";
import { buildActualImportPlan } from "../actual-import/map.js";
import {
  ACTUAL_IMPORTED_INCOME_KEY,
  ACTUAL_UNCATEGORIZED_EXPENSE_KEY,
  type ActualBudgetExport,
  type ActualRawAccount,
  type ActualRawCategory,
  type ActualRawPayee,
  type ActualRawTransaction,
} from "../actual-import/types.js";

function account(overrides: Partial<ActualRawAccount> & { id: string }): ActualRawAccount {
  return {
    closed: 0,
    name: overrides.id,
    offbudget: 0,
    tombstone: 0,
    type: "checking",
    ...overrides,
  };
}

function category(overrides: Partial<ActualRawCategory> & { id: string }): ActualRawCategory {
  return {
    cat_group: null,
    is_income: 0,
    name: overrides.id,
    tombstone: 0,
    ...overrides,
  };
}

function payee(overrides: Partial<ActualRawPayee> & { id: string }): ActualRawPayee {
  return {
    name: overrides.id,
    tombstone: 0,
    transfer_acct: null,
    ...overrides,
  };
}

function transaction(
  overrides: Partial<ActualRawTransaction> & { id: string },
): ActualRawTransaction {
  return {
    acct: null,
    amount: 0,
    category: null,
    cleared: 1,
    date: 20260115,
    description: null,
    isChild: 0,
    isParent: 0,
    notes: null,
    parent_id: null,
    reconciled: 0,
    starting_balance_flag: 0,
    transferred_id: null,
    tombstone: 0,
    ...overrides,
  };
}

function buildExport(overrides: Partial<ActualBudgetExport>): ActualBudgetExport {
  return {
    accounts: [],
    budgetName: "Test Budget",
    categories: [],
    categoryGroups: [],
    payeeMappings: [],
    payees: [],
    transactions: [],
    ...overrides,
  };
}

function plan(ex: ActualBudgetExport, currency = "USD", minorUnits = 2) {
  return buildActualImportPlan({
    export: ex,
    targetCurrencyCode: currency,
    targetCurrencyMinorUnits: minorUnits,
  });
}

describe("convertActualAmountMinor", () => {
  it("passes through 2-decimal target currencies", () => {
    expect(convertActualAmountMinor(12550, 2)).toBe(12550n);
    expect(convertActualAmountMinor(-5025, 2)).toBe(-5025n);
    expect(convertActualAmountMinor(0, 2)).toBe(0n);
  });

  it("scales up for higher-precision currencies", () => {
    expect(convertActualAmountMinor(100, 3)).toBe(1000n);
  });

  it("scales down only when divisible", () => {
    expect(convertActualAmountMinor(10000, 0)).toBe(100n);
    expect(convertActualAmountMinor(10050, 0)).toBeNull();
  });

  it("rejects non-integers and out-of-range minor units", () => {
    expect(convertActualAmountMinor(1.5, 2)).toBeNull();
    expect(convertActualAmountMinor(100, -1)).toBeNull();
  });
});

describe("actualDateToIsoDate", () => {
  it("parses YYYYMMDD integers", () => {
    expect(actualDateToIsoDate(20260527)).toBe("2026-05-27");
    expect(actualDateToIsoDate(20260101)).toBe("2026-01-01");
  });

  it("parses YYYY-MM-DD strings", () => {
    expect(actualDateToIsoDate("2026-05-27")).toBe("2026-05-27");
  });

  it("rejects invalid dates", () => {
    expect(actualDateToIsoDate(20261332)).toBeNull();
    expect(actualDateToIsoDate(0)).toBeNull();
    expect(actualDateToIsoDate(null)).toBeNull();
    expect(actualDateToIsoDate(20260230)).toBeNull();
  });
});

describe("buildActualImportPlan — accounts and opening balances", () => {
  it("maps account types to ledger kinds/subtypes", () => {
    const result = plan(
      buildExport({
        accounts: [
          account({ id: "a-check", name: "Checking", type: "checking" }),
          account({ id: "a-credit", name: "Visa", type: "credit" }),
          account({ id: "a-loan", name: "Mortgage", type: "mortgage" }),
          account({ id: "a-invest", name: "Brokerage", type: "investment" }),
          account({ id: "a-dead", name: "Old", tombstone: 1 }),
        ],
      }),
    );

    expect(result.accounts).toHaveLength(4);
    const byId = new Map(result.accounts.map((a) => [a.actualId, a]));
    expect(byId.get("a-check")).toMatchObject({ kind: "asset", subtype: "bank" });
    expect(byId.get("a-credit")).toMatchObject({ kind: "liability", subtype: "credit_card" });
    expect(byId.get("a-loan")).toMatchObject({ kind: "liability", subtype: "loan" });
    expect(byId.get("a-invest")).toMatchObject({ kind: "asset", subtype: "investment" });
  });

  it("captures starting balance as the account opening balance and consumes the row", () => {
    const result = plan(
      buildExport({
        accounts: [account({ id: "a", name: "Checking" })],
        transactions: [
          transaction({
            acct: "a",
            amount: 150000,
            date: 20260101,
            id: "t-open",
            starting_balance_flag: 1,
          }),
        ],
      }),
    );

    expect(result.accounts[0]).toMatchObject({
      openingBalanceDate: "2026-01-01",
      openingBalanceMinor: "150000",
    });
    // The starting-balance row must not also become a normal transaction.
    expect(result.transactions).toHaveLength(0);
  });

  it("preserves a negative opening balance for a liability account", () => {
    const result = plan(
      buildExport({
        accounts: [account({ id: "card", name: "Visa", type: "credit" })],
        transactions: [
          transaction({
            acct: "card",
            amount: -50000,
            date: 20260101,
            id: "t-open",
            starting_balance_flag: 1,
          }),
        ],
      }),
    );

    expect(result.accounts[0]).toMatchObject({
      kind: "liability",
      openingBalanceDate: "2026-01-01",
      openingBalanceMinor: "-50000",
    });
    expect(result.transactions).toHaveLength(0);
  });
});

describe("buildActualImportPlan — expenses and income", () => {
  it("maps a negative categorized row to an expense against the category", () => {
    const result = plan(
      buildExport({
        accounts: [account({ id: "a", name: "Checking" })],
        categories: [category({ id: "c-food", name: "Food" })],
        payees: [payee({ id: "p", name: "Grocer" })],
        transactions: [
          transaction({
            acct: "a",
            amount: -4200,
            category: "c-food",
            description: "p",
            id: "t1",
          }),
        ],
      }),
    );

    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx?.type).toBe("expense");
    expect(tx?.source).toEqual({ actualId: "a", kind: "account" });
    expect(tx?.lines).toEqual([
      {
        amountMinor: "4200",
        description: "Grocer",
        destination: { actualId: "c-food", kind: "expense_category" },
      },
    ]);
    expect(result.expenseCategories).toContainEqual({ actualId: "c-food", name: "Food" });
  });

  it("maps a positive income-category row to income from a revenue source", () => {
    const result = plan(
      buildExport({
        accounts: [account({ id: "a", name: "Checking" })],
        categories: [category({ id: "c-salary", is_income: 1, name: "Salary" })],
        transactions: [transaction({ acct: "a", amount: 500000, category: "c-salary", id: "t1" })],
      }),
    );

    const tx = result.transactions[0];
    expect(tx?.type).toBe("income");
    expect(tx?.source).toEqual({ actualId: "c-salary", kind: "income_source" });
    expect(tx?.lines[0]?.destination).toEqual({ actualId: "a", kind: "account" });
    expect(result.incomeSources).toContainEqual({ actualId: "c-salary", name: "Salary" });
  });

  it("routes uncategorized expense and income through fallbacks", () => {
    const result = plan(
      buildExport({
        accounts: [account({ id: "a", name: "Checking" })],
        transactions: [
          transaction({ acct: "a", amount: -1000, id: "t-exp" }),
          transaction({ acct: "a", amount: 2000, id: "t-inc" }),
        ],
      }),
    );

    expect(result.expenseCategories).toContainEqual({
      actualId: ACTUAL_UNCATEGORIZED_EXPENSE_KEY,
      name: "Imported Uncategorized",
    });
    expect(result.incomeSources).toContainEqual({
      actualId: ACTUAL_IMPORTED_INCOME_KEY,
      name: "Imported Income",
    });
    const expense = result.transactions.find((t) => t.type === "expense");
    const income = result.transactions.find((t) => t.type === "income");
    expect(expense?.lines[0]?.destination.actualId).toBe(ACTUAL_UNCATEGORIZED_EXPENSE_KEY);
    expect(income?.source.actualId).toBe(ACTUAL_IMPORTED_INCOME_KEY);
  });

  it("maps cleared/reconciled flags to status", () => {
    const result = plan(
      buildExport({
        accounts: [account({ id: "a" })],
        transactions: [
          transaction({ acct: "a", amount: -100, cleared: 0, id: "t-pending", reconciled: 0 }),
          transaction({ acct: "a", amount: -100, cleared: 0, id: "t-recon", reconciled: 1 }),
        ],
      }),
    );
    const pending = result.transactions.find(
      (t) => t.description === "Imported transaction" && t.status === "pending",
    );
    expect(result.transactions.map((t) => t.status).sort()).toEqual(["cleared", "pending"]);
    expect(pending).toBeDefined();
  });
});

describe("buildActualImportPlan — transfers", () => {
  it("collapses a linked pair into a single transfer with the right direction", () => {
    const result = plan(
      buildExport({
        accounts: [
          account({ id: "checking", name: "Checking" }),
          account({ id: "savings", name: "Savings" }),
        ],
        payees: [
          payee({ id: "p-to-savings", name: "Savings", transfer_acct: "savings" }),
          payee({ id: "p-to-checking", name: "Checking", transfer_acct: "checking" }),
        ],
        transactions: [
          transaction({
            acct: "checking",
            amount: -10000,
            description: "p-to-savings",
            id: "t-out",
            transferred_id: "t-in",
          }),
          transaction({
            acct: "savings",
            amount: 10000,
            description: "p-to-checking",
            id: "t-in",
            transferred_id: "t-out",
          }),
        ],
      }),
    );

    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx?.type).toBe("transfer");
    expect(tx?.source).toEqual({ actualId: "checking", kind: "account" });
    expect(tx?.lines[0]?.destination).toEqual({ actualId: "savings", kind: "account" });
    expect(tx?.lines[0]?.amountMinor).toBe("10000");
    expect(result.summary.transferCount).toBe(1);
  });

  it("collapses a pair where the inflow leg appears first", () => {
    const result = plan(
      buildExport({
        accounts: [account({ id: "checking" }), account({ id: "savings" })],
        transactions: [
          transaction({
            acct: "savings",
            amount: 10000,
            id: "t-in",
            transferred_id: "t-out",
          }),
          transaction({
            acct: "checking",
            amount: -10000,
            id: "t-out",
            transferred_id: "t-in",
          }),
        ],
      }),
    );

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.source).toEqual({ actualId: "checking", kind: "account" });
    expect(result.transactions[0]?.lines[0]?.destination).toEqual({
      actualId: "savings",
      kind: "account",
    });
  });

  it("degrades a transfer to a single-sided transaction when the counterpart is gone", () => {
    const result = plan(
      buildExport({
        accounts: [account({ id: "checking" })],
        transactions: [
          transaction({
            acct: "checking",
            amount: -10000,
            id: "t-out",
            transferred_id: "missing",
          }),
        ],
      }),
    );

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.type).toBe("expense");
    expect(result.warnings.some((w) => w.code === "TRANSFER_COUNTERPART_MISSING")).toBe(true);
  });

  it("degrades a same-signed transfer pair to single-sided transactions", () => {
    const result = plan(
      buildExport({
        accounts: [account({ id: "checking" }), account({ id: "savings" })],
        transactions: [
          transaction({ acct: "checking", amount: -10000, id: "t-a", transferred_id: "t-b" }),
          transaction({ acct: "savings", amount: -10000, id: "t-b", transferred_id: "t-a" }),
        ],
      }),
    );

    expect(result.transactions.every((tx) => tx.type !== "transfer")).toBe(true);
    expect(result.transactions).toHaveLength(2);
    expect(result.warnings.some((w) => w.code === "TRANSFER_COUNTERPART_MISSING")).toBe(true);
  });
});

describe("buildActualImportPlan — splits", () => {
  it("groups an expense-only split into one transaction with multiple lines", () => {
    const result = plan(
      buildExport({
        accounts: [account({ id: "a", name: "Checking" })],
        categories: [
          category({ id: "c-food", name: "Food" }),
          category({ id: "c-home", name: "Home" }),
        ],
        transactions: [
          transaction({ acct: "a", amount: -3000, id: "parent", isParent: 1 }),
          transaction({
            acct: "a",
            amount: -2000,
            category: "c-food",
            id: "parent/1",
            isChild: 1,
            parent_id: "parent",
          }),
          transaction({
            acct: "a",
            amount: -1000,
            category: "c-home",
            id: "parent/2",
            isChild: 1,
            parent_id: "parent",
          }),
        ],
      }),
    );

    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx?.type).toBe("expense");
    expect(tx?.lines).toHaveLength(2);
    expect(tx?.lines.map((l) => l.amountMinor)).toEqual(["2000", "1000"]);
    expect(result.summary.splitCount).toBe(1);
  });

  it("imports mixed-direction split children as standalone transactions", () => {
    const result = plan(
      buildExport({
        accounts: [account({ id: "a", name: "Checking" })],
        categories: [
          category({ id: "c-gross", is_income: 1, name: "Gross Pay" }),
          category({ id: "c-tax", name: "Tax" }),
        ],
        transactions: [
          transaction({ acct: "a", amount: 8000, id: "parent", isParent: 1 }),
          transaction({
            acct: "a",
            amount: 10000,
            category: "c-gross",
            id: "parent/1",
            isChild: 1,
            parent_id: "parent",
          }),
          transaction({
            acct: "a",
            amount: -2000,
            category: "c-tax",
            id: "parent/2",
            isChild: 1,
            parent_id: "parent",
          }),
        ],
      }),
    );

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions.map((t) => t.type).sort()).toEqual(["expense", "income"]);
    expect(result.warnings.some((w) => w.code === "SPLIT_NOT_GROUPED")).toBe(true);
  });

  it("imports every split when a budget has more than one split (regression)", () => {
    const result = plan(
      buildExport({
        accounts: [account({ id: "a", name: "Checking" })],
        categories: [category({ id: "c-food", name: "Food" })],
        transactions: [
          transaction({ acct: "a", amount: -3000, id: "p1", isParent: 1 }),
          transaction({
            acct: "a",
            amount: -2000,
            category: "c-food",
            id: "p1/1",
            isChild: 1,
            parent_id: "p1",
          }),
          transaction({
            acct: "a",
            amount: -1000,
            category: "c-food",
            id: "p1/2",
            isChild: 1,
            parent_id: "p1",
          }),
          transaction({ acct: "a", amount: -700, id: "p2", isParent: 1 }),
          transaction({
            acct: "a",
            amount: -400,
            category: "c-food",
            id: "p2/1",
            isChild: 1,
            parent_id: "p2",
          }),
          transaction({
            acct: "a",
            amount: -300,
            category: "c-food",
            id: "p2/2",
            isChild: 1,
            parent_id: "p2",
          }),
        ],
      }),
    );

    expect(result.transactions).toHaveLength(2);
    expect(result.summary.splitCount).toBe(2);
    expect(result.transactions.every((tx) => tx.type === "expense" && tx.lines.length === 2)).toBe(
      true,
    );
  });
});

describe("buildActualImportPlan — skips and tombstones", () => {
  it("skips tombstoned transactions and zero-amount rows", () => {
    const result = plan(
      buildExport({
        accounts: [account({ id: "a" })],
        transactions: [
          transaction({ acct: "a", amount: -100, id: "alive" }),
          transaction({ acct: "a", amount: -100, id: "dead", tombstone: 1 }),
          transaction({ acct: "a", amount: 0, id: "zero" }),
        ],
      }),
    );

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.description).toBe("Imported transaction");
    expect(result.warnings.some((w) => w.code === "ZERO_AMOUNT_SKIPPED")).toBe(true);
    expect(result.summary.skippedCount).toBe(1);
  });

  it("skips a transaction whose account is missing", () => {
    const result = plan(
      buildExport({
        accounts: [],
        transactions: [transaction({ acct: "ghost", amount: -100, id: "t" })],
      }),
    );

    expect(result.transactions).toHaveLength(0);
    expect(result.warnings.some((w) => w.code === "ACCOUNT_MISSING")).toBe(true);
  });

  it("resolves payee names through payee_mapping chains", () => {
    const result = plan(
      buildExport({
        accounts: [account({ id: "a" })],
        payeeMappings: [{ id: "old", targetId: "new" }],
        payees: [payee({ id: "new", name: "Merged Payee" })],
        transactions: [transaction({ acct: "a", amount: -100, description: "old", id: "t" })],
      }),
    );

    expect(result.transactions[0]?.description).toBe("Merged Payee");
  });
});
