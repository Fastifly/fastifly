import type Database from "better-sqlite3";

import type { SqliteClient } from "./client.js";

export const SQLITE_INT64_MIN = -(1n << 63n);
export const SQLITE_INT64_MAX = (1n << 63n) - 1n;

export const SQLITE_MONEY_COLUMNS = {
  accounts: ["opening_balance_minor"],
  budget_limits: ["amount_minor"],
  transaction_postings: ["amount_minor", "foreign_amount_minor", "reporting_amount_minor"],
} as const;

export type SqliteMoneyColumn =
  (typeof SQLITE_MONEY_COLUMNS)[keyof typeof SQLITE_MONEY_COLUMNS][number];

export type SqliteMoneyInput = bigint | number | string;

export function prepareSqliteMoneyStatement<Result = unknown>(
  client: SqliteClient,
  source: string,
): Database.Statement<unknown[], Result> {
  return client.prepare<unknown[], Result>(source).safeIntegers(true);
}

export function bindSqliteMoneyMinor(
  value: SqliteMoneyInput,
  column: SqliteMoneyColumn | "money" = "money",
): bigint {
  return assertSqliteMoneyMinorRange(parseSqliteMoneyMinor(value, column), column);
}

export function readSqliteMoneyMinor(
  value: unknown,
  column: SqliteMoneyColumn | "money" = "money",
): bigint | null {
  if (value === null) {
    return null;
  }

  if (typeof value === "bigint") {
    return assertSqliteMoneyMinorRange(value, column);
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(
        `SQLite money column ${column} was read as an unsafe JavaScript number. Use prepareSqliteMoneyStatement().`,
      );
    }

    return assertSqliteMoneyMinorRange(BigInt(value), column);
  }

  if (typeof value === "string") {
    return assertSqliteMoneyMinorRange(parseSqliteMoneyMinor(value, column), column);
  }

  throw new TypeError(`SQLite money column ${column} must be an integer minor-unit value.`);
}

export function readRequiredSqliteMoneyMinor(
  value: unknown,
  column: SqliteMoneyColumn | "money" = "money",
): bigint {
  const parsed = readSqliteMoneyMinor(value, column);
  if (parsed === null) {
    throw new TypeError(`SQLite money column ${column} is required.`);
  }

  return parsed;
}

export function formatSqliteMoneyMinor(value: bigint): string {
  return assertSqliteMoneyMinorRange(value, "money").toString();
}

function parseSqliteMoneyMinor(
  value: SqliteMoneyInput,
  column: SqliteMoneyColumn | "money",
): bigint {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(`SQLite money column ${column} cannot bind an unsafe JavaScript number.`);
    }

    return BigInt(value);
  }

  if (!/^-?(0|[1-9][0-9]*)$/.test(value)) {
    throw new TypeError(`SQLite money column ${column} must be an integer minor-unit string.`);
  }

  return BigInt(value);
}

function assertSqliteMoneyMinorRange(value: bigint, column: SqliteMoneyColumn | "money"): bigint {
  if (value < SQLITE_INT64_MIN || value > SQLITE_INT64_MAX) {
    throw new RangeError(`SQLite money column ${column} must fit in a signed 64-bit integer.`);
  }

  return value;
}
