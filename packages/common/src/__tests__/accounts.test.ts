import { describe, expect, it } from "vitest";

import { inferTransactionType, isCompatibleAccountPair } from "../product-rules/accounts.js";

describe("account compatibility matrix", () => {
  it("infers the supported day-one transaction types", () => {
    expect(
      inferTransactionType(
        { kind: "asset", subtype: "bank" },
        { kind: "expense", subtype: "external" },
      ),
    ).toBe("expense");

    expect(
      inferTransactionType(
        { kind: "revenue", subtype: "external" },
        { kind: "asset", subtype: "bank" },
      ),
    ).toBe("income");

    expect(inferTransactionType({ kind: "asset" }, { kind: "liability" })).toBe("transfer");

    expect(
      inferTransactionType(
        { kind: "equity", subtype: "opening_helper" },
        { kind: "asset", subtype: "bank" },
      ),
    ).toBe("opening_balance");

    expect(
      inferTransactionType(
        { kind: "equity", subtype: "reconciliation_helper" },
        { kind: "asset", subtype: "bank" },
      ),
    ).toBe("reconciliation");
  });

  it("rejects invalid source and destination pairs", () => {
    expect(isCompatibleAccountPair({ kind: "expense" }, { kind: "asset" })).toBe(false);
    expect(isCompatibleAccountPair({ kind: "asset" }, { kind: "revenue" })).toBe(false);
    expect(isCompatibleAccountPair({ kind: "revenue" }, { kind: "expense" })).toBe(false);
  });
});
