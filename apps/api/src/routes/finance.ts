import {
  ArchiveAccountResponseSchema,
  type BudgetSummaryResponseSchema,
  CommitImportJobRequestSchema,
  CommitImportJobResponseSchema,
  CreateAccountRequestSchema,
  CreateAccountResponseSchema,
  CreateImportCsvRequestSchema,
  CreateImportCsvResponseSchema,
  CreateRecurringTemplateRequestSchema,
  CreateRecurringTemplateResponseSchema,
  CreateRuleRequestSchema,
  CreateRuleResponseSchema,
  CreateTransactionRequestSchema,
  CreateTransactionResponseSchema,
  CursorPaginationQuerySchema,
  type FinanceCursorKind,
  formatAmountMinor,
  GenerateRecurringTemplateRequestSchema,
  GenerateRecurringTemplateResponseSchema,
  GetAccountResponseSchema,
  GetImportJobResponseSchema,
  GetRecurringTemplateResponseSchema,
  GetRuleResponseSchema,
  GetTransactionResponseSchema,
  ImportJobResponseSchema,
  ListImportJobsResponseSchema,
  ListAccountsResponseSchema,
  ListBudgetsQuerySchema,
  ListBudgetsResponseSchema,
  ListRecurringTemplatesResponseSchema,
  ListRulesResponseSchema,
  ListTransactionsQuerySchema,
  ListTransactionsResponseSchema,
  makeMoneyAmount,
  makeValidationError,
  type PageInfo,
  parseAmountMinor,
  parseFinanceCursor,
  parseSyncedId,
  type RecurringTemplateResponseSchema,
  RuleApplyRequestSchema,
  RuleApplyResponseSchema,
  RuleTestRequestSchema,
  RuleTestResponseSchema,
  type RuleResponseSchema,
  type TransactionGroupResponseSchema,
  type TransactionJournalResponseSchema,
  type TransactionPostingResponseSchema,
  UndoImportJobResponseSchema,
  UpdateRecurringTemplateRequestSchema,
  UpdateRuleRequestSchema,
  type ValidationError,
} from "@fastifly/common";
import type {
  AccountBalanceRecord,
  AccountRecord,
  AccountRepository,
  BudgetQueryService,
  BudgetSummaryRecord,
  CreateTransactionLineInput,
  ImportJobRecord,
  LedgerFinanceMutationService,
  LedgerMutationSideEffectFlags,
  RecurringTemplateRecord,
  RuleRecord,
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
import type { FinanceWorkflowService } from "../services/finance-workflows.js";

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

const ImportParamsSchema = LedgerParamsSchema.extend({
  importJobId: z.uuidv7(),
});

const RuleParamsSchema = LedgerParamsSchema.extend({
  ruleId: z.uuidv7(),
});

const RecurringTemplateParamsSchema = LedgerParamsSchema.extend({
  templateId: z.uuidv7(),
});

export type RegisterFinanceRoutesOptions = {
  readonly accountRepository?: AccountRepository | undefined;
  readonly budgetQueryService?: BudgetQueryService | undefined;
  readonly financeMutationService?: LedgerFinanceMutationService | undefined;
  readonly transactionQueryService?: TransactionQueryService | undefined;
  readonly workflowService?: FinanceWorkflowService | undefined;
};

export async function registerFinanceRoutes(
  app: FastifyInstance,
  options: RegisterFinanceRoutesOptions,
): Promise<void> {
  const {
    accountRepository,
    budgetQueryService,
    financeMutationService,
    transactionQueryService,
    workflowService,
  } = options;

  if (accountRepository) {
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

  if (budgetQueryService) {
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

  if (financeMutationService) {
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

  if (workflowService) {
    app.post(
      "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/imports/csv",
      {
        onRequest: app.csrfProtection,
        schema: {
          body: CreateImportCsvRequestSchema,
          params: LedgerParamsSchema,
          response: {
            201: CreateImportCsvResponseSchema,
            ...ErrorResponseSchemas,
          },
        },
      },
      async (request, reply) => {
        const actorUserId = requireAuthenticatedUser(request);
        const params = LedgerParamsSchema.parse(request.params);
        requireActiveWorkspace(request, params.workspaceId);
        requireAbility(request, "import", "Import");
        const body = CreateImportCsvRequestSchema.parse(request.body);

        const importJob = await workflowService.createImportJobFromCsv({
          actorUserId,
          csvText: body.csvText,
          fileName: body.fileName ?? null,
          scope: {
            ledgerId: parseSyncedId(params.ledgerId),
            workspaceId: parseSyncedId(params.workspaceId),
          },
        });
        return reply.status(201).send({
          data: {
            importJob: toImportJobResponse(importJob),
          },
        });
      },
    );

    app.get(
      "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/imports",
      {
        schema: {
          params: LedgerParamsSchema,
          response: {
            200: ListImportJobsResponseSchema,
            ...ErrorResponseSchemas,
          },
        },
      },
      async (request) => {
        requireAuthenticatedUser(request);
        const params = LedgerParamsSchema.parse(request.params);
        requireActiveWorkspace(request, params.workspaceId);
        requireAbility(request, "read", "Import");

        const importJobs = await workflowService.listImportJobs({
          ledgerId: parseSyncedId(params.ledgerId),
          workspaceId: parseSyncedId(params.workspaceId),
        });
        return {
          data: importJobs.map(toImportJobResponse),
        };
      },
    );

    app.get(
      "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/imports/:importJobId",
      {
        schema: {
          params: ImportParamsSchema,
          response: {
            200: GetImportJobResponseSchema,
            ...ErrorResponseSchemas,
          },
        },
      },
      async (request) => {
        requireAuthenticatedUser(request);
        const params = ImportParamsSchema.parse(request.params);
        requireActiveWorkspace(request, params.workspaceId);
        requireAbility(request, "read", "Import");

        const importJob = await workflowService.findImportJob({
          importJobId: parseSyncedId(params.importJobId),
          ledgerId: parseSyncedId(params.ledgerId),
          workspaceId: parseSyncedId(params.workspaceId),
        });
        if (!importJob) {
          throw makeHttpError(404, "Import job was not found.");
        }
        return {
          data: {
            importJob: toImportJobResponse(importJob),
          },
        };
      },
    );

    app.post(
      "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/imports/:importJobId/commit",
      {
        onRequest: app.csrfProtection,
        schema: {
          body: CommitImportJobRequestSchema,
          params: ImportParamsSchema,
          response: {
            200: CommitImportJobResponseSchema,
            ...ErrorResponseSchemas,
          },
        },
      },
      async (request) => {
        const actorUserId = requireAuthenticatedUser(request);
        const params = ImportParamsSchema.parse(request.params);
        requireActiveWorkspace(request, params.workspaceId);
        requireAbility(request, "import", "Import");
        const body = CommitImportJobRequestSchema.parse(request.body);

        const result = await workflowService.commitImportJob({
          actorUserId,
          applyRules: body.applyRules ?? false,
          idempotencyKey: getRequestIdempotencyKey(request),
          importJobId: parseSyncedId(params.importJobId),
          requestId: String(request.id),
          scope: {
            ledgerId: parseSyncedId(params.ledgerId),
            workspaceId: parseSyncedId(params.workspaceId),
          },
        });
        return {
          data: {
            importJob: toImportJobResponse(result.importJob),
          },
        };
      },
    );

    app.post(
      "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/imports/:importJobId/undo",
      {
        onRequest: app.csrfProtection,
        schema: {
          params: ImportParamsSchema,
          response: {
            200: UndoImportJobResponseSchema,
            ...ErrorResponseSchemas,
          },
        },
      },
      async (request) => {
        const actorUserId = requireAuthenticatedUser(request);
        const params = ImportParamsSchema.parse(request.params);
        requireActiveWorkspace(request, params.workspaceId);
        requireAbility(request, "import", "Import");

        const result = await workflowService.undoImportJob({
          actorUserId,
          idempotencyKey: getRequestIdempotencyKey(request),
          importJobId: parseSyncedId(params.importJobId),
          requestId: String(request.id),
          scope: {
            ledgerId: parseSyncedId(params.ledgerId),
            workspaceId: parseSyncedId(params.workspaceId),
          },
        });
        return {
          data: {
            archivedGroupIds: result.archivedGroupIds,
            importJob: toImportJobResponse(result.importJob),
          },
        };
      },
    );

    app.get(
      "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/rules",
      {
        schema: {
          params: LedgerParamsSchema,
          response: {
            200: ListRulesResponseSchema,
            ...ErrorResponseSchemas,
          },
        },
      },
      async (request) => {
        requireAuthenticatedUser(request);
        const params = LedgerParamsSchema.parse(request.params);
        requireActiveWorkspace(request, params.workspaceId);
        requireAbility(request, "read", "Rule");

        const rules = await workflowService.listRules({
          ledgerId: parseSyncedId(params.ledgerId),
          workspaceId: parseSyncedId(params.workspaceId),
        });
        return {
          data: rules.map(toRuleResponse),
        };
      },
    );

    app.post(
      "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/rules",
      {
        onRequest: app.csrfProtection,
        schema: {
          body: CreateRuleRequestSchema,
          params: LedgerParamsSchema,
          response: {
            201: CreateRuleResponseSchema,
            ...ErrorResponseSchemas,
          },
        },
      },
      async (request, reply) => {
        const actorUserId = requireAuthenticatedUser(request);
        const params = LedgerParamsSchema.parse(request.params);
        requireActiveWorkspace(request, params.workspaceId);
        requireAbility(request, "create", "Rule");
        const body = CreateRuleRequestSchema.parse(request.body);

        const rule = await workflowService.createRule({
          action: body.action,
          actorUserId,
          condition: toRuleConditionInput(body.condition),
          enabled: body.enabled,
          ledgerId: parseSyncedId(params.ledgerId),
          name: body.name,
          workspaceId: parseSyncedId(params.workspaceId),
        });
        return reply.status(201).send({
          data: {
            rule: toRuleResponse(rule),
          },
        });
      },
    );

    app.get(
      "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/rules/:ruleId",
      {
        schema: {
          params: RuleParamsSchema,
          response: {
            200: GetRuleResponseSchema,
            ...ErrorResponseSchemas,
          },
        },
      },
      async (request) => {
        requireAuthenticatedUser(request);
        const params = RuleParamsSchema.parse(request.params);
        requireActiveWorkspace(request, params.workspaceId);
        requireAbility(request, "read", "Rule");

        const rule = await workflowService.findRule({
          ledgerId: parseSyncedId(params.ledgerId),
          ruleId: parseSyncedId(params.ruleId),
          workspaceId: parseSyncedId(params.workspaceId),
        });
        if (!rule) {
          throw makeHttpError(404, "Rule was not found.");
        }

        return {
          data: {
            rule: toRuleResponse(rule),
          },
        };
      },
    );

    app.patch(
      "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/rules/:ruleId",
      {
        onRequest: app.csrfProtection,
        schema: {
          body: UpdateRuleRequestSchema,
          params: RuleParamsSchema,
          response: {
            200: GetRuleResponseSchema,
            ...ErrorResponseSchemas,
          },
        },
      },
      async (request) => {
        const actorUserId = requireAuthenticatedUser(request);
        const params = RuleParamsSchema.parse(request.params);
        requireActiveWorkspace(request, params.workspaceId);
        requireAbility(request, "update", "Rule");
        const body = UpdateRuleRequestSchema.parse(request.body);

        const rule = await workflowService.updateRule({
          action: body.action,
          condition: toRuleConditionInput(body.condition),
          enabled: body.enabled,
          ledgerId: parseSyncedId(params.ledgerId),
          name: body.name,
          ruleId: parseSyncedId(params.ruleId),
          updatedBy: actorUserId,
          workspaceId: parseSyncedId(params.workspaceId),
        });
        if (!rule) {
          throw makeHttpError(404, "Rule was not found.");
        }
        return {
          data: {
            rule: toRuleResponse(rule),
          },
        };
      },
    );

    app.delete(
      "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/rules/:ruleId",
      {
        onRequest: app.csrfProtection,
        schema: {
          params: RuleParamsSchema,
          response: {
            200: GetRuleResponseSchema,
            ...ErrorResponseSchemas,
          },
        },
      },
      async (request) => {
        const actorUserId = requireAuthenticatedUser(request);
        const params = RuleParamsSchema.parse(request.params);
        requireActiveWorkspace(request, params.workspaceId);
        requireAbility(request, "delete", "Rule");

        const rule = await workflowService.archiveRule({
          ledgerId: parseSyncedId(params.ledgerId),
          ruleId: parseSyncedId(params.ruleId),
          updatedBy: actorUserId,
          workspaceId: parseSyncedId(params.workspaceId),
        });
        if (!rule) {
          throw makeHttpError(404, "Rule was not found.");
        }
        return {
          data: {
            rule: toRuleResponse(rule),
          },
        };
      },
    );

    app.post(
      "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/rules/:ruleId/test",
      {
        onRequest: app.csrfProtection,
        schema: {
          body: RuleTestRequestSchema,
          params: RuleParamsSchema,
          response: {
            200: RuleTestResponseSchema,
            ...ErrorResponseSchemas,
          },
        },
      },
      async (request) => {
        requireAuthenticatedUser(request);
        const params = RuleParamsSchema.parse(request.params);
        requireActiveWorkspace(request, params.workspaceId);
        requireAbility(request, "read", "Rule");
        const body = RuleTestRequestSchema.parse(request.body);

        const matched = await workflowService.testRule({
          limit: body.limit ?? 100,
          ruleId: parseSyncedId(params.ruleId),
          scope: {
            ledgerId: parseSyncedId(params.ledgerId),
            workspaceId: parseSyncedId(params.workspaceId),
          },
        });
        return {
          data: {
            matchedTransactionGroups: matched.map(toTransactionGroupResponse),
          },
        };
      },
    );

    app.post(
      "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/rules/:ruleId/apply",
      {
        onRequest: app.csrfProtection,
        schema: {
          body: RuleApplyRequestSchema,
          params: RuleParamsSchema,
          response: {
            200: RuleApplyResponseSchema,
            ...ErrorResponseSchemas,
          },
        },
      },
      async (request) => {
        const actorUserId = requireAuthenticatedUser(request);
        const params = RuleParamsSchema.parse(request.params);
        requireActiveWorkspace(request, params.workspaceId);
        requireAbility(request, "update", "Rule");
        const body = RuleApplyRequestSchema.parse(request.body);

        const result = await workflowService.applyRule({
          actorUserId,
          idempotencyKey: getRequestIdempotencyKey(request),
          limit: body.limit ?? 100,
          requestId: String(request.id),
          ruleId: parseSyncedId(params.ruleId),
          scope: {
            ledgerId: parseSyncedId(params.ledgerId),
            workspaceId: parseSyncedId(params.workspaceId),
          },
        });
        return {
          data: {
            matchedTransactionGroupIds: result.matchedTransactionGroupIds,
            rule: toRuleResponse(result.rule),
            status: result.status,
            updatedTransactionGroupIds: result.updatedTransactionGroupIds,
          },
        };
      },
    );

    app.get(
      "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/recurring",
      {
        schema: {
          params: LedgerParamsSchema,
          response: {
            200: ListRecurringTemplatesResponseSchema,
            ...ErrorResponseSchemas,
          },
        },
      },
      async (request) => {
        requireAuthenticatedUser(request);
        const params = LedgerParamsSchema.parse(request.params);
        requireActiveWorkspace(request, params.workspaceId);
        requireAbility(request, "read", "RecurringTemplate");

        const templates = await workflowService.listRecurringTemplates({
          ledgerId: parseSyncedId(params.ledgerId),
          workspaceId: parseSyncedId(params.workspaceId),
        });
        return {
          data: templates.map(toRecurringTemplateResponse),
        };
      },
    );

    app.post(
      "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/recurring",
      {
        onRequest: app.csrfProtection,
        schema: {
          body: CreateRecurringTemplateRequestSchema,
          params: LedgerParamsSchema,
          response: {
            201: CreateRecurringTemplateResponseSchema,
            ...ErrorResponseSchemas,
          },
        },
      },
      async (request, reply) => {
        const actorUserId = requireAuthenticatedUser(request);
        const params = LedgerParamsSchema.parse(request.params);
        requireActiveWorkspace(request, params.workspaceId);
        requireAbility(request, "create", "RecurringTemplate");
        const body = CreateRecurringTemplateRequestSchema.parse(request.body);

        const recurringTemplate = await workflowService.createRecurringTemplate({
          actorUserId,
          cadence: body.cadence,
          intervalCount: body.intervalCount,
          ledgerId: parseSyncedId(params.ledgerId),
          nextRunAt: body.nextRunAt,
          payload: toRecurringTemplatePayloadInput(body.payload),
          status: body.status,
          workspaceId: parseSyncedId(params.workspaceId),
        });
        return reply.status(201).send({
          data: {
            recurringTemplate: toRecurringTemplateResponse(recurringTemplate),
          },
        });
      },
    );

    app.get(
      "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/recurring/:templateId",
      {
        schema: {
          params: RecurringTemplateParamsSchema,
          response: {
            200: GetRecurringTemplateResponseSchema,
            ...ErrorResponseSchemas,
          },
        },
      },
      async (request) => {
        requireAuthenticatedUser(request);
        const params = RecurringTemplateParamsSchema.parse(request.params);
        requireActiveWorkspace(request, params.workspaceId);
        requireAbility(request, "read", "RecurringTemplate");

        const recurringTemplate = await workflowService.findRecurringTemplate({
          ledgerId: parseSyncedId(params.ledgerId),
          recurringTemplateId: parseSyncedId(params.templateId),
          workspaceId: parseSyncedId(params.workspaceId),
        });
        if (!recurringTemplate) {
          throw makeHttpError(404, "Recurring template was not found.");
        }

        return {
          data: {
            recurringTemplate: toRecurringTemplateResponse(recurringTemplate),
          },
        };
      },
    );

    app.patch(
      "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/recurring/:templateId",
      {
        onRequest: app.csrfProtection,
        schema: {
          body: UpdateRecurringTemplateRequestSchema,
          params: RecurringTemplateParamsSchema,
          response: {
            200: GetRecurringTemplateResponseSchema,
            ...ErrorResponseSchemas,
          },
        },
      },
      async (request) => {
        const actorUserId = requireAuthenticatedUser(request);
        const params = RecurringTemplateParamsSchema.parse(request.params);
        requireActiveWorkspace(request, params.workspaceId);
        requireAbility(request, "update", "RecurringTemplate");
        const body = UpdateRecurringTemplateRequestSchema.parse(request.body);

        const recurringTemplate = await workflowService.updateRecurringTemplate({
          cadence: body.cadence,
          intervalCount: body.intervalCount,
          ledgerId: parseSyncedId(params.ledgerId),
          nextRunAt: body.nextRunAt,
          payload: toRecurringTemplatePayloadInput(body.payload),
          recurringTemplateId: parseSyncedId(params.templateId),
          status: body.status,
          updatedBy: actorUserId,
          workspaceId: parseSyncedId(params.workspaceId),
        });
        if (!recurringTemplate) {
          throw makeHttpError(404, "Recurring template was not found.");
        }
        return {
          data: {
            recurringTemplate: toRecurringTemplateResponse(recurringTemplate),
          },
        };
      },
    );

    app.delete(
      "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/recurring/:templateId",
      {
        onRequest: app.csrfProtection,
        schema: {
          params: RecurringTemplateParamsSchema,
          response: {
            200: GetRecurringTemplateResponseSchema,
            ...ErrorResponseSchemas,
          },
        },
      },
      async (request) => {
        const actorUserId = requireAuthenticatedUser(request);
        const params = RecurringTemplateParamsSchema.parse(request.params);
        requireActiveWorkspace(request, params.workspaceId);
        requireAbility(request, "delete", "RecurringTemplate");

        const recurringTemplate = await workflowService.archiveRecurringTemplate({
          ledgerId: parseSyncedId(params.ledgerId),
          recurringTemplateId: parseSyncedId(params.templateId),
          updatedBy: actorUserId,
          workspaceId: parseSyncedId(params.workspaceId),
        });
        if (!recurringTemplate) {
          throw makeHttpError(404, "Recurring template was not found.");
        }
        return {
          data: {
            recurringTemplate: toRecurringTemplateResponse(recurringTemplate),
          },
        };
      },
    );

    app.post(
      "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId/recurring/:templateId/generate",
      {
        onRequest: app.csrfProtection,
        schema: {
          body: GenerateRecurringTemplateRequestSchema,
          params: RecurringTemplateParamsSchema,
          response: {
            200: GenerateRecurringTemplateResponseSchema,
            ...ErrorResponseSchemas,
          },
        },
      },
      async (request) => {
        const actorUserId = requireAuthenticatedUser(request);
        const params = RecurringTemplateParamsSchema.parse(request.params);
        requireActiveWorkspace(request, params.workspaceId);
        requireAbility(request, "update", "RecurringTemplate");
        const body = GenerateRecurringTemplateRequestSchema.parse(request.body);

        const result = await workflowService.generateRecurringTemplate({
          actorUserId,
          idempotencyKey: getRequestIdempotencyKey(request),
          occurredAt: body.occurredAt ?? null,
          recurringTemplateId: parseSyncedId(params.templateId),
          requestId: String(request.id),
          scope: {
            ledgerId: parseSyncedId(params.ledgerId),
            workspaceId: parseSyncedId(params.workspaceId),
          },
        });
        return {
          data: {
            recurringTemplate: toRecurringTemplateResponse(result.recurringTemplate),
            transactionGroup: toTransactionGroupResponse(result.transactionGroup),
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

function toBudgetSummaryResponse(
  budget: BudgetSummaryRecord,
): z.infer<typeof BudgetSummaryResponseSchema> {
  return {
    archivedAt: budget.archivedAt,
    createdAt: budget.createdAt,
    currencyCode: budget.currencyCode,
    id: budget.id,
    ledgerId: budget.ledgerId,
    limit: makeMoneyAmount(budget.limitMinor, budget.currencyCode),
    name: budget.name,
    period: budget.period,
    remaining: makeMoneyAmount(budget.remainingMinor, budget.currencyCode),
    rolloverEnabled: budget.rolloverEnabled,
    spent: makeMoneyAmount(budget.spentMinor, budget.currencyCode),
    updatedAt: budget.updatedAt,
    workspaceId: budget.workspaceId,
  };
}

function toRuleConditionInput(
  condition: z.infer<typeof RuleResponseSchema>["condition"],
): RuleRecord["condition"] {
  return {
    ...(condition.amountMaxMinor ? { amountMaxMinor: condition.amountMaxMinor } : {}),
    ...(condition.amountMinMinor ? { amountMinMinor: condition.amountMinMinor } : {}),
    ...(condition.descriptionContains
      ? { descriptionContains: condition.descriptionContains }
      : {}),
    ...(condition.type ? { type: condition.type } : {}),
  };
}

function toRecurringTemplatePayloadInput(
  payload: z.infer<typeof RecurringTemplateResponseSchema>["payload"],
): RecurringTemplateRecord["payload"] {
  return {
    currencyCode: payload.currencyCode,
    description: payload.description,
    lines: payload.lines.map((line) => ({
      amountMinor: line.amountMinor,
      budgetId: line.budgetId ?? null,
      categoryId: line.categoryId ?? null,
      description: line.description ?? null,
      destinationAccountId: line.destinationAccountId,
      reportingAmountMinor: line.reportingAmountMinor ?? null,
      reportingCurrencyCode: line.reportingCurrencyCode ?? null,
    })),
    sourceAccountId: payload.sourceAccountId,
    title: payload.title ?? null,
    type: payload.type,
  };
}

function toImportJobResponse(importJob: ImportJobRecord): z.infer<typeof ImportJobResponseSchema> {
  return {
    committedAt: importJob.committedAt,
    committedGroupIds: [...importJob.committedGroupIds],
    createdAt: importJob.createdAt,
    createdBy: importJob.createdBy,
    fileName: importJob.fileName,
    id: importJob.id,
    ledgerId: importJob.ledgerId,
    previewRows: importJob.previewRows.map((row) => ({
      amountMinor: row.amountMinor,
      currencyCode: row.currencyCode,
      description: row.description,
      destinationAccountId: row.destinationAccountId,
      occurredAt: row.occurredAt,
      rowNumber: row.rowNumber,
      sourceAccountId: row.sourceAccountId,
      type: row.type,
    })),
    status: importJob.status,
    undoneAt: importJob.undoneAt,
    updatedAt: importJob.updatedAt,
    workspaceId: importJob.workspaceId,
  };
}

function toRuleResponse(rule: RuleRecord): z.infer<typeof RuleResponseSchema> {
  return {
    action: rule.action,
    archivedAt: rule.archivedAt,
    condition: rule.condition,
    createdAt: rule.createdAt,
    createdBy: rule.createdBy,
    enabled: rule.enabled,
    id: rule.id,
    ledgerId: rule.ledgerId,
    name: rule.name,
    updatedAt: rule.updatedAt,
    updatedBy: rule.updatedBy,
    workspaceId: rule.workspaceId,
  };
}

function toRecurringTemplateResponse(
  recurringTemplate: RecurringTemplateRecord,
): z.infer<typeof RecurringTemplateResponseSchema> {
  return {
    archivedAt: recurringTemplate.archivedAt,
    cadence: recurringTemplate.cadence,
    createdAt: recurringTemplate.createdAt,
    createdBy: recurringTemplate.createdBy,
    id: recurringTemplate.id,
    intervalCount: recurringTemplate.intervalCount,
    lastGeneratedAt: recurringTemplate.lastGeneratedAt,
    ledgerId: recurringTemplate.ledgerId,
    nextRunAt: recurringTemplate.nextRunAt,
    payload: {
      currencyCode: recurringTemplate.payload.currencyCode,
      description: recurringTemplate.payload.description,
      lines: recurringTemplate.payload.lines.map((line) => ({
        amountMinor: line.amountMinor,
        budgetId: line.budgetId,
        categoryId: line.categoryId,
        description: line.description,
        destinationAccountId: line.destinationAccountId,
        reportingAmountMinor: line.reportingAmountMinor,
        reportingCurrencyCode: line.reportingCurrencyCode,
      })),
      sourceAccountId: recurringTemplate.payload.sourceAccountId,
      title: recurringTemplate.payload.title,
      type: recurringTemplate.payload.type,
    },
    status: recurringTemplate.status,
    updatedAt: recurringTemplate.updatedAt,
    updatedBy: recurringTemplate.updatedBy,
    workspaceId: recurringTemplate.workspaceId,
  };
}

function toPageInfo(page: {
  readonly hasNextPage: boolean;
  readonly nextCursor: string | null;
}): PageInfo {
  return {
    hasNextPage: page.hasNextPage,
    hasPreviousPage: false,
    nextCursor: page.nextCursor,
    previousCursor: null,
  };
}

function validateFinanceCursorKind(
  cursor: string | undefined,
  expectedKind: FinanceCursorKind,
  requestId: string,
): ValidationError | null {
  if (!cursor) {
    return null;
  }
  try {
    parseFinanceCursor(cursor, expectedKind);
    return null;
  } catch {
    return makeValidationError({
      fields: {
        cursor: ["Cursor is invalid for this list endpoint."],
      },
      requestId,
    });
  }
}

function makeHttpError(statusCode: number, message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}
