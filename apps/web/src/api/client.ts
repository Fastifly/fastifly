import {
  type ApiError,
  ApiErrorSchema,
  ArchiveAccountResponseSchema,
  type AuthResponse,
  AuthResponseSchema,
  CommitImportJobResponseSchema,
  type CreateAccountRequest,
  CreateAccountResponseSchema,
  CreateImportCsvResponseSchema,
  CreateRecurringTemplateResponseSchema,
  CreateRuleResponseSchema,
  type CreateTransactionRequest,
  CreateTransactionResponseSchema,
  CsrfTokenResponseSchema,
  GenerateRecurringTemplateResponseSchema,
  GetImportJobResponseSchema,
  GetRecurringTemplateResponseSchema,
  GetRuleResponseSchema,
  type ImportJobResponse,
  type ListAccountsResponse,
  ListAccountsResponseSchema,
  type ListBudgetsQuery,
  type ListBudgetsResponse,
  ListBudgetsResponseSchema,
  ListImportJobsResponseSchema,
  ListRecurringTemplatesResponseSchema,
  ListRulesResponseSchema,
  type ListTransactionsQuery,
  type ListTransactionsResponse,
  ListTransactionsResponseSchema,
  type LoginCredentials,
  type MeContextResponse,
  MeContextResponseSchema,
  type RecurringTemplateResponse,
  type RegisterCredentials,
  RuleApplyResponseSchema,
  type RuleResponse,
  RuleTestResponseSchema,
  type SyncConflictsResponse,
  SyncConflictsResponseSchema,
  type SyncStatusResponse,
  SyncStatusResponseSchema,
  UndoImportJobResponseSchema,
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
  readonly archiveAccount: (
    input: LedgerPathInput & { readonly accountId: string },
  ) => Promise<void>;
  readonly archiveRule: (
    input: LedgerPathInput & { readonly ruleId: string },
  ) => Promise<RuleResponse>;
  readonly applyRule: (
    input: LedgerPathInput & { readonly limit?: number; readonly ruleId: string },
  ) => Promise<{
    readonly matchedTransactionGroupIds: readonly string[];
    readonly rule: RuleResponse;
    readonly status: RuleResponse["action"]["status"];
    readonly updatedTransactionGroupIds: readonly string[];
  }>;
  readonly commitImportJob: (
    input: LedgerPathInput & {
      readonly applyRules?: boolean;
      readonly importJobId: string;
    },
  ) => Promise<ImportJobResponse>;
  readonly createAccount: (input: LedgerPathInput & CreateAccountRequest) => Promise<void>;
  readonly createImportCsv: (
    input: LedgerPathInput & {
      readonly csvText: string;
      readonly fileName?: string | null;
    },
  ) => Promise<ImportJobResponse>;
  readonly createRecurringTemplate: (
    input: LedgerPathInput & {
      readonly cadence: RecurringTemplateResponse["cadence"];
      readonly intervalCount: number;
      readonly nextRunAt: string;
      readonly payload: RecurringTemplateResponse["payload"];
      readonly status: RecurringTemplateResponse["status"];
    },
  ) => Promise<RecurringTemplateResponse>;
  readonly createRule: (
    input: LedgerPathInput & {
      readonly action: RuleResponse["action"];
      readonly condition: RuleResponse["condition"];
      readonly enabled: boolean;
      readonly name: string;
    },
  ) => Promise<RuleResponse>;
  readonly createTransaction: (input: LedgerPathInput & CreateTransactionRequest) => Promise<void>;
  readonly generateRecurringTemplate: (
    input: LedgerPathInput & {
      readonly occurredAt?: string;
      readonly templateId: string;
    },
  ) => Promise<{
    readonly recurringTemplate: RecurringTemplateResponse;
    readonly transactionGroup: ListTransactionsResponse["data"][number];
  }>;
  readonly getHealth: () => Promise<{ readonly status: string }>;
  readonly getImportJob: (
    input: LedgerPathInput & { readonly importJobId: string },
  ) => Promise<ImportJobResponse>;
  readonly getMeContext: () => Promise<MeContextResponse>;
  readonly getRecurringTemplate: (
    input: LedgerPathInput & { readonly templateId: string },
  ) => Promise<RecurringTemplateResponse>;
  readonly getRule: (input: LedgerPathInput & { readonly ruleId: string }) => Promise<RuleResponse>;
  readonly getSyncConflicts: (input: LedgerPathInput) => Promise<SyncConflictsResponse>;
  readonly getSyncStatus: (input: LedgerPathInput) => Promise<SyncStatusResponse>;
  readonly listAccounts: (input: LedgerPathInput) => Promise<ListAccountsResponse>;
  readonly listBudgets: (
    input: LedgerPathInput & Partial<Pick<ListBudgetsQuery, "asOfDate" | "cursor" | "limit">>,
  ) => Promise<ListBudgetsResponse>;
  readonly listImportJobs: (input: LedgerPathInput) => Promise<readonly ImportJobResponse[]>;
  readonly listRecurringTemplates: (
    input: LedgerPathInput,
  ) => Promise<readonly RecurringTemplateResponse[]>;
  readonly listRules: (input: LedgerPathInput) => Promise<readonly RuleResponse[]>;
  readonly listTransactions: (
    input: LedgerPathInput &
      Partial<
        Pick<
          ListTransactionsQuery,
          "accountId" | "cursor" | "fromOccurredAt" | "limit" | "status" | "toOccurredAt" | "type"
        >
      >,
  ) => Promise<ListTransactionsResponse>;
  readonly login: (input: LoginCredentials) => Promise<AuthResponse>;
  readonly logout: () => Promise<void>;
  readonly register: (input: RegisterCredentials) => Promise<AuthResponse>;
  readonly testRule: (
    input: LedgerPathInput & { readonly limit?: number; readonly ruleId: string },
  ) => Promise<readonly ListTransactionsResponse["data"][number][]>;
  readonly undoImportJob: (input: LedgerPathInput & { readonly importJobId: string }) => Promise<{
    readonly archivedGroupIds: readonly string[];
    readonly importJob: ImportJobResponse;
  }>;
  readonly updateRecurringTemplate: (
    input: LedgerPathInput & {
      readonly cadence: RecurringTemplateResponse["cadence"];
      readonly intervalCount: number;
      readonly nextRunAt: string;
      readonly payload: RecurringTemplateResponse["payload"];
      readonly status: RecurringTemplateResponse["status"];
      readonly templateId: string;
    },
  ) => Promise<RecurringTemplateResponse>;
  readonly updateRule: (
    input: LedgerPathInput & {
      readonly action: RuleResponse["action"];
      readonly condition: RuleResponse["condition"];
      readonly enabled: boolean;
      readonly name: string;
      readonly ruleId: string;
    },
  ) => Promise<RuleResponse>;
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
  async archiveAccount(input) {
    const { accountId, ledgerId, workspaceId } = input;
    await withCsrf(async (csrfToken) => {
      ArchiveAccountResponseSchema.parse(
        await unwrapOpenApiResponse(
          await openApiClient.DELETE(
            "/api/v1/workspaces/{workspaceId}/ledgers/{ledgerId}/accounts/{accountId}",
            {
              headers: {
                "idempotency-key": makeIdempotencyKey(),
                "x-csrf-token": csrfToken,
              },
              params: {
                path: {
                  accountId,
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
  async applyRule(input) {
    const { ledgerId, limit, ruleId, workspaceId } = input;
    return await withCsrf(async (csrfToken) => {
      const response = RuleApplyResponseSchema.parse(
        await unwrapOpenApiResponse(
          await openApiClient.POST(
            "/api/v1/workspaces/{workspaceId}/ledgers/{ledgerId}/rules/{ruleId}/apply",
            {
              body: {
                ...(limit !== undefined ? { limit } : {}),
              },
              headers: {
                "idempotency-key": makeIdempotencyKey(),
                "x-csrf-token": csrfToken,
              },
              params: {
                path: {
                  ledgerId,
                  ruleId,
                  workspaceId,
                },
              },
            },
          ),
        ),
      );
      return response.data;
    });
  },
  async archiveRule(input) {
    const { ledgerId, ruleId, workspaceId } = input;
    return await withCsrf(async (csrfToken) => {
      const response = GetRuleResponseSchema.parse(
        await unwrapOpenApiResponse(
          await openApiClient.DELETE(
            "/api/v1/workspaces/{workspaceId}/ledgers/{ledgerId}/rules/{ruleId}",
            {
              headers: {
                "idempotency-key": makeIdempotencyKey(),
                "x-csrf-token": csrfToken,
              },
              params: {
                path: {
                  ledgerId,
                  ruleId,
                  workspaceId,
                },
              },
            },
          ),
        ),
      );
      return response.data.rule;
    });
  },
  async commitImportJob(input) {
    const { applyRules, importJobId, ledgerId, workspaceId } = input;
    return await withCsrf(async (csrfToken) => {
      const response = CommitImportJobResponseSchema.parse(
        await unwrapOpenApiResponse(
          await openApiClient.POST(
            "/api/v1/workspaces/{workspaceId}/ledgers/{ledgerId}/imports/{importJobId}/commit",
            {
              body: {
                ...(applyRules !== undefined ? { applyRules } : {}),
              },
              headers: {
                "idempotency-key": makeIdempotencyKey(),
                "x-csrf-token": csrfToken,
              },
              params: {
                path: {
                  importJobId,
                  ledgerId,
                  workspaceId,
                },
              },
            },
          ),
        ),
      );
      return response.data.importJob;
    });
  },
  async createAccount(input) {
    const { ledgerId, workspaceId, ...body } = input;
    await withCsrf(async (csrfToken) => {
      CreateAccountResponseSchema.parse(
        await unwrapOpenApiResponse(
          await openApiClient.POST("/api/v1/workspaces/{workspaceId}/ledgers/{ledgerId}/accounts", {
            body: makeCreateAccountBody(body),
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
          }),
        ),
      );
    });
  },
  async createImportCsv(input) {
    const { csvText, fileName, ledgerId, workspaceId } = input;
    return await withCsrf(async (csrfToken) => {
      const response = CreateImportCsvResponseSchema.parse(
        await unwrapOpenApiResponse(
          await openApiClient.POST(
            "/api/v1/workspaces/{workspaceId}/ledgers/{ledgerId}/imports/csv",
            {
              body: {
                csvText,
                ...(fileName !== undefined ? { fileName } : {}),
              },
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
      return response.data.importJob;
    });
  },
  async createRecurringTemplate(input) {
    const { cadence, intervalCount, ledgerId, nextRunAt, payload, status, workspaceId } = input;
    return await withCsrf(async (csrfToken) => {
      const response = CreateRecurringTemplateResponseSchema.parse(
        await unwrapOpenApiResponse(
          await openApiClient.POST(
            "/api/v1/workspaces/{workspaceId}/ledgers/{ledgerId}/recurring",
            {
              body: {
                cadence,
                intervalCount,
                nextRunAt,
                payload,
                status,
              },
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
      return response.data.recurringTemplate;
    });
  },
  async createRule(input) {
    const { action, condition, enabled, ledgerId, name, workspaceId } = input;
    return await withCsrf(async (csrfToken) => {
      const response = CreateRuleResponseSchema.parse(
        await unwrapOpenApiResponse(
          await openApiClient.POST("/api/v1/workspaces/{workspaceId}/ledgers/{ledgerId}/rules", {
            body: {
              action,
              condition: makeRuleConditionBody(condition),
              enabled,
              name,
            },
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
          }),
        ),
      );
      return response.data.rule;
    });
  },
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
  async generateRecurringTemplate(input) {
    const { ledgerId, occurredAt, templateId, workspaceId } = input;
    return await withCsrf(async (csrfToken) => {
      const response = GenerateRecurringTemplateResponseSchema.parse(
        await unwrapOpenApiResponse(
          await openApiClient.POST(
            "/api/v1/workspaces/{workspaceId}/ledgers/{ledgerId}/recurring/{templateId}/generate",
            {
              body: {
                ...(occurredAt !== undefined ? { occurredAt } : {}),
              },
              headers: {
                "idempotency-key": makeIdempotencyKey(),
                "x-csrf-token": csrfToken,
              },
              params: {
                path: {
                  ledgerId,
                  templateId,
                  workspaceId,
                },
              },
            },
          ),
        ),
      );
      return response.data;
    });
  },
  async getImportJob(input) {
    const { importJobId, ledgerId, workspaceId } = input;
    const response = GetImportJobResponseSchema.parse(
      await unwrapOpenApiResponse(
        await openApiClient.GET(
          "/api/v1/workspaces/{workspaceId}/ledgers/{ledgerId}/imports/{importJobId}",
          {
            params: {
              path: {
                importJobId,
                ledgerId,
                workspaceId,
              },
            },
          },
        ),
      ),
    );
    return response.data.importJob;
  },
  async getMeContext() {
    return MeContextResponseSchema.parse(
      await unwrapOpenApiResponse(await openApiClient.GET("/api/v1/me/context")),
    );
  },
  async getHealth() {
    return await unwrapOpenApiResponse(await openApiClient.GET("/health"));
  },
  async getSyncStatus(input) {
    return SyncStatusResponseSchema.parse(
      await unwrapOpenApiResponse(
        await openApiClient.GET("/api/v1/sync/status", {
          params: {
            query: {
              ledgerId: input.ledgerId,
              workspaceId: input.workspaceId,
            },
          },
        }),
      ),
    );
  },
  async getSyncConflicts(input) {
    return SyncConflictsResponseSchema.parse(
      await unwrapOpenApiResponse(
        await openApiClient.GET("/api/v1/sync/conflicts", {
          params: {
            query: {
              ledgerId: input.ledgerId,
              workspaceId: input.workspaceId,
            },
          },
        }),
      ),
    );
  },
  async getRecurringTemplate(input) {
    const { ledgerId, templateId, workspaceId } = input;
    const response = GetRecurringTemplateResponseSchema.parse(
      await unwrapOpenApiResponse(
        await openApiClient.GET(
          "/api/v1/workspaces/{workspaceId}/ledgers/{ledgerId}/recurring/{templateId}",
          {
            params: {
              path: {
                ledgerId,
                templateId,
                workspaceId,
              },
            },
          },
        ),
      ),
    );
    return response.data.recurringTemplate;
  },
  async getRule(input) {
    const { ledgerId, ruleId, workspaceId } = input;
    const response = GetRuleResponseSchema.parse(
      await unwrapOpenApiResponse(
        await openApiClient.GET(
          "/api/v1/workspaces/{workspaceId}/ledgers/{ledgerId}/rules/{ruleId}",
          {
            params: {
              path: {
                ledgerId,
                ruleId,
                workspaceId,
              },
            },
          },
        ),
      ),
    );
    return response.data.rule;
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
  async listImportJobs(input) {
    const response = ListImportJobsResponseSchema.parse(
      await unwrapOpenApiResponse(
        await openApiClient.GET("/api/v1/workspaces/{workspaceId}/ledgers/{ledgerId}/imports", {
          params: {
            path: {
              ledgerId: input.ledgerId,
              workspaceId: input.workspaceId,
            },
          },
        }),
      ),
    );
    return response.data;
  },
  async listRecurringTemplates(input) {
    const response = ListRecurringTemplatesResponseSchema.parse(
      await unwrapOpenApiResponse(
        await openApiClient.GET("/api/v1/workspaces/{workspaceId}/ledgers/{ledgerId}/recurring", {
          params: {
            path: {
              ledgerId: input.ledgerId,
              workspaceId: input.workspaceId,
            },
          },
        }),
      ),
    );
    return response.data;
  },
  async listRules(input) {
    const response = ListRulesResponseSchema.parse(
      await unwrapOpenApiResponse(
        await openApiClient.GET("/api/v1/workspaces/{workspaceId}/ledgers/{ledgerId}/rules", {
          params: {
            path: {
              ledgerId: input.ledgerId,
              workspaceId: input.workspaceId,
            },
          },
        }),
      ),
    );
    return response.data;
  },
  async listTransactions(input) {
    const {
      accountId,
      cursor,
      fromOccurredAt,
      ledgerId,
      limit = 50,
      status,
      toOccurredAt,
      type,
      workspaceId,
    } = input;
    return ListTransactionsResponseSchema.parse(
      await unwrapOpenApiResponse(
        await openApiClient.GET(
          "/api/v1/workspaces/{workspaceId}/ledgers/{ledgerId}/transactions",
          {
            params: {
              path: {
                ledgerId,
                workspaceId,
              },
              query: {
                ...(accountId ? { accountId } : {}),
                ...(cursor ? { cursor } : {}),
                ...(fromOccurredAt ? { fromOccurredAt } : {}),
                limit,
                ...(status ? { status } : {}),
                ...(toOccurredAt ? { toOccurredAt } : {}),
                ...(type ? { type } : {}),
              },
            },
          },
        ),
      ),
    );
  },
  async listBudgets(input) {
    const { asOfDate, cursor, ledgerId, limit = 50, workspaceId } = input;
    return ListBudgetsResponseSchema.parse(
      await unwrapOpenApiResponse(
        await openApiClient.GET("/api/v1/workspaces/{workspaceId}/ledgers/{ledgerId}/budgets", {
          params: {
            path: {
              ledgerId,
              workspaceId,
            },
            query: {
              ...(asOfDate ? { asOfDate } : {}),
              ...(cursor ? { cursor } : {}),
              limit,
            },
          },
        }),
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
  async testRule(input) {
    const { ledgerId, limit, ruleId, workspaceId } = input;
    return await withCsrf(async (csrfToken) => {
      const response = RuleTestResponseSchema.parse(
        await unwrapOpenApiResponse(
          await openApiClient.POST(
            "/api/v1/workspaces/{workspaceId}/ledgers/{ledgerId}/rules/{ruleId}/test",
            {
              body: {
                ...(limit !== undefined ? { limit } : {}),
              },
              headers: {
                "x-csrf-token": csrfToken,
              },
              params: {
                path: {
                  ledgerId,
                  ruleId,
                  workspaceId,
                },
              },
            },
          ),
        ),
      );
      return response.data.matchedTransactionGroups;
    });
  },
  async undoImportJob(input) {
    const { importJobId, ledgerId, workspaceId } = input;
    return await withCsrf(async (csrfToken) => {
      const response = UndoImportJobResponseSchema.parse(
        await unwrapOpenApiResponse(
          await openApiClient.POST(
            "/api/v1/workspaces/{workspaceId}/ledgers/{ledgerId}/imports/{importJobId}/undo",
            {
              headers: {
                "idempotency-key": makeIdempotencyKey(),
                "x-csrf-token": csrfToken,
              },
              params: {
                path: {
                  importJobId,
                  ledgerId,
                  workspaceId,
                },
              },
            },
          ),
        ),
      );
      return response.data;
    });
  },
  async updateRecurringTemplate(input) {
    const {
      cadence,
      intervalCount,
      ledgerId,
      nextRunAt,
      payload,
      status,
      templateId,
      workspaceId,
    } = input;
    return await withCsrf(async (csrfToken) => {
      const response = GetRecurringTemplateResponseSchema.parse(
        await unwrapOpenApiResponse(
          await openApiClient.PATCH(
            "/api/v1/workspaces/{workspaceId}/ledgers/{ledgerId}/recurring/{templateId}",
            {
              body: {
                cadence,
                intervalCount,
                nextRunAt,
                payload,
                status,
              },
              headers: {
                "idempotency-key": makeIdempotencyKey(),
                "x-csrf-token": csrfToken,
              },
              params: {
                path: {
                  ledgerId,
                  templateId,
                  workspaceId,
                },
              },
            },
          ),
        ),
      );
      return response.data.recurringTemplate;
    });
  },
  async updateRule(input) {
    const { action, condition, enabled, ledgerId, name, ruleId, workspaceId } = input;
    return await withCsrf(async (csrfToken) => {
      const response = GetRuleResponseSchema.parse(
        await unwrapOpenApiResponse(
          await openApiClient.PATCH(
            "/api/v1/workspaces/{workspaceId}/ledgers/{ledgerId}/rules/{ruleId}",
            {
              body: {
                action,
                condition: makeRuleConditionBody(condition),
                enabled,
                name,
              },
              headers: {
                "idempotency-key": makeIdempotencyKey(),
                "x-csrf-token": csrfToken,
              },
              params: {
                path: {
                  ledgerId,
                  ruleId,
                  workspaceId,
                },
              },
            },
          ),
        ),
      );
      return response.data.rule;
    });
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

function makeCreateAccountBody(input: CreateAccountRequest) {
  return {
    currencyCode: input.currencyCode,
    kind: input.kind,
    name: input.name,
    subtype: input.subtype,
    ...(input.openingBalanceDate !== undefined
      ? { openingBalanceDate: input.openingBalanceDate }
      : {}),
    ...(input.openingBalanceMinor !== undefined
      ? { openingBalanceMinor: input.openingBalanceMinor }
      : {}),
  };
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

function makeRuleConditionBody(condition: RuleResponse["condition"]) {
  return {
    ...(condition.amountMaxMinor !== undefined ? { amountMaxMinor: condition.amountMaxMinor } : {}),
    ...(condition.amountMinMinor !== undefined ? { amountMinMinor: condition.amountMinMinor } : {}),
    ...(condition.descriptionContains !== undefined
      ? { descriptionContains: condition.descriptionContains }
      : {}),
    ...(condition.type !== undefined ? { type: condition.type } : {}),
  };
}
