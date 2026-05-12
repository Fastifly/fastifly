import { z } from "zod";

export const AccountKindSchema = z.enum(["asset", "liability", "expense", "revenue", "equity"]);
export type AccountKind = z.infer<typeof AccountKindSchema>;

export const AccountSubtypeSchema = z.enum([
  "bank",
  "cash",
  "wallet",
  "credit_card",
  "loan",
  "investment",
  "income_source",
  "expense_category",
  "external",
  "opening_helper",
  "reconciliation_helper",
]);

export type AccountSubtype = z.infer<typeof AccountSubtypeSchema>;

export const UserFacingTransactionTypeSchema = z.enum([
  "expense",
  "income",
  "transfer",
  "opening_balance",
  "reconciliation",
]);

export type UserFacingTransactionType = z.infer<typeof UserFacingTransactionTypeSchema>;

export type AccountDescriptor = {
  readonly kind: AccountKind;
  readonly subtype?: AccountSubtype;
};

export type AccountCompatibilityRule = {
  readonly source: readonly AccountKind[];
  readonly sourceSubtype?: AccountSubtype;
  readonly destination: readonly AccountKind[];
  readonly destinationSubtype?: AccountSubtype;
  readonly transactionType: UserFacingTransactionType;
};

const ASSET_OR_LIABILITY = ["asset", "liability"] as const satisfies readonly AccountKind[];
export const USER_HELD_ACCOUNT_KINDS = ASSET_OR_LIABILITY;

export const ACCOUNT_COMPATIBILITY_MATRIX: readonly AccountCompatibilityRule[] = [
  {
    source: ASSET_OR_LIABILITY,
    destination: ["expense"] as const,
    destinationSubtype: "external",
    transactionType: "expense",
  },
  {
    source: ["revenue"] as const,
    sourceSubtype: "external",
    destination: ASSET_OR_LIABILITY,
    transactionType: "income",
  },
  {
    source: ASSET_OR_LIABILITY,
    destination: ASSET_OR_LIABILITY,
    transactionType: "transfer",
  },
  {
    source: ["equity"] as const,
    sourceSubtype: "opening_helper",
    destination: ASSET_OR_LIABILITY,
    transactionType: "opening_balance",
  },
  {
    source: ["equity"] as const,
    sourceSubtype: "reconciliation_helper",
    destination: ASSET_OR_LIABILITY,
    transactionType: "reconciliation",
  },
] as const;

function matchesAccount(
  account: AccountDescriptor,
  kinds: readonly AccountKind[],
  subtype?: AccountSubtype,
) {
  if (!kinds.includes(account.kind)) {
    return false;
  }

  return subtype === undefined || account.subtype === subtype;
}

export function inferTransactionType(
  source: AccountDescriptor,
  destination: AccountDescriptor,
): UserFacingTransactionType | null {
  for (const rule of ACCOUNT_COMPATIBILITY_MATRIX) {
    if (
      matchesAccount(source, rule.source, rule.sourceSubtype) &&
      matchesAccount(destination, rule.destination, rule.destinationSubtype)
    ) {
      return rule.transactionType;
    }
  }

  return null;
}

export function isCompatibleAccountPair(
  source: AccountDescriptor,
  destination: AccountDescriptor,
): boolean {
  return inferTransactionType(source, destination) !== null;
}

export function isUserHeldAccountKind(kind: AccountKind): boolean {
  return (USER_HELD_ACCOUNT_KINDS as readonly AccountKind[]).includes(kind);
}
