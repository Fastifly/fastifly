import { z } from "zod";

import { SyncedIdSchema } from "../ids.js";

export const CursorPaginationQuerySchema = z.strictObject({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CursorPaginationQuery = z.infer<typeof CursorPaginationQuerySchema>;

export const FinanceCursorKindSchema = z.enum([
  "account.name.asc",
  "budget.name.asc",
  "transaction.lastOccurredAt.desc",
]);

export type FinanceCursorKind = z.infer<typeof FinanceCursorKindSchema>;

export const FinanceCursorPayloadSchema = z.strictObject({
  id: SyncedIdSchema,
  kind: FinanceCursorKindSchema,
  sortKey: z.string().min(1),
  v: z.literal(1),
});

export type FinanceCursorPayload = z.infer<typeof FinanceCursorPayloadSchema>;

export const PageInfoSchema = z.strictObject({
  nextCursor: z.string().min(1).nullable(),
  previousCursor: z.string().min(1).nullable(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

export type PageInfo = z.infer<typeof PageInfoSchema>;

export function paginatedResponseSchema<ItemSchema extends z.ZodType>(itemSchema: ItemSchema) {
  return z.strictObject({
    data: z.array(itemSchema),
    pageInfo: PageInfoSchema,
  });
}

const FINANCE_CURSOR_PREFIX = "ffcur_v1:";

export function encodeFinanceCursor(payload: FinanceCursorPayload): string {
  const parsed = FinanceCursorPayloadSchema.parse(payload);
  return `${FINANCE_CURSOR_PREFIX}${encodeURIComponent(JSON.stringify(parsed))}`;
}

export function parseFinanceCursor(
  cursor: string,
  expectedKind?: FinanceCursorKind,
): FinanceCursorPayload {
  if (!cursor.startsWith(FINANCE_CURSOR_PREFIX)) {
    throw new Error("Finance cursor is not valid for this API version.");
  }

  const rawPayload = cursor.slice(FINANCE_CURSOR_PREFIX.length);
  let decoded: unknown;
  try {
    decoded = JSON.parse(decodeURIComponent(rawPayload));
  } catch {
    throw new Error("Finance cursor payload is malformed.");
  }

  const parsed = FinanceCursorPayloadSchema.parse(decoded);
  if (expectedKind && parsed.kind !== expectedKind) {
    throw new Error("Finance cursor does not match this list endpoint.");
  }
  assertFinanceCursorSortKey(parsed);

  return parsed;
}

function assertFinanceCursorSortKey(payload: FinanceCursorPayload): void {
  if (payload.kind === "transaction.lastOccurredAt.desc") {
    const timestamp = new Date(payload.sortKey);
    if (Number.isNaN(timestamp.valueOf()) || timestamp.toISOString() !== payload.sortKey) {
      throw new Error("Transaction cursor sort key must be an ISO timestamp.");
    }
  }
}
