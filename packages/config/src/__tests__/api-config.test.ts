import { describe, expect, it } from "vitest";

import { makeTestApiConfig, parseApiConfig } from "../index.js";

describe("API config contract", () => {
  it("parses defaults and coerces deployment env values", () => {
    expect(
      parseApiConfig({
        HOST: "0.0.0.0",
        LOG_LEVEL: "warn",
        PORT: "8080",
        SESSION_TTL_DAYS: "14",
      }),
    ).toMatchObject({
      host: "0.0.0.0",
      logLevel: "warn",
      port: 8080,
      sessionTtlDays: 14,
      sessionCookieName: "fastifly_session",
    });
  });

  it("requires a signed cookie secret in production", () => {
    expect(() => parseApiConfig({ NODE_ENV: "production" })).toThrow(
      "COOKIE_SECRET is required in production.",
    );

    expect(
      parseApiConfig({
        COOKIE_SECRET: "x".repeat(32),
        NODE_ENV: "production",
      }),
    ).toMatchObject({
      cookieSecret: "x".repeat(32),
      nodeEnv: "production",
    });
  });

  it("keeps test config creation explicit and valid", () => {
    expect(makeTestApiConfig({ openApiBaseUrl: "http://127.0.0.1:3000" })).toMatchObject({
      logLevel: "silent",
      nodeEnv: "test",
      openApiBaseUrl: "http://127.0.0.1:3000",
    });
  });
});
