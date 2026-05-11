import { createUuidV7 } from "@fastifly/common";
import { describe, expect, it } from "vitest";

import {
  createAccount,
  createSqliteE2eSystem,
  getAccountBalanceMinor,
  registerAndResolveScope,
  requestWithCsrf,
} from "../helpers/system.js";

describe("e2e/api/workflow/sync-conflicts", () => {
  it("runs stale-base conflict creation, listing, resolution, and status transitions", async () => {
    const system = await createSqliteE2eSystem();

    try {
      const { app } = system;
      const owner = await registerAndResolveScope(app, {
        password: "password123",
        username: "sync-conflict-owner-e2e",
      });

      const checking = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "asset",
        name: "Conflict Checking",
        subtype: "bank",
      });
      const groceries = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "expense",
        name: "Conflict Groceries",
        subtype: "external",
      });

      const registerDevice = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: {
          deviceKey: "sync-conflict-device",
          name: "Pixel",
        },
        url: "/api/v1/devices",
      });
      expect(registerDevice.statusCode).toBe(201);
      const deviceId = registerDevice.json<{ data: { device: { id: string } } }>().data.device.id;

      const firstOperationId = createUuidV7();
      const staleOperationId = createUuidV7();

      const firstPush = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: {
          deviceId,
          ledgerId: owner.ledgerId,
          operations: [
            {
              baseRevision: "0",
              createdAt: "2026-05-11T18:00:00.000Z",
              idempotencyKey: "sync-conflict-op-1",
              localSequence: "1",
              operationId: firstOperationId,
              operationType: "transaction_group.create_expense.v1",
              operationVersion: 1,
              payload: {
                currencyCode: "INR",
                description: "Conflict seed expense",
                occurredAt: "2026-05-11T18:00:00.000Z",
                sourceAccountId: checking,
                transactions: [{ amountMinor: "90000", destinationAccountId: groceries }],
              },
            },
          ],
          workspaceId: owner.workspaceId,
        },
        url: "/api/v1/sync/push",
      });
      expect(firstPush.statusCode).toBe(200);
      const firstPushBody = firstPush.json<{
        data: { accepted: Array<{ operationId: string; serverRevision: string }> };
      }>().data;
      expect(firstPushBody.accepted).toHaveLength(1);
      expect(firstPushBody.accepted[0]?.operationId).toBe(firstOperationId);
      const firstServerRevision = firstPushBody.accepted[0]?.serverRevision;
      expect(firstServerRevision).toBeDefined();
      expect(await getAccountBalanceMinor(app, owner, checking)).toBe("-90000");
      expect(await getAccountBalanceMinor(app, owner, groceries)).toBe("90000");

      const stalePush = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: {
          deviceId,
          ledgerId: owner.ledgerId,
          operations: [
            {
              baseRevision: "0",
              createdAt: "2026-05-11T18:05:00.000Z",
              idempotencyKey: "sync-conflict-op-2",
              localSequence: "2",
              operationId: staleOperationId,
              operationType: "transaction_group.create_expense.v1",
              operationVersion: 1,
              payload: {
                currencyCode: "INR",
                description: "Stale base revision should conflict",
                occurredAt: "2026-05-11T18:05:00.000Z",
                sourceAccountId: checking,
                transactions: [{ amountMinor: "91000", destinationAccountId: groceries }],
              },
            },
          ],
          workspaceId: owner.workspaceId,
        },
        url: "/api/v1/sync/push",
      });
      expect(stalePush.statusCode).toBe(200);
      const stalePayload = stalePush.json<{
        data: { conflicts: Array<{ conflictType: string; operationId: string }> };
      }>().data;
      expect(stalePayload.conflicts).toHaveLength(1);
      expect(stalePayload.conflicts[0]).toMatchObject({
        conflictType: "stale_update",
        operationId: staleOperationId,
      });
      expect(await getAccountBalanceMinor(app, owner, checking)).toBe("-90000");
      expect(await getAccountBalanceMinor(app, owner, groceries)).toBe("90000");

      const conflictsBeforeResolve = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        query: {
          ledgerId: owner.ledgerId,
          workspaceId: owner.workspaceId,
        },
        url: "/api/v1/sync/conflicts",
      });
      expect(conflictsBeforeResolve.statusCode).toBe(200);
      const openConflicts = conflictsBeforeResolve.json<{
        data: { conflicts: Array<{ id: string; incomingOperationId: string }> };
      }>().data.conflicts;
      expect(openConflicts).toHaveLength(1);
      expect(openConflicts[0]?.incomingOperationId).toBe(staleOperationId);

      const statusBeforeResolve = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        query: {
          ledgerId: owner.ledgerId,
          workspaceId: owner.workspaceId,
        },
        url: "/api/v1/sync/status",
      });
      expect(statusBeforeResolve.statusCode).toBe(200);
      const statusBeforeResolveBody = statusBeforeResolve.json<{
        data: { openConflicts: number; serverRevision: string };
      }>().data;
      expect(statusBeforeResolveBody.openConflicts).toBe(1);
      expect(statusBeforeResolveBody.serverRevision).toBe(firstServerRevision);

      const resolve = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: {
          ledgerId: owner.ledgerId,
          resolution: "dismiss",
          workspaceId: owner.workspaceId,
        },
        url: `/api/v1/sync/conflicts/${openConflicts[0]?.id}/resolve`,
      });
      expect(resolve.statusCode).toBe(200);
      expect(resolve.json<{ data: { status: string } }>().data.status).toBe("dismissed");

      const conflictsAfterResolve = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        query: {
          ledgerId: owner.ledgerId,
          workspaceId: owner.workspaceId,
        },
        url: "/api/v1/sync/conflicts",
      });
      expect(conflictsAfterResolve.statusCode).toBe(200);
      expect(
        conflictsAfterResolve.json<{ data: { conflicts: unknown[] } }>().data.conflicts,
      ).toHaveLength(0);

      const statusAfterResolve = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        query: {
          ledgerId: owner.ledgerId,
          workspaceId: owner.workspaceId,
        },
        url: "/api/v1/sync/status",
      });
      expect(statusAfterResolve.statusCode).toBe(200);
      const statusAfterResolveBody = statusAfterResolve.json<{
        data: { openConflicts: number; serverRevision: string };
      }>().data;
      expect(statusAfterResolveBody.openConflicts).toBe(0);
      expect(statusAfterResolveBody.serverRevision).toBe(firstServerRevision);
    } finally {
      await system.cleanup();
    }
  });
});
