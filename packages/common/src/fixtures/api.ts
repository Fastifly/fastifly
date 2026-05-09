import { ApiErrorSchema, ValidationErrorSchema } from "../api/errors.js";
import { paginatedResponseSchema } from "../api/pagination.js";
import { MoneyAmountSchema } from "../money.js";

export const moneyAmountFixture = MoneyAmountSchema.parse({
  amountMinor: "12550",
  currencyCode: "INR",
});

export const validationErrorFixture = ValidationErrorSchema.parse({
  error: {
    code: "VALIDATION_ERROR",
    message: "The request contains invalid fields.",
    details: {
      fields: {
        "transactions.0.amountMinor": ["Amount is required."],
      },
    },
    requestId: "req_fixture",
  },
});

export const forbiddenErrorFixture = ApiErrorSchema.parse({
  error: {
    code: "FORBIDDEN",
    message: "You do not have permission to perform this action.",
    details: {},
    requestId: "req_fixture",
  },
});

export const emptyPaginatedMoneyFixture = paginatedResponseSchema(MoneyAmountSchema).parse({
  data: [],
  pageInfo: {
    nextCursor: null,
    previousCursor: null,
    hasNextPage: false,
    hasPreviousPage: false,
  },
});
