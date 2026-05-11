import { describe, expect, it } from "vitest";

import { makeTestApiConfig, parseApiConfig } from "../index.js";

describe("API config contract", () => {
  it("parses defaults and coerces deployment env values", () => {
    expect(
      parseApiConfig({
        APP_PORT: "8080",
        APP_URL: "https://fastifly.example.com",
        DATABASE_DRIVER: "sqlite",
        DATABASE_URL: "/app/data/fastifly.db",
        HOST: "0.0.0.0",
        LOG_LEVEL: "warn",
        SESSION_TTL_DAYS: "14",
      }),
    ).toMatchObject({
      databaseDriver: "sqlite",
      databaseUrl: "/app/data/fastifly.db",
      host: "0.0.0.0",
      logLevel: "warn",
      openApiBaseUrl: "https://fastifly.example.com",
      port: 8080,
      postgresLedgerLockAcquireTimeoutMs: 15_000,
      serveWebStatic: false,
      sessionTtlDays: 14,
      sessionCookieName: "fastifly_session",
    });
  });

  it("requires a signed cookie secret in production", () => {
    expect(() => parseApiConfig({ APP_ENV: "production" })).toThrow(
      "COOKIE_SECRET is required in production.",
    );

    expect(
      parseApiConfig({
        APP_ENV: "production",
        COOKIE_SECURE: "true",
        SESSION_SECRET: "x".repeat(32),
      }),
    ).toMatchObject({
      cookieSecure: true,
      cookieSecret: "x".repeat(32),
      nodeEnv: "production",
    });
  });

  it("parses string booleans without treating false as true", () => {
    expect(parseApiConfig({ AUTO_MIGRATE: "false", COOKIE_SECURE: "false" })).toMatchObject({
      autoMigrate: false,
      cookieSecure: false,
    });
    expect(parseApiConfig({ AUTO_MIGRATE: "1", COOKIE_SECURE: "true" })).toMatchObject({
      autoMigrate: true,
      cookieSecure: true,
    });
    expect(() => parseApiConfig({ COOKIE_SECURE: "yes" })).toThrow();
  });

  it("requires WEB_STATIC_ROOT when static serving is enabled", () => {
    expect(() => parseApiConfig({ SERVE_WEB_STATIC: "true" })).toThrow(
      "WEB_STATIC_ROOT is required when SERVE_WEB_STATIC is enabled.",
    );

    expect(
      parseApiConfig({
        SERVE_WEB_STATIC: "true",
        WEB_STATIC_ROOT: "/app/web/dist",
      }),
    ).toMatchObject({
      serveWebStatic: true,
      webStaticRoot: "/app/web/dist",
    });
  });

  it("parses Postgres ledger advisory lock acquisition timeout", () => {
    expect(
      parseApiConfig({
        POSTGRES_LEDGER_LOCK_ACQUIRE_TIMEOUT_MS: "25000",
      }),
    ).toMatchObject({
      postgresLedgerLockAcquireTimeoutMs: 25_000,
    });

    expect(() =>
      parseApiConfig({
        POSTGRES_LEDGER_LOCK_ACQUIRE_TIMEOUT_MS: "10",
      }),
    ).toThrow();
  });

  it("keeps test config creation explicit and valid", () => {
    expect(makeTestApiConfig({ openApiBaseUrl: "http://127.0.0.1:3000" })).toMatchObject({
      logLevel: "silent",
      nodeEnv: "test",
      openApiBaseUrl: "http://127.0.0.1:3000",
    });
  });
});
