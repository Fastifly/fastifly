import { CursorPaginationQuerySchema, MoneyAmountSchema } from "@fastifly/common";

export const webPackageName = "@fastifly/web";

export const webSharedContractSmoke = {
  moneySchema: MoneyAmountSchema,
  paginationQuerySchema: CursorPaginationQuerySchema,
};
