import { describe, expect, it } from "vitest";

import {
  createAccount,
  createSqliteE2eSystem,
  createTransaction,
  getAccountBalanceMinor,
  registerAndResolveScope,
} from "../helpers/system.js";

describe("e2e/api/workflow/transactions-transfer", () => {
  it("creates transfer transactions and keeps transfer-scoped listing and balances consistent", async () => {
    const system = await createSqliteE2eSystem();

    try {
      const { app } = system;
      const owner = await registerAndResolveScope(app, {
        password: "password123",
        username: "transfer-owner-e2e",
      });

      const checking = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "asset",
        name: "Transfer Checking",
        subtype: "bank",
      });
      const cash = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "asset",
        name: "Transfer Cash",
        subtype: "cash",
      });
      const salary = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "revenue",
        name: "Transfer Salary",
        subtype: "external",
      });

      await createTransaction(app, owner, {
        currencyCode: "INR",
        description: "Transfer funding income",
        occurredAt: "2026-05-11T08:00:00.000Z",
        sourceAccountId: salary,
        transactions: [{ amountMinor: "25000000", destinationAccountId: checking }],
        type: "income",
      });
      await createTransaction(app, owner, {
        currencyCode: "INR",
        description: "Transfer to cash wallet",
        occurredAt: "2026-05-11T09:00:00.000Z",
        sourceAccountId: checking,
        transactions: [{ amountMinor: "500000", destinationAccountId: cash }],
        type: "transfer",
      });

      const transferListResponse = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/transactions?type=transfer&limit=50`,
      });
      expect(transferListResponse.statusCode).toBe(200);
      const transferGroups = transferListResponse.json<{
        data: Array<{ id: string; type: string; journals: Array<{ description: string }> }>;
      }>().data;
      expect(transferGroups.length).toBeGreaterThan(0);
      expect(transferGroups.every((group) => group.type === "transfer")).toBe(true);

      const createdTransfer = transferGroups.find(
        (group) => group.journals[0]?.description === "Transfer to cash wallet",
      );
      expect(createdTransfer).toBeDefined();

      const transferDetailResponse = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/transactions/${createdTransfer?.id}`,
      });
      expect(transferDetailResponse.statusCode).toBe(200);
      const transferDetail = transferDetailResponse.json<{
        data: { transactionGroup: { journals: Array<{ postings: unknown[] }> } };
      }>().data.transactionGroup;
      expect(transferDetail.journals).toHaveLength(1);
      expect(transferDetail.journals[0]?.postings).toHaveLength(2);

      const checkingBalance = await getAccountBalanceMinor(app, owner, checking);
      const cashBalance = await getAccountBalanceMinor(app, owner, cash);
      expect(checkingBalance).toBe("24500000");
      expect(cashBalance).toBe("500000");
    } finally {
      await system.cleanup();
    }
  });
});
