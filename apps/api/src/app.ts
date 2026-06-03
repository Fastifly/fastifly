import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineWorkspaceAbility } from "@fastifly/authz";
import { createUuidV7, parseSyncedId } from "@fastifly/common";
import { type ApiConfig, makeTestApiConfig } from "@fastifly/config";
import type {
  AccountRepository,
  BudgetQueryService,
  CategoryRepository,
  DeviceRepository,
  IdentityRepository,
  LedgerFinanceMutationService,
  ReportQueryService,
  SyncQueryService,
  SyncReplayService,
  TransactionQueryService,
} from "@fastifly/db";
import fastifyCookie from "@fastify/cookie";
import fastifyCsrfProtection from "@fastify/csrf-protection";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import fastifySwagger from "@fastify/swagger";
import scalarApiReference from "@scalar/fastify-api-reference";
import Fastify, { type FastifyInstance } from "fastify";
import {
  createJsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { simpleWebAuthnAdapter, type WebAuthnAdapter } from "./auth/webauthn.js";
import { anonymousAuthContext, denyAllAbility } from "./context.js";
import { registerErrorHandlers } from "./errors.js";
import { registerAuthRoutes, resolveApiKeyUser, resolveSessionUser } from "./routes/auth.js";
import { registerDeviceRoutes } from "./routes/devices.js";
import { registerFinanceRoutes } from "./routes/finance.js";
import { registerSyncRoutes } from "./routes/sync.js";
import { type ReadinessState, registerSystemRoutes } from "./routes/system.js";
import type { FinanceWorkflowService } from "./services/finance-workflows.js";

export type BuildApiAppOptions = {
  readonly accountRepository?: AccountRepository;
  readonly budgetQueryService?: BudgetQueryService;
  readonly categoryRepository?: CategoryRepository;
  readonly config?: Partial<ApiConfig>;
  readonly deviceRepository?: DeviceRepository;
  readonly financeMutationService?: LedgerFinanceMutationService;
  readonly identityRepository?: IdentityRepository;
  readonly reportQueryService?: ReportQueryService;
  readonly readiness?: Partial<ReadinessState>;
  readonly syncQueryService?: SyncQueryService;
  readonly syncReplayService?: SyncReplayService;
  readonly transactionQueryService?: TransactionQueryService;
  readonly workflowService?: FinanceWorkflowService;
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

    if (!options.identityRepository) {
      return;
    }

    const identityRepository = options.identityRepository;
    const sessionUser = await resolveSessionUser(
      identityRepository,
      request.cookies[config.sessionCookieName],
    );

    if (sessionUser) {
      request.authContext = {
        kind: "user",
        userId: sessionUser.id,
      };
    } else {
      // Fall back to API-key authentication so customers can call the API with
      // their own clients using a key generated from the dashboard.
      const apiKeyAuth = await resolveApiKeyUser(identityRepository, request.headers.authorization);

      if (apiKeyAuth) {
        request.authContext = {
          apiKeyId: apiKeyAuth.apiKeyId,
          kind: "user",
          userId: apiKeyAuth.user.id,
        };
        await identityRepository.touchApiKeyLastUsed(apiKeyAuth.apiKeyId);
      }
    }

    if (request.authContext.kind === "user") {
      request.workspaceContext = await identityRepository.findDefaultWorkspaceContextForUser(
        request.authContext.userId,
      );
      request.authzAbility = request.workspaceContext
        ? defineWorkspaceAbility({ role: request.workspaceContext.activeWorkspace.role })
        : denyAllAbility;
    }
  });

  app.addHook("preHandler", async (request) => {
    if (!options.identityRepository || request.authContext.kind !== "user") {
      return;
    }

    const routeWorkspaceId = parseRouteWorkspaceId(request);
    const routeLedgerId = parseRouteLedgerId(request);
    const headerWorkspaceId = routeWorkspaceId ? null : parseWorkspaceSelectionHeader(request);
    const headerLedgerId = routeLedgerId ? null : parseLedgerSelectionHeader(request);
    const preferredWorkspaceId = routeWorkspaceId ?? headerWorkspaceId;
    const preferredLedgerId = routeLedgerId ?? headerLedgerId;

    if (!preferredWorkspaceId && !preferredLedgerId) {
      return;
    }

    request.workspaceContext = await options.identityRepository.findDefaultWorkspaceContextForUser(
      request.authContext.userId,
      preferredWorkspaceId ?? undefined,
      preferredLedgerId ?? undefined,
    );
    if (routeWorkspaceId && request.workspaceContext?.activeWorkspace.id !== routeWorkspaceId) {
      request.workspaceContext = null;
    }
    request.authzAbility = request.workspaceContext
      ? defineWorkspaceAbility({ role: request.workspaceContext.activeWorkspace.role })
      : denyAllAbility;
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

  // CSRF defends cookie/session writes from cross-site forgery; it is meaningless
  // for API-key (bearer) auth, which a browser cannot be tricked into sending. Skip
  // the check for API-key-authenticated requests so headless clients (e.g. the Dwell
  // desktop widget) can POST without a cookie+token dance, while interactive
  // session requests stay protected. Reassigned before routes capture the handler.
  const enforceCsrf = app.csrfProtection.bind(app);
  app.csrfProtection = (request, reply, done) => {
    if (request.authContext.kind === "user" && request.authContext.apiKeyId) {
      done();
      return;
    }
    enforceCsrf(request, reply, done);
  };

  await app.register(fastifyRateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) =>
      makeRateLimitError(`Too many requests. Try again in ${context.after}.`, context.statusCode),
  });

  await app.register(fastifySwagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Fastifly API",
        description: "Fastifly finance application API",
        version: "0.1.0",
      },
      servers: [{ url: config.openApiBaseUrl }],
    },
    transform: createJsonSchemaTransform({
      zodToJsonConfig: { target: "draft-2020-12" },
    }),
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

  if (options.deviceRepository) {
    await registerDeviceRoutes(app, {
      deviceRepository: options.deviceRepository,
    });
  }

  if (
    options.accountRepository ||
    options.budgetQueryService ||
    options.categoryRepository ||
    options.financeMutationService ||
    options.reportQueryService ||
    options.transactionQueryService ||
    options.workflowService
  ) {
    await registerFinanceRoutes(app, {
      accountRepository: options.accountRepository,
      budgetQueryService: options.budgetQueryService,
      categoryRepository: options.categoryRepository,
      financeMutationService: options.financeMutationService,
      reportQueryService: options.reportQueryService,
      transactionQueryService: options.transactionQueryService,
      workflowService: options.workflowService,
    });
  }

  if (options.syncReplayService || options.syncQueryService) {
    await registerSyncRoutes(app, {
      syncQueryService: options.syncQueryService,
      syncReplayService: options.syncReplayService,
    });
  }

  if (config.serveWebStatic) {
    await registerWebStatic(app, config.webStaticRoot);
  }

  return app;
}

async function registerWebStatic(app: FastifyInstance, webStaticRoot: string | undefined) {
  if (!webStaticRoot) {
    throw new Error("WEB_STATIC_ROOT is required when static serving is enabled.");
  }

  const staticRoot = resolve(webStaticRoot);

  if (!existsSync(staticRoot)) {
    throw new Error(`WEB_STATIC_ROOT does not exist: ${staticRoot}`);
  }

  await app.register(fastifyStatic, {
    root: staticRoot,
    maxAge: "30d",
    immutable: true,
    index: false,
    wildcard: false,
    cacheControl: false,
    setHeaders: (response, filePath) => {
      response.setHeader("Cache-Control", resolveStaticCacheControl(filePath));
    },
  });

  app.get("/", { schema: { hide: true } }, async (_request, reply) =>
    reply.sendFile("index.html", {
      immutable: false,
      maxAge: 0,
    }),
  );

  app.get("/*", { schema: { hide: true } }, async (request, reply) => {
    const pathname = new URL(request.url, "http://localhost").pathname;

    if (isBackendPath(pathname)) {
      return reply.callNotFound();
    }

    return reply.sendFile("index.html", {
      immutable: false,
      maxAge: 0,
    });
  });
}

function isBackendPath(pathname: string): boolean {
  return pathname === "/health" || pathname === "/ready" || pathname.startsWith("/api/");
}

function resolveStaticCacheControl(filePath: string): string {
  const normalized = filePath.replaceAll("\\", "/");

  if (normalized.endsWith("/index.html") || normalized.endsWith("/sw.js")) {
    return "no-cache";
  }
  if (normalized.endsWith("/manifest.webmanifest")) {
    return "public, max-age=3600";
  }

  return "public, max-age=2592000, immutable";
}

function makeRateLimitError(message: string, statusCode: number): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

function parseWorkspaceSelectionHeader(request: { readonly headers: Record<string, unknown> }) {
  const headerWorkspaceId = request.headers["x-fastifly-workspace-id"];

  if (typeof headerWorkspaceId === "string" && headerWorkspaceId.trim().length > 0) {
    try {
      return parseSyncedId(headerWorkspaceId.trim());
    } catch {
      throw makeHttpError(400, "Workspace selection header is invalid.");
    }
  }

  return null;
}

function parseRouteWorkspaceId(request: { readonly params: unknown }) {
  const params = request.params;

  if (
    params &&
    typeof params === "object" &&
    "workspaceId" in params &&
    typeof params.workspaceId === "string" &&
    params.workspaceId.trim().length > 0
  ) {
    try {
      return parseSyncedId(params.workspaceId.trim());
    } catch {
      throw makeHttpError(400, "Workspace route parameter is invalid.");
    }
  }

  return null;
}

function parseLedgerSelectionHeader(request: { readonly headers: Record<string, unknown> }) {
  const headerLedgerId = request.headers["x-fastifly-ledger-id"];

  if (typeof headerLedgerId === "string" && headerLedgerId.trim().length > 0) {
    try {
      return parseSyncedId(headerLedgerId.trim());
    } catch {
      throw makeHttpError(400, "Ledger selection header is invalid.");
    }
  }

  return null;
}

function parseRouteLedgerId(request: { readonly params: unknown }) {
  const params = request.params;

  if (
    params &&
    typeof params === "object" &&
    "ledgerId" in params &&
    typeof params.ledgerId === "string" &&
    params.ledgerId.trim().length > 0
  ) {
    try {
      return parseSyncedId(params.ledgerId.trim());
    } catch {
      throw makeHttpError(400, "Ledger route parameter is invalid.");
    }
  }

  return null;
}

function makeHttpError(statusCode: number, message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}
