import { ListBudgetsQuerySchema, ListBudgetsResponseSchema, parseSyncedId } from "@fastifly/common";
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
import { toBudgetSummaryResponse, toPageInfo } from "./mappers.js";

export function registerFinanceBudgetRoutes(app: FastifyInstance, options: RegisterOptions): void {
  const { budgetQueryService } = options;

  if (!budgetQueryService) {
    return;
  }

  app.get(
    "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/budgets",
    {
      schema: {
        params: LedgerParamsSchema,
        querystring: ListBudgetsQuerySchema,
        response: {
          200: ListBudgetsResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      requireAuthenticatedUser(request);
      const params = LedgerParamsSchema.parse(request.params);
      requireActiveWorkspace(request, params.workspaceId);
      requireAbility(request, "read", "Budget");
      const query = ListBudgetsQuerySchema.parse(request.query);
      const cursorError = validateFinanceCursorKind(
        query.cursor,
        "budget.name.asc",
        String(request.id),
      );
      if (cursorError) {
        return reply.status(400).send(cursorError);
      }

      const budgetPage = await budgetQueryService.listBudgets({
        asOfDate: query.asOfDate ?? null,
        cursor: query.cursor ?? null,
        ledgerId: parseSyncedId(params.ledgerId),
        limit: query.limit,
        workspaceId: parseSyncedId(params.workspaceId),
      });

      return {
        data: budgetPage.items.map(toBudgetSummaryResponse),
        pageInfo: toPageInfo(budgetPage),
      };
    },
  );
}
