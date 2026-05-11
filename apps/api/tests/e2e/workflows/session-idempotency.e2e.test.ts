import { describe, expect, it } from "vitest";

import { createSqliteE2eSystem, getSessionCookie, requestWithCsrf } from "../helpers/system.js";

describe("e2e/api/workflow/session-idempotency", () => {
  it("runs session login/logout lifecycle and idempotent write guarantees", async () => {
    const system = await createSqliteE2eSystem();

    try {
      const { app } = system;

      const register = await requestWithCsrf(app, undefined, {
        method: "POST",
        payload: {
          password: "password123",
          username: "session-owner-e2e",
        },
        url: "/api/v1/auth/register",
      });
      expect(register.statusCode).toBe(201);
      const initialCookie = getSessionCookie(register);

      const logout = await requestWithCsrf(app, initialCookie, {
        method: "POST",
        payload: {},
        url: "/api/v1/auth/logout",
      });
      expect(logout.statusCode).toBe(204);

      const contextAfterLogout = await app.inject({
        headers: { cookie: initialCookie },
        method: "GET",
        url: "/api/v1/me/context",
      });
      expect(contextAfterLogout.statusCode).toBe(401);

      const login = await requestWithCsrf(app, undefined, {
        method: "POST",
        payload: {
          password: "password123",
          username: "session-owner-e2e",
        },
        url: "/api/v1/auth/login",
      });
      expect(login.statusCode).toBe(200);
      const activeCookie = getSessionCookie(login);

      const me = await app.inject({
        headers: { cookie: activeCookie },
        method: "GET",
        url: "/api/v1/me/context",
      });
      expect(me.statusCode).toBe(200);
      const scope = me.json<{
        data: {
          activeLedger: { id: string };
          activeWorkspace: { id: string; role: "owner" | "admin" | "editor" | "viewer" };
        };
      }>().data;
      expect(scope.activeWorkspace.role).toBe("owner");

      const createCheckingFirst = await requestWithCsrf(app, activeCookie, {
        headers: { "idempotency-key": "idem-account-create-1" },
        method: "POST",
        payload: {
          currencyCode: "INR",
          kind: "asset",
          name: "Idem Checking",
          subtype: "bank",
        },
        url: `/api/v1/workspaces/${scope.activeWorkspace.id}/ledgers/${scope.activeLedger.id}/accounts`,
      });
      expect(createCheckingFirst.statusCode).toBe(201);
      const checkingId = createCheckingFirst.json<{ data: { account: { id: string } } }>().data
        .account.id;

      const createCheckingReplay = await requestWithCsrf(app, activeCookie, {
        headers: { "idempotency-key": "idem-account-create-1" },
        method: "POST",
        payload: {
          currencyCode: "INR",
          kind: "asset",
          name: "Idem Checking",
          subtype: "bank",
        },
        url: `/api/v1/workspaces/${scope.activeWorkspace.id}/ledgers/${scope.activeLedger.id}/accounts`,
      });
      expect(createCheckingReplay.statusCode).toBe(201);
      expect(createCheckingReplay.headers["idempotency-replayed"]).toBe("true");
      expect(
        createCheckingReplay.json<{ data: { account: { id: string } } }>().data.account.id,
      ).toBe(checkingId);

      const createCheckingConflict = await requestWithCsrf(app, activeCookie, {
        headers: { "idempotency-key": "idem-account-create-1" },
        method: "POST",
        payload: {
          currencyCode: "INR",
          kind: "asset",
          name: "Changed payload should conflict",
          subtype: "bank",
        },
        url: `/api/v1/workspaces/${scope.activeWorkspace.id}/ledgers/${scope.activeLedger.id}/accounts`,
      });
      expect(createCheckingConflict.statusCode).toBe(409);

      const createGroceries = await requestWithCsrf(app, activeCookie, {
        headers: { "idempotency-key": "idem-account-create-2" },
        method: "POST",
        payload: {
          currencyCode: "INR",
          kind: "expense",
          name: "Idem Groceries",
          subtype: "external",
        },
        url: `/api/v1/workspaces/${scope.activeWorkspace.id}/ledgers/${scope.activeLedger.id}/accounts`,
      });
      expect(createGroceries.statusCode).toBe(201);
      const groceriesId = createGroceries.json<{ data: { account: { id: string } } }>().data.account
        .id;

      const createTransactionFirst = await requestWithCsrf(app, activeCookie, {
        headers: { "idempotency-key": "idem-transaction-create-1" },
        method: "POST",
        payload: {
          currencyCode: "INR",
          description: "Idempotent groceries",
          occurredAt: "2026-05-11T16:00:00.000Z",
          sourceAccountId: checkingId,
          transactions: [{ amountMinor: "150000", destinationAccountId: groceriesId }],
          type: "expense",
        },
        url: `/api/v1/workspaces/${scope.activeWorkspace.id}/ledgers/${scope.activeLedger.id}/transactions`,
      });
      expect(createTransactionFirst.statusCode).toBe(201);
      const firstGroupId = createTransactionFirst.json<{
        data: { transactionGroup: { id: string } };
      }>().data.transactionGroup.id;

      const createTransactionReplay = await requestWithCsrf(app, activeCookie, {
        headers: { "idempotency-key": "idem-transaction-create-1" },
        method: "POST",
        payload: {
          currencyCode: "INR",
          description: "Idempotent groceries",
          occurredAt: "2026-05-11T16:00:00.000Z",
          sourceAccountId: checkingId,
          transactions: [{ amountMinor: "150000", destinationAccountId: groceriesId }],
          type: "expense",
        },
        url: `/api/v1/workspaces/${scope.activeWorkspace.id}/ledgers/${scope.activeLedger.id}/transactions`,
      });
      expect(createTransactionReplay.statusCode).toBe(201);
      expect(createTransactionReplay.headers["idempotency-replayed"]).toBe("true");
      expect(
        createTransactionReplay.json<{ data: { transactionGroup: { id: string } } }>().data
          .transactionGroup.id,
      ).toBe(firstGroupId);

      const createTransactionConflict = await requestWithCsrf(app, activeCookie, {
        headers: { "idempotency-key": "idem-transaction-create-1" },
        method: "POST",
        payload: {
          currencyCode: "INR",
          description: "Idempotent groceries",
          occurredAt: "2026-05-11T16:00:00.000Z",
          sourceAccountId: checkingId,
          transactions: [{ amountMinor: "155000", destinationAccountId: groceriesId }],
          type: "expense",
        },
        url: `/api/v1/workspaces/${scope.activeWorkspace.id}/ledgers/${scope.activeLedger.id}/transactions`,
      });
      expect(createTransactionConflict.statusCode).toBe(409);
    } finally {
      await system.cleanup();
    }
  });
});
