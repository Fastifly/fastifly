import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
  ActualImportParseError,
  parseActualBudgetExport,
} from "../../src/services/actual-import-parser.js";
import { buildActualBudgetZip } from "../e2e/helpers/actual-budget-fixture.js";

describe("parseActualBudgetExport", () => {
  it("reads accounts, categories, payees, and transactions from a real Actual export shape", () => {
    const zip = buildActualBudgetZip({
      accounts: [
        { id: "acc-checking", name: "Checking", type: "checking" },
        { id: "acc-dead", name: "Old", tombstone: 1 },
      ],
      budgetName: "My Budget",
      categories: [
        { id: "cat-food", name: "Food" },
        { id: "cat-salary", is_income: 1, name: "Salary" },
      ],
      categoryGroups: [{ id: "grp", name: "Everyday" }],
      payeeMappings: [{ id: "payee-old", targetId: "payee-store" }],
      payees: [{ id: "payee-store", name: "Corner Store" }],
      transactions: [
        {
          acct: "acc-checking",
          amount: -4200,
          category: "cat-food",
          date: 20260115,
          description: "payee-store",
          id: "txn-1",
        },
      ],
    });

    const result = parseActualBudgetExport(zip);

    expect(result.budgetName).toBe("My Budget");
    expect(result.accounts).toHaveLength(2);
    expect(result.accounts.find((a) => a.id === "acc-dead")?.tombstone).toBe(1);
    expect(result.categories.map((c) => c.id).sort()).toEqual(["cat-food", "cat-salary"]);
    expect(result.categories.find((c) => c.id === "cat-salary")?.is_income).toBe(1);
    expect(result.payeeMappings).toEqual([{ id: "payee-old", targetId: "payee-store" }]);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({
      acct: "acc-checking",
      amount: -4200,
      category: "cat-food",
      date: 20260115,
      description: "payee-store",
    });
  });

  it("tolerates a database that is missing optional tables and columns", () => {
    const zip = buildActualBudgetZip({
      accounts: [{ id: "acc-1", name: "Wallet" }],
      transactions: [{ acct: "acc-1", amount: -100, id: "txn-1" }],
    });

    const result = parseActualBudgetExport(zip);
    expect(result.accounts).toHaveLength(1);
    expect(result.transactions).toHaveLength(1);
    expect(result.payees).toEqual([]);
    expect(result.payeeMappings).toEqual([]);
  });

  it("ignores unrelated files in the archive", () => {
    const dbBytes = unzipSync(
      buildActualBudgetZip({
        accounts: [{ id: "acc-1", name: "Wallet" }],
        transactions: [{ acct: "acc-1", amount: -100, id: "txn-1" }],
      }),
    )["db.sqlite"];
    if (!dbBytes) {
      throw new Error("Expected db.sqlite in the built fixture.");
    }

    const repacked = zipSync({
      "db.sqlite": dbBytes,
      "junk.bin": new Uint8Array([9, 9, 9, 9]),
      "metadata.json": new TextEncoder().encode('{"budgetName":"X"}'),
    });
    const result = parseActualBudgetExport(repacked);
    expect(result.accounts).toHaveLength(1);
    expect(result.budgetName).toBe("X");
  });

  it("throws when the archive does not contain db.sqlite", () => {
    const zip = zipSync({ "metadata.json": new TextEncoder().encode("{}") });
    expect(() => parseActualBudgetExport(zip)).toThrow(ActualImportParseError);
  });

  it("throws when the bytes are not a valid zip archive", () => {
    expect(() => parseActualBudgetExport(new Uint8Array([1, 2, 3, 4]))).toThrow(
      ActualImportParseError,
    );
  });

  it("throws when db.sqlite is not a valid SQLite database", () => {
    const zip = zipSync({ "db.sqlite": new TextEncoder().encode("not a database") });
    expect(() => parseActualBudgetExport(zip)).toThrow(ActualImportParseError);
  });
});
