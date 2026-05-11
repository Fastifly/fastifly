import { describe, expect, it } from "vitest";

import {
  createAccount,
  createSqliteE2eSystem,
  createTransaction,
  getAccountBalanceMinor,
  registerAndResolveScope,
} from "../helpers/system.js";

describe("e2e/api/workflow/transactions-income", () => {
  it("creates an income transaction and updates balances and list/detail surfaces", async () => {
    const system = await createSqliteE2eSystem();

    try {
      const { app } = system;
      const owner = await registerAndResolveScope(app, {
        password: "password123",
        username: "income-owner-e2e",
      });

      const checking = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "asset",
        name: "Income Checking",
        subtype: "bank",
      });
      const salary = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "revenue",
        name: "Income Salary",
        subtype: "external",
      });

      await createTransaction(app, owner, {
        currencyCode: "INR",
        description: "Income salary credit",
        occurredAt: "2026-05-11T08:00:00.000Z",
        sourceAccountId: salary,
        transactions: [{ amountMinor: "25000000", destinationAccountId: checking }],
        type: "income",
      });

      const listResponse = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/transactions?type=income&limit=50`,
      });
      expect(listResponse.statusCode).toBe(200);
      const listBody = listResponse.json<{
        data: Array<{
          id: string;
          type: string;
          journals: Array<{ description: string }>;
        }>;
      }>().data;
      const createdGroup = listBody.find(
        (group) => group.journals[0]?.description === "Income salary credit",
      );
      expect(createdGroup).toBeDefined();
      expect(createdGroup?.type).toBe("income");

      const detailResponse = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/transactions/${createdGroup?.id}`,
      });
      expect(detailResponse.statusCode).toBe(200);
      const detailBody = detailResponse.json<{
        data: {
          transactionGroup: { journals: Array<{ postings: Array<{ amountMinor: string }> }> };
        };
      }>().data.transactionGroup;
      expect(detailBody.journals).toHaveLength(1);
      expect(detailBody.journals[0]?.postings).toHaveLength(2);

      const checkingBalance = await getAccountBalanceMinor(app, owner, checking);
      const salaryBalance = await getAccountBalanceMinor(app, owner, salary);
      expect(checkingBalance).toBe("25000000");
      expect(salaryBalance).toBe("-25000000");
    } finally {
      await system.cleanup();
    }
  });
});
