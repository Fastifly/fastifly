import {
  type ApiError,
  ApiErrorSchema,
  type AuthResponse,
  AuthResponseSchema,
  type CreateTransactionRequest,
  CreateTransactionResponseSchema,
  CsrfTokenResponseSchema,
  type ListAccountsResponse,
  ListAccountsResponseSchema,
  type ListTransactionsResponse,
  ListTransactionsResponseSchema,
  type LoginCredentials,
  type MeContextResponse,
  MeContextResponseSchema,
  type RegisterCredentials,
} from "@fastifly/common";
import createClient from "openapi-fetch";
import { notifySessionExpired } from "../auth/session-events";
import { API_BASE_URL } from "../env";
import type { paths } from "./generated/openapi";

export class FastiflyApiError extends Error {
  readonly response: ApiError;

  constructor(response: ApiError) {
    super(response.error.message);
    this.name = "FastiflyApiError";
    this.response = response;
  }
}

export type ApiClient = {
  readonly createTransaction: (input: LedgerPathInput & CreateTransactionRequest) => Promise<void>;
  readonly getHealth: () => Promise<{ readonly status: string }>;
  readonly getMeContext: () => Promise<MeContextResponse>;
  readonly listAccounts: (input: LedgerPathInput) => Promise<ListAccountsResponse>;
  readonly listTransactions: (input: LedgerPathInput) => Promise<ListTransactionsResponse>;
  readonly login: (input: LoginCredentials) => Promise<AuthResponse>;
  readonly logout: () => Promise<void>;
  readonly register: (input: RegisterCredentials) => Promise<AuthResponse>;
};

type LedgerPathInput = {
  readonly ledgerId: string;
  readonly workspaceId: string;
};

const openApiClient = createClient<paths>({
  baseUrl: API_BASE_URL,
  credentials: "include",
});

let csrfTokenPromise: Promise<string> | null = null;

export const apiClient: ApiClient = {
  async createTransaction(input) {
    const { ledgerId, workspaceId, ...body } = input;
    await withCsrf(async (csrfToken) => {
      CreateTransactionResponseSchema.parse(
        await unwrapOpenApiResponse(
          await openApiClient.POST(
            "/api/v1/workspaces/{workspaceId}/ledgers/{ledgerId}/transactions",
            {
              body: makeCreateTransactionBody(body),
              headers: {
                "idempotency-key": makeIdempotencyKey(),
                "x-csrf-token": csrfToken,
              },
              params: {
                path: {
                  ledgerId,
                  workspaceId,
                },
              },
            },
          ),
        ),
      );
    });
  },
  async getMeContext() {
    return MeContextResponseSchema.parse(
      await unwrapOpenApiResponse(await openApiClient.GET("/api/v1/me/context")),
    );
  },
  async getHealth() {
    return await unwrapOpenApiResponse(await openApiClient.GET("/health"));
  },
  async listAccounts(input) {
    return ListAccountsResponseSchema.parse(
      await unwrapOpenApiResponse(
        await openApiClient.GET("/api/v1/workspaces/{workspaceId}/ledgers/{ledgerId}/accounts", {
          params: {
            path: {
              ledgerId: input.ledgerId,
              workspaceId: input.workspaceId,
            },
            query: {
              limit: 50,
            },
          },
        }),
      ),
    );
  },
  async listTransactions(input) {
    return ListTransactionsResponseSchema.parse(
      await unwrapOpenApiResponse(
        await openApiClient.GET(
          "/api/v1/workspaces/{workspaceId}/ledgers/{ledgerId}/transactions",
          {
            params: {
              path: {
                ledgerId: input.ledgerId,
                workspaceId: input.workspaceId,
              },
              query: {
                limit: 50,
              },
            },
          },
        ),
      ),
    );
  },
  async login(input) {
    return withCsrf(async (csrfToken) =>
      AuthResponseSchema.parse(
        await unwrapOpenApiResponse(
          await openApiClient.POST("/api/v1/auth/login", {
            body: input,
            headers: { "x-csrf-token": csrfToken },
          }),
        ),
      ),
    );
  },
  async logout() {
    await withCsrf(async (csrfToken) => {
      await unwrapOpenApiEmptyResponse(
        await openApiClient.POST("/api/v1/auth/logout", {
          headers: { "x-csrf-token": csrfToken },
        }),
      );
      csrfTokenPromise = null;
    });
  },
  async register(input) {
    return withCsrf(async (csrfToken) =>
      AuthResponseSchema.parse(
        await unwrapOpenApiResponse(
          await openApiClient.POST("/api/v1/auth/register", {
            body: input,
            headers: { "x-csrf-token": csrfToken },
          }),
        ),
      ),
    );
  },
};

type OpenApiFetchResult<TData> = {
  readonly data?: TData;
  readonly error?: unknown;
  readonly response: Response;
};

async function unwrapOpenApiResponse<TData>(result: OpenApiFetchResult<TData>): Promise<TData> {
  if (result.error !== undefined) {
    const parsed = ApiErrorSchema.safeParse(result.error);
    if (parsed.success) {
      notifyIfSessionExpired(parsed.data);
      throw new FastiflyApiError(parsed.data);
    }

    throw new Error(`Request failed with status ${result.response.status}.`);
  }

  if (result.data === undefined) {
    throw new Error(`Request returned no response body with status ${result.response.status}.`);
  }

  return result.data;
}

async function unwrapOpenApiEmptyResponse<TData>(result: OpenApiFetchResult<TData>): Promise<void> {
  if (result.error !== undefined) {
    const parsed = ApiErrorSchema.safeParse(result.error);
    if (parsed.success) {
      notifyIfSessionExpired(parsed.data);
      throw new FastiflyApiError(parsed.data);
    }

    throw new Error(`Request failed with status ${result.response.status}.`);
  }

  if (!result.response.ok) {
    throw new Error(`Request failed with status ${result.response.status}.`);
  }
}

async function withCsrf<T>(request: (csrfToken: string) => Promise<T>): Promise<T> {
  const csrfToken = await getCsrfToken();

  try {
    return await request(csrfToken);
  } catch (error) {
    if (!isCsrfFailure(error)) {
      throw error;
    }

    csrfTokenPromise = null;
    return request(await getCsrfToken());
  }
}

async function getCsrfToken(): Promise<string> {
  csrfTokenPromise ??= fetchCsrfToken();
  return csrfTokenPromise;
}

async function fetchCsrfToken(): Promise<string> {
  const response = CsrfTokenResponseSchema.parse(
    await unwrapOpenApiResponse(await openApiClient.GET("/api/v1/auth/csrf")),
  );
  return response.data.csrfToken;
}

function isCsrfFailure(error: unknown): boolean {
  return (
    error instanceof FastiflyApiError &&
    error.response.error.code === "FORBIDDEN" &&
    error.response.error.message.toLocaleLowerCase("en-US").includes("csrf")
  );
}

function notifyIfSessionExpired(error: ApiError): void {
  if (error.error.code === "UNAUTHENTICATED") {
    notifySessionExpired();
  }
}

function makeIdempotencyKey(): string {
  return `web-${crypto.randomUUID()}`;
}

function makeCreateTransactionBody(input: CreateTransactionRequest) {
  return {
    currencyCode: input.currencyCode,
    description: input.description,
    occurredAt: input.occurredAt,
    sourceAccountId: input.sourceAccountId,
    transactions: input.transactions.map((line) => ({
      amountMinor: line.amountMinor,
      destinationAccountId: line.destinationAccountId,
      ...(line.budgetId !== undefined ? { budgetId: line.budgetId } : {}),
      ...(line.categoryId !== undefined ? { categoryId: line.categoryId } : {}),
      ...(line.description !== undefined ? { description: line.description } : {}),
      ...(line.reportingAmountMinor !== undefined
        ? { reportingAmountMinor: line.reportingAmountMinor }
        : {}),
      ...(line.reportingCurrencyCode !== undefined
        ? { reportingCurrencyCode: line.reportingCurrencyCode }
        : {}),
    })),
    type: input.type,
    ...(input.options !== undefined
      ? {
          options: {
            ...(input.options.applyRules !== undefined
              ? { applyRules: input.options.applyRules }
              : {}),
            ...(input.options.batchSubmission !== undefined
              ? { batchSubmission: input.options.batchSubmission }
              : {}),
            ...(input.options.fireWebhooks !== undefined
              ? { fireWebhooks: input.options.fireWebhooks }
              : {}),
            ...(input.options.recalculateBalances !== undefined
              ? { recalculateBalances: input.options.recalculateBalances }
              : {}),
            ...(input.options.skipNotifications !== undefined
              ? { skipNotifications: input.options.skipNotifications }
              : {}),
          },
        }
      : {}),
    ...(input.source !== undefined ? { source: input.source } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
  };
}
