import { MAX_SIGNED_64, MIN_SIGNED_64 } from "../money.js";

/** Actual stores amounts in 2-decimal-place minor units. */
const ACTUAL_MINOR_UNITS = 2;

/**
 * Convert an Actual integer amount (2-dp minor units) into the target
 * currency's minor units. Returns `null` when the value cannot be represented
 * exactly (fractional down-scaling) or overflows signed 64-bit range.
 */
export function convertActualAmountMinor(
  actualAmount: number,
  targetMinorUnits: number,
): bigint | null {
  if (!Number.isInteger(actualAmount) || !Number.isInteger(targetMinorUnits)) {
    return null;
  }
  if (targetMinorUnits < 0 || targetMinorUnits > 12) {
    return null;
  }

  const base = BigInt(actualAmount);
  const delta = targetMinorUnits - ACTUAL_MINOR_UNITS;

  let result: bigint;
  if (delta === 0) {
    result = base;
  } else if (delta > 0) {
    result = base * 10n ** BigInt(delta);
  } else {
    const divisor = 10n ** BigInt(-delta);
    if (base % divisor !== 0n) {
      return null;
    }
    result = base / divisor;
  }

  if (result < MIN_SIGNED_64 || result > MAX_SIGNED_64) {
    return null;
  }

  return result;
}

/**
 * Convert an Actual date (`YYYYMMDD` integer, numeric string, or `YYYY-MM-DD`
 * string) into a calendar `YYYY-MM-DD` string. Returns `null` for invalid input.
 */
export function actualDateToIsoDate(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  let raw: string;
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      return null;
    }
    raw = String(value);
  } else {
    raw = value.trim();
  }

  let year: number;
  let month: number;
  let day: number;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    year = Number(raw.slice(0, 4));
    month = Number(raw.slice(5, 7));
    day = Number(raw.slice(8, 10));
  } else if (/^\d{8}$/.test(raw)) {
    year = Number(raw.slice(0, 4));
    month = Number(raw.slice(4, 6));
    day = Number(raw.slice(6, 8));
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** Build an ISO-8601 UTC midnight timestamp from a `YYYY-MM-DD` date string. */
export function isoDateToOccurredAt(isoDate: string): string {
  return `${isoDate}T00:00:00.000Z`;
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}
