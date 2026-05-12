import {
  type AccountKind,
  type AccountSubtype,
  type CreateAccountRequest,
  CreateAccountRequestSchema,
  parseSignedDecimalMoneyToMinor,
} from "@fastifly/common";

export type AccountFormType = "bank" | "cash" | "credit_card" | "investment" | "loan" | "wallet";

export type AccountFormValues = {
  readonly currencyCode: string;
  readonly name: string;
  readonly openingBalance: string;
  readonly openingBalanceDate: string;
  readonly type: AccountFormType;
};

export type AccountTypeDefinition = {
  readonly kind: AccountKind;
  readonly supportsOpeningBalance: boolean;
  readonly subtype: AccountSubtype;
  readonly type: AccountFormType;
};

export const ACCOUNT_FORM_TYPES: readonly AccountTypeDefinition[] = [
  { kind: "asset", subtype: "bank", supportsOpeningBalance: true, type: "bank" },
  { kind: "asset", subtype: "cash", supportsOpeningBalance: true, type: "cash" },
  { kind: "asset", subtype: "wallet", supportsOpeningBalance: true, type: "wallet" },
  { kind: "asset", subtype: "investment", supportsOpeningBalance: true, type: "investment" },
  { kind: "liability", subtype: "credit_card", supportsOpeningBalance: true, type: "credit_card" },
  { kind: "liability", subtype: "loan", supportsOpeningBalance: true, type: "loan" },
] as const;

export function makeAccountFormDefaults(type: AccountFormType = "bank"): AccountFormValues {
  return {
    currencyCode: "INR",
    name: "",
    openingBalance: "",
    openingBalanceDate: new Date().toISOString().slice(0, 10),
    type,
  };
}

export function buildCreateAccountRequest(values: AccountFormValues): CreateAccountRequest {
  const definition = getAccountTypeDefinition(values.type);
  const name = values.name.trim();
  if (!name) {
    throw new Error("Account name is required.");
  }

  const request: CreateAccountRequest = {
    currencyCode: values.currencyCode.trim().toUpperCase(),
    kind: definition.kind,
    name,
    subtype: definition.subtype,
  };

  const openingBalance = values.openingBalance.trim();
  if (definition.supportsOpeningBalance && openingBalance) {
    if (!values.openingBalanceDate.trim()) {
      throw new Error("Opening balance date is required.");
    }

    return CreateAccountRequestSchema.parse({
      ...request,
      openingBalanceDate: values.openingBalanceDate,
      openingBalanceMinor: parseSignedDecimalMoneyToMinor(openingBalance),
    });
  }

  return CreateAccountRequestSchema.parse(request);
}

export function getAccountTypeDefinition(type: AccountFormType): AccountTypeDefinition {
  const definition = ACCOUNT_FORM_TYPES.find((candidate) => candidate.type === type);
  if (!definition) {
    throw new Error("Choose a valid account type.");
  }

  return definition;
}
