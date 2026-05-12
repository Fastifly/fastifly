import {
  CursorPaginationQuerySchema,
  ListCategoriesResponseSchema,
  parseSyncedId,
} from "@fastifly/common";
import type { FastifyInstance } from "fastify";
import {
  requireAbility,
  requireActiveWorkspace,
  requireAuthenticatedUser,
} from "../../policies.js";
import { ErrorResponseSchemas } from "../../schemas.js";
import {
  LedgerParamsSchema,
  type RegisterFinanceRoutesOptions as RegisterOptions,
  validateFinanceCursorKind,
} from "./contracts.js";
import { toCategoryResponse, toPageInfo } from "./mappers.js";

export function registerFinanceCategoryRoutes(
  app: FastifyInstance,
  options: RegisterOptions,
): void {
  const { categoryRepository } = options;

  if (!categoryRepository) {
    return;
  }

  app.get(
    "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/categories",
    {
      schema: {
        params: LedgerParamsSchema,
        querystring: CursorPaginationQuerySchema,
        response: {
          200: ListCategoriesResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      requireAuthenticatedUser(request);
      const params = LedgerParamsSchema.parse(request.params);
      requireActiveWorkspace(request, params.workspaceId);
      requireAbility(request, "read", "Category");
      const query = CursorPaginationQuerySchema.parse(request.query);
      const cursorError = validateFinanceCursorKind(
        query.cursor,
        "category.name.asc",
        String(request.id),
      );
      if (cursorError) {
        return reply.status(400).send(cursorError);
      }

      const page = await categoryRepository.listCategories({
        cursor: query.cursor ?? null,
        ledgerId: parseSyncedId(params.ledgerId),
        limit: query.limit,
        workspaceId: parseSyncedId(params.workspaceId),
      });

      return {
        data: page.items.map(toCategoryResponse),
        pageInfo: toPageInfo(page),
      };
    },
  );
}
