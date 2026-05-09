import {
  ArchiveAccountResponseSchema,
  CreateAccountRequestSchema,
  CreateAccountResponseSchema,
  CreateTransactionRequestSchema,
  CreateTransactionResponseSchema,
  formatAmountMinor,
  GetAccountResponseSchema,
  GetTransactionResponseSchema,
  ListAccountsResponseSchema,
  ListTransactionsQuerySchema,
  ListTransactionsResponseSchema,
  makeMoneyAmount,
  parseAmountMinor,
  parseSyncedId,
  type TransactionGroupResponseSchema,
  type TransactionJournalResponseSchema,
  type TransactionPostingResponseSchema,
} from "@fastifly/common";
import type {
  AccountBalanceRecord,
  AccountRecord,
  AccountRepository,
  CreateTransactionLineInput,
  LedgerFinanceMutationService,
  LedgerMutationSideEffectFlags,
  TransactionGroupRecord,
  TransactionJournalRecord,
  TransactionPostingRecord,
  TransactionQueryService,
} from "@fastifly/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod/v4";

import { getRequestIdempotencyKey, sendLedgerMutationResult } from "../idempotency.js";
import { requireAbility, requireActiveWorkspace, requireAuthenticatedUser } from "../policies.js";
import { ErrorResponseSchemas } from "../schemas.js";

const LedgerParamsSchema = z.strictObject({
  ledgerId: z.uuidv7(),
  workspaceId: z.uuidv7(),
});

const AccountParamsSchema = LedgerParamsSchema.extend({
  accountId: z.uuidv7(),
});

const TransactionParamsSchema = LedgerParamsSchema.extend({
  transactionGroupId: z.uuidv7(),
});

export type RegisterFinanceRoutesOptions = {
  readonly accountRepository?: AccountRepository | undefined;
  readonly financeMutationService?: LedgerFinanceMutationService | undefined;
  readonly transactionQueryService?: TransactionQueryService | undefined;
};

export async function registerFinanceRoutes(
  app: FastifyInstance,
  options: RegisterFinanceRoutesOptions,
): Promise<void> {
  const { accountRepository, financeMutationService, transactionQueryService } = options;

  if (accountRepository) {
    app.get(
      "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/accounts",
      {
        schema: {
          params: LedgerParamsSchema,
          response: {
            200: ListAccountsResponseSchema,
            ...ErrorResponseSchemas,
          },
        },
      },
      async (request) => {
        requireAuthenticatedUser(request);
        const params = LedgerParamsSchema.parse(request.params);
        requireActiveWorkspace(request, params.workspaceId);
        requireAbility(request, "read", "Account");
        const scope = {
          ledgerId: parseSyncedId(params.ledgerId),
          workspaceId: parseSyncedId(params.workspaceId),
        };
        const accounts = await accountRepository.listAccounts(scope);
        const accountsWithBalances = await Promise.all(
          accounts.map(async (account) =>
            toAccountWithBalanceResponse(
              account,
              await accountRepository.getAccountBalance({ ...scope, accountId: account.id }),
            ),
          ),
        );

        return {
          data: accountsWithBalances,
          pageInfo: emptyPageInfo(),
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

  if (financeMutationService) {
    app.post(
      "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/accounts",
      {
        schema: {
          body: CreateAccountRequestSchema,
          params: LedgerParamsSchema,
          response: {
            201: CreateAccountResponseSchema,
            ...ErrorResponseSchemas,
          },
        },
      },
      async (request, reply) => {
        const actorUserId = requireAuthenticatedUser(request);
        const params = LedgerParamsSchema.parse(request.params);
        requireActiveWorkspace(request, params.workspaceId);
        requireAbility(request, "create", "Account");
        const body = CreateAccountRequestSchema.parse(request.body);

        return sendLedgerMutationResult(
          reply,
          await financeMutationService.createAccount({
            account: {
              currencyCode: body.currencyCode,
              kind: body.kind,
              name: body.name,
              openingBalanceDate: body.openingBalanceDate ?? null,
              openingBalanceMinor: body.openingBalanceMinor
                ? parseAmountMinor(body.openingBalanceMinor)
                : null,
              subtype: body.subtype,
            },
            envelope: {
              actorUserId,
              baseRevision: null,
              deviceId: null,
              dryRun: false,
              idempotencyKey: getRequestIdempotencyKey(request),
              ledgerId: parseSyncedId(params.ledgerId),
              requestId: String(request.id),
              sideEffectFlags: makeSideEffectFlags(),
              source: "rest",
              syncOperation: null,
              workspaceId: parseSyncedId(params.workspaceId),
            },
          }),
        );
      },
    );

    app.delete(
      "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/accounts/:accountId",
      {
        schema: {
          params: AccountParamsSchema,
          response: {
            200: ArchiveAccountResponseSchema,
            ...ErrorResponseSchemas,
          },
        },
      },
      async (request, reply) => {
        const actorUserId = requireAuthenticatedUser(request);
        const params = AccountParamsSchema.parse(request.params);
        requireActiveWorkspace(request, params.workspaceId);
        requireAbility(request, "archive", "Account");

        return sendLedgerMutationResult(
          reply,
          await financeMutationService.archiveAccount({
            account: {
              accountId: parseSyncedId(params.accountId),
            },
            envelope: {
              actorUserId,
              baseRevision: null,
              deviceId: null,
              dryRun: false,
              idempotencyKey: getRequestIdempotencyKey(request),
              ledgerId: parseSyncedId(params.ledgerId),
              requestId: String(request.id),
              sideEffectFlags: makeSideEffectFlags(),
              source: "rest",
              syncOperation: null,
              workspaceId: parseSyncedId(params.workspaceId),
            },
          }),
        );
      },
    );

    app.post(
      "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/transactions",
      {
        schema: {
          body: CreateTransactionRequestSchema,
          params: LedgerParamsSchema,
          response: {
            201: CreateTransactionResponseSchema,
            ...ErrorResponseSchemas,
          },
        },
      },
      async (request, reply) => {
        const actorUserId = requireAuthenticatedUser(request);
        const params = LedgerParamsSchema.parse(request.params);
        requireActiveWorkspace(request, params.workspaceId);
        requireAbility(request, "create", "TransactionGroup");
        const body = CreateTransactionRequestSchema.parse(request.body);
        const create = {
          expense: financeMutationService.createExpense,
          income: financeMutationService.createIncome,
          transfer: financeMutationService.createTransfer,
        }[body.type].bind(financeMutationService);

        return sendLedgerMutationResult(
          reply,
          await create({
            envelope: {
              actorUserId,
              baseRevision: null,
              deviceId: null,
              dryRun: false,
              idempotencyKey: getRequestIdempotencyKey(request),
              ledgerId: parseSyncedId(params.ledgerId),
              requestId: String(request.id),
              sideEffectFlags: makeSideEffectFlags(body.options),
              source: "rest",
              syncOperation: null,
              workspaceId: parseSyncedId(params.workspaceId),
            },
            transaction: {
              currencyCode: body.currencyCode,
              description: body.description,
              lines: body.transactions.map(toTransactionLineInput),
              occurredAt: body.occurredAt,
              source: body.source ?? "api",
              sourceAccountId: parseSyncedId(body.sourceAccountId),
              title: body.title ?? null,
              ...(body.status ? { status: body.status } : {}),
            },
          }),
        );
      },
    );
  }

  if (transactionQueryService) {
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
      async (request) => {
        requireAuthenticatedUser(request);
        const params = LedgerParamsSchema.parse(request.params);
        requireActiveWorkspace(request, params.workspaceId);
        requireAbility(request, "read", "TransactionGroup");
        const query = ListTransactionsQuerySchema.parse(request.query);

        return {
          data: (
            await transactionQueryService.listTransactionGroups({
              accountId: query.accountId ? parseSyncedId(query.accountId) : null,
              fromOccurredAt: query.fromOccurredAt ?? null,
              ledgerId: parseSyncedId(params.ledgerId),
              limit: query.limit,
              status: query.status ?? null,
              toOccurredAt: query.toOccurredAt ?? null,
              type: query.type ?? null,
              workspaceId: parseSyncedId(params.workspaceId),
            })
          ).map(toTransactionGroupResponse),
          pageInfo: emptyPageInfo(),
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
}

function makeSideEffectFlags(
  input: {
    readonly applyRules?: boolean | undefined;
    readonly batchSubmission?: boolean | undefined;
    readonly fireWebhooks?: boolean | undefined;
    readonly recalculateBalances?: boolean | undefined;
    readonly skipNotifications?: boolean | undefined;
  } = {},
): LedgerMutationSideEffectFlags {
  return {
    applyRules: input.applyRules ?? false,
    batchSubmission: input.batchSubmission ?? false,
    fireWebhooks: input.fireWebhooks ?? false,
    recalculateBalances: input.recalculateBalances ?? true,
    skipNotifications: input.skipNotifications ?? false,
  };
}

function toTransactionLineInput(
  input: z.infer<typeof CreateTransactionRequestSchema>["transactions"][number],
): CreateTransactionLineInput {
  return {
    amountMinor: parseAmountMinor(input.amountMinor),
    budgetId: input.budgetId ? parseSyncedId(input.budgetId) : null,
    categoryId: input.categoryId ? parseSyncedId(input.categoryId) : null,
    description: input.description ?? null,
    destinationAccountId: parseSyncedId(input.destinationAccountId),
    reportingAmountMinor: input.reportingAmountMinor
      ? parseAmountMinor(input.reportingAmountMinor)
      : null,
    reportingCurrencyCode: input.reportingCurrencyCode ?? null,
  };
}

function toAccountWithBalanceResponse(
  account: AccountRecord,
  balance: AccountBalanceRecord | null,
): z.infer<typeof GetAccountResponseSchema>["data"]["account"] {
  const effectiveBalance = balance ?? {
    accountId: account.id,
    balanceMinor: 0n,
    currencyCode: account.currencyCode,
    reportingBalanceMinor: 0n,
    reportingCurrencyCode: account.currencyCode,
  };

  return {
    archivedAt: account.archivedAt,
    balance: makeMoneyAmount(effectiveBalance.balanceMinor, effectiveBalance.currencyCode),
    createdAt: account.createdAt,
    currencyCode: account.currencyCode,
    id: account.id,
    isActive: account.isActive,
    kind: account.kind,
    ledgerId: account.ledgerId,
    name: account.name,
    openingBalanceDate: account.openingBalanceDate,
    openingBalanceMinor: account.openingBalanceMinor?.toString() ?? null,
    reportingBalance: makeMoneyAmount(
      effectiveBalance.reportingBalanceMinor,
      effectiveBalance.reportingCurrencyCode,
    ),
    subtype: account.subtype,
    updatedAt: account.updatedAt,
    workspaceId: account.workspaceId,
  };
}

function toTransactionGroupResponse(
  group: TransactionGroupRecord,
): z.infer<typeof TransactionGroupResponseSchema> {
  return {
    id: group.id,
    journals: group.journals.map(toTransactionJournalResponse),
    ledgerId: group.ledgerId,
    title: group.title,
    type: group.type,
    workspaceId: group.workspaceId,
  };
}

function toTransactionJournalResponse(
  journal: TransactionJournalRecord,
): z.infer<typeof TransactionJournalResponseSchema> {
  return {
    description: journal.description,
    id: journal.id,
    occurredAt: journal.occurredAt,
    postings: journal.postings.map(toTransactionPostingResponse),
    type: journal.type,
  };
}

function toTransactionPostingResponse(
  posting: TransactionPostingRecord,
): z.infer<typeof TransactionPostingResponseSchema> {
  return {
    accountId: posting.accountId,
    amountMinor: formatAmountMinor(posting.amountMinor),
    currencyCode: posting.currencyCode,
    id: posting.id,
    reportingAmountMinor: formatAmountMinor(posting.reportingAmountMinor),
    reportingCurrencyCode: posting.reportingCurrencyCode,
  };
}

function emptyPageInfo(): z.infer<typeof ListAccountsResponseSchema>["pageInfo"] {
  return {
    hasNextPage: false,
    hasPreviousPage: false,
    nextCursor: null,
    previousCursor: null,
  };
}

function makeHttpError(statusCode: number, message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}
