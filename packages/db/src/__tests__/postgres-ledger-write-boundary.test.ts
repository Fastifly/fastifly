import { describe, expect, it } from "vitest";

import { createPostgresAdvisoryLedgerWriteBoundary } from "../index.js";

describe("Postgres advisory ledger write boundary", () => {
  it("acquires and releases advisory lock around callback", async () => {
    const statements: string[] = [];
    let released = false;

    const reserved = makeReservedConnection((sql) => {
      statements.push(sql);

      if (sql.includes("pg_try_advisory_lock")) {
        return Promise.resolve([{ acquired: true }]);
      }

      if (sql.includes("pg_advisory_unlock")) {
        return Promise.resolve([{ pg_advisory_unlock: true }]);
      }

      return Promise.resolve([]);
    });
    reserved.release = async () => {
      released = true;
    };

    const boundary = createPostgresAdvisoryLedgerWriteBoundary(
      {
        reserve: async () => reserved,
      } as never,
      {
        acquireTimeoutMs: 1_000,
        nowMs: () => 0,
      },
    );

    const result = await boundary.runExclusive("workspace:ledger", async () => "done");

    expect(result).toBe("done");
    expect(statements.some((statement) => statement.includes("pg_try_advisory_lock"))).toBe(true);
    expect(statements.some((statement) => statement.includes("pg_advisory_unlock"))).toBe(true);
    expect(released).toBe(true);
  });

  it("fails with timeout when advisory lock cannot be acquired", async () => {
    let released = false;

    const reserved = makeReservedConnection((sql) => {
      if (sql.includes("pg_try_advisory_lock")) {
        return Promise.resolve([{ acquired: false }]);
      }

      if (sql.includes("pg_advisory_unlock")) {
        return Promise.resolve([{ pg_advisory_unlock: true }]);
      }

      return Promise.resolve([]);
    });
    reserved.release = async () => {
      released = true;
    };

    let now = 0;
    const boundary = createPostgresAdvisoryLedgerWriteBoundary(
      {
        reserve: async () => reserved,
      } as never,
      {
        acquireTimeoutMs: 1,
        nowMs: () => {
          now += 2;
          return now;
        },
      },
    );

    await expect(boundary.runExclusive("workspace:ledger", async () => "done")).rejects.toThrow(
      "Timed out while waiting for ledger write boundary lock",
    );
    expect(released).toBe(true);
  });
});

type ReservedConnection = ((
  strings: TemplateStringsArray,
  ...values: readonly unknown[]
) => Promise<readonly unknown[]>) & {
  release: () => Promise<void>;
};

function makeReservedConnection(
  execute: (statement: string, values: readonly unknown[]) => Promise<readonly unknown[]>,
): ReservedConnection {
  const tag = async (strings: TemplateStringsArray, ...values: readonly unknown[]) =>
    execute(strings.join(" "), values);
  return Object.assign(tag, {
    release: async () => undefined,
  });
}
