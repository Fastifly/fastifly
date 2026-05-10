import {
  parseSyncedId,
  SyncConflictsQuerySchema,
  SyncConflictsResponseSchema,
  type SyncOperationEnvelope,
  SyncPullQuerySchema,
  SyncPullResponseSchema,
  SyncPushRequestSchema,
  SyncPushResponseSchema,
  SyncResolveConflictParamsSchema,
  SyncResolveConflictRequestSchema,
  SyncResolveConflictResponseSchema,
  SyncStatusQuerySchema,
  SyncStatusResponseSchema,
} from "@fastifly/common";
import { type SyncQueryService, SyncReplayError, type SyncReplayService } from "@fastifly/db";
import type { FastifyInstance } from "fastify";

import { requireAbility, requireActiveWorkspace, requireAuthenticatedUser } from "../policies.js";
import { ErrorResponseSchemas } from "../schemas.js";

export type RegisterSyncRoutesOptions = {
  readonly syncQueryService?: SyncQueryService | undefined;
  readonly syncReplayService?: SyncReplayService | undefined;
};

export async function registerSyncRoutes(
  app: FastifyInstance,
  options: RegisterSyncRoutesOptions,
): Promise<void> {
  const { syncQueryService, syncReplayService } = options;

  if (syncReplayService) {
    app.post(
      "/api/v1/sync/push",
      {
        onRequest: app.csrfProtection,
        schema: {
          body: SyncPushRequestSchema,
          response: {
            200: SyncPushResponseSchema,
            ...ErrorResponseSchemas,
          },
        },
      },
      async (request) => {
        const actorUserId = requireAuthenticatedUser(request);
        const body = SyncPushRequestSchema.parse(request.body);
        requireActiveWorkspace(request, body.workspaceId);
        requireAbility(request, "sync", "Sync");

        try {
          const result = await syncReplayService.push({
            actorUserId,
            deviceId: parseSyncedId(body.deviceId),
            ledgerId: parseSyncedId(body.ledgerId),
            operations: body.operations.map(
              (operation): SyncOperationEnvelope => ({
                ...operation,
                deviceId: parseSyncedId(body.deviceId),
                ledgerId: parseSyncedId(body.ledgerId),
                workspaceId: parseSyncedId(body.workspaceId),
              }),
            ),
            workspaceId: parseSyncedId(body.workspaceId),
          });

          return { data: result };
        } catch (error) {
          if (error instanceof SyncReplayError) {
            throw makeHttpError(403, error.message);
          }

          throw error;
        }
      },
    );
  }

  if (syncQueryService) {
    app.get(
      "/api/v1/sync/pull",
      {
        schema: {
          querystring: SyncPullQuerySchema,
          response: {
            200: SyncPullResponseSchema,
            ...ErrorResponseSchemas,
          },
        },
      },
      async (request) => {
        const actorUserId = requireAuthenticatedUser(request);
        const query = SyncPullQuerySchema.parse(request.query);
        requireActiveWorkspace(request, query.workspaceId);
        requireAbility(request, "sync", "Sync");

        return {
          data: await syncQueryService.pull({
            actorUserId,
            ledgerId: parseSyncedId(query.ledgerId),
            sinceRevision: Number(query.sinceRevision),
            workspaceId: parseSyncedId(query.workspaceId),
          }),
        };
      },
    );

    app.get(
      "/api/v1/sync/status",
      {
        schema: {
          querystring: SyncStatusQuerySchema,
          response: {
            200: SyncStatusResponseSchema,
            ...ErrorResponseSchemas,
          },
        },
      },
      async (request) => {
        const actorUserId = requireAuthenticatedUser(request);
        const query = SyncStatusQuerySchema.parse(request.query);
        requireActiveWorkspace(request, query.workspaceId);
        requireAbility(request, "sync", "Sync");

        return {
          data: await syncQueryService.status({
            actorUserId,
            ledgerId: parseSyncedId(query.ledgerId),
            workspaceId: parseSyncedId(query.workspaceId),
          }),
        };
      },
    );

    app.get(
      "/api/v1/sync/conflicts",
      {
        schema: {
          querystring: SyncConflictsQuerySchema,
          response: {
            200: SyncConflictsResponseSchema,
            ...ErrorResponseSchemas,
          },
        },
      },
      async (request) => {
        const actorUserId = requireAuthenticatedUser(request);
        const query = SyncConflictsQuerySchema.parse(request.query);
        requireActiveWorkspace(request, query.workspaceId);
        requireAbility(request, "sync", "Sync");

        return {
          data: await syncQueryService.listConflicts({
            actorUserId,
            ledgerId: parseSyncedId(query.ledgerId),
            workspaceId: parseSyncedId(query.workspaceId),
          }),
        };
      },
    );

    app.post(
      "/api/v1/sync/conflicts/:conflictId/resolve",
      {
        onRequest: app.csrfProtection,
        schema: {
          body: SyncResolveConflictRequestSchema,
          params: SyncResolveConflictParamsSchema,
          response: {
            200: SyncResolveConflictResponseSchema,
            ...ErrorResponseSchemas,
          },
        },
      },
      async (request) => {
        const actorUserId = requireAuthenticatedUser(request);
        const params = SyncResolveConflictParamsSchema.parse(request.params);
        const body = SyncResolveConflictRequestSchema.parse(request.body);
        requireActiveWorkspace(request, body.workspaceId);
        requireAbility(request, "sync", "Sync");

        const result = await syncQueryService.dismissConflict({
          actorUserId,
          conflictId: parseSyncedId(params.conflictId),
          ledgerId: parseSyncedId(body.ledgerId),
          workspaceId: parseSyncedId(body.workspaceId),
        });
        if (!result) {
          throw makeHttpError(404, "Sync conflict was not found.");
        }

        return { data: result };
      },
    );
  }
}

function makeHttpError(statusCode: number, message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}
