import { z } from "zod";

export const CursorPaginationQuerySchema = z.strictObject({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CursorPaginationQuery = z.infer<typeof CursorPaginationQuerySchema>;

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
