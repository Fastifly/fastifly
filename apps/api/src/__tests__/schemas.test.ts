import { describe, expect, it } from "vitest";

import { ErrorResponseSchemas, HealthResponseSchema, ReadyResponseSchema } from "../schemas.js";

const requestId = "019b0d3d-5e30-7c9e-90af-95a7a67b2c38";

describe("API response schemas", () => {
  it("keeps health and readiness response contracts strict", () => {
    expect(() =>
      HealthResponseSchema.parse({
        requestId,
        service: "fastifly-api",
        status: "ok",
      }),
    ).not.toThrow();

    expect(() =>
      ReadyResponseSchema.parse({
        checks: {
          config: "ok",
          migrations: "ok",
        },
        requestId,
        status: "ready",
      }),
    ).not.toThrow();

    expect(
      HealthResponseSchema.safeParse({
        extra: true,
        requestId,
        service: "fastifly-api",
        status: "ok",
      }).success,
    ).toBe(false);
  });

  it("uses status-specific error codes in response contracts", () => {
    expect(
      ErrorResponseSchemas[404].parse({
        error: {
          code: "NOT_FOUND",
          details: {},
          message: "The requested resource was not found.",
          requestId,
        },
      }),
    ).toMatchObject({
      error: { code: "NOT_FOUND" },
    });

    expect(
      ErrorResponseSchemas[404].safeParse({
        error: {
          code: "CONFLICT",
          details: {},
          message: "Wrong code for this status.",
          requestId,
        },
      }).success,
    ).toBe(false);
  });
});
