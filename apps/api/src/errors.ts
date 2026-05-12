import {
  type ApiErrorCode,
  type FieldErrorMap,
  makeApiError,
  makeValidationError,
} from "@fastifly/common";
import {
  CategoryRepositoryError,
  FinanceMutationError,
  LedgerMutationError,
  TransactionWriteError,
} from "@fastifly/db";
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { FinanceWorkflowServiceError } from "./services/finance-workflows.js";

const DEFAULT_ERROR_MESSAGES = {
  BAD_REQUEST: "The request is invalid.",
  UNAUTHENTICATED: "Authentication is required.",
  FORBIDDEN: "You do not have permission to perform this action.",
  NOT_FOUND: "The requested resource was not found.",
  CONFLICT: "The request conflicts with the current resource state.",
  RATE_LIMITED: "Too many requests. Try again later.",
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
  return isFastifyError(error) && error.statusCode === 400 && Array.isArray(error.validation);
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
    case "CATEGORY_NOT_FOUND_OR_ARCHIVED":
      return {
        code: "NOT_FOUND",
        message: "Category was not found or is already archived.",
        statusCode: 404,
      };
  }
}

function toTransactionWriteHttpError(error: TransactionWriteError): {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly message: string;
} {
  switch (error.code) {
    case "LEDGER_SCOPE_NOT_FOUND":
      return {
        code: "NOT_FOUND",
        message: "The requested ledger was not found.",
        statusCode: 404,
      };
    case "ACCOUNT_NOT_FOUND_OR_INACTIVE":
      return {
        code: "NOT_FOUND",
        message: "The account was not found or is inactive.",
        statusCode: 404,
      };
    case "CATEGORY_NOT_FOUND_OR_ARCHIVED":
      return {
        code: "NOT_FOUND",
        message: "The category was not found or is archived.",
        statusCode: 404,
      };
    case "BUDGET_NOT_FOUND_OR_ARCHIVED":
      return {
        code: "NOT_FOUND",
        message: "The budget was not found or is archived.",
        statusCode: 404,
      };
    case "INVALID_TRANSACTION_INPUT":
      return {
        code: "BAD_REQUEST",
        message: error.message,
        statusCode: 400,
      };
    case "CROSS_CURRENCY_WRITE_NOT_SUPPORTED":
      return {
        code: "BAD_REQUEST",
        message: "Cross-currency transaction writes are not supported yet.",
        statusCode: 400,
      };
    case "ACCOUNT_PAIR_MISMATCH":
      return {
        code: "BAD_REQUEST",
        message: "The selected accounts do not match this transaction type.",
        statusCode: 400,
      };
  }
}

function toCategoryRepositoryHttpError(error: CategoryRepositoryError): {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly message: string;
} {
  switch (error.code) {
    case "PARENT_NOT_FOUND_OR_ARCHIVED":
      return {
        code: "NOT_FOUND",
        message: "Parent category was not found or is archived.",
        statusCode: 404,
      };
    case "PARENT_CANNOT_BE_SELF":
      return {
        code: "BAD_REQUEST",
        message: "A category cannot be its own parent.",
        statusCode: 400,
      };
  }
}

function toFinanceWorkflowHttpError(error: FinanceWorkflowServiceError): {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly message: string;
} {
  switch (error.code) {
    case "IMPORT_JOB_NOT_FOUND":
      return {
        code: "NOT_FOUND",
        message: "Import job was not found.",
        statusCode: 404,
      };
    case "RULE_NOT_FOUND":
      return {
        code: "NOT_FOUND",
        message: "Rule was not found.",
        statusCode: 404,
      };
    case "RECURRING_TEMPLATE_NOT_FOUND":
      return {
        code: "NOT_FOUND",
        message: "Recurring template was not found.",
        statusCode: 404,
      };
    case "IMPORT_JOB_INVALID_STATE":
      return {
        code: "CONFLICT",
        message: error.message,
        statusCode: 409,
      };
    case "INVALID_IMPORT_CSV":
      return {
        code: "BAD_REQUEST",
        message: error.message,
        statusCode: 400,
      };
    case "INVALID_RECURRING_TEMPLATE":
      return {
        code: "BAD_REQUEST",
        message: error.message,
        statusCode: 400,
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
    case 429:
      return "RATE_LIMITED";
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

function logInternalServerError(
  request: FastifyRequest,
  error: unknown,
  statusCode: number,
  code: ApiErrorCode,
): void {
  if (statusCode < 500) {
    return;
  }

  request.log.error(
    {
      code,
      ...(error instanceof Error ? { err: error } : { error }),
      method: request.method,
      requestId: getRequestId(request),
      statusCode,
      url: request.url,
    },
    "Request failed with internal server error",
  );
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
      logInternalServerError(request, error, mappedError.statusCode, mappedError.code);
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
      logInternalServerError(request, error, mappedError.statusCode, mappedError.code);
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

    if (error instanceof TransactionWriteError) {
      const mappedError = toTransactionWriteHttpError(error);
      logInternalServerError(request, error, mappedError.statusCode, mappedError.code);
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

    if (error instanceof CategoryRepositoryError) {
      const mappedError = toCategoryRepositoryHttpError(error);
      logInternalServerError(request, error, mappedError.statusCode, mappedError.code);
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

    if (error instanceof FinanceWorkflowServiceError) {
      const mappedError = toFinanceWorkflowHttpError(error);
      logInternalServerError(request, error, mappedError.statusCode, mappedError.code);
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
    logInternalServerError(request, error, statusCode, code);

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
