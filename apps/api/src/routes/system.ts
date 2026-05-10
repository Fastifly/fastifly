import type { FastifyInstance } from "fastify";

import {
  ErrorResponseSchemas,
  HealthResponseSchema,
  OpenApiDocumentSchema,
  ReadyResponseSchema,
} from "../schemas.js";

export type ReadinessState = {
  readonly migrations: "unknown" | "ok";
};

export async function registerSystemRoutes(
  app: FastifyInstance,
  readiness: ReadinessState = { migrations: "unknown" },
): Promise<void> {
  app.route({
    method: "GET",
    url: "/health",
    schema: {
      response: {
        200: HealthResponseSchema,
        ...ErrorResponseSchemas,
      },
    },
    handler: (request) => ({
      status: "ok" as const,
      service: "fastifly-api" as const,
      requestId: String(request.id),
    }),
  });

  app.route({
    method: "GET",
    url: "/ready",
    schema: {
      response: {
        200: ReadyResponseSchema,
        503: ReadyResponseSchema,
        ...ErrorResponseSchemas,
      },
    },
    handler: (request, reply) => {
      const isReady = readiness.migrations === "ok";

      return reply.status(isReady ? 200 : 503).send({
        status: isReady ? "ready" : "not_ready",
        checks: {
          config: "ok" as const,
          migrations: readiness.migrations,
        },
        requestId: String(request.id),
      });
    },
  });

  app.route({
    method: "GET",
    url: "/api/openapi.json",
    schema: {
      response: {
        200: OpenApiDocumentSchema,
        ...ErrorResponseSchemas,
      },
    },
    handler: () => app.swagger(),
  });
}
