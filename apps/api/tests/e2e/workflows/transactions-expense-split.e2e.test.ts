import { describe, expect, it } from "vitest";

import {
  createAccount,
  createSqliteE2eSystem,
  createTransaction,
  getAccountBalanceMinor,
  registerAndResolveScope,
} from "../helpers/system.js";

describe("e2e/api/workflow/transactions-expense-split", () => {
  it("creates expense and split expense transactions with correct balance and query behavior", async () => {
    const system = await createSqliteE2eSystem();

    try {
      const { app } = system;
      const owner = await registerAndResolveScope(app, {
        password: "password123",
        username: "expense-owner-e2e",
      });

      const checking = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "asset",
        name: "Expense Checking",
        subtype: "bank",
      });
      const salary = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "revenue",
        name: "Expense Salary",
        subtype: "external",
      });
      const groceries = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "expense",
        name: "Expense Groceries",
        subtype: "external",
      });
      const rent = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "expense",
        name: "Expense Rent",
        subtype: "external",
      });

      await createTransaction(app, owner, {
        currencyCode: "INR",
        description: "Expense funding income",
        occurredAt: "2026-05-11T08:00:00.000Z",
        sourceAccountId: salary,
        transactions: [{ amountMinor: "25000000", destinationAccountId: checking }],
        type: "income",
      });
      await createTransaction(app, owner, {
        currencyCode: "INR",
        description: "Expense groceries single",
        occurredAt: "2026-05-11T09:00:00.000Z",
        sourceAccountId: checking,
        transactions: [{ amountMinor: "685000", destinationAccountId: groceries }],
        type: "expense",
      });
      await createTransaction(app, owner, {
        currencyCode: "INR",
        description: "Expense split groceries+rent",
        occurredAt: "2026-05-11T10:00:00.000Z",
        sourceAccountId: checking,
        transactions: [
          { amountMinor: "500000", destinationAccountId: groceries },
          { amountMinor: "4500000", destinationAccountId: rent },
        ],
        type: "expense",
      });

      const listExpenseResponse = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/transactions?type=expense&limit=50`,
      });
      expect(listExpenseResponse.statusCode).toBe(200);
      const expenseGroups = listExpenseResponse.json<{
        data: Array<{
          id: string;
          type: string;
          journals: Array<{ description: string; postings: unknown[] }>;
        }>;
      }>().data;
      expect(expenseGroups.length).toBeGreaterThanOrEqual(2);
      expect(
        expenseGroups.every((group) => group.type === "expense" || group.type === "split"),
      ).toBe(true);

      const splitGroup = expenseGroups.find(
        (group) => group.journals[0]?.description === "Expense split groceries+rent",
      );
      expect(splitGroup).toBeDefined();
      expect(splitGroup?.type).toBe("split");

      const splitDetail = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/transactions/${splitGroup?.id}`,
      });
      expect(splitDetail.statusCode).toBe(200);
      const splitDetailBody = splitDetail.json<{
        data: { transactionGroup: { journals: Array<{ postings: unknown[] }> } };
      }>().data.transactionGroup;
      expect(splitDetailBody.journals.length).toBeGreaterThan(1);

      const checkingBalance = await getAccountBalanceMinor(app, owner, checking);
      const groceriesBalance = await getAccountBalanceMinor(app, owner, groceries);
      const rentBalance = await getAccountBalanceMinor(app, owner, rent);
      expect(checkingBalance).toBe("19315000");
      expect(groceriesBalance).toBe("1185000");
      expect(rentBalance).toBe("4500000");
    } finally {
      await system.cleanup();
    }
  });
});
