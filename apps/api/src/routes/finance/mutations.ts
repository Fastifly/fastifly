import {
  ArchiveAccountResponseSchema,
  ArchiveCategoryResponseSchema,
  CreateAccountRequestSchema,
  CreateAccountResponseSchema,
  CreateCategoryRequestSchema,
  CreateCategoryResponseSchema,
  CreateTransactionRequestSchema,
  CreateTransactionResponseSchema,
  parseAmountMinor,
  parseSyncedId,
} from "@fastifly/common";
import type { FastifyInstance } from "fastify";
import { getRequestIdempotencyKey, sendLedgerMutationResult } from "../../idempotency.js";
import {
  requireAbility,
  requireActiveWorkspace,
  requireAuthenticatedUser,
} from "../../policies.js";
import { ErrorResponseSchemas } from "../../schemas.js";
import {
  AccountParamsSchema,
  CategoryParamsSchema,
  LedgerParamsSchema,
  makeSideEffectFlags,
  type RegisterFinanceRoutesOptions as RegisterOptions,
} from "./contracts.js";
import { toTransactionLineInput } from "./mappers.js";

export function registerFinanceMutationRoutes(
  app: FastifyInstance,
  options: RegisterOptions,
): void {
  const { financeMutationService } = options;

  if (!financeMutationService) {
    return;
  }

  app.post(
    "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/accounts",
    {
      onRequest: app.csrfProtection,
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
            authorization: {
              action: "create",
              subject: "Account",
            },
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
      onRequest: app.csrfProtection,
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
            authorization: {
              action: "archive",
              subject: "Account",
            },
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
    "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/categories",
    {
      onRequest: app.csrfProtection,
      schema: {
        body: CreateCategoryRequestSchema,
        params: LedgerParamsSchema,
        response: {
          201: CreateCategoryResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const actorUserId = requireAuthenticatedUser(request);
      const params = LedgerParamsSchema.parse(request.params);
      requireActiveWorkspace(request, params.workspaceId);
      requireAbility(request, "create", "Category");
      const body = CreateCategoryRequestSchema.parse(request.body);

      return sendLedgerMutationResult(
        reply,
        await financeMutationService.createCategory({
          category: {
            color: body.color ?? null,
            icon: body.icon ?? null,
            name: body.name,
            parentId: body.parentId ? parseSyncedId(body.parentId) : null,
          },
          envelope: {
            actorUserId,
            authorization: {
              action: "create",
              subject: "Category",
            },
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
    "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/categories/:categoryId",
    {
      onRequest: app.csrfProtection,
      schema: {
        params: CategoryParamsSchema,
        response: {
          200: ArchiveCategoryResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const actorUserId = requireAuthenticatedUser(request);
      const params = CategoryParamsSchema.parse(request.params);
      requireActiveWorkspace(request, params.workspaceId);
      requireAbility(request, "archive", "Category");

      return sendLedgerMutationResult(
        reply,
        await financeMutationService.archiveCategory({
          category: {
            categoryId: parseSyncedId(params.categoryId),
          },
          envelope: {
            actorUserId,
            authorization: {
              action: "archive",
              subject: "Category",
            },
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
      onRequest: app.csrfProtection,
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
            authorization: {
              action: "create",
              subject: "TransactionGroup",
            },
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
