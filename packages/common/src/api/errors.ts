import { z } from "zod";

export const ApiErrorCodeSchema = z.enum([
  "BAD_REQUEST",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "VALIDATION_ERROR",
  "IDEMPOTENCY_REPLAY",
  "INTERNAL_SERVER_ERROR",
]);

export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const FieldErrorMapSchema = z.record(z.string().min(1), z.array(z.string().min(1)));
export type FieldErrorMap = z.infer<typeof FieldErrorMapSchema>;

export const ApiErrorSchema = z
  .object({
    error: z
      .object({
        code: ApiErrorCodeSchema,
        message: z.string().min(1),
        details: z.record(z.string(), z.unknown()),
        requestId: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type ApiError = z.infer<typeof ApiErrorSchema>;

export const ValidationErrorSchema = z
  .object({
    error: z
      .object({
        code: z.literal("VALIDATION_ERROR"),
        message: z.string().min(1),
        details: z
          .object({
            fields: FieldErrorMapSchema,
          })
          .strict(),
        requestId: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type ValidationError = z.infer<typeof ValidationErrorSchema>;

export function makeApiError(input: ApiError["error"]): ApiError {
  return ApiErrorSchema.parse({ error: input });
}

export function makeValidationError(input: {
  readonly message?: string;
  readonly fields: FieldErrorMap;
  readonly requestId: string;
}): ValidationError {
  return ValidationErrorSchema.parse({
    error: {
      code: "VALIDATION_ERROR",
      message: input.message ?? "The request contains invalid fields.",
      details: { fields: input.fields },
      requestId: input.requestId,
    },
  });
}
