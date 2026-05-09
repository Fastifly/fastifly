import { MoneyAmountSchema, makeValidationError } from "@fastifly/common";

export const apiPackageName = "@fastifly/api";

export const apiSharedContractSmoke = {
  moneySchema: MoneyAmountSchema,
  validationErrorFactory: makeValidationError,
};
