import { describe, expect, it } from "vitest";

import {
  buildTransactionListQuery,
  makeTransactionListFilterDefaults,
} from "../finance/transaction-list";

describe("transaction list filters", () => {
  it("omits all-filters while keeping a small mobile-friendly page size", () => {
    expect(buildTransactionListQuery(makeTransactionListFilterDefaults())).toEqual({
      limit: 10,
    });
  });

  it("builds the shared API query parameters for selected filters", () => {
    expect(
      buildTransactionListQuery({
        accountId: "018f3f52-7d7e-7000-a000-000000000001",
        limit: 25,
        status: "cleared",
        type: "expense",
      }),
    ).toEqual({
      accountId: "018f3f52-7d7e-7000-a000-000000000001",
      limit: 25,
      status: "cleared",
      type: "expense",
    });
  });
});
