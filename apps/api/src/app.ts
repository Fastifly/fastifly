import { createUuidV7 } from "@fastifly/common";
import fastifyCookie from "@fastify/cookie";
import fastifyCsrfProtection from "@fastify/csrf-protection";
import fastifySwagger from "@fastify/swagger";
import scalarApiReference from "@scalar/fastify-api-reference";
import Fastify, { type FastifyInstance } from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";

import { type ApiConfig, makeTestApiConfig } from "./config.js";
import { anonymousAuthContext, denyAllAbility } from "./context.js";
import { registerErrorHandlers } from "./errors.js";
import { type ReadinessState, registerSystemRoutes } from "./routes/system.js";

export type BuildApiAppOptions = {
  readonly config?: Partial<ApiConfig>;
  readonly readiness?: Partial<ReadinessState>;
};

export async function buildApiApp(options: BuildApiAppOptions = {}): Promise<FastifyInstance> {
  const config = makeTestApiConfig({
    nodeEnv: "development",
    logLevel: "info",
    ...options.config,
  });

  const app = Fastify({
    logger: config.logLevel === "silent" ? false : { level: config.logLevel },
    genReqId: () => createUuidV7(),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  registerErrorHandlers(app);

  app.addHook("onRequest", async (request) => {
    request.authContext = anonymousAuthContext;
    request.authzAbility = denyAllAbility;
  });

  await app.register(fastifyCookie, config.cookieSecret ? { secret: config.cookieSecret } : {});

  await app.register(fastifyCsrfProtection, {
    cookieKey: config.csrfCookieName,
    cookieOpts: {
      httpOnly: true,
      sameSite: "strict",
      secure: config.nodeEnv === "production",
      path: "/",
    },
    getToken: (request) => request.headers["x-csrf-token"]?.toString(),
  });

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "Fastifly API",
        description: "Fastifly finance application API",
        version: "0.1.0",
      },
      servers: [{ url: config.openApiBaseUrl }],
    },
    transform: jsonSchemaTransform,
  });

  await app.register(scalarApiReference, {
    routePrefix: "/api/docs",
    configuration: {
      url: "/api/openapi.json",
    },
    logLevel: config.logLevel,
  });

  await registerSystemRoutes(app, {
    migrations: options.readiness?.migrations ?? "unknown",
  });

  return app;
}
