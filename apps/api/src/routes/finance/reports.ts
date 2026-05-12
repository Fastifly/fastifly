import {
  NetWorthTrendQuerySchema,
  NetWorthTrendResponseSchema,
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
} from "./contracts.js";
import { toNetWorthTrendResponse } from "./mappers.js";

export function registerFinanceReportRoutes(app: FastifyInstance, options: RegisterOptions): void {
  const { reportQueryService } = options;

  if (!reportQueryService) {
    return;
  }

  app.get(
    "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/reports/net-worth",
    {
      schema: {
        params: LedgerParamsSchema,
        querystring: NetWorthTrendQuerySchema,
        response: {
          200: NetWorthTrendResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      requireAuthenticatedUser(request);
      const params = LedgerParamsSchema.parse(request.params);
      requireActiveWorkspace(request, params.workspaceId);
      requireAbility(request, "read", "Report");
      const query = NetWorthTrendQuerySchema.parse(request.query);

      const report = await reportQueryService.getNetWorthTrend({
        asOfDate: query.asOfDate ?? null,
        ledgerId: parseSyncedId(params.ledgerId),
        months: query.months ?? null,
        workspaceId: parseSyncedId(params.workspaceId),
      });

      return toNetWorthTrendResponse(report);
    },
  );
}
