import { describe, expect, it } from "vitest";

import {
  bindSqliteMoneyMinor,
  prepareSqliteMoneyStatement,
  readRequiredSqliteMoneyMinor,
  readSqliteMoneyMinor,
  SQLITE_INT64_MAX,
  SQLITE_INT64_MIN,
} from "../index.js";
import { createInMemorySqliteDatabase, runSqliteMigrations } from "../testing/migrations.js";

type MoneyRoundTripRow = {
  readonly opening_balance_minor: bigint;
  readonly budget_amount_minor: bigint;
  readonly amount_minor: bigint;
  readonly foreign_amount_minor: bigint;
  readonly reporting_amount_minor: bigint;
};

describe("SQLite money boundary", () => {
  it("round-trips every current money column above Number.MAX_SAFE_INTEGER", () => {
    const db = createInMemorySqliteDatabase();
    const largeAmount = BigInt(Number.MAX_SAFE_INTEGER) + 2n;
    const negativeLargeAmount = -largeAmount;

    try {
      runSqliteMigrations(db);
      insertFinanceGraph(db, largeAmount, negativeLargeAmount);

      const row = prepareSqliteMoneyStatement<MoneyRoundTripRow>(
        db,
        `
          SELECT
            accounts.opening_balance_minor,
            budget_limits.amount_minor AS budget_amount_minor,
            transaction_postings.amount_minor,
            transaction_postings.foreign_amount_minor,
            transaction_postings.reporting_amount_minor
          FROM accounts
          JOIN budget_limits ON budget_limits.id = 'budget_limit_1'
          JOIN transaction_postings ON transaction_postings.id = 'posting_1'
          WHERE accounts.id = 'account_1'
        `,
      ).get();

      expect(row).toEqual({
        amount_minor: negativeLargeAmount,
        budget_amount_minor: largeAmount,
        foreign_amount_minor: largeAmount,
        opening_balance_minor: largeAmount,
        reporting_amount_minor: negativeLargeAmount,
      });
      expect(typeof row?.opening_balance_minor).toBe("bigint");
      expect(typeof row?.budget_amount_minor).toBe("bigint");
      expect(typeof row?.amount_minor).toBe("bigint");
      expect(typeof row?.foreign_amount_minor).toBe("bigint");
      expect(typeof row?.reporting_amount_minor).toBe("bigint");
    } finally {
      db.close();
    }
  });

  it("fails closed when a money value was read through an unsafe number path", () => {
    const db = createInMemorySqliteDatabase();
    const largeAmount = BigInt(Number.MAX_SAFE_INTEGER) + 2n;

    try {
      runSqliteMigrations(db);
      insertFinanceGraph(db, largeAmount, -largeAmount);

      const unsafe = db
        .prepare("SELECT opening_balance_minor FROM accounts WHERE id = 'account_1'")
        .get() as { opening_balance_minor: number };

      expect(typeof unsafe.opening_balance_minor).toBe("number");
      expect(BigInt(unsafe.opening_balance_minor)).not.toBe(largeAmount);
      expect(() =>
        readRequiredSqliteMoneyMinor(unsafe.opening_balance_minor, "opening_balance_minor"),
      ).toThrow("unsafe JavaScript number");
    } finally {
      db.close();
    }
  });

  it("validates bind/read values before ledger logic can use them", () => {
    expect(bindSqliteMoneyMinor(SQLITE_INT64_MAX)).toBe(SQLITE_INT64_MAX);
    expect(bindSqliteMoneyMinor(SQLITE_INT64_MIN)).toBe(SQLITE_INT64_MIN);
    expect(bindSqliteMoneyMinor("9007199254740993")).toBe(9_007_199_254_740_993n);
    expect(readSqliteMoneyMinor(null)).toBeNull();
    expect(readSqliteMoneyMinor(1250)).toBe(1250n);

    expect(() => bindSqliteMoneyMinor(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      "unsafe JavaScript number",
    );
    expect(() => bindSqliteMoneyMinor(SQLITE_INT64_MAX + 1n)).toThrow("signed 64-bit integer");
    expect(() => bindSqliteMoneyMinor("12.50")).toThrow("integer minor-unit string");
    expect(() => readRequiredSqliteMoneyMinor(null, "amount_minor")).toThrow("is required");
  });
});

function insertFinanceGraph(
  db: ReturnType<typeof createInMemorySqliteDatabase>,
  amount: bigint,
  signedAmount: bigint,
) {
  db.exec(`
    INSERT INTO users (
      id,
      username,
      username_normalized,
      display_name,
      password_hash,
      created_at,
      updated_at
    )
    VALUES (
      'user_1',
      'User',
      'user',
      'User',
      'hash',
      '2026-05-09T00:00:00.000Z',
      '2026-05-09T00:00:00.000Z'
    );

    INSERT INTO workspaces (
      id,
      name,
      owner_user_id,
      status,
      created_at,
      updated_at
    )
    VALUES (
      'workspace_1',
      'Workspace',
      'user_1',
      'active',
      '2026-05-09T00:00:00.000Z',
      '2026-05-09T00:00:00.000Z'
    );

    INSERT INTO currencies (
      code,
      name,
      decimal_places,
      symbol,
      created_at,
      updated_at
    )
    VALUES (
      'INR',
      'Indian Rupee',
      2,
      'Rs',
      '2026-05-09T00:00:00.000Z',
      '2026-05-09T00:00:00.000Z'
    );

    INSERT INTO ledgers (
      id,
      workspace_id,
      name,
      base_currency_code,
      first_day_of_week,
      status,
      created_at,
      updated_at
    )
    VALUES (
      'ledger_1',
      'workspace_1',
      'Main',
      'INR',
      1,
      'active',
      '2026-05-09T00:00:00.000Z',
      '2026-05-09T00:00:00.000Z'
    );

    INSERT INTO budgets (
      id,
      workspace_id,
      ledger_id,
      name,
      currency_code,
      period,
      rollover_enabled,
      created_at,
      updated_at
    )
    VALUES (
      'budget_1',
      'workspace_1',
      'ledger_1',
      'Groceries',
      'INR',
      'monthly',
      0,
      '2026-05-09T00:00:00.000Z',
      '2026-05-09T00:00:00.000Z'
    );
  `);

  db.prepare(
    `
      INSERT INTO accounts (
        id,
        workspace_id,
        ledger_id,
        name,
        kind,
        subtype,
        currency_code,
        opening_balance_minor,
        opening_balance_date,
        is_active,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    "account_1",
    "workspace_1",
    "ledger_1",
    "Checking",
    "asset",
    "bank",
    "INR",
    bindSqliteMoneyMinor(amount, "opening_balance_minor"),
    "2026-05-09",
    1,
    "2026-05-09T00:00:00.000Z",
    "2026-05-09T00:00:00.000Z",
  );

  db.prepare(
    `
      INSERT INTO budget_limits (
        id,
        budget_id,
        amount_minor,
        currency_code,
        start_date,
        end_date,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    "budget_limit_1",
    "budget_1",
    bindSqliteMoneyMinor(amount, "amount_minor"),
    "INR",
    "2026-05-01",
    "2026-05-31",
    "2026-05-09T00:00:00.000Z",
    "2026-05-09T00:00:00.000Z",
  );

  db.exec(`
    INSERT INTO transaction_groups (
      id,
      workspace_id,
      ledger_id,
      title,
      type,
      source,
      created_by,
      updated_by,
      created_at,
      updated_at
    )
    VALUES (
      'group_1',
      'workspace_1',
      'ledger_1',
      'Large payment',
      'expense',
      'manual',
      'user_1',
      'user_1',
      '2026-05-09T00:00:00.000Z',
      '2026-05-09T00:00:00.000Z'
    );

    INSERT INTO transaction_journals (
      id,
      workspace_id,
      ledger_id,
      group_id,
      type,
      occurred_at,
      description,
      status,
      source,
      created_by,
      updated_by,
      created_at,
      updated_at
    )
    VALUES (
      'journal_1',
      'workspace_1',
      'ledger_1',
      'group_1',
      'expense',
      '2026-05-09T00:00:00.000Z',
      'Large payment',
      'cleared',
      'manual',
      'user_1',
      'user_1',
      '2026-05-09T00:00:00.000Z',
      '2026-05-09T00:00:00.000Z'
    );
  `);

  db.prepare(
    `
      INSERT INTO transaction_postings (
        id,
        workspace_id,
        ledger_id,
        journal_id,
        account_id,
        amount_minor,
        currency_code,
        foreign_amount_minor,
        foreign_currency_code,
        reporting_amount_minor,
        reporting_currency_code,
        budget_id,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    "posting_1",
    "workspace_1",
    "ledger_1",
    "journal_1",
    "account_1",
    bindSqliteMoneyMinor(signedAmount, "amount_minor"),
    "INR",
    bindSqliteMoneyMinor(amount, "foreign_amount_minor"),
    "INR",
    bindSqliteMoneyMinor(signedAmount, "reporting_amount_minor"),
    "INR",
    "budget_1",
    "2026-05-09T00:00:00.000Z",
  );
}
