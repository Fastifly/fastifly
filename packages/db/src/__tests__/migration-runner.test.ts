import { describe, expect, it } from "vitest";

import { splitSqlStatements } from "../testing/migrations.js";

describe("migration runner", () => {
  it("splits semicolon-delimited SQL while preserving quoted semicolons", () => {
    expect(
      splitSqlStatements(`
        CREATE TABLE example (id TEXT PRIMARY KEY);
        INSERT INTO example (id) VALUES ('a;b');
      `),
    ).toEqual([
      "CREATE TABLE example (id TEXT PRIMARY KEY)",
      "INSERT INTO example (id) VALUES ('a;b')",
    ]);
  });
});
