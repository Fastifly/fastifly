import { ApiErrorSchema, ValidationErrorSchema } from "../api/errors.js";
import { ListAccountsResponseSchema, ListTransactionsResponseSchema } from "../api/finance.js";
import { encodeFinanceCursor, paginatedResponseSchema } from "../api/pagination.js";
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

export const accountListFixture = ListAccountsResponseSchema.parse({
  data: [
    {
      archivedAt: null,
      balance: { amountMinor: "25000", currencyCode: "INR" },
      createdAt: "2026-05-09T00:00:00.000Z",
      currencyCode: "INR",
      id: "019dfbac-3319-7773-9a7d-52fb8d9b73e6",
      isActive: true,
      kind: "asset",
      ledgerId: "019dfbac-3319-7773-9a7d-52fb8d9b73e7",
      name: "Bank",
      openingBalanceDate: null,
      openingBalanceMinor: null,
      reportingBalance: { amountMinor: "25000", currencyCode: "INR" },
      subtype: "bank",
      updatedAt: "2026-05-09T00:00:00.000Z",
      workspaceId: "019dfbac-3319-7773-9a7d-52fb8d9b73e8",
    },
  ],
  pageInfo: {
    hasNextPage: true,
    hasPreviousPage: false,
    nextCursor: encodeFinanceCursor({
      id: "019dfbac-3319-7773-9a7d-52fb8d9b73e6",
      kind: "account.name.asc",
      sortKey: "Bank",
      v: 1,
    }),
    previousCursor: null,
  },
});

export const transactionListFixture = ListTransactionsResponseSchema.parse({
  data: [
    {
      id: "019dfbac-3319-7773-9a7d-52fb8d9b73e9",
      journals: [
        {
          description: "Groceries",
          id: "019dfbac-3319-7773-9a7d-52fb8d9b73ea",
          occurredAt: "2026-05-09T08:00:00.000Z",
          postings: [
            {
              accountId: "019dfbac-3319-7773-9a7d-52fb8d9b73e6",
              amountMinor: "-12000",
              currencyCode: "INR",
              id: "019dfbac-3319-7773-9a7d-52fb8d9b73eb",
              reportingAmountMinor: "-12000",
              reportingCurrencyCode: "INR",
            },
            {
              accountId: "019dfbac-3319-7773-9a7d-52fb8d9b73ec",
              amountMinor: "12000",
              currencyCode: "INR",
              id: "019dfbac-3319-7773-9a7d-52fb8d9b73ed",
              reportingAmountMinor: "12000",
              reportingCurrencyCode: "INR",
            },
          ],
          type: "expense",
        },
      ],
      ledgerId: "019dfbac-3319-7773-9a7d-52fb8d9b73e7",
      title: "Groceries",
      type: "expense",
      workspaceId: "019dfbac-3319-7773-9a7d-52fb8d9b73e8",
    },
  ],
  pageInfo: {
    hasNextPage: true,
    hasPreviousPage: false,
    nextCursor: encodeFinanceCursor({
      id: "019dfbac-3319-7773-9a7d-52fb8d9b73e9",
      kind: "transaction.lastOccurredAt.desc",
      sortKey: "2026-05-09T08:00:00.000Z",
      v: 1,
    }),
    previousCursor: null,
  },
});
