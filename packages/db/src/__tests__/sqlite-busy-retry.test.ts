import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { createConfiguredSqliteClient, isSqliteBusyError, withSqliteBusyRetry } from "../index.js";

function busyError(): Error {
  return Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" });
}

describe("withSqliteBusyRetry", () => {
  it("retries transient SQLITE_BUSY failures then resolves", async () => {
    const sleep = vi.fn(async () => undefined);
    let calls = 0;
    const result = await withSqliteBusyRetry(
      () => {
        calls += 1;
        if (calls < 3) {
          throw busyError();
        }
        return 42;
      },
      { baseDelayMs: 1, retries: 5, sleep },
    );

    expect(result).toBe(42);
    expect(calls).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retry budget is exhausted", async () => {
    const sleep = vi.fn(async () => undefined);
    let calls = 0;
    await expect(
      withSqliteBusyRetry(
        () => {
          calls += 1;
          throw busyError();
        },
        { baseDelayMs: 1, retries: 2, sleep },
      ),
    ).rejects.toMatchObject({ code: "SQLITE_BUSY" });

    expect(calls).toBe(3); // initial attempt + 2 retries
  });

  it("rethrows non-busy errors immediately", async () => {
    const sleep = vi.fn(async () => undefined);
    let calls = 0;
    await expect(
      withSqliteBusyRetry(
        () => {
          calls += 1;
          throw new Error("constraint failed");
        },
        { sleep },
      ),
    ).rejects.toThrow("constraint failed");

    expect(calls).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(isSqliteBusyError(new Error("x"))).toBe(false);
    expect(isSqliteBusyError(busyError())).toBe(true);
  });
});

describe("SQLite cross-connection write serialization", () => {
  it("serializes two connections via BEGIN IMMEDIATE and recovers after commit", () => {
    const dir = mkdtempSync(join(tmpdir(), "fastifly-sqlite-concurrency-"));
    const path = join(dir, "shared.db");
    const api = createConfiguredSqliteClient({ source: path });
    const worker = createConfiguredSqliteClient({ source: path });
    // Simulate a short-tempered second writer so the test does not block for the full timeout.
    worker.pragma("busy_timeout = 50");

    try {
      api.exec("CREATE TABLE counter (id INTEGER PRIMARY KEY, value INTEGER NOT NULL)");
      api.prepare("INSERT INTO counter (id, value) VALUES (1, 0)").run();

      // The API process holds the write lock inside an immediate transaction.
      api.exec("BEGIN IMMEDIATE");
      api.prepare("UPDATE counter SET value = value + 1 WHERE id = 1").run();

      // The worker process cannot acquire the write lock and surfaces SQLITE_BUSY.
      let observed: unknown;
      try {
        worker.prepare("UPDATE counter SET value = value + 1 WHERE id = 1").run();
      } catch (error) {
        observed = error;
      }
      expect(isSqliteBusyError(observed)).toBe(true);

      // Once the API commits, the worker write succeeds — no lost update.
      api.exec("COMMIT");
      worker.prepare("UPDATE counter SET value = value + 1 WHERE id = 1").run();

      const value = (api.prepare("SELECT value FROM counter WHERE id = 1").get() as {
        readonly value: number;
      }).value;
      expect(value).toBe(2);
    } finally {
      api.close();
      worker.close();
      rmSync(dir, { force: true, recursive: true });
    }
  });
});
