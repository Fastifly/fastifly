import {
  type ApiError,
  ApiErrorSchema,
  type AuthCredentials,
  type AuthResponse,
  AuthResponseSchema,
  type MeContextResponse,
  MeContextResponseSchema,
} from "@fastifly/common";
import { API_BASE_URL } from "../env";

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
  readonly login: (input: AuthCredentials) => Promise<AuthResponse>;
  readonly register: (input: AuthCredentials) => Promise<AuthResponse>;
};

export const apiClient: ApiClient = {
  async getMeContext() {
    return MeContextResponseSchema.parse(await requestJson("/api/v1/me/context"));
  },
  async getHealth() {
    return await requestJson<{ readonly status: string }>("/health");
  },
  async login(input) {
    return AuthResponseSchema.parse(
      await requestJson("/api/v1/auth/login", {
        json: input,
        method: "POST",
      }),
    );
  },
  async register(input) {
    return AuthResponseSchema.parse(
      await requestJson("/api/v1/auth/register", {
        json: input,
        method: "POST",
      }),
    );
  },
};

type JsonRequestInit = RequestInit & {
  readonly json?: unknown;
};

async function requestJson<TResponse>(path: string, init?: JsonRequestInit): Promise<TResponse> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");

  let body = init?.body;
  if (init && "json" in init) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  const fetchInit = init ? withoutJson(init) : {};

  const requestInit: RequestInit = {
    credentials: "include",
    ...fetchInit,
    headers,
  };
  if (body !== undefined) {
    requestInit.body = body;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, requestInit);
  const payload = (await response.json().catch(() => ({}))) as unknown;

  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(payload);
    if (parsed.success) {
      throw new FastiflyApiError(parsed.data);
    }

    throw new Error(`Request failed with status ${response.status}.`);
  }

  return payload as TResponse;
}

function withoutJson({ json: _json, ...init }: JsonRequestInit): RequestInit {
  return init;
}
