import { z } from "zod";

export const IDEMPOTENCY_KEY_HEADER = "idempotency-key";
export const IDEMPOTENCY_REPLAYED_HEADER = "idempotency-replayed";

export const IdempotencyKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[\x21-\x7E]+$/, "Idempotency key must use visible ASCII without spaces.");

export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;

export function parseOptionalIdempotencyKey(
  value: string | readonly string[] | undefined,
): IdempotencyKey | null {
  if (Array.isArray(value)) {
    return value[0] ? IdempotencyKeySchema.parse(value[0]) : null;
  }

  return value ? IdempotencyKeySchema.parse(value) : null;
}
