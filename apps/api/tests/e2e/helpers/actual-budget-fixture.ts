import Database from "better-sqlite3";
import { zipSync } from "fflate";

/**
 * Builds a synthetic Actual Budget export (`.zip` containing `db.sqlite` +
 * `metadata.json`) for tests, mirroring Actual's real table/column shapes and
 * conventions (integer 2-dp amounts, `YYYYMMDD` dates, `tombstone` soft deletes,
 * `transferred_id`-linked transfers, `isParent`/`isChild` splits).
 */
export type FixtureAccount = {
  readonly id: string;
  readonly name?: string;
  readonly type?: string;
  readonly offbudget?: number;
  readonly closed?: number;
  readonly tombstone?: number;
};

export type FixtureCategoryGroup = {
  readonly id: string;
  readonly name?: string;
  readonly is_income?: number;
  readonly tombstone?: number;
};

export type FixtureCategory = {
  readonly id: string;
  readonly name?: string;
  readonly is_income?: number;
  readonly cat_group?: string | null;
  readonly tombstone?: number;
};

export type FixturePayee = {
  readonly id: string;
  readonly name?: string | null;
  readonly transfer_acct?: string | null;
  readonly tombstone?: number;
};

export type FixturePayeeMapping = {
  readonly id: string;
  readonly targetId: string;
};

export type FixtureTransaction = {
  readonly id: string;
  readonly acct: string;
  readonly amount: number;
  readonly category?: string | null;
  readonly description?: string | null;
  readonly notes?: string | null;
  readonly date?: number;
  readonly isParent?: number;
  readonly isChild?: number;
  readonly parent_id?: string | null;
  readonly transferred_id?: string | null;
  readonly starting_balance_flag?: number;
  readonly cleared?: number;
  readonly reconciled?: number;
  readonly tombstone?: number;
};

export type ActualBudgetFixture = {
  readonly budgetName?: string;
  readonly accounts?: readonly FixtureAccount[];
  readonly categoryGroups?: readonly FixtureCategoryGroup[];
  readonly categories?: readonly FixtureCategory[];
  readonly payees?: readonly FixturePayee[];
  readonly payeeMappings?: readonly FixturePayeeMapping[];
  readonly transactions?: readonly FixtureTransaction[];
};

export function buildActualBudgetZip(fixture: ActualBudgetFixture): Uint8Array {
  const db = new Database(":memory:");
  try {
    createSchema(db);
    insertRows(db, fixture);
    const dbBytes = new Uint8Array(db.serialize());
    const metadata = new TextEncoder().encode(
      JSON.stringify({ budgetName: fixture.budgetName ?? "Test Budget", id: "budget-fixture" }),
    );
    return zipSync({ "db.sqlite": dbBytes, "metadata.json": metadata });
  } finally {
    db.close();
  }
}

export function buildActualBudgetBase64(fixture: ActualBudgetFixture): string {
  return Buffer.from(buildActualBudgetZip(fixture)).toString("base64");
}

function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY, name TEXT, offbudget INTEGER DEFAULT 0, closed INTEGER DEFAULT 0,
      type TEXT, sort_order REAL, tombstone INTEGER DEFAULT 0
    );
    CREATE TABLE category_groups (
      id TEXT PRIMARY KEY, name TEXT, is_income INTEGER DEFAULT 0, sort_order REAL,
      tombstone INTEGER DEFAULT 0
    );
    CREATE TABLE categories (
      id TEXT PRIMARY KEY, name TEXT, is_income INTEGER DEFAULT 0, cat_group TEXT,
      sort_order REAL, hidden INTEGER DEFAULT 0, tombstone INTEGER DEFAULT 0
    );
    CREATE TABLE payees (
      id TEXT PRIMARY KEY, name TEXT, transfer_acct TEXT, tombstone INTEGER DEFAULT 0
    );
    CREATE TABLE payee_mapping (id TEXT PRIMARY KEY, targetId TEXT);
    CREATE TABLE transactions (
      id TEXT PRIMARY KEY, isParent INTEGER DEFAULT 0, isChild INTEGER DEFAULT 0,
      parent_id TEXT, acct TEXT, category TEXT, amount INTEGER, description TEXT, notes TEXT,
      date INTEGER, transferred_id TEXT, starting_balance_flag INTEGER DEFAULT 0,
      cleared INTEGER DEFAULT 1, reconciled INTEGER DEFAULT 0, sort_order REAL,
      tombstone INTEGER DEFAULT 0
    );
    CREATE TABLE __migrations__ (id INTEGER PRIMARY KEY);
  `);
}

function insertRows(db: Database.Database, fixture: ActualBudgetFixture): void {
  const insertAccount = db.prepare(
    "INSERT INTO accounts (id, name, offbudget, closed, type, tombstone) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const account of fixture.accounts ?? []) {
    insertAccount.run(
      account.id,
      account.name ?? account.id,
      account.offbudget ?? 0,
      account.closed ?? 0,
      account.type ?? "checking",
      account.tombstone ?? 0,
    );
  }

  const insertGroup = db.prepare(
    "INSERT INTO category_groups (id, name, is_income, tombstone) VALUES (?, ?, ?, ?)",
  );
  for (const group of fixture.categoryGroups ?? []) {
    insertGroup.run(group.id, group.name ?? group.id, group.is_income ?? 0, group.tombstone ?? 0);
  }

  const insertCategory = db.prepare(
    "INSERT INTO categories (id, name, is_income, cat_group, tombstone) VALUES (?, ?, ?, ?, ?)",
  );
  for (const category of fixture.categories ?? []) {
    insertCategory.run(
      category.id,
      category.name ?? category.id,
      category.is_income ?? 0,
      category.cat_group ?? null,
      category.tombstone ?? 0,
    );
  }

  const insertPayee = db.prepare(
    "INSERT INTO payees (id, name, transfer_acct, tombstone) VALUES (?, ?, ?, ?)",
  );
  for (const payee of fixture.payees ?? []) {
    insertPayee.run(
      payee.id,
      payee.name ?? payee.id,
      payee.transfer_acct ?? null,
      payee.tombstone ?? 0,
    );
  }

  const insertMapping = db.prepare("INSERT INTO payee_mapping (id, targetId) VALUES (?, ?)");
  for (const mapping of fixture.payeeMappings ?? []) {
    insertMapping.run(mapping.id, mapping.targetId);
  }

  const insertTransaction = db.prepare(`
    INSERT INTO transactions (
      id, isParent, isChild, parent_id, acct, category, amount, description, notes, date,
      transferred_id, starting_balance_flag, cleared, reconciled, tombstone
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const transaction of fixture.transactions ?? []) {
    insertTransaction.run(
      transaction.id,
      transaction.isParent ?? 0,
      transaction.isChild ?? 0,
      transaction.parent_id ?? null,
      transaction.acct,
      transaction.category ?? null,
      transaction.amount,
      transaction.description ?? null,
      transaction.notes ?? null,
      transaction.date ?? 20260115,
      transaction.transferred_id ?? null,
      transaction.starting_balance_flag ?? 0,
      transaction.cleared ?? 1,
      transaction.reconciled ?? 0,
      transaction.tombstone ?? 0,
    );
  }
}
