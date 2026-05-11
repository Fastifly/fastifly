import { SEED_CREDENTIALS } from "@fastifly/db";
import { describe, expect, it } from "vitest";

import {
  createAccount,
  createSqliteE2eSystem,
  createTransaction,
  getAccountBalanceMinor,
  loginAndResolveScope,
  registerAndResolveScope,
  requestWithCsrf,
} from "../helpers/system.js";

describe("e2e/api/workflow/sorting-and-transaction-side-effects", () => {
  it("enforces stable account and transaction sorting while preserving transaction side effects", async () => {
    const system = await createSqliteE2eSystem();

    try {
      const { app } = system;
      const owner = await registerAndResolveScope(app, {
        password: "password123",
        username: "sort-owner-e2e",
      });

      const checking = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "asset",
        name: "Sort Checking",
        subtype: "bank",
      });
      const salary = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "revenue",
        name: "Sort Salary",
        subtype: "external",
      });
      const groceries = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "expense",
        name: "Sort Groceries",
        subtype: "external",
      });

      await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "asset",
        name: "Sort Zeta",
        subtype: "cash",
      });
      await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "asset",
        name: "Sort Alpha",
        subtype: "cash",
      });
      await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "asset",
        name: "Sort Beta",
        subtype: "cash",
      });

      const accountsResponse = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/accounts?limit=50`,
      });
      expect(accountsResponse.statusCode).toBe(200);
      const sortableAccountNames = accountsResponse
        .json<{ data: Array<{ name: string }> }>()
        .data.map((account) => account.name)
        .filter((name) => name.startsWith("Sort "));
      expect(sortableAccountNames).toEqual(
        [...sortableAccountNames].sort((a, b) => a.localeCompare(b)),
      );

      await createTransaction(app, owner, {
        currencyCode: "INR",
        description: "Sort income",
        occurredAt: "2026-05-11T09:00:00.000Z",
        sourceAccountId: salary,
        transactions: [{ amountMinor: "1000000", destinationAccountId: checking }],
        type: "income",
      });
      await createTransaction(app, owner, {
        currencyCode: "INR",
        description: "Sort expense tie A",
        occurredAt: "2026-05-11T12:00:00.000Z",
        sourceAccountId: checking,
        transactions: [{ amountMinor: "100000", destinationAccountId: groceries }],
        type: "expense",
      });
      await createTransaction(app, owner, {
        currencyCode: "INR",
        description: "Sort expense tie B",
        occurredAt: "2026-05-11T12:00:00.000Z",
        sourceAccountId: checking,
        transactions: [{ amountMinor: "150000", destinationAccountId: groceries }],
        type: "expense",
      });

      const listTransactions = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/transactions?limit=50`,
      });
      expect(listTransactions.statusCode).toBe(200);
      const listedGroups = listTransactions.json<{
        data: Array<{
          id: string;
          journals: Array<{ description: string; occurredAt: string }>;
        }>;
      }>().data;
      const sortGroups = listedGroups.filter((group) =>
        group.journals[0]?.description.startsWith("Sort "),
      );
      expect(sortGroups).toHaveLength(3);
      expect(sortGroups[0]?.journals[0]?.occurredAt).toBe("2026-05-11T12:00:00.000Z");
      expect(sortGroups[1]?.journals[0]?.occurredAt).toBe("2026-05-11T12:00:00.000Z");
      expect(sortGroups[2]?.journals[0]?.occurredAt).toBe("2026-05-11T09:00:00.000Z");

      const pageOne = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/transactions?limit=2`,
      });
      expect(pageOne.statusCode).toBe(200);
      const pageOneBody = pageOne.json<{
        data: Array<{ id: string }>;
        pageInfo: { hasNextPage: boolean; nextCursor: string | null };
      }>();
      expect(pageOneBody.data).toHaveLength(2);
      expect(pageOneBody.pageInfo.hasNextPage).toBe(true);
      expect(pageOneBody.pageInfo.nextCursor).toBeTruthy();

      const pageTwo = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url:
          `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}` +
          `/transactions?limit=2&cursor=${encodeURIComponent(pageOneBody.pageInfo.nextCursor ?? "")}`,
      });
      expect(pageTwo.statusCode).toBe(200);
      const pageTwoBody = pageTwo.json<{
        data: Array<{ id: string }>;
      }>();
      expect(pageTwoBody.data.length).toBeGreaterThan(0);
      const firstPageIds = new Set(pageOneBody.data.map((group) => group.id));
      for (const group of pageTwoBody.data) {
        expect(firstPageIds.has(group.id)).toBe(false);
      }

      const checkingBalance = await getAccountBalanceMinor(app, owner, checking);
      const groceriesBalance = await getAccountBalanceMinor(app, owner, groceries);
      expect(checkingBalance).toBe("750000");
      expect(groceriesBalance).toBe("250000");
    } finally {
      await system.cleanup();
    }
  });

  it("updates budget projections after transaction writes and keeps budget list sorted", async () => {
    const system = await createSqliteE2eSystem({ seedLevel: "demo" });

    try {
      const { app } = system;
      const owner = await loginAndResolveScope(app, SEED_CREDENTIALS.owner);
      const asOfDate = "2026-05-11";

      const budgetsBefore = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url:
          `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}` +
          `/budgets?limit=50&asOfDate=${asOfDate}`,
      });
      expect(budgetsBefore.statusCode).toBe(200);
      const budgetsBeforeBody = budgetsBefore.json<{
        data: Array<{ id: string; name: string; spent: { amountMinor: string } }>;
      }>().data;
      expect(budgetsBeforeBody.length).toBeGreaterThan(0);
      expect(budgetsBeforeBody.map((budget) => budget.name)).toEqual(
        [...budgetsBeforeBody.map((budget) => budget.name)].sort((a, b) => a.localeCompare(b)),
      );

      const targetBudget = budgetsBeforeBody[0];
      expect(targetBudget).toBeDefined();

      const accountsResponse = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/accounts?limit=100`,
      });
      expect(accountsResponse.statusCode).toBe(200);
      const accounts = accountsResponse.json<{
        data: Array<{
          id: string;
          kind: string;
          name: string;
          subtype: string;
        }>;
      }>().data;
      const sourceAccount = accounts.find(
        (account) =>
          account.kind === "asset" && (account.subtype === "bank" || account.subtype === "cash"),
      );
      const destinationAccount = accounts.find((account) => account.kind === "expense");
      expect(sourceAccount).toBeDefined();
      expect(destinationAccount).toBeDefined();
      if (!targetBudget || !sourceAccount || !destinationAccount) {
        throw new Error("Expected seeded budget and accounts to exist.");
      }

      const spentBefore = BigInt(targetBudget.spent.amountMinor);
      const writeAmountMinor = "175000";
      const createBudgetLinkedTransaction = await requestWithCsrf(app, owner.cookie, {
        headers: { "idempotency-key": "budget-linked-transaction-e2e-1" },
        method: "POST",
        payload: {
          currencyCode: "INR",
          description: "Budget side-effect check",
          occurredAt: "2026-05-11T19:30:00.000Z",
          sourceAccountId: sourceAccount.id,
          transactions: [
            {
              amountMinor: writeAmountMinor,
              budgetId: targetBudget.id,
              destinationAccountId: destinationAccount.id,
            },
          ],
          type: "expense",
        },
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/transactions`,
      });
      expect(createBudgetLinkedTransaction.statusCode).toBe(201);

      const budgetsAfter = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url:
          `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}` +
          `/budgets?limit=50&asOfDate=${asOfDate}`,
      });
      expect(budgetsAfter.statusCode).toBe(200);
      const budgetsAfterBody = budgetsAfter.json<{
        data: Array<{ id: string; spent: { amountMinor: string } }>;
      }>().data;
      const updatedBudget = budgetsAfterBody.find((budget) => budget.id === targetBudget.id);
      expect(updatedBudget).toBeDefined();
      expect(BigInt(updatedBudget?.spent.amountMinor ?? "0")).toBe(
        spentBefore + BigInt(writeAmountMinor),
      );
    } finally {
      await system.cleanup();
    }
  });
});
