import { defineWorkspaceAbility } from "@fastifly/authz";
import { createUuidV7 } from "@fastifly/common";
import { type ApiConfig, makeTestApiConfig } from "@fastifly/config";
import type {
  AccountRepository,
  IdentityRepository,
  LedgerFinanceMutationService,
  SyncReplayService,
  TransactionQueryService,
} from "@fastifly/db";
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
import { simpleWebAuthnAdapter, type WebAuthnAdapter } from "./auth/webauthn.js";
import { anonymousAuthContext, denyAllAbility } from "./context.js";
import { registerErrorHandlers } from "./errors.js";
import { registerAuthRoutes, resolveSessionUser } from "./routes/auth.js";
import { registerFinanceRoutes } from "./routes/finance.js";
import { registerSyncRoutes } from "./routes/sync.js";
import { type ReadinessState, registerSystemRoutes } from "./routes/system.js";

export type BuildApiAppOptions = {
  readonly accountRepository?: AccountRepository;
  readonly config?: Partial<ApiConfig>;
  readonly financeMutationService?: LedgerFinanceMutationService;
  readonly identityRepository?: IdentityRepository;
  readonly readiness?: Partial<ReadinessState>;
  readonly syncReplayService?: SyncReplayService;
  readonly transactionQueryService?: TransactionQueryService;
  readonly webAuthnAdapter?: WebAuthnAdapter;
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

  await app.register(fastifyCookie, config.cookieSecret ? { secret: config.cookieSecret } : {});

  app.addHook("onRequest", async (request) => {
    request.authContext = anonymousAuthContext;
    request.authzAbility = denyAllAbility;
    request.workspaceContext = null;

    if (options.identityRepository) {
      const user = await resolveSessionUser(
        options.identityRepository,
        request.cookies[config.sessionCookieName],
      );

      if (user) {
        request.authContext = {
          kind: "user",
          userId: user.id,
        };
        request.workspaceContext =
          await options.identityRepository.findDefaultWorkspaceContextForUser(user.id);
        request.authzAbility = request.workspaceContext
          ? defineWorkspaceAbility({ role: request.workspaceContext.activeWorkspace.role })
          : denyAllAbility;
      }
    }
  });

  await app.register(fastifyCsrfProtection, {
    cookieKey: config.csrfCookieName,
    cookieOpts: {
      httpOnly: true,
      sameSite: "strict",
      secure: config.cookieSecure ?? config.nodeEnv === "production",
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

  if (options.identityRepository) {
    await registerAuthRoutes(app, {
      config,
      identityRepository: options.identityRepository,
      webAuthnAdapter: options.webAuthnAdapter ?? simpleWebAuthnAdapter,
    });
  }

  if (
    options.accountRepository ||
    options.financeMutationService ||
    options.transactionQueryService
  ) {
    await registerFinanceRoutes(app, {
      accountRepository: options.accountRepository,
      financeMutationService: options.financeMutationService,
      transactionQueryService: options.transactionQueryService,
    });
  }

  if (options.syncReplayService) {
    await registerSyncRoutes(app, {
      syncReplayService: options.syncReplayService,
    });
  }

  return app;
}
