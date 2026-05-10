import {
  type ApiError,
  ApiErrorSchema,
  type AuthCredentials,
  type AuthResponse,
  AuthResponseSchema,
  type ListAccountsResponse,
  ListAccountsResponseSchema,
  type ListTransactionsResponse,
  ListTransactionsResponseSchema,
  type MeContextResponse,
  MeContextResponseSchema,
} from "@fastifly/common";
import createClient from "openapi-fetch";
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
  readonly getHealth: () => Promise<{ readonly status: string }>;
  readonly getMeContext: () => Promise<MeContextResponse>;
  readonly listAccounts: (input: LedgerPathInput) => Promise<ListAccountsResponse>;
  readonly listTransactions: (input: LedgerPathInput) => Promise<ListTransactionsResponse>;
  readonly login: (input: AuthCredentials) => Promise<AuthResponse>;
  readonly register: (input: AuthCredentials) => Promise<AuthResponse>;
};

type LedgerPathInput = {
  readonly ledgerId: string;
  readonly workspaceId: string;
};

const openApiClient = createClient<paths>({
  baseUrl: API_BASE_URL,
  credentials: "include",
});

export const apiClient: ApiClient = {
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
    return AuthResponseSchema.parse(
      await unwrapOpenApiResponse(
        await openApiClient.POST("/api/v1/auth/login", {
          body: input,
        }),
      ),
    );
  },
  async register(input) {
    return AuthResponseSchema.parse(
      await unwrapOpenApiResponse(
        await openApiClient.POST("/api/v1/auth/register", {
          body: input,
        }),
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
      throw new FastiflyApiError(parsed.data);
    }

    throw new Error(`Request failed with status ${result.response.status}.`);
  }

  if (result.data === undefined) {
    throw new Error(`Request returned no response body with status ${result.response.status}.`);
  }

  return result.data;
}
