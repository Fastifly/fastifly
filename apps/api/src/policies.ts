import { type AuthzAction, assertCan, type DomainAuthzSubject } from "@fastifly/authz";
import type { SyncedId } from "@fastifly/common";
import type { UserWorkspaceContextRecord } from "@fastifly/db";
import type { FastifyRequest } from "fastify";

function makeHttpError(statusCode: number, message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

export function requireAuthenticatedUser(request: FastifyRequest): SyncedId {
  if (request.authContext.kind !== "user") {
    throw makeHttpError(401, "Authentication is required.");
  }

  return request.authContext.userId;
}

export function requireWorkspaceContext(request: FastifyRequest): UserWorkspaceContextRecord {
  const context = request.workspaceContext;

  if (!context) {
    throw makeHttpError(403, "No active workspace is available.");
  }

  return context;
}

export function requireAbility(
  request: FastifyRequest,
  action: AuthzAction,
  subject: DomainAuthzSubject,
): void {
  try {
    assertCan(request.authzAbility, action, subject);
  } catch {
    throw makeHttpError(403, "You do not have permission to perform this action.");
  }
}

export function requireActiveWorkspace(
  request: FastifyRequest,
  workspaceId: string,
): UserWorkspaceContextRecord {
  const context = requireWorkspaceContext(request);

  if (context.activeWorkspace.id !== workspaceId) {
    throw makeHttpError(403, "Workspace access is denied.");
  }

  return context;
}
