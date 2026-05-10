import { describe, expect, it } from "vitest";

import {
  formatAmountMinor,
  formatMoneyMinor,
  MAX_SIGNED_64,
  MIN_SIGNED_64,
  MoneyAmountSchema,
  makeMoneyAmount,
  parseAmountMinor,
  parseDecimalMoneyToMinor,
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

  it("converts user-entered decimal money to integer minor units without floats", () => {
    expect(parseDecimalMoneyToMinor("125")).toBe("12500");
    expect(parseDecimalMoneyToMinor("125.5")).toBe("12550");
    expect(parseDecimalMoneyToMinor("125.50")).toBe("12550");
    expect(parseDecimalMoneyToMinor("0.99")).toBe("99");
    expect(parseDecimalMoneyToMinor(" 10.01 ")).toBe("1001");

    for (const value of ["", "-1", "01", "1.234", "1,000", "1e3"]) {
      expect(() => parseDecimalMoneyToMinor(value)).toThrow();
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

  it("formats integer minor-unit money for display with narrow currency symbols", () => {
    expect(formatMoneyMinor(12550n, "INR")).toBe("₹125.50");
    expect(formatMoneyMinor(-12550n, "INR")).toBe("-₹125.50");
    expect(formatMoneyMinor("123456789", "INR")).toBe("₹12,34,567.89");
    expect(formatMoneyMinor(12550n, "USD", { locale: "en-US" })).toBe("$125.50");
  });
});
