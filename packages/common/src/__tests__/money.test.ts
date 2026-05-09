import { describe, expect, it } from "vitest";

import {
  formatAmountMinor,
  MAX_SIGNED_64,
  MIN_SIGNED_64,
  MoneyAmountSchema,
  makeMoneyAmount,
  parseAmountMinor,
} from "../money.js";

describe("money contracts", () => {
  it("parses integer minor-unit strings into bigint", () => {
    expect(parseAmountMinor("0")).toBe(0n);
    expect(parseAmountMinor("12550")).toBe(12550n);
    expect(parseAmountMinor("-12550")).toBe(-12550n);
  });

  it("rejects unsafe amount strings", () => {
    for (const value of ["", "01", "-0", "1.25", "1e3", "1,000", " 10"]) {
      expect(() => parseAmountMinor(value)).toThrow();
    }
  });

  it("rejects values outside signed 64-bit database range", () => {
    expect(() => parseAmountMinor((MAX_SIGNED_64 + 1n).toString())).toThrow();
    expect(() => parseAmountMinor((MIN_SIGNED_64 - 1n).toString())).toThrow();
  });

  it("builds strict API money payloads with currency", () => {
    expect(makeMoneyAmount(12550n, "INR")).toEqual({
      amountMinor: "12550",
      currencyCode: "INR",
    });
    expect(formatAmountMinor(MAX_SIGNED_64)).toBe(MAX_SIGNED_64.toString());
    expect(MoneyAmountSchema.safeParse({ amountMinor: "12550" }).success).toBe(false);
    expect(
      MoneyAmountSchema.safeParse({
        amountMinor: "12550",
        currencyCode: "inr",
      }).success,
    ).toBe(false);
  });
});
