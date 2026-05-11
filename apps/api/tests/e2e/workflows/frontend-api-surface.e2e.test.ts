import {
  ApiErrorSchema,
  ArchiveAccountResponseSchema,
  GetAccountResponseSchema,
  ListAccountsResponseSchema,
  ListBudgetsResponseSchema,
  ListImportJobsResponseSchema,
  ListRecurringTemplatesResponseSchema,
  ListRulesResponseSchema,
  ListTransactionsResponseSchema,
  MeContextResponseSchema,
  SyncConflictsResponseSchema,
  SyncStatusResponseSchema,
  ValidationErrorSchema,
} from "@fastifly/common";
import { describe, expect, it } from "vitest";

import {
  createAccount,
  createSqliteE2eSystem,
  createTransaction,
  getSessionCookie,
  registerAndResolveScope,
  requestWithCsrf,
} from "../helpers/system.js";

describe("e2e/api/workflow/frontend-api-surface", () => {
  it("serves frontend finance queries with strict response contracts", async () => {
    const system = await createSqliteE2eSystem();

    try {
      const { app } = system;
      const owner = await registerAndResolveScope(app, {
        password: "password123",
        username: "frontend-surface-owner-e2e",
      });

      const checking = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "asset",
        name: "Surface Checking",
        subtype: "bank",
      });
      const groceries = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "expense",
        name: "Surface Groceries",
        subtype: "external",
      });
      const salary = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "revenue",
        name: "Surface Salary",
        subtype: "external",
      });

      await createTransaction(app, owner, {
        currencyCode: "INR",
        description: "Surface salary",
        occurredAt: "2026-05-11T20:00:00.000Z",
        sourceAccountId: salary,
        transactions: [{ amountMinor: "5000000", destinationAccountId: checking }],
        type: "income",
      });
      await createTransaction(app, owner, {
        currencyCode: "INR",
        description: "Surface groceries",
        occurredAt: "2026-05-11T20:10:00.000Z",
        sourceAccountId: checking,
        transactions: [{ amountMinor: "250000", destinationAccountId: groceries }],
        type: "expense",
      });

      const meContext = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: "/api/v1/me/context",
      });
      expect(meContext.statusCode).toBe(200);
      const meContextBody = MeContextResponseSchema.parse(meContext.json());
      expect(meContextBody.data.activeWorkspace.id).toBe(owner.workspaceId);
      expect(meContextBody.data.activeLedger.id).toBe(owner.ledgerId);

      const accounts = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/accounts?limit=20`,
      });
      expect(accounts.statusCode).toBe(200);
      const accountsBody = ListAccountsResponseSchema.parse(accounts.json());
      expect(accountsBody.data.length).toBeGreaterThanOrEqual(3);
      expect(accountsBody.pageInfo.hasNextPage).toBe(false);

      const transactionsPageOne = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/transactions?limit=1`,
      });
      expect(transactionsPageOne.statusCode).toBe(200);
      const transactionsPageOneBody = ListTransactionsResponseSchema.parse(
        transactionsPageOne.json(),
      );
      expect(transactionsPageOneBody.data).toHaveLength(1);
      expect(transactionsPageOneBody.pageInfo.hasNextPage).toBe(true);
      expect(transactionsPageOneBody.pageInfo.nextCursor).toBeTruthy();

      const pageOneGroupIds = new Set(transactionsPageOneBody.data.map((entry) => entry.id));
      const transactionsPageTwo = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url:
          `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}` +
          `/transactions?limit=1&cursor=${encodeURIComponent(transactionsPageOneBody.pageInfo.nextCursor ?? "")}`,
      });
      expect(transactionsPageTwo.statusCode).toBe(200);
      const transactionsPageTwoBody = ListTransactionsResponseSchema.parse(
        transactionsPageTwo.json(),
      );
      expect(transactionsPageTwoBody.data).toHaveLength(1);
      expect(pageOneGroupIds.has(transactionsPageTwoBody.data[0]?.id ?? "")).toBe(false);

      const invalidCursorForAccounts = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url:
          `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}` +
          `/accounts?limit=20&cursor=${encodeURIComponent(transactionsPageOneBody.pageInfo.nextCursor ?? "")}`,
      });
      expect(invalidCursorForAccounts.statusCode).toBe(400);
      const invalidCursorBody = ValidationErrorSchema.parse(invalidCursorForAccounts.json());
      expect(invalidCursorBody.error.details.fields.cursor).toBeDefined();

      const expenseFilter = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/transactions?type=expense&limit=20`,
      });
      expect(expenseFilter.statusCode).toBe(200);
      const expenseBody = ListTransactionsResponseSchema.parse(expenseFilter.json());
      expect(expenseBody.data.length).toBeGreaterThan(0);
      expect(
        expenseBody.data.every((entry) => entry.type === "expense" || entry.type === "split"),
      ).toBe(true);

      const budgets = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/budgets?limit=20`,
      });
      expect(budgets.statusCode).toBe(200);
      ListBudgetsResponseSchema.parse(budgets.json());

      const importJobs = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/imports`,
      });
      expect(importJobs.statusCode).toBe(200);
      ListImportJobsResponseSchema.parse(importJobs.json());

      const rules = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/rules`,
      });
      expect(rules.statusCode).toBe(200);
      ListRulesResponseSchema.parse(rules.json());

      const recurring = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/recurring`,
      });
      expect(recurring.statusCode).toBe(200);
      ListRecurringTemplatesResponseSchema.parse(recurring.json());

      const syncStatus = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        query: {
          ledgerId: owner.ledgerId,
          workspaceId: owner.workspaceId,
        },
        url: "/api/v1/sync/status",
      });
      expect(syncStatus.statusCode).toBe(200);
      SyncStatusResponseSchema.parse(syncStatus.json());

      const syncConflicts = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        query: {
          ledgerId: owner.ledgerId,
          workspaceId: owner.workspaceId,
        },
        url: "/api/v1/sync/conflicts",
      });
      expect(syncConflicts.statusCode).toBe(200);
      SyncConflictsResponseSchema.parse(syncConflicts.json());
    } finally {
      await system.cleanup();
    }
  });

  it("enforces strict auth and validation error contracts for frontend failure handling", async () => {
    const system = await createSqliteE2eSystem();

    try {
      const { app } = system;
      const register = await requestWithCsrf(app, undefined, {
        method: "POST",
        payload: {
          password: "password123",
          username: "frontend-errors-owner-e2e",
        },
        url: "/api/v1/auth/register",
      });
      expect(register.statusCode).toBe(201);
      const cookie = getSessionCookie(register);
      const scope = (
        await app.inject({
          headers: { cookie },
          method: "GET",
          url: "/api/v1/me/context",
        })
      ).json<{
        data: {
          activeLedger: { id: string };
          activeWorkspace: { id: string };
        };
      }>().data;

      const logout = await requestWithCsrf(app, cookie, {
        method: "POST",
        payload: {},
        url: "/api/v1/auth/logout",
      });
      expect(logout.statusCode).toBe(204);

      const unauthenticatedMeContext = await app.inject({
        headers: { cookie },
        method: "GET",
        url: "/api/v1/me/context",
      });
      expect(unauthenticatedMeContext.statusCode).toBe(401);
      const unauthenticatedBody = ApiErrorSchema.parse(unauthenticatedMeContext.json());
      expect(unauthenticatedBody.error.code).toBe("UNAUTHENTICATED");
      expect(unauthenticatedBody.error.requestId.length).toBeGreaterThan(0);

      const unauthenticatedAccounts = await app.inject({
        headers: { cookie },
        method: "GET",
        url: `/api/v1/workspaces/${scope.activeWorkspace.id}/ledgers/${scope.activeLedger.id}/accounts`,
      });
      expect(unauthenticatedAccounts.statusCode).toBe(401);
      expect(ApiErrorSchema.parse(unauthenticatedAccounts.json()).error.code).toBe(
        "UNAUTHENTICATED",
      );

      const invalidRegister = await requestWithCsrf(app, undefined, {
        method: "POST",
        payload: {
          password: "short",
          username: "frontend-errors-short-password-e2e",
        },
        url: "/api/v1/auth/register",
      });
      expect(invalidRegister.statusCode).toBe(400);
      const invalidRegisterBody = ValidationErrorSchema.parse(invalidRegister.json());
      const validationFields = invalidRegisterBody.error.details.fields;
      expect(
        "password" in validationFields ||
          "body.password" in validationFields ||
          "request" in validationFields,
      ).toBe(true);

      const validRegister = await requestWithCsrf(app, undefined, {
        method: "POST",
        payload: {
          password: "password123",
          username: "frontend-errors-csrf-e2e",
        },
        url: "/api/v1/auth/register",
      });
      expect(validRegister.statusCode).toBe(201);
      const validCookie = getSessionCookie(validRegister);

      const missingCsrf = await app.inject({
        headers: {
          cookie: validCookie,
          "idempotency-key": "missing-csrf-e2e-1",
        },
        method: "POST",
        payload: {
          currencyCode: "INR",
          kind: "asset",
          name: "Should fail without csrf token",
          subtype: "cash",
        },
        url: `/api/v1/workspaces/${scope.activeWorkspace.id}/ledgers/${scope.activeLedger.id}/accounts`,
      });
      expect(missingCsrf.statusCode).toBe(403);
      expect(ApiErrorSchema.parse(missingCsrf.json()).error.code).toBe("FORBIDDEN");
    } finally {
      await system.cleanup();
    }
  });

  it("archives accounts and blocks follow-up transaction writes against archived accounts", async () => {
    const system = await createSqliteE2eSystem();

    try {
      const { app } = system;
      const owner = await registerAndResolveScope(app, {
        password: "password123",
        username: "frontend-archive-owner-e2e",
      });

      const checking = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "asset",
        name: "Archive Checking",
        subtype: "bank",
      });
      const groceries = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "expense",
        name: "Archive Groceries",
        subtype: "external",
      });

      const archive = await requestWithCsrf(app, owner.cookie, {
        headers: {
          "idempotency-key": "archive-account-e2e-1",
        },
        method: "DELETE",
        payload: {},
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/accounts/${groceries}`,
      });
      expect(archive.statusCode).toBe(200);
      const archiveBody = ArchiveAccountResponseSchema.parse(archive.json());
      expect(archiveBody.data.account.archivedAt).not.toBeNull();

      const archivedAccountLookup = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/accounts/${groceries}`,
      });
      expect(archivedAccountLookup.statusCode).toBe(200);
      const archivedAccountBody = GetAccountResponseSchema.parse(archivedAccountLookup.json());
      expect(archivedAccountBody.data.account.archivedAt).not.toBeNull();
      expect(archivedAccountBody.data.account.isActive).toBe(false);

      const accountsAfterArchive = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/accounts?limit=20`,
      });
      expect(accountsAfterArchive.statusCode).toBe(200);
      const accountsAfterArchiveBody = ListAccountsResponseSchema.parse(
        accountsAfterArchive.json(),
      );
      expect(accountsAfterArchiveBody.data.some((account) => account.id === groceries)).toBe(false);

      const transactionAgainstArchivedAccount = await requestWithCsrf(app, owner.cookie, {
        headers: {
          "idempotency-key": "transaction-against-archived-account-e2e-1",
        },
        method: "POST",
        payload: {
          currencyCode: "INR",
          description: "Should fail against archived destination",
          occurredAt: "2026-05-11T20:20:00.000Z",
          sourceAccountId: checking,
          transactions: [{ amountMinor: "10000", destinationAccountId: groceries }],
          type: "expense",
        },
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/transactions`,
      });
      expect(transactionAgainstArchivedAccount.statusCode).toBe(404);
      expect(ApiErrorSchema.parse(transactionAgainstArchivedAccount.json()).error.code).toBe(
        "NOT_FOUND",
      );
    } finally {
      await system.cleanup();
    }
  });
});
