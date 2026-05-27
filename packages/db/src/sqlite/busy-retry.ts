/**
 * Cross-process SQLite write contention helper.
 *
 * A separate worker process and the API process write the same SQLite file. Writes are serialized by
 * SQLite's own write lock (every ledger mutation and job claim runs under `BEGIN IMMEDIATE`, and the
 * runtime sets `busy_timeout`). When contention still surfaces as `SQLITE_BUSY` after the busy
 * timeout, callers retry a bounded number of times with linear backoff.
 */

const SQLITE_BUSY_CODES = new Set([
  "SQLITE_BUSY",
  "SQLITE_BUSY_SNAPSHOT",
  "SQLITE_BUSY_RECOVERY",
  "SQLITE_BUSY_TIMEOUT",
]);

export function isSqliteBusyError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === "string" && SQLITE_BUSY_CODES.has(code);
}

export type SqliteBusyRetryOptions = {
  readonly retries?: number;
  readonly baseDelayMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export async function withSqliteBusyRetry<T>(
  fn: () => T | Promise<T>,
  options: SqliteBusyRetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 25;
  const sleep = options.sleep ?? defaultSleep;

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      if (!isSqliteBusyError(error) || attempt >= retries) {
        throw error;
      }
      attempt += 1;
      await sleep(baseDelayMs * attempt);
    }
  }
}
