import { describe, expect, it } from "vitest";

import { webSharedContractSmoke } from "../index.js";

describe("web shared contract smoke", () => {
  it("uses package contracts instead of local duplicate schemas", () => {
    expect(
      webSharedContractSmoke.moneySchema.parse({
        amountMinor: "12550",
        currencyCode: "INR",
      }),
    ).toEqual({
      amountMinor: "12550",
      currencyCode: "INR",
    });

    expect(webSharedContractSmoke.paginationQuerySchema.parse({ limit: "25" })).toEqual({
      limit: 25,
    });
  });
});
