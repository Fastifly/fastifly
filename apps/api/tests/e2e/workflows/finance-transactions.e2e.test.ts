import { describe, expect, it } from "vitest";

import {
  createAccount,
  createSqliteE2eSystem,
  createTransaction,
  getAccountBalanceMinor,
  registerAndResolveScope,
} from "../helpers/system.js";

describe("e2e/api/workflow/finance-transactions", () => {
  it("runs account and transaction lifecycle with derived balance checks", async () => {
    const system = await createSqliteE2eSystem();

    try {
      const { app } = system;
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
        accountPage.json<{ data: unknown[]; pageInfo: { hasNextPage: boolean } }>().pageInfo
          .hasNextPage,
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
        detail.json<{ data: { transactionGroup: { journals: Array<{ postings: unknown[] }> } } }>()
          .data.transactionGroup.journals.length,
      ).toBeGreaterThan(0);

      const checkingBalance = await getAccountBalanceMinor(app, owner, checking);
      const cashBalance = await getAccountBalanceMinor(app, owner, cash);
      const groceriesBalance = await getAccountBalanceMinor(app, owner, groceries);
      const rentBalance = await getAccountBalanceMinor(app, owner, rent);

      expect(checkingBalance).toBe("18815000");
      expect(cashBalance).toBe("500000");
      expect(groceriesBalance).toBe("1185000");
      expect(rentBalance).toBe("4500000");
    } finally {
      await system.cleanup();
    }
  });
});
