import { describe, expect, it } from "vitest";

import {
  createAccount,
  createSqliteE2eSystem,
  registerAndResolveScope,
  requestWithCsrf,
} from "../helpers/system.js";

describe("e2e/api/workflow/import-rules-recurring", () => {
  it("runs import, rules, and recurring lifecycle including archive and undo flows", async () => {
    const system = await createSqliteE2eSystem();

    try {
      const { app } = system;
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
      const createGroceriesCategory = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: { name: "Groceries" },
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/categories`,
      });
      expect(createGroceriesCategory.statusCode).toBe(201);
      const groceriesCategory = createGroceriesCategory.json<{
        data: { category: { counterpartyAccountId: string | null; id: string } };
      }>().data.category;
      expect(groceriesCategory.counterpartyAccountId).toBeTruthy();

      const createRentCategory = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: { name: "Rent" },
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/categories`,
      });
      expect(createRentCategory.statusCode).toBe(201);
      const rentCategory = createRentCategory.json<{
        data: { category: { counterpartyAccountId: string | null; id: string } };
      }>().data.category;
      expect(rentCategory.counterpartyAccountId).toBeTruthy();

      const groceriesCounterpartyAccountId = groceriesCategory.counterpartyAccountId;
      if (!groceriesCounterpartyAccountId) {
        throw new Error("Expected RAW Groceries category to include a counterparty account.");
      }
      const rentCounterpartyAccountId = rentCategory.counterpartyAccountId;
      if (!rentCounterpartyAccountId) {
        throw new Error("Expected Rent category to include a counterparty account.");
      }

      const csvText = [
        "type,sourceAccountId,destinationAccountId,amountMinor,currencyCode,occurredAt,description",
        `expense,${checking},${groceriesCounterpartyAccountId},120000,INR,2026-05-11T13:00:00.000Z,CSV groceries`,
        `expense,${checking},${rentCounterpartyAccountId},4500000,INR,2026-05-11T13:05:00.000Z,CSV rent`,
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
      const importJob = createImport.json<{ data: { importJob: { id: string; status: string } } }>()
        .data.importJob;
      expect(importJob.status).toBe("preview_ready");

      const listImports = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/imports`,
      });
      expect(listImports.statusCode).toBe(200);
      expect(
        listImports
          .json<{ data: Array<{ id: string }> }>()
          .data.some((job) => job.id === importJob.id),
      ).toBe(true);

      const getImportBeforeCommit = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/imports/${importJob.id}`,
      });
      expect(getImportBeforeCommit.statusCode).toBe(200);
      expect(
        getImportBeforeCommit.json<{
          data: { importJob: { previewRows: unknown[]; status: string } };
        }>().data.importJob.previewRows.length,
      ).toBe(2);

      const commitImport = await requestWithCsrf(app, owner.cookie, {
        headers: { "idempotency-key": "import-commit-e2e-1" },
        method: "POST",
        payload: { applyRules: false },
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/imports/${importJob.id}/commit`,
      });
      expect(commitImport.statusCode, commitImport.body).toBe(200);
      expect(
        commitImport.json<{ data: { importJob: { status: string } } }>().data.importJob.status,
      ).toBe("committed");

      const committedGroupIds = commitImport.json<{
        data: { importJob: { committedGroupIds: string[] } };
      }>().data.importJob.committedGroupIds;
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

      const getRule = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/rules/${ruleId}`,
      });
      expect(getRule.statusCode).toBe(200);

      const updateRule = await requestWithCsrf(app, owner.cookie, {
        method: "PATCH",
        payload: {
          action: { status: "reconciled", type: "set_transaction_status" },
          condition: { descriptionContains: "CSV", type: "expense" },
          enabled: true,
          name: "Auto-reconcile CSV expenses",
        },
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/rules/${ruleId}`,
      });
      expect(updateRule.statusCode).toBe(200);
      expect(
        updateRule.json<{ data: { rule: { action: { status: string } } } }>().data.rule.action
          .status,
      ).toBe("reconciled");

      const listRules = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/rules`,
      });
      expect(listRules.statusCode).toBe(200);
      expect(
        listRules.json<{ data: Array<{ id: string }> }>().data.some((rule) => rule.id === ruleId),
      ).toBe(true);

      const testRule = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: { limit: 20 },
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/rules/${ruleId}/test`,
      });
      expect(testRule.statusCode).toBe(200);
      expect(
        testRule.json<{ data: { matchedTransactionGroups: unknown[] } }>().data
          .matchedTransactionGroups.length,
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
            lines: [
              {
                amountMinor: "300000",
                categoryId: groceriesCategory.id,
                destinationAccountId: groceriesCounterpartyAccountId,
              },
            ],
            sourceAccountId: checking,
            title: "Recurring groceries",
            type: "expense",
          },
          status: "active",
        },
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/recurring`,
      });
      expect(createRecurring.statusCode).toBe(201);
      const templateId = createRecurring.json<{ data: { recurringTemplate: { id: string } } }>()
        .data.recurringTemplate.id;

      const getRecurring = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/recurring/${templateId}`,
      });
      expect(getRecurring.statusCode).toBe(200);

      const updateRecurring = await requestWithCsrf(app, owner.cookie, {
        method: "PATCH",
        payload: {
          cadence: "monthly",
          intervalCount: 1,
          nextRunAt: "2026-06-15T00:00:00.000Z",
          payload: {
            currencyCode: "INR",
            description: "Monthly groceries updated",
            lines: [
              {
                amountMinor: "310000",
                categoryId: groceriesCategory.id,
                destinationAccountId: groceriesCounterpartyAccountId,
              },
            ],
            sourceAccountId: checking,
            title: "Recurring groceries updated",
            type: "expense",
          },
          status: "active",
        },
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/recurring/${templateId}`,
      });
      expect(updateRecurring.statusCode).toBe(200);

      const listRecurring = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/recurring`,
      });
      expect(listRecurring.statusCode).toBe(200);
      expect(
        listRecurring
          .json<{ data: Array<{ id: string }> }>()
          .data.some((item) => item.id === templateId),
      ).toBe(true);

      const generateRecurring = await requestWithCsrf(app, owner.cookie, {
        headers: { "idempotency-key": "recurring-generate-e2e-1" },
        method: "POST",
        payload: { occurredAt: "2026-05-11T14:00:00.000Z" },
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/recurring/${templateId}/generate`,
      });
      expect(generateRecurring.statusCode).toBe(200);
      expect(
        generateRecurring.json<{ data: { transactionGroup: { type: string } } }>().data
          .transactionGroup.type,
      ).toBe("expense");

      const undoImport = await requestWithCsrf(app, owner.cookie, {
        headers: { "idempotency-key": "import-undo-e2e-1" },
        method: "POST",
        payload: {},
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/imports/${importJob.id}/undo`,
      });
      expect(undoImport.statusCode).toBe(200);
      expect(
        undoImport.json<{ data: { importJob: { status: string } } }>().data.importJob.status,
      ).toBe("undone");

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

      const archiveRule = await requestWithCsrf(app, owner.cookie, {
        method: "DELETE",
        payload: {},
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/rules/${ruleId}`,
      });
      expect(archiveRule.statusCode).toBe(200);
      expect(
        archiveRule.json<{ data: { rule: { archivedAt: string | null } } }>().data.rule.archivedAt,
      ).not.toBeNull();

      const archiveRecurring = await requestWithCsrf(app, owner.cookie, {
        method: "DELETE",
        payload: {},
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/recurring/${templateId}`,
      });
      expect(archiveRecurring.statusCode).toBe(200);
      expect(
        archiveRecurring.json<{ data: { recurringTemplate: { archivedAt: string | null } } }>().data
          .recurringTemplate.archivedAt,
      ).not.toBeNull();
    } finally {
      await system.cleanup();
    }
  });
});
