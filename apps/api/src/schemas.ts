import { type ApiErrorCode, ValidationErrorSchema } from "@fastifly/common";
import { z } from "zod/v4";

export const HealthResponseSchema = z.strictObject({
  status: z.literal("ok"),
  service: z.literal("fastifly-api"),
  requestId: z.string().min(1),
});

export const ReadyResponseSchema = z.strictObject({
  status: z.enum(["ready", "not_ready"]),
  checks: z.strictObject({
    config: z.literal("ok"),
    migrations: z.enum(["unknown", "ok"]),
  }),
  requestId: z.string().min(1),
});

export const OpenApiDocumentSchema = z.record(z.string(), z.unknown());

function apiErrorResponseSchema<TCode extends ApiErrorCode>(code: TCode) {
  return z.strictObject({
    error: z.strictObject({
      code: z.literal(code),
      message: z.string().min(1),
      details: z.record(z.string(), z.unknown()),
      requestId: z.string().min(1),
    }),
  });
}

export const UnauthenticatedErrorResponseSchema = apiErrorResponseSchema("UNAUTHENTICATED");
export const ForbiddenErrorResponseSchema = apiErrorResponseSchema("FORBIDDEN");
export const NotFoundErrorResponseSchema = apiErrorResponseSchema("NOT_FOUND");
export const ConflictErrorResponseSchema = apiErrorResponseSchema("CONFLICT");
export const InternalServerErrorResponseSchema = apiErrorResponseSchema("INTERNAL_SERVER_ERROR");

export const ErrorResponseSchemas = {
  400: ValidationErrorSchema,
  401: UnauthenticatedErrorResponseSchema,
  403: ForbiddenErrorResponseSchema,
  404: NotFoundErrorResponseSchema,
  409: ConflictErrorResponseSchema,
  500: InternalServerErrorResponseSchema,
} as const;

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type ReadyResponse = z.infer<typeof ReadyResponseSchema>;
