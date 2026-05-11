import { createUuidV7 } from "@fastifly/common";
import { describe, expect, it } from "vitest";
import {
  createPostgresE2eSystem,
  E2E_POSTGRES_URL_ENV,
  getPostgresE2eUrlFromEnv,
} from "../helpers/postgres-system.js";
import {
  createAccount,
  createTransaction,
  getAccountBalanceMinor,
  registerAndResolveScope,
  requestWithCsrf,
} from "../helpers/system.js";

describe("e2e/api/workflow/postgres-runtime-parity", () => {
  it("runs auth, finance writes, balances, and sync push on postgres runtime", async (context) => {
    const databaseUrl = getPostgresE2eUrlFromEnv();
    if (!databaseUrl) {
      context.skip(`${E2E_POSTGRES_URL_ENV} is not set.`);
      return;
    }

    const system = await createPostgresE2eSystem({
      databaseUrl,
      seedLevel: "essential",
    });

    try {
      const { app } = system;
      const owner = await registerAndResolveScope(app, {
        password: "password123",
        username: "pg-runtime-owner-e2e",
      });
      expect(owner.role).toBe("owner");

      const checking = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "asset",
        name: "PG Runtime Checking",
        subtype: "bank",
      });
      const salary = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "revenue",
        name: "PG Runtime Salary",
        subtype: "external",
      });
      const groceries = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "expense",
        name: "PG Runtime Groceries",
        subtype: "external",
      });

      await createTransaction(app, owner, {
        currencyCode: "INR",
        description: "PG runtime salary",
        occurredAt: "2026-05-11T07:00:00.000Z",
        sourceAccountId: salary,
        transactions: [{ amountMinor: "5000000", destinationAccountId: checking }],
        type: "income",
      });
      await createTransaction(app, owner, {
        currencyCode: "INR",
        description: "PG runtime groceries",
        occurredAt: "2026-05-11T08:00:00.000Z",
        sourceAccountId: checking,
        transactions: [{ amountMinor: "125000", destinationAccountId: groceries }],
        type: "expense",
      });

      const checkingBalance = await getAccountBalanceMinor(app, owner, checking);
      const groceriesBalance = await getAccountBalanceMinor(app, owner, groceries);
      expect(checkingBalance).toBe("4875000");
      expect(groceriesBalance).toBe("125000");

      const registerDevice = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: {
          deviceKey: "pg-runtime-device",
          name: "Pixel PG",
        },
        url: "/api/v1/devices",
      });
      expect(registerDevice.statusCode).toBe(201);
      const deviceId = registerDevice.json<{ data: { device: { id: string } } }>().data.device.id;

      const syncPush = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: {
          deviceId,
          ledgerId: owner.ledgerId,
          operations: [
            {
              createdAt: "2026-05-11T09:00:00.000Z",
              idempotencyKey: "pg-runtime-sync-1",
              localSequence: "1",
              operationId: createUuidV7(),
              operationType: "transaction_group.create_expense.v1",
              operationVersion: 1,
              payload: {
                currencyCode: "INR",
                description: "PG runtime sync expense",
                occurredAt: "2026-05-11T09:00:00.000Z",
                sourceAccountId: checking,
                transactions: [{ amountMinor: "50000", destinationAccountId: groceries }],
              },
            },
          ],
          workspaceId: owner.workspaceId,
        },
        url: "/api/v1/sync/push",
      });
      expect(syncPush.statusCode).toBe(200);
      expect(syncPush.json<{ data: { accepted: unknown[] } }>().data.accepted).toHaveLength(1);
    } finally {
      await system.cleanup();
    }
  });
});
