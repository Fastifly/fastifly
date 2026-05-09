import { type FieldErrorMap, makeApiError, makeValidationError } from "@fastifly/common";
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const DEFAULT_ERROR_MESSAGES = {
  BAD_REQUEST: "The request is invalid.",
  NOT_FOUND: "The requested resource was not found.",
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

    const statusCode =
      isFastifyError(error) && error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    const isClientError = statusCode < 500;
    const clientMessage = isFastifyError(error)
      ? error.message
      : DEFAULT_ERROR_MESSAGES.BAD_REQUEST;

    sendError(
      reply,
      statusCode,
      makeApiError({
        code: isClientError ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR",
        message: isClientError ? clientMessage : DEFAULT_ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        details: {},
        requestId: getRequestId(request),
      }),
    );
  });
}
