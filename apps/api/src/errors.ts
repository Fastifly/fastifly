import {
  type ApiErrorCode,
  type FieldErrorMap,
  makeApiError,
  makeValidationError,
} from "@fastifly/common";
import { FinanceMutationError, LedgerMutationError } from "@fastifly/db";
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const DEFAULT_ERROR_MESSAGES = {
  BAD_REQUEST: "The request is invalid.",
  UNAUTHENTICATED: "Authentication is required.",
  FORBIDDEN: "You do not have permission to perform this action.",
  NOT_FOUND: "The requested resource was not found.",
  CONFLICT: "The request conflicts with the current resource state.",
  INTERNAL_SERVER_ERROR: "An unexpected error occurred.",
} as const;

function getRequestId(request: FastifyRequest): string {
  return String(request.id);
}

function getMissingProperty(params: unknown): string | undefined {
  if (!params || typeof params !== "object" || !("missingProperty" in params)) {
    return undefined;
  }

  const missingProperty = params.missingProperty;
  return typeof missingProperty === "string" ? missingProperty : undefined;
}

function isFastifyError(error: unknown): error is FastifyError {
  return Boolean(error && typeof error === "object" && "message" in error);
}

function isFastifyValidationError(error: unknown): error is FastifyError {
  return isFastifyError(error) && Array.isArray(error.validation);
}

function toLedgerMutationHttpError(error: LedgerMutationError): {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly message: string;
} {
  switch (error.code) {
    case "IDEMPOTENCY_CONFLICT":
      return {
        code: "CONFLICT",
        message: "This retry key was already used for a different request.",
        statusCode: 409,
      };
    case "INVALID_SYNC_OPERATION":
      return {
        code: "BAD_REQUEST",
        message: "The sync operation metadata is invalid.",
        statusCode: 400,
      };
    case "LEDGER_NOT_FOUND":
      return {
        code: "NOT_FOUND",
        message: "The requested ledger was not found.",
        statusCode: 404,
      };
    case "LEDGER_NOT_WRITABLE":
      return {
        code: "CONFLICT",
        message: "This ledger cannot be changed right now.",
        statusCode: 409,
      };
    case "MUTATION_FORBIDDEN":
      return {
        code: "FORBIDDEN",
        message: "You do not have permission to perform this action.",
        statusCode: 403,
      };
    case "INVALID_MUTATION_RESPONSE":
      return {
        code: "INTERNAL_SERVER_ERROR",
        message: DEFAULT_ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        statusCode: 500,
      };
  }
}

function toFinanceMutationHttpError(error: FinanceMutationError): {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly message: string;
} {
  switch (error.code) {
    case "ACCOUNT_NOT_FOUND_OR_ARCHIVED":
      return {
        code: "NOT_FOUND",
        message: "Account was not found or is already archived.",
        statusCode: 404,
      };
  }
}

function mapStatusToApiErrorCode(statusCode: number): ApiErrorCode {
  switch (statusCode) {
    case 401:
      return "UNAUTHENTICATED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 400:
      return "BAD_REQUEST";
    default:
      return statusCode >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST";
  }
}

function toFieldErrorMap(error: FastifyError): FieldErrorMap {
  const validation = error.validation ?? [];
  const fields: Record<string, string[]> = {};

  for (const entry of validation) {
    const path = entry.instancePath?.replace(/^\//, "").replaceAll("/", ".");
    const field = path && path.length > 0 ? path : (getMissingProperty(entry.params) ?? "request");
    const messages = fields[field] ?? [];
    messages.push(entry.message ?? "Invalid value.");
    fields[field] = messages;
  }

  if (Object.keys(fields).length === 0) {
    fields.request = [error.message];
  }

  return fields;
}

function sendError(reply: FastifyReply, statusCode: number, payload: unknown): void {
  reply.status(statusCode).send(payload);
}

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    sendError(
      reply,
      404,
      makeApiError({
        code: "NOT_FOUND",
        message: DEFAULT_ERROR_MESSAGES.NOT_FOUND,
        details: { path: request.url },
        requestId: getRequestId(request),
      }),
    );
  });

  app.setErrorHandler((error, request, reply) => {
    if (isFastifyValidationError(error)) {
      sendError(
        reply,
        400,
        makeValidationError({
          fields: toFieldErrorMap(error),
          requestId: getRequestId(request),
        }),
      );
      return;
    }

    if (error instanceof LedgerMutationError) {
      const mappedError = toLedgerMutationHttpError(error);
      sendError(
        reply,
        mappedError.statusCode,
        makeApiError({
          code: mappedError.code,
          message: mappedError.message,
          details: {},
          requestId: getRequestId(request),
        }),
      );
      return;
    }

    if (error instanceof FinanceMutationError) {
      const mappedError = toFinanceMutationHttpError(error);
      sendError(
        reply,
        mappedError.statusCode,
        makeApiError({
          code: mappedError.code,
          message: mappedError.message,
          details: {},
          requestId: getRequestId(request),
        }),
      );
      return;
    }

    const statusCode =
      isFastifyError(error) && error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    const code = mapStatusToApiErrorCode(statusCode);
    const clientMessage = isFastifyError(error)
      ? error.message
      : DEFAULT_ERROR_MESSAGES.BAD_REQUEST;

    sendError(
      reply,
      statusCode,
      makeApiError({
        code,
        message: code === "INTERNAL_SERVER_ERROR" ? DEFAULT_ERROR_MESSAGES[code] : clientMessage,
        details: {},
        requestId: getRequestId(request),
      }),
    );
  });
}
