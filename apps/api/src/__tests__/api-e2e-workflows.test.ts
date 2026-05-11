import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUuidV7, type SyncedId } from "@fastifly/common";
import { makeTestApiConfig } from "@fastifly/config";
import {
  createInProcessLedgerWriteBoundary,
  createLedgerFinanceMutationService,
  createSqliteAccountRepository,
  createSqliteBudgetQueryService,
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
  createConfiguredSqliteClient,
  LedgerMutationRunner,
} from "@fastifly/db";
import type { FastifyInstance, InjectOptions } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { buildApiApp } from "../app.js";
import { createRuntimeAuthorization } from "../runtime.js";
import { createFinanceWorkflowService } from "../services/finance-workflows.js";
import { injectWithCsrf } from "./helpers/csrf.js";
import { runMigrations } from "../../../../packages/db/src/migrations/maintenance-cli.js";

type AuthSession = {
  readonly cookie: string;
  readonly ledgerId: string;
  readonly role: "owner" | "admin" | "editor" | "viewer";
  readonly userId: string;
  readonly workspaceId: string;
};

const SESSION_COOKIE_NAME = "fastifly_session";

const appClosers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(appClosers.splice(0).map((close) => close()));
});

describe("api e2e workflows (sqlite)", () => {
  it("executes the full auth, recovery, invitation, and membership workflow", async () => {
    const app = await createSqliteE2eApp();
    const owner = await registerAndResolveScope(app, {
      password: "password123",
      username: "owner-e2e",
    });
    expect(owner.role).toBe("owner");

    const passkeyStart = await requestWithCsrf(app, owner.cookie, {
      method: "POST",
      payload: { name: "Owner passkey" },
      url: "/api/v1/auth/passkeys/registration/start",
    });
    expect(passkeyStart.statusCode).toBe(200);
    expect(
      passkeyStart.json<{ data: { options: { challenge: string } } }>().data.options.challenge,
    ).toHaveLength(43);

    const generateRecoveryCodes = await requestWithCsrf(app, owner.cookie, {
      method: "POST",
      url: "/api/v1/me/recovery-codes",
    });
    expect(generateRecoveryCodes.statusCode).toBe(201);
    expect(
      generateRecoveryCodes.json<{ data: { recoveryCodes: readonly string[] } }>().data.recoveryCodes,
    ).toHaveLength(10);

    const revokeRecoveryCodes = await requestWithCsrf(app, owner.cookie, {
      method: "DELETE",
      url: "/api/v1/me/recovery-codes",
    });
    expect(revokeRecoveryCodes.statusCode).toBe(204);

    const createInvite = await requestWithCsrf(app, owner.cookie, {
      method: "POST",
      payload: { inviteeIdentifier: "partner-e2e", role: "editor" },
      url: `/api/v1/workspaces/${owner.workspaceId}/invitations`,
    });
    expect(createInvite.statusCode).toBe(201);
    const invitePayload = createInvite.json<{
      data: {
        invitation: { id: string };
        inviteLink: string;
      };
    }>().data;
    const inviteToken = invitePayload.inviteLink.split("/").at(-1);
    expect(inviteToken).toBeTruthy();

    const getInvite = await app.inject({
      method: "GET",
      url: `/api/v1/invitations/${inviteToken}`,
    });
    expect(getInvite.statusCode).toBe(200);

    const invitee = await registerAndResolveScope(app, {
      password: "password123",
      username: "partner-e2e",
    });

    const acceptInvite = await requestWithCsrf(app, invitee.cookie, {
      method: "POST",
      payload: {},
      url: `/api/v1/invitations/${inviteToken}/accept`,
    });
    expect(acceptInvite.statusCode).toBe(200);

    const membersAfterAccept = await app.inject({
      headers: { cookie: owner.cookie },
      method: "GET",
      url: `/api/v1/workspaces/${owner.workspaceId}/members`,
    });
    expect(membersAfterAccept.statusCode).toBe(200);
    expect(
      membersAfterAccept
        .json<{ data: { members: ReadonlyArray<{ user: { id: string }; role: string }> } }>()
        .data.members.some((member) => member.user.id === invitee.userId && member.role === "editor"),
    ).toBe(true);

    const updateMemberRole = await requestWithCsrf(app, owner.cookie, {
      method: "PATCH",
      payload: { role: "viewer" },
      url: `/api/v1/workspaces/${owner.workspaceId}/members/${invitee.userId}`,
    });
    expect(updateMemberRole.statusCode).toBe(200);

    const forbiddenAccountCreate = await requestWithCsrf(app, invitee.cookie, {
      method: "POST",
      payload: {
        currencyCode: "INR",
        kind: "asset",
        name: "Viewer should not create",
        subtype: "bank",
      },
      url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/accounts`,
    });
    expect(forbiddenAccountCreate.statusCode).toBe(403);

    const removeMember = await requestWithCsrf(app, owner.cookie, {
      method: "DELETE",
      payload: {},
      url: `/api/v1/workspaces/${owner.workspaceId}/members/${invitee.userId}`,
    });
    expect(removeMember.statusCode).toBe(204);

    const inviteeMembersAfterRemoval = await app.inject({
      headers: { cookie: invitee.cookie },
      method: "GET",
      url: `/api/v1/workspaces/${owner.workspaceId}/members`,
    });
    expect(inviteeMembersAfterRemoval.statusCode).toBe(403);

    const revokeInvite = await requestWithCsrf(app, owner.cookie, {
      method: "DELETE",
      payload: {},
      url: `/api/v1/workspaces/${owner.workspaceId}/invitations/${invitePayload.invitation.id}`,
    });
    expect(revokeInvite.statusCode).toBe(404);
  });

  it("executes the full accounts and transaction workflow", async () => {
    const app = await createSqliteE2eApp();
    const owner = await registerAndResolveScope(app, {
      password: "password123",
      username: "finance-owner-e2e",
    });

    const checking = await createAccount(app, owner, {
      currencyCode: "INR",
      kind: "asset",
      name: "Checking",
      subtype: "bank",
    });
    const cash = await createAccount(app, owner, {
      currencyCode: "INR",
      kind: "asset",
      name: "Cash",
      subtype: "cash",
    });
    const salary = await createAccount(app, owner, {
      currencyCode: "INR",
      kind: "revenue",
      name: "Salary",
      subtype: "external",
    });
    const groceries = await createAccount(app, owner, {
      currencyCode: "INR",
      kind: "expense",
      name: "Groceries",
      subtype: "external",
    });
    const rent = await createAccount(app, owner, {
      currencyCode: "INR",
      kind: "expense",
      name: "Rent",
      subtype: "external",
    });

    const accountPage = await app.inject({
      headers: { cookie: owner.cookie },
      method: "GET",
      url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/accounts?limit=2`,
    });
    expect(accountPage.statusCode).toBe(200);
    expect(
      accountPage.json<{ data: unknown[]; pageInfo: { hasNextPage: boolean } }>().pageInfo.hasNextPage,
    ).toBe(true);

    await createTransaction(app, owner, {
      currencyCode: "INR",
      description: "May salary",
      occurredAt: "2026-05-11T08:00:00.000Z",
      sourceAccountId: salary,
      transactions: [{ amountMinor: "25000000", destinationAccountId: checking }],
      type: "income",
    });
    await createTransaction(app, owner, {
      currencyCode: "INR",
      description: "Weekly groceries",
      occurredAt: "2026-05-11T09:00:00.000Z",
      sourceAccountId: checking,
      transactions: [{ amountMinor: "685000", destinationAccountId: groceries }],
      type: "expense",
    });
    await createTransaction(app, owner, {
      currencyCode: "INR",
      description: "Move to cash",
      occurredAt: "2026-05-11T10:00:00.000Z",
      sourceAccountId: checking,
      transactions: [{ amountMinor: "500000", destinationAccountId: cash }],
      type: "transfer",
    });
    await createTransaction(app, owner, {
      currencyCode: "INR",
      description: "Split expense",
      occurredAt: "2026-05-11T11:00:00.000Z",
      sourceAccountId: checking,
      transactions: [
        { amountMinor: "500000", destinationAccountId: groceries },
        { amountMinor: "4500000", destinationAccountId: rent },
      ],
      type: "expense",
    });

    const listAll = await app.inject({
      headers: { cookie: owner.cookie },
      method: "GET",
      url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/transactions?limit=50`,
    });
    expect(listAll.statusCode).toBe(200);
    const allGroups = listAll.json<{
      data: Array<{ id: string; type: string }>;
    }>().data;
    expect(allGroups.length).toBeGreaterThanOrEqual(4);

    const listExpense = await app.inject({
      headers: { cookie: owner.cookie },
      method: "GET",
      url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/transactions?type=expense&limit=50`,
    });
    expect(listExpense.statusCode).toBe(200);
    const expenseItems = listExpense.json<{ data: Array<{ type: string }> }>().data;
    expect(expenseItems.length).toBeGreaterThan(0);
    expect(
      expenseItems.every((group) => group.type === "expense" || group.type === "split"),
    ).toBe(true);

    const detail = await app.inject({
      headers: { cookie: owner.cookie },
      method: "GET",
      url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/transactions/${allGroups[0]?.id}`,
    });
    expect(detail.statusCode).toBe(200);
    expect(
      detail.json<{ data: { transactionGroup: { journals: Array<{ postings: unknown[] }> } } }>().data
        .transactionGroup.journals.length,
    ).toBeGreaterThan(0);

    const checkingBalance = await getAccountBalanceMinor(app, owner, checking);
    const cashBalance = await getAccountBalanceMinor(app, owner, cash);
    const groceriesBalance = await getAccountBalanceMinor(app, owner, groceries);
    const rentBalance = await getAccountBalanceMinor(app, owner, rent);

    expect(checkingBalance).toBe("18815000");
    expect(cashBalance).toBe("500000");
    expect(groceriesBalance).toBe("1185000");
    expect(rentBalance).toBe("4500000");
  });

  it("executes the full sync workflow including revoke protection", async () => {
    const app = await createSqliteE2eApp();
    const owner = await registerAndResolveScope(app, {
      password: "password123",
      username: "sync-owner-e2e",
    });

    const checking = await createAccount(app, owner, {
      currencyCode: "INR",
      kind: "asset",
      name: "Checking",
      subtype: "bank",
    });
    const groceries = await createAccount(app, owner, {
      currencyCode: "INR",
      kind: "expense",
      name: "Groceries",
      subtype: "external",
    });
    const syncOperationId = createUuidV7();

    const registerDevice = await requestWithCsrf(app, owner.cookie, {
      method: "POST",
      payload: {
        deviceKey: "ios-sync-device",
        name: "iPhone",
      },
      url: "/api/v1/devices",
    });
    expect(registerDevice.statusCode).toBe(201);
    const deviceId = registerDevice.json<{ data: { device: { id: string } } }>().data.device.id;

    const listDevices = await app.inject({
      headers: { cookie: owner.cookie },
      method: "GET",
      url: "/api/v1/devices",
    });
    expect(listDevices.statusCode).toBe(200);
    expect(
      listDevices.json<{ data: Array<{ deviceKey: string; id: string }> }>().data.some(
        (device) => device.id === deviceId && device.deviceKey === "ios-sync-device",
      ),
    ).toBe(true);

    const push = await requestWithCsrf(app, owner.cookie, {
      method: "POST",
      payload: {
        deviceId,
        ledgerId: owner.ledgerId,
        operations: [
          {
            createdAt: "2026-05-11T12:00:00.000Z",
            idempotencyKey: "sync-op-1",
            localSequence: "1",
            operationId: syncOperationId,
            operationType: "transaction_group.create_expense.v1",
            operationVersion: 1,
            payload: {
              currencyCode: "INR",
              description: "Offline groceries",
              occurredAt: "2026-05-11T12:00:00.000Z",
              sourceAccountId: checking,
              transactions: [{ amountMinor: "120000", destinationAccountId: groceries }],
            },
          },
        ],
        workspaceId: owner.workspaceId,
      },
      url: "/api/v1/sync/push",
    });
    expect(push.statusCode).toBe(200);
    const firstPushPayload = push.json<{ data: { accepted: Array<{ serverRevision: string }> } }>().data;
    expect(firstPushPayload.accepted.length).toBe(1);
    const firstServerRevision = firstPushPayload.accepted[0]?.serverRevision;
    expect(firstServerRevision).toBeDefined();

    const replayPush = await requestWithCsrf(app, owner.cookie, {
      method: "POST",
      payload: {
        deviceId,
        ledgerId: owner.ledgerId,
        operations: [
          {
            createdAt: "2026-05-11T12:00:00.000Z",
            idempotencyKey: "sync-op-1-replay",
            localSequence: "1",
            operationId: syncOperationId,
            operationType: "transaction_group.create_expense.v1",
            operationVersion: 1,
            payload: {
              currencyCode: "INR",
              description: "Offline groceries",
              occurredAt: "2026-05-11T12:00:00.000Z",
              sourceAccountId: checking,
              transactions: [{ amountMinor: "120000", destinationAccountId: groceries }],
            },
          },
        ],
        workspaceId: owner.workspaceId,
      },
      url: "/api/v1/sync/push",
    });
    if (replayPush.statusCode !== 200) {
      throw new Error(
        `Expected replay sync push to return 200, got ${replayPush.statusCode}. Body: ${replayPush.body}`,
      );
    }
    const replayPayload = replayPush.json<{
      data: { accepted: Array<{ serverRevision: string }>; rejected: Array<{ reason: string }> };
    }>().data;
    expect(replayPayload.accepted.length).toBe(1);
    expect(replayPayload.accepted[0]?.serverRevision).toBe(firstServerRevision);
    expect(replayPayload.rejected.length).toBe(0);

    const status = await app.inject({
      headers: { cookie: owner.cookie },
      method: "GET",
      query: {
        ledgerId: owner.ledgerId,
        workspaceId: owner.workspaceId,
      },
      url: "/api/v1/sync/status",
    });
    expect(status.statusCode).toBe(200);
    expect(status.json<{ data: { serverRevision: string } }>().data.serverRevision).toBeDefined();

    const pull = await app.inject({
      headers: { cookie: owner.cookie },
      method: "GET",
      query: {
        ledgerId: owner.ledgerId,
        sinceRevision: "0",
        workspaceId: owner.workspaceId,
      },
      url: "/api/v1/sync/pull",
    });
    expect(pull.statusCode).toBe(200);
    expect(pull.json<{ data: { operations: unknown[] } }>().data.operations.length).toBeGreaterThan(0);

    const revokeDevice = await requestWithCsrf(app, owner.cookie, {
      method: "POST",
      payload: {},
      url: `/api/v1/devices/${deviceId}/revoke`,
    });
    expect(revokeDevice.statusCode).toBe(200);

    const rejectedPush = await requestWithCsrf(app, owner.cookie, {
      method: "POST",
      payload: {
        deviceId,
        ledgerId: owner.ledgerId,
        operations: [
          {
            createdAt: "2026-05-11T12:10:00.000Z",
            idempotencyKey: "sync-op-2",
            localSequence: "2",
            operationId: createUuidV7(),
            operationType: "transaction_group.create_expense.v1",
            operationVersion: 1,
            payload: {
              currencyCode: "INR",
              description: "Rejected after revoke",
              occurredAt: "2026-05-11T12:10:00.000Z",
              sourceAccountId: checking,
              transactions: [{ amountMinor: "100000", destinationAccountId: groceries }],
            },
          },
        ],
        workspaceId: owner.workspaceId,
      },
      url: "/api/v1/sync/push",
    });
    expect(rejectedPush.statusCode).toBe(403);
  });

  it("executes the full import, rule, and recurring workflow", async () => {
    const app = await createSqliteE2eApp();
    const owner = await registerAndResolveScope(app, {
      password: "password123",
      username: "workflow-owner-e2e",
    });
    expect(owner.role).toBe("owner");

    const checking = await createAccount(app, owner, {
      currencyCode: "INR",
      kind: "asset",
      name: "Checking",
      subtype: "bank",
    });
    const groceries = await createAccount(app, owner, {
      currencyCode: "INR",
      kind: "expense",
      name: "Groceries",
      subtype: "external",
    });
    const rent = await createAccount(app, owner, {
      currencyCode: "INR",
      kind: "expense",
      name: "Rent",
      subtype: "external",
    });

    const csvText = [
      "type,sourceAccountId,destinationAccountId,amountMinor,currencyCode,occurredAt,description",
      `expense,${checking},${groceries},120000,INR,2026-05-11T13:00:00.000Z,CSV groceries`,
      `expense,${checking},${rent},4500000,INR,2026-05-11T13:05:00.000Z,CSV rent`,
    ].join("\n");

    const createImport = await requestWithCsrf(app, owner.cookie, {
      method: "POST",
      payload: {
        csvText,
        fileName: "workflow.csv",
      },
      url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/imports/csv`,
    });
    expect(createImport.statusCode).toBe(201);
    const importJob = createImport.json<{ data: { importJob: { id: string; status: string } } }>().data
      .importJob;
    expect(importJob.status).toBe("preview_ready");

    const getImportBeforeCommit = await app.inject({
      headers: { cookie: owner.cookie },
      method: "GET",
      url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/imports/${importJob.id}`,
    });
    expect(getImportBeforeCommit.statusCode).toBe(200);
    expect(
      getImportBeforeCommit.json<{ data: { importJob: { previewRows: unknown[]; status: string } } }>()
        .data.importJob.previewRows.length,
    ).toBe(2);

    const commitImport = await requestWithCsrf(app, owner.cookie, {
      headers: { "idempotency-key": "import-commit-e2e-1" },
      method: "POST",
      payload: { applyRules: false },
      url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/imports/${importJob.id}/commit`,
    });
    if (commitImport.statusCode !== 200) {
      throw new Error(
        `Expected import commit to return 200, got ${commitImport.statusCode}. Body: ${commitImport.body}`,
      );
    }
    expect(
      commitImport.json<{ data: { importJob: { status: string } } }>().data.importJob.status,
    ).toBe("committed");

    const committedGroupIds = commitImport.json<{ data: { importJob: { committedGroupIds: string[] } } }>()
      .data.importJob.committedGroupIds;
    expect(committedGroupIds.length).toBe(2);

    const listAfterCommit = await app.inject({
      headers: { cookie: owner.cookie },
      method: "GET",
      url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/transactions?limit=100`,
    });
    expect(listAfterCommit.statusCode).toBe(200);
    const committedGroupsVisible = listAfterCommit
      .json<{ data: Array<{ id: string }> }>()
      .data.filter((group) => committedGroupIds.includes(group.id));
    expect(committedGroupsVisible.length).toBe(2);

    const createRule = await requestWithCsrf(app, owner.cookie, {
      method: "POST",
      payload: {
        action: { status: "cleared", type: "set_transaction_status" },
        condition: { descriptionContains: "CSV", type: "expense" },
        enabled: true,
        name: "Auto-clear CSV expenses",
      },
      url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/rules`,
    });
    expect(createRule.statusCode).toBe(201);
    const ruleId = createRule.json<{ data: { rule: { id: string } } }>().data.rule.id;

    const testRule = await requestWithCsrf(app, owner.cookie, {
      method: "POST",
      payload: { limit: 20 },
      url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/rules/${ruleId}/test`,
    });
    expect(testRule.statusCode).toBe(200);
    expect(
      testRule.json<{ data: { matchedTransactionGroups: unknown[] } }>().data.matchedTransactionGroups
        .length,
    ).toBeGreaterThan(0);

    const applyRule = await requestWithCsrf(app, owner.cookie, {
      headers: { "idempotency-key": "rule-apply-e2e-1" },
      method: "POST",
      payload: { limit: 20 },
      url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/rules/${ruleId}/apply`,
    });
    expect(applyRule.statusCode).toBe(200);
    expect(
      applyRule.json<{ data: { updatedTransactionGroupIds: unknown[] } }>().data
        .updatedTransactionGroupIds.length,
    ).toBeGreaterThan(0);

    const createRecurring = await requestWithCsrf(app, owner.cookie, {
      method: "POST",
      payload: {
        cadence: "monthly",
        intervalCount: 1,
        nextRunAt: "2026-06-01T00:00:00.000Z",
        payload: {
          currencyCode: "INR",
          description: "Monthly groceries",
          lines: [{ amountMinor: "300000", destinationAccountId: groceries }],
          sourceAccountId: checking,
          title: "Recurring groceries",
          type: "expense",
        },
        status: "active",
      },
      url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/recurring`,
    });
    expect(createRecurring.statusCode).toBe(201);
    const templateId = createRecurring.json<{ data: { recurringTemplate: { id: string } } }>().data
      .recurringTemplate.id;

    const generateRecurring = await requestWithCsrf(app, owner.cookie, {
      headers: { "idempotency-key": "recurring-generate-e2e-1" },
      method: "POST",
      payload: { occurredAt: "2026-05-11T14:00:00.000Z" },
      url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/recurring/${templateId}/generate`,
    });
    expect(generateRecurring.statusCode).toBe(200);
    expect(
      generateRecurring.json<{ data: { transactionGroup: { type: string } } }>().data.transactionGroup
        .type,
    ).toBe("expense");

    const undoImport = await requestWithCsrf(app, owner.cookie, {
      headers: { "idempotency-key": "import-undo-e2e-1" },
      method: "POST",
      payload: {},
      url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/imports/${importJob.id}/undo`,
    });
    expect(undoImport.statusCode).toBe(200);
    expect(undoImport.json<{ data: { importJob: { status: string } } }>().data.importJob.status).toBe(
      "undone",
    );

    const listAfterUndo = await app.inject({
      headers: { cookie: owner.cookie },
      method: "GET",
      url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/transactions?limit=100`,
    });
    expect(listAfterUndo.statusCode).toBe(200);
    const visibleGroupIdsAfterUndo = new Set(
      listAfterUndo.json<{ data: Array<{ id: string }> }>().data.map((group) => group.id),
    );
    for (const groupId of committedGroupIds) {
      expect(visibleGroupIdsAfterUndo.has(groupId)).toBe(false);
    }
  });
});

async function createSqliteE2eApp(): Promise<FastifyInstance> {
  const tempDirectory = await mkdtemp(join(tmpdir(), "fastifly-api-e2e-"));
  const sqlitePath = join(tempDirectory, "e2e.sqlite");
  await runMigrations("sqlite", sqlitePath);
  const sqliteClient = createConfiguredSqliteClient({ source: sqlitePath });
  seedCurrencies(sqliteClient);
  const sqliteDb = createSqliteDatabaseFromClient(sqliteClient);

  const createId = createUuidV7;
  const identityRepository = createSqliteIdentityRepository(sqliteDb, { createId });
  const transactionQueryService = createSqliteTransactionQueryService(sqliteClient);
  const runner = new LedgerMutationRunner({
    authorize: createRuntimeAuthorization(identityRepository),
    store: createSqliteLedgerMutationStore(sqliteDb, { createId }),
    writeBoundary: createInProcessLedgerWriteBoundary(),
  });
  const financeMutationService = createLedgerFinanceMutationService({
    accountRepository: createSqliteAccountRepository(sqliteClient, { createId }),
    runner,
    transactionRepository: createSqliteTransactionWriteRepository(sqliteClient, { createId }),
  });
  const syncRepository = createSqliteSyncRepository(sqliteClient);
  const app = await buildApiApp({
    accountRepository: createSqliteAccountRepository(sqliteClient, { createId }),
    budgetQueryService: createSqliteBudgetQueryService(sqliteClient),
    config: makeTestApiConfig({ logLevel: "silent", nodeEnv: "test" }),
    deviceRepository: createSqliteDeviceRepository(sqliteClient, { createId }),
    financeMutationService,
    identityRepository,
    readiness: { migrations: "ok" },
    syncQueryService: createSyncQueryService({ syncRepository }),
    syncReplayService: createSyncReplayService({ createId, financeMutationService, syncRepository }),
    transactionQueryService,
    workflowService: createFinanceWorkflowService({
      financeMutationService,
      transactionQueryService,
      workflowRepository: createSqliteWorkflowRepository(sqliteClient, { createId }),
    }),
  });

  appClosers.push(async () => {
    await app.close();
    sqliteClient.close();
    await rm(tempDirectory, { force: true, recursive: true });
  });

  return app;
}

function seedCurrencies(
  client: ReturnType<typeof createConfiguredSqliteClient>,
): void {
  const statement = client.prepare(`
    INSERT OR IGNORE INTO currencies (
      code, name, decimal_places, symbol, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();

  statement.run("INR", "Indian Rupee", 2, "₹", now, now);
  statement.run("USD", "US Dollar", 2, "$", now, now);
  statement.run("EUR", "Euro", 2, "€", now, now);
}

async function registerAndResolveScope(
  app: FastifyInstance,
  input: { readonly password: string; readonly username: string },
): Promise<AuthSession> {
  const registerResponse = await requestWithCsrf(app, undefined, {
    method: "POST",
    payload: input,
    url: "/api/v1/auth/register",
  });
  expect(registerResponse.statusCode).toBe(201);
  const cookie = getSessionCookie(registerResponse);

  const contextResponse = await app.inject({
    headers: { cookie },
    method: "GET",
    url: "/api/v1/me/context",
  });
  expect(contextResponse.statusCode).toBe(200);
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

async function createAccount(
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

async function createTransaction(
  app: FastifyInstance,
  session: AuthSession,
  payload: Record<string, unknown>,
) {
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

async function getAccountBalanceMinor(
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

async function requestWithCsrf(
  app: FastifyInstance,
  cookie: string | undefined,
  request: Omit<InjectOptions, "headers"> & { readonly headers?: Record<string, string> },
) {
  const headers = { ...(request.headers ?? {}) };

  if (cookie) {
    headers.cookie = cookie;
  }

  return await injectWithCsrf(app, {
    ...request,
    headers,
  });
}

function getSessionCookie(response: {
  readonly headers: Record<string, unknown>;
}): string {
  const setCookie = response.headers["set-cookie"];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];

  for (const cookie of cookies) {
    if (typeof cookie !== "string") {
      continue;
    }

    const pair = cookie.split(";")[0];

    if (pair && pair.startsWith(`${SESSION_COOKIE_NAME}=`)) {
      return pair;
    }
  }

  throw new Error("Expected session cookie to be present in response.");
}
