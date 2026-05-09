import {
  ArchiveAccountResponseSchema,
  CreateAccountRequestSchema,
  CreateAccountResponseSchema,
  CreateTransactionRequestSchema,
  CreateTransactionResponseSchema,
  parseAmountMinor,
  parseSyncedId,
} from "@fastifly/common";
import type {
  CreateTransactionLineInput,
  LedgerFinanceMutationService,
  LedgerMutationSideEffectFlags,
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

export type RegisterFinanceRoutesOptions = {
  readonly financeMutationService: LedgerFinanceMutationService;
};

export async function registerFinanceRoutes(
  app: FastifyInstance,
  options: RegisterFinanceRoutesOptions,
): Promise<void> {
  const { financeMutationService } = options;

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
