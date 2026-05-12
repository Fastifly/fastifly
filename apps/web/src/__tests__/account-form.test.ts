import { describe, expect, it } from "vitest";

import {
  buildCreateAccountRequest,
  getAccountTypeDefinition,
  makeAccountFormDefaults,
} from "../finance/account-form";

describe("account form", () => {
  it("builds a create account request for asset accounts with signed opening balance", () => {
    expect(
      buildCreateAccountRequest({
        currencyCode: "inr",
        name: "  Emergency fund ",
        openingBalance: "-125.50",
        openingBalanceDate: "2026-05-10",
        type: "bank",
      }),
    ).toEqual({
      currencyCode: "INR",
      kind: "asset",
      name: "Emergency fund",
      openingBalanceDate: "2026-05-10",
      openingBalanceMinor: "-12550",
      subtype: "bank",
    });
  });

  it("maps liability accounts and disables opening balance parsing when left empty", () => {
    expect(
      buildCreateAccountRequest({
        ...makeAccountFormDefaults("credit_card"),
        name: "Card",
        openingBalance: "",
      }),
    ).toEqual({
      currencyCode: "INR",
      kind: "liability",
      name: "Card",
      subtype: "credit_card",
    });

    expect(getAccountTypeDefinition("investment")).toMatchObject({
      kind: "asset",
      subtype: "investment",
      supportsOpeningBalance: true,
    });
  });

  it("rejects missing names and unsafe opening balances", () => {
    expect(() =>
      buildCreateAccountRequest({
        ...makeAccountFormDefaults(),
        name: "",
      }),
    ).toThrow("Account name is required.");

    expect(() =>
      buildCreateAccountRequest({
        ...makeAccountFormDefaults(),
        name: "Checking",
        openingBalance: "1.234",
      }),
    ).toThrow("Money amount must be a decimal with up to 2 fraction digits");
  });
});
