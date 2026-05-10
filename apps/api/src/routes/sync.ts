import {
  parseSyncedId,
  type SyncOperationEnvelope,
  SyncPushRequestSchema,
  SyncPushResponseSchema,
} from "@fastifly/common";
import { SyncReplayError, type SyncReplayService } from "@fastifly/db";
import type { FastifyInstance } from "fastify";

import { requireAbility, requireActiveWorkspace, requireAuthenticatedUser } from "../policies.js";
import { ErrorResponseSchemas } from "../schemas.js";

export type RegisterSyncRoutesOptions = {
  readonly syncReplayService?: SyncReplayService | undefined;
};

export async function registerSyncRoutes(
  app: FastifyInstance,
  options: RegisterSyncRoutesOptions,
): Promise<void> {
  if (!options.syncReplayService) {
    return;
  }
  const syncReplayService = options.syncReplayService;

  app.post(
    "/api/v1/sync/push",
    {
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

function makeHttpError(statusCode: number, message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}
