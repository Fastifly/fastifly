import { describe, expect, it } from "vitest";
import { z } from "zod";

import { makeValidationError } from "../api/errors.js";
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
