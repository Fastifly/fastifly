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

export const MoneyAmountSchema = z.strictObject({
  amountMinor: AmountMinorStringSchema,
  currencyCode: CurrencyCodeSchema,
});

export type MoneyAmount = z.infer<typeof MoneyAmountSchema>;

const DEFAULT_MONEY_DISPLAY_LOCALE = "en-IN";
const DEFAULT_MONEY_DISPLAY_FRACTION_DIGITS = 2;

export type FormatMoneyMinorOptions = {
  readonly currencyDisplay?: Intl.NumberFormatOptions["currencyDisplay"];
  readonly locale?: string;
};

export function parseAmountMinor(value: string): bigint {
  AmountMinorStringSchema.parse(value);
  return BigInt(value);
}

export function parseDecimalMoneyToMinor(value: string): AmountMinorString {
  const trimmed = value.trim();
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("Money amount must be a positive decimal with up to 2 fraction digits");
  }

  const [whole = "0", fraction = ""] = trimmed.split(".");
  const amountMinor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  return formatAmountMinor(amountMinor);
}

export function parseSignedDecimalMoneyToMinor(value: string): AmountMinorString {
  const trimmed = value.trim();
  if (!/^-?(0|[1-9]\d*)(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("Money amount must be a decimal with up to 2 fraction digits");
  }

  const isNegative = trimmed.startsWith("-");
  const unsigned = isNegative ? trimmed.slice(1) : trimmed;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const amountMinor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  return formatAmountMinor(isNegative && amountMinor > 0n ? -amountMinor : amountMinor);
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

export function formatMoneyMinor(
  amountMinor: bigint | AmountMinorString,
  currencyCode: string,
  options: FormatMoneyMinorOptions = {},
): string {
  const amount =
    typeof amountMinor === "bigint"
      ? amountMinor
      : BigInt(AmountMinorStringSchema.parse(amountMinor));
  const currency = parseCurrencyCode(currencyCode);
  const locale = options.locale ?? DEFAULT_MONEY_DISPLAY_LOCALE;
  const currencyDisplay = options.currencyDisplay ?? "narrowSymbol";
  const formatter = new Intl.NumberFormat(locale, {
    currency,
    currencyDisplay,
    maximumFractionDigits: DEFAULT_MONEY_DISPLAY_FRACTION_DIGITS,
    minimumFractionDigits: DEFAULT_MONEY_DISPLAY_FRACTION_DIGITS,
    style: "currency",
  });
  const absolute = amount < 0n ? -amount : amount;
  const groupedInteger = groupMoneyInteger(
    (absolute / 100n).toString(),
    locale,
    getGroupSeparator(locale),
  );
  const fraction = (absolute % 100n)
    .toString()
    .padStart(DEFAULT_MONEY_DISPLAY_FRACTION_DIGITS, "0");

  return renderMoneyParts({
    formatter,
    fraction,
    groupedInteger,
    isNegative: amount < 0n,
  });
}

function renderMoneyParts(input: {
  readonly formatter: Intl.NumberFormat;
  readonly fraction: string;
  readonly groupedInteger: string;
  readonly isNegative: boolean;
}): string {
  let integerRendered = false;
  const template = input.formatter.formatToParts(input.isNegative ? -1234.56 : 1234.56);

  return template
    .flatMap((part) => {
      if (part.type === "integer") {
        if (integerRendered) {
          return [];
        }

        integerRendered = true;
        return [input.groupedInteger];
      }

      if (part.type === "group") {
        return [];
      }

      if (part.type === "fraction") {
        return [input.fraction];
      }

      return [part.value];
    })
    .join("");
}

function getGroupSeparator(locale: string): string {
  const groupPart = new Intl.NumberFormat(locale, { useGrouping: true })
    .formatToParts(1000)
    .find((part) => part.type === "group");
  return groupPart?.value ?? ",";
}

function groupMoneyInteger(value: string, locale: string, separator: string): string {
  if (value.length <= 3) {
    return value;
  }

  if (locale.toLocaleLowerCase("en-US").startsWith("en-in")) {
    const lastThree = value.slice(-3);
    const head = value.slice(0, -3);
    const groupedHead = head.replace(/\B(?=(\d{2})+(?!\d))/g, separator);
    return `${groupedHead}${separator}${lastThree}`;
  }

  return value.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}
