import { FastiflyApiError } from "../../../api/client";
import { en } from "../../../i18n/en";

export function isDueSoon(nextRunAt: string): boolean {
  const next = Date.parse(nextRunAt);
  if (Number.isNaN(next)) {
    return false;
  }

  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return next >= now && next <= now + sevenDaysMs;
}

export function getRecurringError(error: unknown): string {
  if (error instanceof FastiflyApiError) {
    return error.response.error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }

  return en.recurring.createFailed;
}

export function getRecurringStatusError(error: unknown): string {
  if (error instanceof FastiflyApiError) {
    return error.response.error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }

  return en.recurring.statusFailed;
}
