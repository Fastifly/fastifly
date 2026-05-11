import {
  CursorPaginationQuerySchema,
  GetAccountResponseSchema,
  ListAccountsResponseSchema,
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
  AccountParamsSchema,
  LedgerParamsSchema,
  makeHttpError,
  type RegisterFinanceRoutesOptions as RegisterOptions,
  validateFinanceCursorKind,
} from "./contracts.js";
import { toAccountWithBalanceResponse, toPageInfo } from "./mappers.js";

export function registerFinanceAccountRoutes(app: FastifyInstance, options: RegisterOptions): void {
  const { accountRepository } = options;

  if (!accountRepository) {
    return;
  }

  app.get(
    "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/accounts",
    {
      schema: {
        params: LedgerParamsSchema,
        querystring: CursorPaginationQuerySchema,
        response: {
          200: ListAccountsResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      requireAuthenticatedUser(request);
      const params = LedgerParamsSchema.parse(request.params);
      requireActiveWorkspace(request, params.workspaceId);
      requireAbility(request, "read", "Account");
      const query = CursorPaginationQuerySchema.parse(request.query);
      const cursorError = validateFinanceCursorKind(
        query.cursor,
        "account.name.asc",
        String(request.id),
      );
      if (cursorError) {
        return reply.status(400).send(cursorError);
      }
      const scope = {
        ledgerId: parseSyncedId(params.ledgerId),
        workspaceId: parseSyncedId(params.workspaceId),
      };
      const accountPage = await accountRepository.listAccounts({
        ...scope,
        cursor: query.cursor ?? null,
        limit: query.limit,
      });
      const accountsWithBalances = await Promise.all(
        accountPage.items.map(async (account) =>
          toAccountWithBalanceResponse(
            account,
            await accountRepository.getAccountBalance({ ...scope, accountId: account.id }),
          ),
        ),
      );

      return {
        data: accountsWithBalances,
        pageInfo: toPageInfo(accountPage),
      };
    },
  );

  app.get(
    "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/accounts/:accountId",
    {
      schema: {
        params: AccountParamsSchema,
        response: {
          200: GetAccountResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      requireAuthenticatedUser(request);
      const params = AccountParamsSchema.parse(request.params);
      requireActiveWorkspace(request, params.workspaceId);
      requireAbility(request, "read", "Account");
      const scope = {
        ledgerId: parseSyncedId(params.ledgerId),
        workspaceId: parseSyncedId(params.workspaceId),
      };
      const accountId = parseSyncedId(params.accountId);
      const account = await accountRepository.findAccount({ ...scope, accountId });
      if (!account) {
        throw makeHttpError(404, "Account was not found.");
      }

      return {
        data: {
          account: toAccountWithBalanceResponse(
            account,
            await accountRepository.getAccountBalance({ ...scope, accountId }),
          ),
        },
      };
    },
  );
}
