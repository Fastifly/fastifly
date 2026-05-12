import { describe, expect, it } from "vitest";

import {
  createAccount,
  createSqliteE2eSystem,
  getAccountBalanceMinor,
  registerAndResolveScope,
  requestWithCsrf,
} from "../helpers/system.js";

describe("e2e/api/workflow/dashboard-settings-read-after-write", () => {
  it("keeps dashboard and settings query surfaces consistent immediately after writes", async () => {
    const system = await createSqliteE2eSystem();

    try {
      const { app } = system;
      const owner = await registerAndResolveScope(app, {
        password: "password123",
        username: "read-after-write-owner-e2e",
      });

      const checking = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "asset",
        name: "RAW Checking",
        subtype: "bank",
      });
      const salary = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "revenue",
        name: "RAW Salary",
        subtype: "external",
      });
      const createGroceriesCategory = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: { name: "RAW Groceries" },
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/categories`,
      });
      expect(createGroceriesCategory.statusCode).toBe(201);
      const groceriesCategory = createGroceriesCategory.json<{
        data: { category: { counterpartyAccountId: string | null; id: string } };
      }>().data.category;
      expect(groceriesCategory.counterpartyAccountId).toBeTruthy();
      const groceriesCounterpartyAccountId = groceriesCategory.counterpartyAccountId!;

      const healthBefore = await app.inject({ method: "GET", url: "/health" });
      expect(healthBefore.statusCode).toBe(200);

      const meBefore = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: "/api/v1/me/context",
      });
      expect(meBefore.statusCode).toBe(200);

      const accountsBefore = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/accounts?limit=100`,
      });
      expect(accountsBefore.statusCode).toBe(200);
      const accountCountBefore = accountsBefore.json<{ data: unknown[] }>().data.length;

      const transactionsBefore = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/transactions?limit=100`,
      });
      expect(transactionsBefore.statusCode).toBe(200);
      const transactionCountBefore = transactionsBefore.json<{ data: unknown[] }>().data.length;

      const importsBefore = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/imports`,
      });
      expect(importsBefore.statusCode).toBe(200);
      const importCountBefore = importsBefore.json<{ data: unknown[] }>().data.length;

      const rulesBefore = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/rules`,
      });
      expect(rulesBefore.statusCode).toBe(200);
      const ruleCountBefore = rulesBefore.json<{ data: unknown[] }>().data.length;

      const recurringBefore = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/recurring`,
      });
      expect(recurringBefore.statusCode).toBe(200);
      const recurringCountBefore = recurringBefore.json<{ data: unknown[] }>().data.length;

      const syncStatusBefore = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        query: {
          ledgerId: owner.ledgerId,
          workspaceId: owner.workspaceId,
        },
        url: "/api/v1/sync/status",
      });
      expect(syncStatusBefore.statusCode).toBe(200);
      const syncStatusBeforeBody = syncStatusBefore.json<{
        data: {
          serverRevision: string;
          lastOperationAt: string | null;
          openConflicts: number;
        };
      }>().data;
      expect(syncStatusBeforeBody.openConflicts).toBe(0);

      const syncConflictsBefore = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        query: {
          ledgerId: owner.ledgerId,
          workspaceId: owner.workspaceId,
        },
        url: "/api/v1/sync/conflicts",
      });
      expect(syncConflictsBefore.statusCode).toBe(200);
      expect(
        syncConflictsBefore.json<{ data: { conflicts: unknown[] } }>().data.conflicts,
      ).toHaveLength(0);

      const createTransactionWrite = await requestWithCsrf(app, owner.cookie, {
        headers: { "idempotency-key": "read-after-write-transaction-1" },
        method: "POST",
        payload: {
          currencyCode: "INR",
          description: "read-after-write transaction",
          occurredAt: "2026-05-11T21:00:00.000Z",
          sourceAccountId: salary,
          transactions: [{ amountMinor: "500000", destinationAccountId: checking }],
          type: "income",
        },
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/transactions`,
      });
      expect(createTransactionWrite.statusCode).toBe(201);
      const createdTransactionGroupId = createTransactionWrite.json<{
        data: { transactionGroup: { id: string } };
      }>().data.transactionGroup.id;
      expect(createdTransactionGroupId.length).toBeGreaterThan(0);

      const createImportWrite = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: {
          csvText:
            "type,sourceAccountId,destinationAccountId,amountMinor,currencyCode,occurredAt,description\n" +
            `expense,${checking},${groceriesCounterpartyAccountId},120000,INR,2026-05-11T21:10:00.000Z,read-after-write import`,
          fileName: "read-after-write.csv",
        },
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/imports/csv`,
      });
      expect(createImportWrite.statusCode).toBe(201);
      const createdImportId = createImportWrite.json<{
        data: { importJob: { id: string; status: string; previewRows: unknown[] } };
      }>().data.importJob.id;
      expect(createdImportId.length).toBeGreaterThan(0);

      const createRuleWrite = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: {
          action: { status: "cleared", type: "set_transaction_status" },
          condition: { descriptionContains: "read-after-write", type: "expense" },
          enabled: true,
          name: "read-after-write rule",
        },
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/rules`,
      });
      expect(createRuleWrite.statusCode).toBe(201);
      const createdRuleId = createRuleWrite.json<{ data: { rule: { id: string } } }>().data.rule.id;
      expect(createdRuleId.length).toBeGreaterThan(0);

      const createRecurringWrite = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: {
          cadence: "monthly",
          intervalCount: 1,
          nextRunAt: "2026-06-01T00:00:00.000Z",
          payload: {
            currencyCode: "INR",
            description: "read-after-write recurring",
            lines: [
              {
                amountMinor: "100000",
                categoryId: groceriesCategory.id,
                destinationAccountId: groceriesCounterpartyAccountId,
              },
            ],
            sourceAccountId: checking,
            title: "RAW recurring",
            type: "expense",
          },
          status: "active",
        },
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/recurring`,
      });
      expect(createRecurringWrite.statusCode, createRecurringWrite.body).toBe(201);
      const createdRecurringId = createRecurringWrite.json<{
        data: { recurringTemplate: { id: string } };
      }>().data.recurringTemplate.id;
      expect(createdRecurringId.length).toBeGreaterThan(0);

      const checkingBalanceAfterIncome = await getAccountBalanceMinor(app, owner, checking);
      expect(checkingBalanceAfterIncome).toBe("500000");

      const accountsAfter = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/accounts?limit=100`,
      });
      expect(accountsAfter.statusCode).toBe(200);
      expect(accountsAfter.json<{ data: unknown[] }>().data.length).toBe(accountCountBefore);

      const transactionsAfter = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/transactions?limit=100`,
      });
      expect(transactionsAfter.statusCode).toBe(200);
      const transactionsAfterBody = transactionsAfter.json<{
        data: Array<{
          id: string;
          type: string;
          journals: Array<{ description: string }>;
        }>;
      }>();
      expect(transactionsAfterBody.data.length).toBe(transactionCountBefore + 1);
      const createdTransaction = transactionsAfterBody.data.find(
        (group) => group.id === createdTransactionGroupId,
      );
      expect(createdTransaction).toBeDefined();
      expect(createdTransaction?.type).toBe("income");
      expect(createdTransaction?.journals[0]?.description).toBe("read-after-write transaction");

      const importsAfter = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/imports`,
      });
      expect(importsAfter.statusCode).toBe(200);
      const importsAfterBody = importsAfter.json<{
        data: Array<{ id: string; status: string; previewRows: unknown[] }>;
      }>().data;
      expect(importsAfterBody.length).toBe(importCountBefore + 1);
      const createdImport = importsAfterBody.find((job) => job.id === createdImportId);
      expect(createdImport).toBeDefined();
      expect(createdImport?.status).toBe("preview_ready");
      expect(createdImport?.previewRows).toHaveLength(1);

      const rulesAfter = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/rules`,
      });
      expect(rulesAfter.statusCode).toBe(200);
      const rulesAfterBody = rulesAfter.json<{
        data: Array<{ id: string; name: string; enabled: boolean }>;
      }>().data;
      expect(rulesAfterBody.length).toBe(ruleCountBefore + 1);
      const createdRule = rulesAfterBody.find((rule) => rule.id === createdRuleId);
      expect(createdRule).toBeDefined();
      expect(createdRule?.name).toBe("read-after-write rule");
      expect(createdRule?.enabled).toBe(true);

      const recurringAfter = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/recurring`,
      });
      expect(recurringAfter.statusCode).toBe(200);
      const recurringAfterBody = recurringAfter.json<{
        data: Array<{ id: string; status: string }>;
      }>().data;
      expect(recurringAfterBody.length).toBe(recurringCountBefore + 1);
      const createdRecurring = recurringAfterBody.find((item) => item.id === createdRecurringId);
      expect(createdRecurring).toBeDefined();
      expect(createdRecurring?.status).toBe("active");

      const syncStatusAfter = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        query: {
          ledgerId: owner.ledgerId,
          workspaceId: owner.workspaceId,
        },
        url: "/api/v1/sync/status",
      });
      expect(syncStatusAfter.statusCode).toBe(200);
      const syncStatusAfterBody = syncStatusAfter.json<{
        data: {
          serverRevision: string;
          lastOperationAt: string | null;
          openConflicts: number;
        };
      }>().data;
      expect(syncStatusAfterBody.openConflicts).toBe(0);
      expect(syncStatusAfterBody.serverRevision).toBe(syncStatusBeforeBody.serverRevision);
      expect(syncStatusAfterBody.lastOperationAt).toBe(syncStatusBeforeBody.lastOperationAt);

      const syncConflictsAfter = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        query: {
          ledgerId: owner.ledgerId,
          workspaceId: owner.workspaceId,
        },
        url: "/api/v1/sync/conflicts",
      });
      expect(syncConflictsAfter.statusCode).toBe(200);
      expect(
        syncConflictsAfter.json<{ data: { conflicts: unknown[] } }>().data.conflicts,
      ).toHaveLength(0);
    } finally {
      await system.cleanup();
    }
  });
});
