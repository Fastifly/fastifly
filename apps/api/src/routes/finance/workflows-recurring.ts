import {
  CreateRecurringTemplateRequestSchema,
  CreateRecurringTemplateResponseSchema,
  GenerateRecurringTemplateRequestSchema,
  GenerateRecurringTemplateResponseSchema,
  GetRecurringTemplateResponseSchema,
  ListRecurringTemplatesResponseSchema,
  parseSyncedId,
  UpdateRecurringTemplateRequestSchema,
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
  RecurringTemplateParamsSchema,
  type RegisterFinanceRoutesOptions as RegisterOptions,
} from "./contracts.js";
import {
  toRecurringTemplatePayloadInput,
  toRecurringTemplateResponse,
  toTransactionGroupResponse,
} from "./mappers.js";

export function registerFinanceRecurringWorkflowRoutes(
  app: FastifyInstance,
  workflowService: NonNullable<RegisterOptions["workflowService"]>,
): void {
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
