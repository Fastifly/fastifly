import { createUuidV7, type SyncedId } from "@fastifly/common";
import type {
  IdentityRepository,
  SessionRecord,
  SyncQueryService,
  SyncReplayService,
  UserRecord,
  UserWorkspaceContextRecord,
} from "@fastifly/db";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApiApp } from "../app.js";
import { hashSessionToken } from "../auth/sessions.js";

const apps: Awaited<ReturnType<typeof buildApiApp>>[] = [];
const SESSION_TOKEN = "sync-route-session";

function createDeterministicIdGenerator(): () => SyncedId {
  let counter = 1;

  return () => {
    const value = counter;
    counter += 1;

    return createUuidV7({
      nowMs: Date.UTC(2026, 4, 9),
      randomBytes: (byteLength) => {
        const bytes = new Uint8Array(byteLength);
        bytes[byteLength - 1] = value;
        return bytes;
      },
    });
  };
}

const createId = createDeterministicIdGenerator();

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("sync routes", () => {
  it("pushes offline operations through the sync replay service", async () => {
    const state = createUserWorkspaceContext("editor");
    const syncReplayService = makeSyncReplayService();
    const app = await makeApp(state, syncReplayService);
    const deviceId = createId();
    const operationId = "operation_1";

    const response = await app.inject({
      headers: { cookie: sessionCookie() },
      method: "POST",
      payload: {
        deviceId,
        ledgerId: state.context.activeLedger.id,
        operations: [
          {
            baseRevision: "0",
            createdAt: "2026-05-09T01:00:00.000Z",
            idempotencyKey: "idem_operation_1",
            localSequence: "1",
            operationId,
            operationType: "transaction_group.create_expense.v1",
            operationVersion: 1,
            payload: {
              currencyCode: "INR",
              description: "Groceries",
              occurredAt: "2026-05-09T08:00:00.000Z",
              sourceAccountId: createId(),
              transactions: [{ amountMinor: "12000", destinationAccountId: createId() }],
            },
          },
        ],
        workspaceId: state.context.activeWorkspace.id,
      },
      url: "/api/v1/sync/push",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        accepted: [{ operationId, serverRevision: "1" }],
        conflicts: [],
        rejected: [],
        serverRevision: "1",
      },
    });
    expect(syncReplayService.push).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: state.user.id,
        deviceId,
        ledgerId: state.context.activeLedger.id,
        operations: [
          expect.objectContaining({
            deviceId,
            ledgerId: state.context.activeLedger.id,
            operationId,
            workspaceId: state.context.activeWorkspace.id,
          }),
        ],
        workspaceId: state.context.activeWorkspace.id,
      }),
    );
  });

  it("rejects sync pushes for viewer roles before replay", async () => {
    const state = createUserWorkspaceContext("viewer");
    const syncReplayService = makeSyncReplayService();
    const app = await makeApp(state, syncReplayService);

    const response = await app.inject({
      headers: { cookie: sessionCookie() },
      method: "POST",
      payload: {
        deviceId: createId(),
        ledgerId: state.context.activeLedger.id,
        operations: [
          {
            createdAt: "2026-05-09T01:00:00.000Z",
            idempotencyKey: "idem_operation_1",
            localSequence: "1",
            operationId: "operation_1",
            operationType: "transaction_group.create_expense.v1",
            operationVersion: 1,
            payload: {},
          },
        ],
        workspaceId: state.context.activeWorkspace.id,
      },
      url: "/api/v1/sync/push",
    });

    expect(response.statusCode).toBe(403);
    expect(syncReplayService.push).not.toHaveBeenCalled();
  });

  it("pulls accepted sync operations through the sync query service", async () => {
    const state = createUserWorkspaceContext("editor");
    const syncQueryService = makeSyncQueryService(state.context.activeLedger.id);
    const app = await makeApp(state, { syncQueryService });

    const response = await app.inject({
      headers: { cookie: sessionCookie() },
      method: "GET",
      query: {
        ledgerId: state.context.activeLedger.id,
        sinceRevision: "0",
        workspaceId: state.context.activeWorkspace.id,
      },
      url: "/api/v1/sync/pull",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        fromRevision: "0",
        ledgerId: state.context.activeLedger.id,
        operations: [
          {
            createdAt: "2026-05-09T01:00:00.000Z",
            deviceId: expect.any(String),
            localSequence: "1",
            operationId: "operation_1",
            operationType: "transaction_group.create_expense.v1",
            payload: { description: "Groceries" },
            payloadEncoding: "plaintext.v1",
            serverRevision: "1",
          },
        ],
        toRevision: "1",
        workspaceId: state.context.activeWorkspace.id,
      },
    });
    expect(syncQueryService.pull).toHaveBeenCalledWith({
      actorUserId: state.user.id,
      ledgerId: state.context.activeLedger.id,
      sinceRevision: 0,
      workspaceId: state.context.activeWorkspace.id,
    });
  });

  it("reports sync status through the sync query service", async () => {
    const state = createUserWorkspaceContext("editor");
    const syncQueryService = makeSyncQueryService(state.context.activeLedger.id);
    const app = await makeApp(state, { syncQueryService });

    const response = await app.inject({
      headers: { cookie: sessionCookie() },
      method: "GET",
      query: {
        ledgerId: state.context.activeLedger.id,
        workspaceId: state.context.activeWorkspace.id,
      },
      url: "/api/v1/sync/status",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        ledgerId: state.context.activeLedger.id,
        openConflictCount: 1,
        serverRevision: "1",
        workspaceId: state.context.activeWorkspace.id,
      },
    });
  });
});

function createUserWorkspaceContext(role: UserWorkspaceContextRecord["activeWorkspace"]["role"]): {
  readonly context: UserWorkspaceContextRecord;
  readonly user: UserRecord;
} {
  const userId = createId();
  const workspaceId = createId();
  const ledgerId = createId();
  const now = "2026-05-09T00:00:00.000Z";

  return {
    context: {
      activeLedger: {
        archivedAt: null,
        baseCurrencyCode: "INR",
        createdAt: now,
        firstDayOfWeek: 1,
        id: ledgerId,
        name: "Primary",
        status: "active",
        updatedAt: now,
        workspaceId,
      },
      activeWorkspace: {
        archivedAt: null,
        createdAt: now,
        id: workspaceId,
        name: "Personal",
        ownerUserId: userId,
        role,
        status: "active",
        updatedAt: now,
      },
    },
    user: {
      createdAt: now,
      disabledAt: null,
      displayName: "Owner",
      id: userId,
      passwordHash: "$argon2id$fixture",
      updatedAt: now,
      username: "owner",
      usernameNormalized: "owner",
    },
  };
}

function makeIdentityRepository(input: {
  readonly context: UserWorkspaceContextRecord;
  readonly user: UserRecord;
}): IdentityRepository {
  const session: SessionRecord = {
    createdAt: "2026-05-09T00:00:00.000Z",
    expiresAt: "2026-06-09T00:00:00.000Z",
    id: createId(),
    ipAddress: null,
    revokedAt: null,
    tokenHash: hashSessionToken(SESSION_TOKEN),
    userAgent: null,
    userId: input.user.id,
  };

  return {
    findActiveSessionByTokenHash: async (tokenHash) =>
      tokenHash === session.tokenHash ? session : null,
    findDefaultWorkspaceContextForUser: async (userId) =>
      userId === input.user.id ? input.context : null,
    findUserById: async (userId) => (userId === input.user.id ? input.user : null),
  } as IdentityRepository;
}

async function makeApp(
  state: ReturnType<typeof createUserWorkspaceContext>,
  services:
    | SyncReplayService
    | {
        readonly syncQueryService?: SyncQueryService;
        readonly syncReplayService?: SyncReplayService;
      },
) {
  const serviceOptions = "push" in services ? { syncReplayService: services } : services;
  const app = await buildApiApp({
    config: { logLevel: "silent", nodeEnv: "test" },
    identityRepository: makeIdentityRepository(state),
    readiness: { migrations: "ok" },
    ...serviceOptions,
  });
  apps.push(app);

  return app;
}

function makeSyncReplayService(): SyncReplayService {
  return {
    push: vi.fn(async () => ({
      accepted: [{ operationId: "operation_1", serverRevision: "1" }],
      conflicts: [],
      rejected: [],
      serverRevision: "1",
    })),
  };
}

function makeSyncQueryService(ledgerId: SyncedId): SyncQueryService {
  const deviceId = createId();

  return {
    pull: vi.fn(async (input) => ({
      fromRevision: input.sinceRevision.toString(),
      ledgerId,
      operations: [
        {
          createdAt: "2026-05-09T01:00:00.000Z",
          deviceId,
          localSequence: "1",
          operationId: "operation_1",
          operationType: "transaction_group.create_expense.v1",
          payload: { description: "Groceries" },
          payloadEncoding: "plaintext.v1" as const,
          serverRevision: "1",
        },
      ],
      toRevision: "1",
      workspaceId: input.workspaceId,
    })),
    status: vi.fn(async (input) => ({
      ledgerId,
      openConflictCount: 1,
      serverRevision: "1",
      workspaceId: input.workspaceId,
    })),
  };
}

function sessionCookie(): string {
  return `fastifly_session=${SESSION_TOKEN}`;
}
