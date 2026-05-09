import { z } from "zod";

export const CursorPaginationQuerySchema = z
  .object({
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type CursorPaginationQuery = z.infer<typeof CursorPaginationQuerySchema>;

export const PageInfoSchema = z
  .object({
    nextCursor: z.string().min(1).nullable(),
    previousCursor: z.string().min(1).nullable(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  })
  .strict();

export type PageInfo = z.infer<typeof PageInfoSchema>;

export function paginatedResponseSchema<ItemSchema extends z.ZodType>(itemSchema: ItemSchema) {
  return z
    .object({
      data: z.array(itemSchema),
      pageInfo: PageInfoSchema,
    })
    .strict();
}
