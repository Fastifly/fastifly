import { createUuidV7 } from "@fastifly/common";
import { describe, expect, it } from "vitest";

import {
  createAccount,
  createSqliteE2eSystem,
  getAccountBalanceMinor,
  registerAndResolveScope,
  requestWithCsrf,
} from "../helpers/system.js";

describe("e2e/api/workflow/sync-negative-matrix", () => {
  it("enforces invalid-operation, duplicate-sequence, stale-base, and missing-device behaviors", async () => {
    const system = await createSqliteE2eSystem();

    try {
      const { app } = system;
      const owner = await registerAndResolveScope(app, {
        password: "password123",
        username: "sync-negative-owner-e2e",
      });

      const checking = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "asset",
        name: "Sync Negative Checking",
        subtype: "bank",
      });
      const groceries = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "expense",
        name: "Sync Negative Groceries",
        subtype: "external",
      });

      const registerDevice = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: {
          deviceKey: "sync-negative-ios-device",
          name: "iPhone Negative",
        },
        url: "/api/v1/devices",
      });
      expect(registerDevice.statusCode).toBe(201);
      const deviceId = registerDevice.json<{ data: { device: { id: string } } }>().data.device.id;

      const checkingBeforePushes = await getAccountBalanceMinor(app, owner, checking);
      const groceriesBeforePushes = await getAccountBalanceMinor(app, owner, groceries);
      expect(checkingBeforePushes).toBe("0");
      expect(groceriesBeforePushes).toBe("0");

      const invalidPayloadPush = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: {
          deviceId,
          ledgerId: owner.ledgerId,
          operations: [
            {
              createdAt: "2026-05-11T20:30:00.000Z",
              idempotencyKey: "sync-negative-invalid-op-1",
              localSequence: "1",
              operationId: createUuidV7(),
              operationType: "transaction_group.create_expense.v1",
              operationVersion: 1,
              payload: {
                currencyCode: "INR",
                description: "missing transactions array",
                occurredAt: "2026-05-11T20:30:00.000Z",
                sourceAccountId: checking,
              },
            },
          ],
          workspaceId: owner.workspaceId,
        },
        url: "/api/v1/sync/push",
      });
      expect(invalidPayloadPush.statusCode).toBe(200);
      const invalidPayloadBody = invalidPayloadPush.json<{
        data: { rejected: Array<{ reason: string }> };
      }>().data;
      expect(invalidPayloadBody.rejected).toHaveLength(1);
      expect(invalidPayloadBody.rejected[0]?.reason).toBe("invalid_operation");
      expect(await getAccountBalanceMinor(app, owner, checking)).toBe("0");
      expect(await getAccountBalanceMinor(app, owner, groceries)).toBe("0");

      const acceptedOperationId = createUuidV7();
      const acceptedPush = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: {
          deviceId,
          ledgerId: owner.ledgerId,
          operations: [
            {
              createdAt: "2026-05-11T20:31:00.000Z",
              idempotencyKey: "sync-negative-accepted-op-1",
              localSequence: "2",
              operationId: acceptedOperationId,
              operationType: "transaction_group.create_expense.v1",
              operationVersion: 1,
              payload: {
                currencyCode: "INR",
                description: "accepted sync write",
                occurredAt: "2026-05-11T20:31:00.000Z",
                sourceAccountId: checking,
                transactions: [{ amountMinor: "123000", destinationAccountId: groceries }],
              },
            },
          ],
          workspaceId: owner.workspaceId,
        },
        url: "/api/v1/sync/push",
      });
      expect(acceptedPush.statusCode).toBe(200);
      const acceptedBody = acceptedPush.json<{
        data: { accepted: Array<{ operationId: string; serverRevision: string }> };
      }>().data;
      expect(acceptedBody.accepted).toHaveLength(1);
      expect(acceptedBody.accepted[0]?.operationId).toBe(acceptedOperationId);
      const acceptedRevision = acceptedBody.accepted[0]?.serverRevision;
      expect(acceptedRevision).toBeDefined();
      expect(await getAccountBalanceMinor(app, owner, checking)).toBe("-123000");
      expect(await getAccountBalanceMinor(app, owner, groceries)).toBe("123000");

      const duplicateSequencePush = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: {
          deviceId,
          ledgerId: owner.ledgerId,
          operations: [
            {
              createdAt: "2026-05-11T20:32:00.000Z",
              idempotencyKey: "sync-negative-dup-seq-op-1",
              localSequence: "2",
              operationId: createUuidV7(),
              operationType: "transaction_group.create_expense.v1",
              operationVersion: 1,
              payload: {
                currencyCode: "INR",
                description: "duplicate local sequence",
                occurredAt: "2026-05-11T20:32:00.000Z",
                sourceAccountId: checking,
                transactions: [{ amountMinor: "120000", destinationAccountId: groceries }],
              },
            },
          ],
          workspaceId: owner.workspaceId,
        },
        url: "/api/v1/sync/push",
      });
      expect(duplicateSequencePush.statusCode).toBe(200);
      const duplicateSequenceBody = duplicateSequencePush.json<{
        data: { rejected: Array<{ reason: string }> };
      }>().data;
      expect(duplicateSequenceBody.rejected).toHaveLength(1);
      expect(duplicateSequenceBody.rejected[0]?.reason).toBe("duplicate_local_sequence");
      expect(await getAccountBalanceMinor(app, owner, checking)).toBe("-123000");
      expect(await getAccountBalanceMinor(app, owner, groceries)).toBe("123000");

      const staleBasePush = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: {
          deviceId,
          ledgerId: owner.ledgerId,
          operations: [
            {
              baseRevision: "0",
              createdAt: "2026-05-11T20:33:00.000Z",
              idempotencyKey: "sync-negative-stale-op-1",
              localSequence: "3",
              operationId: createUuidV7(),
              operationType: "transaction_group.create_expense.v1",
              operationVersion: 1,
              payload: {
                currencyCode: "INR",
                description: "stale base revision",
                occurredAt: "2026-05-11T20:33:00.000Z",
                sourceAccountId: checking,
                transactions: [{ amountMinor: "110000", destinationAccountId: groceries }],
              },
            },
          ],
          workspaceId: owner.workspaceId,
        },
        url: "/api/v1/sync/push",
      });
      expect(staleBasePush.statusCode).toBe(200);
      const staleBaseBody = staleBasePush.json<{
        data: { conflicts: Array<{ conflictType: string }> };
      }>().data;
      expect(staleBaseBody.conflicts).toHaveLength(1);
      expect(staleBaseBody.conflicts[0]?.conflictType).toBe("stale_update");
      expect(await getAccountBalanceMinor(app, owner, checking)).toBe("-123000");
      expect(await getAccountBalanceMinor(app, owner, groceries)).toBe("123000");

      const syncStatusAfterStale = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        query: {
          ledgerId: owner.ledgerId,
          workspaceId: owner.workspaceId,
        },
        url: "/api/v1/sync/status",
      });
      expect(syncStatusAfterStale.statusCode).toBe(200);
      const syncStatusAfterStaleBody = syncStatusAfterStale.json<{
        data: { serverRevision: string; openConflicts: number };
      }>().data;
      expect(syncStatusAfterStaleBody.serverRevision).toBe(acceptedRevision);
      expect(syncStatusAfterStaleBody.openConflicts).toBe(1);

      const missingDevicePush = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: {
          deviceId: createUuidV7(),
          ledgerId: owner.ledgerId,
          operations: [
            {
              createdAt: "2026-05-11T20:34:00.000Z",
              idempotencyKey: "sync-negative-missing-device-op-1",
              localSequence: "1",
              operationId: createUuidV7(),
              operationType: "transaction_group.create_expense.v1",
              operationVersion: 1,
              payload: {
                currencyCode: "INR",
                description: "missing device",
                occurredAt: "2026-05-11T20:34:00.000Z",
                sourceAccountId: checking,
                transactions: [{ amountMinor: "110000", destinationAccountId: groceries }],
              },
            },
          ],
          workspaceId: owner.workspaceId,
        },
        url: "/api/v1/sync/push",
      });
      expect(missingDevicePush.statusCode).toBe(404);
      expect(await getAccountBalanceMinor(app, owner, checking)).toBe("-123000");
      expect(await getAccountBalanceMinor(app, owner, groceries)).toBe("123000");
    } finally {
      await system.cleanup();
    }
  });
});
