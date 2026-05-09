import { ApiErrorSchema, ValidationErrorSchema } from "@fastifly/common";
import { z } from "zod/v4";

export const HealthResponseSchema = z
  .object({
    status: z.literal("ok"),
    service: z.literal("fastifly-api"),
    requestId: z.string().min(1),
  })
  .strict();

export const ReadyResponseSchema = z
  .object({
    status: z.enum(["ready", "not_ready"]),
    checks: z
      .object({
        config: z.literal("ok"),
        migrations: z.enum(["unknown", "ok"]),
      })
      .strict(),
    requestId: z.string().min(1),
  })
  .strict();

export const OpenApiDocumentSchema = z.record(z.string(), z.unknown());

export const ErrorResponseSchemas = {
  400: ValidationErrorSchema,
  404: ApiErrorSchema,
  500: ApiErrorSchema,
} as const;

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type ReadyResponse = z.infer<typeof ReadyResponseSchema>;
