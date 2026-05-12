import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUuidV7, type SyncedId } from "@fastifly/common";
import { makeTestApiConfig } from "@fastifly/config";
import {
  createConfiguredSqliteClient,
  createInProcessLedgerWriteBoundary,
  createLedgerFinanceMutationService,
  createSqliteAccountRepository,
  createSqliteBudgetQueryService,
  createSqliteCategoryRepository,
  createSqliteDatabaseFromClient,
  createSqliteDeviceRepository,
  createSqliteIdentityRepository,
  createSqliteLedgerMutationStore,
  createSqliteSyncRepository,
  createSqliteTransactionQueryService,
  createSqliteTransactionWriteRepository,
  createSqliteWorkflowRepository,
  createSyncQueryService,
  createSyncReplayService,
  LedgerMutationRunner,
  type SeedLevel,
  seedSqlite,
} from "@fastifly/db";
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";

import { runMigrations } from "../../../../../packages/db/src/migrations/maintenance-cli.js";
import { buildApiApp } from "../../../src/app.js";
import type { WebAuthnAdapter } from "../../../src/auth/webauthn.js";
import { createRuntimeAuthorization } from "../../../src/runtime.js";
import { createFinanceWorkflowService } from "../../../src/services/finance-workflows.js";
import { injectWithCsrf } from "./csrf.js";

const SESSION_COOKIE_NAME = "fastifly_session";

export type AuthSession = {
  readonly cookie: string;
  readonly ledgerId: string;
  readonly role: "owner" | "admin" | "editor" | "viewer";
  readonly userId: string;
  readonly workspaceId: string;
};

export async function createSqliteE2eSystem(
  options: { readonly seedLevel?: SeedLevel; readonly webAuthnAdapter?: WebAuthnAdapter } = {},
): Promise<{
  readonly app: FastifyInstance;
  readonly cleanup: () => Promise<void>;
}> {
  const tempDirectory = await mkdtemp(join(tmpdir(), "fastifly-api-e2e-"));
  const sqlitePath = join(tempDirectory, "e2e.sqlite");
  await runMigrations("sqlite", sqlitePath);

  const sqliteClient = createConfiguredSqliteClient({ source: sqlitePath });
  await seedSqlite(sqliteClient, options.seedLevel ?? "essential");
  const sqliteDb = createSqliteDatabaseFromClient(sqliteClient);

  const createId = createUuidV7;
  const identityRepository = createSqliteIdentityRepository(sqliteDb, { createId });
  const accountRepository = createSqliteAccountRepository(sqliteClient, { createId });
  const categoryRepository = createSqliteCategoryRepository(sqliteClient, { createId });
  const transactionQueryService = createSqliteTransactionQueryService(sqliteClient);
  const runner = new LedgerMutationRunner({
    authorize: createRuntimeAuthorization(identityRepository),
    store: createSqliteLedgerMutationStore(sqliteDb, { createId }),
    writeBoundary: createInProcessLedgerWriteBoundary(),
  });
  const financeMutationService = createLedgerFinanceMutationService({
    accountRepository,
    categoryRepository,
    runner,
    transactionRepository: createSqliteTransactionWriteRepository(sqliteClient, { createId }),
  });
  const syncRepository = createSqliteSyncRepository(sqliteClient);

  const app = await buildApiApp({
    accountRepository,
    budgetQueryService: createSqliteBudgetQueryService(sqliteClient),
    categoryRepository,
    config: makeTestApiConfig({ logLevel: "silent", nodeEnv: "test" }),
    deviceRepository: createSqliteDeviceRepository(sqliteClient, { createId }),
    financeMutationService,
    identityRepository,
    readiness: { migrations: "ok" },
    syncQueryService: createSyncQueryService({ syncRepository }),
    syncReplayService: createSyncReplayService({
      createId,
      financeMutationService,
      syncRepository,
    }),
    transactionQueryService,
    ...(options.webAuthnAdapter ? { webAuthnAdapter: options.webAuthnAdapter } : {}),
    workflowService: createFinanceWorkflowService({
      accountRepository,
      categoryRepository,
      financeMutationService,
      transactionQueryService,
      workflowRepository: createSqliteWorkflowRepository(sqliteClient, { createId }),
    }),
  });

  const cleanup = async () => {
    await app.close();
    sqliteClient.close();
    await rm(tempDirectory, { force: true, recursive: true });
  };

  return { app, cleanup };
}

export async function registerAndResolveScope(
  app: FastifyInstance,
  input: { readonly password: string; readonly username: string },
): Promise<AuthSession> {
  const registerResponse = await requestWithCsrf(app, undefined, {
    method: "POST",
    payload: input,
    url: "/api/v1/auth/register",
  });

  if (registerResponse.statusCode !== 201) {
    throw new Error(
      `Expected registration to return 201, got ${registerResponse.statusCode}. Body: ${registerResponse.body}`,
    );
  }

  const cookie = getSessionCookie(registerResponse);
  return await resolveScopeFromCookie(app, cookie);
}

export async function loginAndResolveScope(
  app: FastifyInstance,
  input: { readonly password: string; readonly username: string },
): Promise<AuthSession> {
  const loginResponse = await requestWithCsrf(app, undefined, {
    method: "POST",
    payload: input,
    url: "/api/v1/auth/login",
  });

  if (loginResponse.statusCode !== 200) {
    throw new Error(
      `Expected login to return 200, got ${loginResponse.statusCode}. Body: ${loginResponse.body}`,
    );
  }

  const cookie = getSessionCookie(loginResponse);
  return await resolveScopeFromCookie(app, cookie);
}

export async function createAccount(
  app: FastifyInstance,
  session: AuthSession,
  payload: {
    readonly currencyCode: string;
    readonly kind: "asset" | "expense" | "revenue";
    readonly name: string;
    readonly subtype: "bank" | "cash" | "external";
  },
): Promise<SyncedId> {
  const response = await requestWithCsrf(app, session.cookie, {
    headers: { "idempotency-key": `acct-${createUuidV7()}` },
    method: "POST",
    payload,
    url: `/api/v1/workspaces/${session.workspaceId}/ledgers/${session.ledgerId}/accounts`,
  });

  if (response.statusCode !== 201) {
    throw new Error(
      `Expected account creation to return 201, got ${response.statusCode}. Body: ${response.body}`,
    );
  }

  return response.json<{ data: { account: { id: SyncedId } } }>().data.account.id;
}

export async function createTransaction(
  app: FastifyInstance,
  session: AuthSession,
  payload: Record<string, unknown>,
): Promise<void> {
  const response = await requestWithCsrf(app, session.cookie, {
    headers: { "idempotency-key": `txn-${createUuidV7()}` },
    method: "POST",
    payload,
    url: `/api/v1/workspaces/${session.workspaceId}/ledgers/${session.ledgerId}/transactions`,
  });

  if (response.statusCode !== 201) {
    throw new Error(
      `Expected transaction creation to return 201, got ${response.statusCode}. Body: ${response.body}`,
    );
  }
}

export async function getAccountBalanceMinor(
  app: FastifyInstance,
  session: AuthSession,
  accountId: SyncedId,
): Promise<string> {
  const response = await app.inject({
    headers: { cookie: session.cookie },
    method: "GET",
    url: `/api/v1/workspaces/${session.workspaceId}/ledgers/${session.ledgerId}/accounts/${accountId}`,
  });

  if (response.statusCode !== 200) {
    throw new Error(
      `Expected account lookup to return 200, got ${response.statusCode}. Body: ${response.body}`,
    );
  }

  return response.json<{ data: { account: { balance: { amountMinor: string } } } }>().data.account
    .balance.amountMinor;
}

export async function requestWithCsrf(
  app: FastifyInstance,
  cookie: string | undefined,
  request: Omit<InjectOptions, "headers"> & { readonly headers?: Record<string, string> },
): Promise<LightMyRequestResponse> {
  const headers = { ...(request.headers ?? {}) };

  if (cookie) {
    headers.cookie = cookie;
  }

  return await injectWithCsrf(app, {
    ...request,
    headers,
  });
}

export function getSessionCookie(response: { readonly headers: Record<string, unknown> }): string {
  const setCookie = response.headers["set-cookie"];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];

  for (const cookie of cookies) {
    if (typeof cookie !== "string") {
      continue;
    }

    const pair = cookie.split(";")[0];
    if (pair?.startsWith(`${SESSION_COOKIE_NAME}=`)) {
      return pair;
    }
  }

  throw new Error("Expected session cookie to be present in response.");
}

export function mergeCookieFromResponse(
  existingCookie: string | undefined,
  response: { readonly headers: Record<string, unknown> },
): string {
  const setCookie = response.headers["set-cookie"];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const jar = new Map<string, string>();

  for (const cookiePair of splitCookieHeader(existingCookie)) {
    const key = cookiePair.split("=")[0];
    if (key && cookiePair.length > 0) {
      jar.set(key, cookiePair);
    }
  }

  for (const cookie of cookies) {
    if (typeof cookie !== "string") {
      continue;
    }
    const pair = cookie.split(";")[0];
    const key = pair?.split("=")[0];
    if (key && pair?.length) {
      jar.set(key, pair);
    }
  }

  return Array.from(jar.values()).join("; ");
}

async function resolveScopeFromCookie(app: FastifyInstance, cookie: string): Promise<AuthSession> {
  const contextResponse = await app.inject({
    headers: { cookie },
    method: "GET",
    url: "/api/v1/me/context",
  });
  if (contextResponse.statusCode !== 200) {
    throw new Error(
      `Expected me/context to return 200, got ${contextResponse.statusCode}. Body: ${contextResponse.body}`,
    );
  }

  const context = contextResponse.json<{
    data: {
      activeLedger: { id: string };
      activeWorkspace: { id: string; role: "owner" | "admin" | "editor" | "viewer" };
      user: { id: string };
    };
  }>().data;

  return {
    cookie,
    ledgerId: context.activeLedger.id,
    role: context.activeWorkspace.role,
    userId: context.user.id,
    workspaceId: context.activeWorkspace.id,
  };
}

function splitCookieHeader(cookieHeader: string | undefined): readonly string[] {
  if (!cookieHeader) {
    return [];
  }
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part.includes("="));
}
