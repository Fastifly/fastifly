import {
  GetTransactionResponseSchema,
  ListTransactionsQuerySchema,
  ListTransactionsResponseSchema,
  makeValidationError,
  parseAmountMinor,
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
  makeHttpError,
  type RegisterFinanceRoutesOptions as RegisterOptions,
  TransactionParamsSchema,
  validateFinanceCursorKind,
} from "./contracts.js";
import { toPageInfo, toTransactionGroupResponse } from "./mappers.js";

export function registerFinanceTransactionRoutes(
  app: FastifyInstance,
  options: RegisterOptions,
): void {
  const { transactionQueryService } = options;

  if (!transactionQueryService) {
    return;
  }

  app.get(
    "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/transactions",
    {
      schema: {
        params: LedgerParamsSchema,
        querystring: ListTransactionsQuerySchema,
        response: {
          200: ListTransactionsResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      requireAuthenticatedUser(request);
      const params = LedgerParamsSchema.parse(request.params);
      requireActiveWorkspace(request, params.workspaceId);
      requireAbility(request, "read", "TransactionGroup");
      const query = ListTransactionsQuerySchema.parse(request.query);
      if (query.reconciled !== undefined && query.status !== undefined) {
        return reply.status(400).send(
          makeValidationError({
            fields: {
              reconciled: ["The reconciled filter cannot be combined with status."],
            },
            requestId: String(request.id),
          }),
        );
      }
      const cursorError = validateFinanceCursorKind(
        query.cursor,
        "transaction.lastOccurredAt.desc",
        String(request.id),
      );
      if (cursorError) {
        return reply.status(400).send(cursorError);
      }

      const transactionPage = await transactionQueryService.listTransactionGroups({
        accountId: query.accountId ? parseSyncedId(query.accountId) : null,
        amountMaxMinor: query.amountMax ? parseAmountMinor(query.amountMax) : null,
        amountMinMinor: query.amountMin ? parseAmountMinor(query.amountMin) : null,
        budgetId: query.budgetId ? parseSyncedId(query.budgetId) : null,
        categoryId: query.categoryId ? parseSyncedId(query.categoryId) : null,
        cursor: query.cursor ?? null,
        currencyCode: query.currencyCode ?? null,
        fromOccurredAt: query.fromOccurredAt ?? null,
        importJobId: query.importJobId ? parseSyncedId(query.importJobId) : null,
        ledgerId: parseSyncedId(params.ledgerId),
        limit: query.limit,
        reconciled: query.reconciled ?? null,
        status: query.status ?? null,
        tagId: query.tagId ? parseSyncedId(query.tagId) : null,
        toOccurredAt: query.toOccurredAt ?? null,
        type: query.type ?? null,
        workspaceId: parseSyncedId(params.workspaceId),
      });

      return {
        data: transactionPage.items.map(toTransactionGroupResponse),
        pageInfo: toPageInfo(transactionPage),
      };
    },
  );

  app.get(
    "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/transactions/:transactionGroupId",
    {
      schema: {
        params: TransactionParamsSchema,
        response: {
          200: GetTransactionResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      requireAuthenticatedUser(request);
      const params = TransactionParamsSchema.parse(request.params);
      requireActiveWorkspace(request, params.workspaceId);
      requireAbility(request, "read", "TransactionGroup");
      const transactionGroup = await transactionQueryService.getTransactionGroup({
        ledgerId: parseSyncedId(params.ledgerId),
        transactionGroupId: parseSyncedId(params.transactionGroupId),
        workspaceId: parseSyncedId(params.workspaceId),
      });
      if (!transactionGroup) {
        throw makeHttpError(404, "Transaction group was not found.");
      }

      return {
        data: {
          transactionGroup: toTransactionGroupResponse(transactionGroup),
        },
      };
    },
  );
}
