import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";

type CsrfInjectOptions = Omit<InjectOptions, "headers"> & {
  readonly headers?: Record<string, string>;
};

export async function injectWithCsrf(
  app: FastifyInstance,
  options: CsrfInjectOptions,
): Promise<LightMyRequestResponse> {
  const headers = options.headers ?? {};
  const csrf = await getCsrfHeaders(app, headers.cookie);
  const requestOptions: InjectOptions = {
    ...options,
    headers: {
      ...headers,
      cookie: csrf.cookie,
      "x-csrf-token": csrf.token,
    },
  };

  return await app.inject(requestOptions);
}

async function getCsrfHeaders(
  app: FastifyInstance,
  existingCookie?: string,
): Promise<{ readonly cookie: string; readonly token: string }> {
  const response = await app.inject(
    existingCookie
      ? {
          headers: { cookie: existingCookie },
          method: "GET",
          url: "/api/v1/auth/csrf",
        }
      : {
          method: "GET",
          url: "/api/v1/auth/csrf",
        },
  );

  if (response.statusCode !== 200) {
    throw new Error(`Expected CSRF token endpoint to return 200, got ${response.statusCode}.`);
  }

  return {
    cookie: joinCookies(existingCookie, getCookiePair(response)),
    token: response.json<{ data: { csrfToken: string } }>().data.csrfToken,
  };
}

function getCookiePair(response: { readonly headers: Record<string, unknown> }): string {
  const header = response.headers["set-cookie"];
  const cookie = Array.isArray(header) ? header[0] : header;

  if (typeof cookie !== "string") {
    throw new Error("Expected response to set a cookie");
  }

  return cookie.split(";")[0] ?? "";
}

function joinCookies(...cookies: readonly (string | undefined)[]): string {
  return cookies.filter((cookie) => cookie && cookie.length > 0).join("; ");
}
