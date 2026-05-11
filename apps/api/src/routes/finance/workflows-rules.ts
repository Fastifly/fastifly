import {
  CreateRuleRequestSchema,
  CreateRuleResponseSchema,
  GetRuleResponseSchema,
  ListRulesResponseSchema,
  parseSyncedId,
  RuleApplyRequestSchema,
  RuleApplyResponseSchema,
  RuleTestRequestSchema,
  RuleTestResponseSchema,
  UpdateRuleRequestSchema,
} from "@fastifly/common";
import type { FastifyInstance } from "fastify";
import { getRequestIdempotencyKey } from "../../idempotency.js";
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
  RuleParamsSchema,
} from "./contracts.js";
import { toRuleConditionInput, toRuleResponse, toTransactionGroupResponse } from "./mappers.js";

export function registerFinanceRuleWorkflowRoutes(
  app: FastifyInstance,
  workflowService: NonNullable<RegisterOptions["workflowService"]>,
): void {
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
}
