import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ApiErrorSchema,
  IDEMPOTENCY_REPLAYED_HEADER,
  isSyncedId,
  ValidationErrorSchema,
} from "@fastifly/common";
import { FinanceMutationError, LedgerMutationError } from "@fastifly/db";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { buildApiApp } from "../app.js";
import { getRequestIdempotencyKey, sendLedgerMutationResult } from "../idempotency.js";

const apps: Awaited<ReturnType<typeof buildApiApp>>[] = [];
const tempDirs: string[] = [];

async function makeApp() {
  const app = await buildApiApp({
    config: { logLevel: "silent", nodeEnv: "test" },
    readiness: { migrations: "ok" },
  });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("Fastifly API app", () => {
  it("serves health and readiness with stable request identifiers", async () => {
    const app = await makeApp();

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({
      status: "ok",
      service: "fastifly-api",
    });
    expect(isSyncedId(health.json<{ requestId: string }>().requestId)).toBe(true);

    const ready = await app.inject({ method: "GET", url: "/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({
      status: "ready",
      checks: {
        config: "ok",
        migrations: "ok",
      },
    });
  });

  it("returns 503 when readiness checks are incomplete", async () => {
    const app = await buildApiApp({
      config: { logLevel: "silent", nodeEnv: "test" },
      readiness: { migrations: "unknown" },
    });
    apps.push(app);

    const ready = await app.inject({ method: "GET", url: "/ready" });
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toMatchObject({
      status: "not_ready",
      checks: {
        config: "ok",
        migrations: "unknown",
      },
    });
  });

  it("exposes an OpenAPI document generated from registered routes", async () => {
    const app = await makeApp();
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/api/openapi.json" });
    expect(response.statusCode).toBe(200);

    const document = response.json<{
      openapi: string;
      paths: Record<string, unknown>;
    }>();
    expect(document.openapi).toBe("3.1.0");
    expect(document.paths).toHaveProperty("/health");
    expect(document.paths).toHaveProperty("/ready");
  });

  it("serves frontend static assets and SPA fallback when enabled", async () => {
    const webStaticRoot = makeStaticFixture();
    const app = await buildApiApp({
      config: {
        logLevel: "silent",
        nodeEnv: "test",
        serveWebStatic: true,
        webStaticRoot,
      },
      readiness: { migrations: "ok" },
    });
    apps.push(app);

    const home = await app.inject({ method: "GET", url: "/" });
    expect(home.statusCode).toBe(200);
    expect(home.headers["content-type"]).toContain("text/html");
    expect(home.body).toContain("Fastifly test shell");

    const deepLink = await app.inject({ method: "GET", url: "/transactions" });
    expect(deepLink.statusCode).toBe(200);
    expect(deepLink.body).toContain("Fastifly test shell");

    const sw = await app.inject({ method: "GET", url: "/sw.js" });
    expect(sw.statusCode).toBe(200);
    expect(sw.headers["cache-control"]).toContain("no-cache");

    const apiMiss = await app.inject({ method: "GET", url: "/api/missing" });
    expect(apiMiss.statusCode).toBe(404);
    expect(apiMiss.json()).toMatchObject({
      error: {
        code: "NOT_FOUND",
      },
    });
  });

  it("fails startup if static serving is enabled with a missing web root", async () => {
    await expect(
      buildApiApp({
        config: {
          logLevel: "silent",
          nodeEnv: "test",
          serveWebStatic: true,
          webStaticRoot: "/tmp/fastifly-missing-static-root",
        },
        readiness: { migrations: "ok" },
      }),
    ).rejects.toThrow("WEB_STATIC_ROOT does not exist");
  });

  it("returns standard not-found errors", async () => {
    const app = await makeApp();

    const response = await app.inject({ method: "GET", url: "/missing" });
    expect(response.statusCode).toBe(404);
    expect(() => ApiErrorSchema.parse(response.json())).not.toThrow();
    expect(response.json()).toMatchObject({
      error: {
        code: "NOT_FOUND",
        details: {
          path: "/missing",
        },
      },
    });
  });

  it("maps Zod validation errors to standard field errors", async () => {
    const app = await makeApp();
    app.route({
      method: "POST",
      url: "/test/validation",
      schema: {
        body: z
          .object({
            name: z.string().min(2),
          })
          .strict(),
      },
      handler: () => ({ ok: true }),
    });

    const response = await app.inject({
      method: "POST",
      url: "/test/validation",
      payload: { name: "" },
    });

    expect(response.statusCode).toBe(400);
    expect(() => ValidationErrorSchema.parse(response.json())).not.toThrow();
    expect(response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
      },
    });
  });

  it("preserves important standard error codes for future route layers", async () => {
    const app = await makeApp();

    for (const [statusCode] of [
      [401, "UNAUTHENTICATED"],
      [403, "FORBIDDEN"],
      [409, "CONFLICT"],
    ] as const) {
      app.route({
        method: "GET",
        url: `/test/errors/${statusCode}`,
        handler: () => {
          const error = new Error(`status ${statusCode}`) as Error & { statusCode: number };
          error.statusCode = statusCode;
          throw error;
        },
      });
    }

    for (const [statusCode, code] of [
      [401, "UNAUTHENTICATED"],
      [403, "FORBIDDEN"],
      [409, "CONFLICT"],
    ] as const) {
      const response = await app.inject({
        method: "GET",
        url: `/test/errors/${statusCode}`,
      });

      expect(response.statusCode).toBe(statusCode);
      expect(response.json()).toMatchObject({
        error: {
          code,
        },
      });
    }
  });

  it("maps ledger mutation errors to customer-safe API errors", async () => {
    const app = await makeApp();
    app.route({
      method: "POST",
      url: "/test/ledger/idempotency-conflict",
      handler: () => {
        throw new LedgerMutationError(
          "Idempotency key was already used with a different request.",
          "IDEMPOTENCY_CONFLICT",
        );
      },
    });
    app.route({
      method: "POST",
      url: "/test/ledger/read-only",
      handler: () => {
        throw new LedgerMutationError("Ledger scope is not writable.", "LEDGER_NOT_WRITABLE");
      },
    });
    app.route({
      method: "POST",
      url: "/test/ledger/forbidden",
      handler: () => {
        throw new LedgerMutationError(
          "Actor is not a member of this workspace.",
          "MUTATION_FORBIDDEN",
        );
      },
    });

    const conflict = await app.inject({
      method: "POST",
      url: "/test/ledger/idempotency-conflict",
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({
      error: {
        code: "CONFLICT",
        message: "This retry key was already used for a different request.",
      },
    });

    const readOnly = await app.inject({ method: "POST", url: "/test/ledger/read-only" });
    expect(readOnly.statusCode).toBe(409);
    expect(readOnly.json()).toMatchObject({
      error: {
        code: "CONFLICT",
        message: "This ledger cannot be changed right now.",
      },
    });

    const forbidden = await app.inject({ method: "POST", url: "/test/ledger/forbidden" });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json()).toMatchObject({
      error: {
        code: "FORBIDDEN",
        message: "You do not have permission to perform this action.",
      },
    });
  });

  it("maps finance mutation errors to customer-safe API errors", async () => {
    const app = await makeApp();
    app.route({
      method: "DELETE",
      url: "/test/finance/archive-missing-account",
      handler: () => {
        throw new FinanceMutationError(
          "Account was not found or is already archived.",
          "ACCOUNT_NOT_FOUND_OR_ARCHIVED",
        );
      },
    });

    const response = await app.inject({
      method: "DELETE",
      url: "/test/finance/archive-missing-account",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: {
        code: "NOT_FOUND",
        message: "Account was not found or is already archived.",
      },
    });
  });

  it("normalizes ledger mutation idempotency headers for routes", async () => {
    const app = await makeApp();
    app.route({
      method: "POST",
      url: "/test/ledger/idempotency",
      handler: (request, reply) =>
        sendLedgerMutationResult(reply, {
          body: { idempotencyKey: getRequestIdempotencyKey(request) },
          idempotencyReplayed: true,
          status: 201,
        }),
    });

    const response = await app.inject({
      headers: { "idempotency-key": " retry_123 " },
      method: "POST",
      url: "/test/ledger/idempotency",
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers[IDEMPOTENCY_REPLAYED_HEADER]).toBe("true");
    expect(response.json()).toEqual({ idempotencyKey: "retry_123" });

    const invalid = await app.inject({
      headers: { "idempotency-key": "contains space" },
      method: "POST",
      url: "/test/ledger/idempotency",
    });

    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({
      error: {
        code: "BAD_REQUEST",
        message: "Idempotency key is invalid.",
      },
    });
  });
});

function makeStaticFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "fastifly-web-static-"));
  tempDirs.push(dir);
  writeFileSync(
    join(dir, "index.html"),
    "<!doctype html><html><body><div>Fastifly test shell</div></body></html>",
  );
  writeFileSync(join(dir, "sw.js"), "self.addEventListener('install', () => {});");
  writeFileSync(join(dir, "manifest.webmanifest"), JSON.stringify({ name: "Fastifly" }));
  return dir;
}
