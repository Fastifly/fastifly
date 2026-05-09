import { describe, expect, it } from "vitest";
import { z } from "zod";

import { makeValidationError } from "../api/errors.js";
import { CreateTransactionRequestSchema } from "../api/finance.js";
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_REPLAYED_HEADER,
  IdempotencyKeySchema,
  parseOptionalIdempotencyKey,
} from "../api/idempotency.js";
import { CursorPaginationQuerySchema, paginatedResponseSchema } from "../api/pagination.js";
import {
  emptyPaginatedMoneyFixture,
  forbiddenErrorFixture,
  moneyAmountFixture,
  validationErrorFixture,
} from "../fixtures/api.js";

describe("API contract schemas", () => {
  it("keeps validation errors mapped to dotted form paths", () => {
    expect(
      makeValidationError({
        requestId: "req_test",
        fields: {
          "transactions.0.amountMinor": ["Amount is required."],
        },
      }),
    ).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "The request contains invalid fields.",
        details: {
          fields: {
            "transactions.0.amountMinor": ["Amount is required."],
          },
        },
        requestId: "req_test",
      },
    });
  });

  it("normalizes cursor pagination query limits", () => {
    expect(CursorPaginationQuerySchema.parse({ limit: "25" })).toEqual({ limit: 25 });
    expect(CursorPaginationQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(CursorPaginationQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });

  it("keeps idempotency headers and keys strict", () => {
    expect(IDEMPOTENCY_KEY_HEADER).toBe("idempotency-key");
    expect(IDEMPOTENCY_REPLAYED_HEADER).toBe("idempotency-replayed");
    expect(parseOptionalIdempotencyKey(" retry_123 ")).toBe("retry_123");
    expect(parseOptionalIdempotencyKey(["retry_456"])).toBe("retry_456");
    expect(parseOptionalIdempotencyKey(undefined)).toBeNull();
    expect(IdempotencyKeySchema.safeParse("contains space").success).toBe(false);
  });

  it("keeps finance write contracts strict about money and split rows", () => {
    const validSplit = CreateTransactionRequestSchema.parse({
      currencyCode: "INR",
      description: "Grocery shopping",
      occurredAt: "2026-05-09T08:00:00.000Z",
      sourceAccountId: "019dfbac-3319-7773-9a7d-52fb8d9b73e6",
      transactions: [
        {
          amountMinor: "80000",
          destinationAccountId: "019dfbac-3319-7773-9a7d-52fb8d9b73e7",
        },
        {
          amountMinor: "40000",
          destinationAccountId: "019dfbac-3319-7773-9a7d-52fb8d9b73e8",
        },
      ],
      type: "expense",
    });

    expect(validSplit.transactions).toHaveLength(2);
    expect(CreateTransactionRequestSchema.safeParse({ ...validSplit, extra: true }).success).toBe(
      false,
    );
    expect(
      CreateTransactionRequestSchema.safeParse({
        ...validSplit,
        transactions: [{ ...validSplit.transactions[0], amountMinor: 12_000 }],
      }).success,
    ).toBe(false);
    expect(
      CreateTransactionRequestSchema.safeParse({
        ...validSplit,
        transactions: [{ ...validSplit.transactions[0], amountMinor: "12.00" }],
      }).success,
    ).toBe(false);
  });

  it("creates strict paginated response schemas", () => {
    const AccountListSchema = paginatedResponseSchema(
      z.object({ id: z.string(), name: z.string() }).strict(),
    );

    expect(
      AccountListSchema.safeParse({
        data: [{ id: "account_1", name: "Checking" }],
        pageInfo: {
          nextCursor: null,
          previousCursor: null,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      }).success,
    ).toBe(true);
  });

  it("keeps exported contract fixtures schema-valid", () => {
    expect(moneyAmountFixture).toEqual({ amountMinor: "12550", currencyCode: "INR" });
    expect(validationErrorFixture.error.code).toBe("VALIDATION_ERROR");
    expect(forbiddenErrorFixture.error.code).toBe("FORBIDDEN");
    expect(emptyPaginatedMoneyFixture.data).toEqual([]);
  });
});
