import { z } from "zod";

export const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;
export const AMOUNT_MINOR_PATTERN = /^-?(0|[1-9]\d*)$/;

export const MIN_SIGNED_64 = -(2n ** 63n);
export const MAX_SIGNED_64 = 2n ** 63n - 1n;

export const CurrencyCodeSchema = z
  .string()
  .regex(CURRENCY_CODE_PATTERN, "Currency code must be a three-letter ISO 4217 code");

export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;

export function isCurrencyCode(value: string): value is CurrencyCode {
  return CurrencyCodeSchema.safeParse(value).success;
}

export function parseCurrencyCode(value: string): CurrencyCode {
  return CurrencyCodeSchema.parse(value);
}

export const AmountMinorStringSchema = z.string().superRefine((value, ctx) => {
  if (!AMOUNT_MINOR_PATTERN.test(value) || value === "-0") {
    ctx.addIssue({
      code: "custom",
      message: "Amount minor must be a base-10 integer string without decimals or separators",
    });
    return;
  }

  const parsed = BigInt(value);
  if (parsed < MIN_SIGNED_64 || parsed > MAX_SIGNED_64) {
    ctx.addIssue({
      code: "custom",
      message: "Amount minor must fit in a signed 64-bit integer",
    });
  }
});

export type AmountMinorString = z.infer<typeof AmountMinorStringSchema>;

export const MoneyAmountSchema = z
  .object({
    amountMinor: AmountMinorStringSchema,
    currencyCode: CurrencyCodeSchema,
  })
  .strict();

export type MoneyAmount = z.infer<typeof MoneyAmountSchema>;

export function parseAmountMinor(value: string): bigint {
  AmountMinorStringSchema.parse(value);
  return BigInt(value);
}

export function formatAmountMinor(value: bigint): AmountMinorString {
  if (value < MIN_SIGNED_64 || value > MAX_SIGNED_64) {
    throw new RangeError("Amount minor must fit in a signed 64-bit integer");
  }

  return AmountMinorStringSchema.parse(value.toString());
}

export function makeMoneyAmount(amountMinor: bigint, currencyCode: string): MoneyAmount {
  return MoneyAmountSchema.parse({
    amountMinor: formatAmountMinor(amountMinor),
    currencyCode,
  });
}
