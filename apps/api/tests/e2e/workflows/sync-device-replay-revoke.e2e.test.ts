import { createUuidV7 } from "@fastifly/common";
import { describe, expect, it } from "vitest";

import {
  createAccount,
  createSqliteE2eSystem,
  getAccountBalanceMinor,
  registerAndResolveScope,
  requestWithCsrf,
} from "../helpers/system.js";

describe("e2e/api/workflow/sync-device-replay-revoke", () => {
  it("runs sync push replay, pull/status, and revoked-device denial", async () => {
    const system = await createSqliteE2eSystem();

    try {
      const { app } = system;
      const owner = await registerAndResolveScope(app, {
        password: "password123",
        username: "sync-owner-e2e",
      });

      const checking = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "asset",
        name: "Checking",
        subtype: "bank",
      });
      const groceries = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "expense",
        name: "Groceries",
        subtype: "external",
      });
      const syncOperationId = createUuidV7();

      const registerDevice = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: {
          deviceKey: "ios-sync-device",
          name: "iPhone",
        },
        url: "/api/v1/devices",
      });
      expect(registerDevice.statusCode).toBe(201);
      const deviceId = registerDevice.json<{ data: { device: { id: string } } }>().data.device.id;

      const listDevices = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: "/api/v1/devices",
      });
      expect(listDevices.statusCode).toBe(200);
      expect(
        listDevices
          .json<{ data: Array<{ deviceKey: string; id: string }> }>()
          .data.some((device) => device.id === deviceId && device.deviceKey === "ios-sync-device"),
      ).toBe(true);

      const push = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: {
          deviceId,
          ledgerId: owner.ledgerId,
          operations: [
            {
              createdAt: "2026-05-11T12:00:00.000Z",
              idempotencyKey: "sync-op-1",
              localSequence: "1",
              operationId: syncOperationId,
              operationType: "transaction_group.create_expense.v1",
              operationVersion: 1,
              payload: {
                currencyCode: "INR",
                description: "Offline groceries",
                occurredAt: "2026-05-11T12:00:00.000Z",
                sourceAccountId: checking,
                transactions: [{ amountMinor: "120000", destinationAccountId: groceries }],
              },
            },
          ],
          workspaceId: owner.workspaceId,
        },
        url: "/api/v1/sync/push",
      });
      expect(push.statusCode).toBe(200);
      const firstPushPayload = push.json<{
        data: { accepted: Array<{ serverRevision: string }> };
      }>().data;
      expect(firstPushPayload.accepted.length).toBe(1);
      const firstServerRevision = firstPushPayload.accepted[0]?.serverRevision;
      expect(firstServerRevision).toBeDefined();

      const checkingAfterPush = await getAccountBalanceMinor(app, owner, checking);
      const groceriesAfterPush = await getAccountBalanceMinor(app, owner, groceries);
      expect(checkingAfterPush).toBe("-120000");
      expect(groceriesAfterPush).toBe("120000");

      const replayPush = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: {
          deviceId,
          ledgerId: owner.ledgerId,
          operations: [
            {
              createdAt: "2026-05-11T12:00:00.000Z",
              idempotencyKey: "sync-op-1-replay",
              localSequence: "1",
              operationId: syncOperationId,
              operationType: "transaction_group.create_expense.v1",
              operationVersion: 1,
              payload: {
                currencyCode: "INR",
                description: "Offline groceries",
                occurredAt: "2026-05-11T12:00:00.000Z",
                sourceAccountId: checking,
                transactions: [{ amountMinor: "120000", destinationAccountId: groceries }],
              },
            },
          ],
          workspaceId: owner.workspaceId,
        },
        url: "/api/v1/sync/push",
      });
      expect(replayPush.statusCode).toBe(200);
      const replayPayload = replayPush.json<{
        data: { accepted: Array<{ serverRevision: string }>; rejected: Array<{ reason: string }> };
      }>().data;
      expect(replayPayload.accepted.length).toBe(1);
      expect(replayPayload.accepted[0]?.serverRevision).toBe(firstServerRevision);
      expect(replayPayload.rejected.length).toBe(0);

      const checkingAfterReplay = await getAccountBalanceMinor(app, owner, checking);
      const groceriesAfterReplay = await getAccountBalanceMinor(app, owner, groceries);
      expect(checkingAfterReplay).toBe(checkingAfterPush);
      expect(groceriesAfterReplay).toBe(groceriesAfterPush);

      const status = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        query: {
          ledgerId: owner.ledgerId,
          workspaceId: owner.workspaceId,
        },
        url: "/api/v1/sync/status",
      });
      expect(status.statusCode).toBe(200);
      const statusBody = status.json<{
        data: { serverRevision: string; openConflicts: number; lastOperationAt: string | null };
      }>().data;
      expect(statusBody.serverRevision).toBe(firstServerRevision);
      expect(statusBody.openConflicts).toBe(0);
      expect(statusBody.lastOperationAt).not.toBeNull();

      const pull = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        query: {
          ledgerId: owner.ledgerId,
          sinceRevision: "0",
          workspaceId: owner.workspaceId,
        },
        url: "/api/v1/sync/pull",
      });
      expect(pull.statusCode).toBe(200);
      const pullBody = pull.json<{
        data: {
          fromRevision: string;
          toRevision: string;
          hasMore: boolean;
          nextSinceRevision: string | null;
          operations: Array<{ operationId: string; operationType: string; serverRevision: string }>;
        };
      }>().data;
      expect(pullBody.fromRevision).toBe("0");
      expect(pullBody.toRevision).toBe(firstServerRevision);
      expect(pullBody.hasMore).toBe(false);
      expect(pullBody.nextSinceRevision).toBeNull();
      expect(pullBody.operations).toHaveLength(1);
      expect(pullBody.operations[0]?.operationId).toBe(syncOperationId);
      expect(pullBody.operations[0]?.operationType).toBe("transaction_group.create_expense.v1");
      expect(pullBody.operations[0]?.serverRevision).toBe(firstServerRevision);

      const revokeDevice = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: {},
        url: `/api/v1/devices/${deviceId}/revoke`,
      });
      expect(revokeDevice.statusCode).toBe(200);

      const rejectedPush = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: {
          deviceId,
          ledgerId: owner.ledgerId,
          operations: [
            {
              createdAt: "2026-05-11T12:10:00.000Z",
              idempotencyKey: "sync-op-2",
              localSequence: "2",
              operationId: createUuidV7(),
              operationType: "transaction_group.create_expense.v1",
              operationVersion: 1,
              payload: {
                currencyCode: "INR",
                description: "Rejected after revoke",
                occurredAt: "2026-05-11T12:10:00.000Z",
                sourceAccountId: checking,
                transactions: [{ amountMinor: "100000", destinationAccountId: groceries }],
              },
            },
          ],
          workspaceId: owner.workspaceId,
        },
        url: "/api/v1/sync/push",
      });
      expect(rejectedPush.statusCode).toBe(403);

      const statusAfterRejectedPush = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        query: {
          ledgerId: owner.ledgerId,
          workspaceId: owner.workspaceId,
        },
        url: "/api/v1/sync/status",
      });
      expect(statusAfterRejectedPush.statusCode).toBe(200);
      expect(
        statusAfterRejectedPush.json<{ data: { serverRevision: string } }>().data.serverRevision,
      ).toBe(firstServerRevision);
    } finally {
      await system.cleanup();
    }
  });
});
