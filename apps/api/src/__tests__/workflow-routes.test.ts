import { createUuidV7, type SyncedId } from "@fastifly/common";
import type {
  IdentityRepository,
  ImportJobRecord,
  RecurringTemplateRecord,
  RuleRecord,
  SessionRecord,
  UserRecord,
  UserWorkspaceContextRecord,
} from "@fastifly/db";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApiApp } from "../app.js";
import { hashSessionToken } from "../auth/sessions.js";
import type { FinanceWorkflowService } from "../services/finance-workflows.js";
import { injectWithCsrf } from "./helpers/csrf.js";

const SESSION_TOKEN = "workflow-route-session";
const apps: Awaited<ReturnType<typeof buildApiApp>>[] = [];

function createDeterministicIdGenerator(): () => SyncedId {
  let counter = 1;
  return () => {
    const value = counter;
    counter += 1;
    return createUuidV7({
      nowMs: Date.UTC(2026, 4, 11),
      randomBytes: (byteLength) => {
        const bytes = new Uint8Array(byteLength);
        bytes[byteLength - 1] = value;
        return bytes;
      },
    });
  };
}

const createId = createDeterministicIdGenerator();

function createUserWorkspaceContext(role: UserWorkspaceContextRecord["activeWorkspace"]["role"]): {
  readonly context: UserWorkspaceContextRecord;
  readonly user: UserRecord;
} {
  const userId = createId();
  const workspaceId = createId();
  const ledgerId = createId();
  const now = "2026-05-11T00:00:00.000Z";

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
    createdAt: "2026-05-11T00:00:00.000Z",
    expiresAt: "2026-06-11T00:00:00.000Z",
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

function makeImportJob(
  scope: { readonly workspaceId: SyncedId; readonly ledgerId: SyncedId },
  actorUserId: SyncedId,
): ImportJobRecord {
  return {
    committedAt: null,
    committedGroupIds: [],
    createdAt: "2026-05-11T00:00:00.000Z",
    createdBy: actorUserId,
    csvText:
      "type,sourceAccountId,destinationAccountId,amountMinor,currencyCode,occurredAt,description\nexpense,019f0b11-6ff9-79b3-bf95-2910aef65f11,019f0b11-6ff9-79b3-bf95-2910aef65f12,12000,INR,2026-05-11T10:00:00.000Z,Groceries",
    fileName: "seed.csv",
    id: createId(),
    ledgerId: scope.ledgerId,
    previewRows: [
      {
        amountMinor: "12000",
        currencyCode: "INR",
        description: "Groceries",
        destinationAccountId: createId(),
        occurredAt: "2026-05-11T10:00:00.000Z",
        rowNumber: 1,
        sourceAccountId: createId(),
        type: "expense",
      },
    ],
    status: "preview_ready",
    undoneAt: null,
    updatedAt: "2026-05-11T00:00:00.000Z",
    workspaceId: scope.workspaceId,
  };
}

function makeRule(
  scope: { readonly workspaceId: SyncedId; readonly ledgerId: SyncedId },
  actorUserId: SyncedId,
): RuleRecord {
  return {
    action: {
      status: "cleared",
      type: "set_transaction_status",
    },
    archivedAt: null,
    condition: {
      type: "expense",
    },
    createdAt: "2026-05-11T00:00:00.000Z",
    createdBy: actorUserId,
    enabled: true,
    id: createId(),
    ledgerId: scope.ledgerId,
    name: "Auto clear expenses",
    updatedAt: "2026-05-11T00:00:00.000Z",
    updatedBy: actorUserId,
    workspaceId: scope.workspaceId,
  };
}

function makeRecurringTemplate(
  scope: { readonly workspaceId: SyncedId; readonly ledgerId: SyncedId },
  actorUserId: SyncedId,
): RecurringTemplateRecord {
  return {
    archivedAt: null,
    cadence: "monthly",
    createdAt: "2026-05-11T00:00:00.000Z",
    createdBy: actorUserId,
    id: createId(),
    intervalCount: 1,
    lastGeneratedAt: null,
    ledgerId: scope.ledgerId,
    nextRunAt: "2026-06-01T00:00:00.000Z",
    payload: {
      currencyCode: "INR",
      description: "Rent",
      lines: [
        {
          amountMinor: "25000",
          budgetId: null,
          categoryId: null,
          description: "Rent",
          destinationAccountId: createId(),
          reportingAmountMinor: null,
          reportingCurrencyCode: null,
        },
      ],
      sourceAccountId: createId(),
      title: "Monthly rent",
      type: "expense",
    },
    status: "active",
    updatedAt: "2026-05-11T00:00:00.000Z",
    updatedBy: actorUserId,
    workspaceId: scope.workspaceId,
  };
}

function makeWorkflowService(
  state: ReturnType<typeof createUserWorkspaceContext>,
): FinanceWorkflowService {
  const scope = {
    ledgerId: state.context.activeLedger.id,
    workspaceId: state.context.activeWorkspace.id,
  };
  const importJob = makeImportJob(scope, state.user.id);
  const committedImportJob: ImportJobRecord = {
    ...importJob,
    committedAt: "2026-05-11T01:00:00.000Z",
    committedGroupIds: [createId()],
    status: "committed",
    updatedAt: "2026-05-11T01:00:00.000Z",
  };
  const undoneImportJob: ImportJobRecord = {
    ...committedImportJob,
    status: "undone",
    undoneAt: "2026-05-11T02:00:00.000Z",
    updatedAt: "2026-05-11T02:00:00.000Z",
  };
  const rule = makeRule(scope, state.user.id);
  const recurringTemplate = makeRecurringTemplate(scope, state.user.id);

  return {
    archiveRecurringTemplate: vi.fn(async () => ({
      ...recurringTemplate,
      archivedAt: "2026-05-11T03:00:00.000Z",
      status: "archived" as const,
    })),
    archiveRule: vi.fn(async () => ({
      ...rule,
      archivedAt: "2026-05-11T03:00:00.000Z",
    })),
    applyRule: vi.fn(async () => ({
      matchedTransactionGroupIds: [createId()],
      rule,
      status: "cleared" as const,
      updatedTransactionGroupIds: [createId()],
    })),
    commitImportJob: vi.fn(async () => ({ importJob: committedImportJob })),
    createImportJobFromCsv: vi.fn(async () => importJob),
    createRecurringTemplate: vi.fn(async () => recurringTemplate),
    createRule: vi.fn(async () => rule),
    findImportJob: vi.fn(async () => importJob),
    findRecurringTemplate: vi.fn(async () => recurringTemplate),
    findRule: vi.fn(async () => rule),
    generateRecurringTemplate: vi.fn(async () => ({
      recurringTemplate: {
        ...recurringTemplate,
        lastGeneratedAt: "2026-05-11T08:00:00.000Z",
        nextRunAt: "2026-07-01T00:00:00.000Z",
      },
      transactionGroup: {
        id: createId(),
        journals: [
          {
            description: "Rent",
            id: createId(),
            occurredAt: "2026-05-11T08:00:00.000Z",
            postings: [
              {
                accountId: createId(),
                amountMinor: -25_000n,
                currencyCode: "INR",
                id: createId(),
                reportingAmountMinor: -25_000n,
                reportingCurrencyCode: "INR",
              },
              {
                accountId: createId(),
                amountMinor: 25_000n,
                currencyCode: "INR",
                id: createId(),
                reportingAmountMinor: 25_000n,
                reportingCurrencyCode: "INR",
              },
            ],
            type: "expense" as const,
          },
        ],
        ledgerId: scope.ledgerId,
        title: "Rent",
        type: "expense" as const,
        workspaceId: scope.workspaceId,
      },
    })),
    listImportJobs: vi.fn(async () => [importJob]),
    listRecurringTemplates: vi.fn(async () => [recurringTemplate]),
    listRules: vi.fn(async () => [rule]),
    testRule: vi.fn(async () => []),
    undoImportJob: vi.fn(async () => ({
      archivedGroupIds: committedImportJob.committedGroupIds,
      importJob: undoneImportJob,
    })),
    updateRecurringTemplate: vi.fn(async () => recurringTemplate),
    updateRule: vi.fn(async () => rule),
  };
}

async function makeApp(role: UserWorkspaceContextRecord["activeWorkspace"]["role"] = "editor") {
  const state = createUserWorkspaceContext(role);
  const workflowService = makeWorkflowService(state);
  const app = await buildApiApp({
    config: { logLevel: "silent", nodeEnv: "test" },
    identityRepository: makeIdentityRepository(state),
    readiness: { migrations: "ok" },
    workflowService,
  });
  apps.push(app);

  return { app, state, workflowService };
}

function sessionCookie(): string {
  return `fastifly_session=${SESSION_TOKEN}`;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("workflow routes", () => {
  it("creates and lists import jobs", async () => {
    const { app, state, workflowService } = await makeApp("editor");
    const createResponse = await injectWithCsrf(app, {
      headers: { cookie: sessionCookie() },
      method: "POST",
      payload: {
        csvText:
          "type,sourceAccountId,destinationAccountId,amountMinor,currencyCode,occurredAt,description\nexpense,019f0b11-6ff9-79b3-bf95-2910aef65f11,019f0b11-6ff9-79b3-bf95-2910aef65f12,12000,INR,2026-05-11T10:00:00.000Z,Groceries",
        fileName: "seed.csv",
      },
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/imports/csv`,
    });
    expect(createResponse.statusCode).toBe(201);
    expect(workflowService.createImportJobFromCsv).toHaveBeenCalled();

    const listResponse = await app.inject({
      headers: { cookie: sessionCookie() },
      method: "GET",
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/imports`,
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({
      data: [expect.objectContaining({ fileName: "seed.csv", status: "preview_ready" })],
    });
  });

  it("commits and undoes import jobs", async () => {
    const { app, state, workflowService } = await makeApp("editor");
    const importJobId = createId();
    const commitResponse = await injectWithCsrf(app, {
      headers: { cookie: sessionCookie(), "idempotency-key": "import-commit-1" },
      method: "POST",
      payload: { applyRules: true },
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/imports/${importJobId}/commit`,
    });
    expect(commitResponse.statusCode).toBe(200);
    expect(workflowService.commitImportJob).toHaveBeenCalledWith(
      expect.objectContaining({
        applyRules: true,
        idempotencyKey: "import-commit-1",
      }),
    );

    const undoResponse = await injectWithCsrf(app, {
      headers: { cookie: sessionCookie(), "idempotency-key": "import-undo-1" },
      method: "POST",
      payload: {},
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/imports/${importJobId}/undo`,
    });
    expect(undoResponse.statusCode).toBe(200);
    expect(undoResponse.json()).toMatchObject({
      data: {
        archivedGroupIds: expect.any(Array),
        importJob: expect.objectContaining({ status: "undone" }),
      },
    });
  });

  it("creates, lists, and applies rules", async () => {
    const { app, state, workflowService } = await makeApp("editor");
    const createResponse = await injectWithCsrf(app, {
      headers: { cookie: sessionCookie() },
      method: "POST",
      payload: {
        action: { status: "cleared", type: "set_transaction_status" },
        condition: { type: "expense" },
        enabled: true,
        name: "Auto clear expenses",
      },
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/rules`,
    });
    expect(createResponse.statusCode).toBe(201);

    const listResponse = await app.inject({
      headers: { cookie: sessionCookie() },
      method: "GET",
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/rules`,
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({
      data: [expect.objectContaining({ name: "Auto clear expenses" })],
    });

    const ruleId = createId();
    const applyResponse = await injectWithCsrf(app, {
      headers: { cookie: sessionCookie(), "idempotency-key": "rule-apply-1" },
      method: "POST",
      payload: { limit: 50 },
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/rules/${ruleId}/apply`,
    });
    expect(applyResponse.statusCode).toBe(200);
    expect(workflowService.applyRule).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "rule-apply-1",
        limit: 50,
      }),
    );
  });

  it("creates and generates recurring templates", async () => {
    const { app, state, workflowService } = await makeApp("editor");
    const createResponse = await injectWithCsrf(app, {
      headers: { cookie: sessionCookie() },
      method: "POST",
      payload: {
        cadence: "monthly",
        intervalCount: 1,
        nextRunAt: "2026-06-01T00:00:00.000Z",
        payload: {
          currencyCode: "INR",
          description: "Rent",
          lines: [
            {
              amountMinor: "25000",
              destinationAccountId: createId(),
            },
          ],
          sourceAccountId: createId(),
          title: "Monthly rent",
          type: "expense",
        },
        status: "active",
      },
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/recurring`,
    });
    expect(createResponse.statusCode).toBe(201);

    const templateId = createId();
    const generateResponse = await injectWithCsrf(app, {
      headers: { cookie: sessionCookie(), "idempotency-key": "recurring-generate-1" },
      method: "POST",
      payload: { occurredAt: "2026-05-11T08:00:00.000Z" },
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/recurring/${templateId}/generate`,
    });
    expect(generateResponse.statusCode).toBe(200);
    expect(generateResponse.json()).toMatchObject({
      data: {
        recurringTemplate: expect.objectContaining({ status: "active" }),
        transactionGroup: expect.objectContaining({ type: "expense" }),
      },
    });
    expect(workflowService.generateRecurringTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "recurring-generate-1",
      }),
    );
  });
});
