import {
  CommitImportJobRequestSchema,
  CommitImportJobResponseSchema,
  CreateImportCsvRequestSchema,
  CreateImportCsvResponseSchema,
  GetImportJobResponseSchema,
  ListImportJobsResponseSchema,
  parseSyncedId,
  UndoImportJobResponseSchema,
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
  ImportParamsSchema,
  LedgerParamsSchema,
  makeHttpError,
  type RegisterFinanceRoutesOptions as RegisterOptions,
} from "./contracts.js";
import { toImportJobResponse } from "./mappers.js";

export function registerFinanceImportWorkflowRoutes(
  app: FastifyInstance,
  workflowService: NonNullable<RegisterOptions["workflowService"]>,
): void {
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
}
