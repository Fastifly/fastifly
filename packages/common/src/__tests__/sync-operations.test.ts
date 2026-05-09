import { describe, expect, it } from "vitest";

import { createUuidV7 } from "../ids.js";
import {
  APPROVED_SYNC_OPERATION_TYPES,
  SyncOperationEnvelopeSchema,
  SyncOperationTypeSchema,
} from "../sync/operations.js";

describe("sync operation contracts", () => {
  it("matches the approved day-one offline command allowlist", () => {
    expect(APPROVED_SYNC_OPERATION_TYPES).toEqual([
      "transaction_group.create_expense.v1",
      "transaction_group.create_income.v1",
      "transaction_group.create_transfer.v1",
      "category.create.v1",
      "budget.assign_category_month.v1",
    ]);
  });

  it("rejects broad mutation names that bypass product-specific contracts", () => {
    expect(SyncOperationTypeSchema.safeParse("transaction_group.create").success).toBe(false);
    expect(SyncOperationTypeSchema.safeParse("account.archive").success).toBe(false);
  });

  it("validates the documented v0.1 sync operation envelope", () => {
    const workspaceId = createUuidV7({ nowMs: 1, randomBytes: () => new Uint8Array(10).fill(1) });
    const ledgerId = createUuidV7({ nowMs: 2, randomBytes: () => new Uint8Array(10).fill(2) });
    const deviceId = createUuidV7({ nowMs: 3, randomBytes: () => new Uint8Array(10).fill(3) });

    expect(
      SyncOperationEnvelopeSchema.parse({
        baseRevision: "42",
        createdAt: "2026-05-09T12:00:00.000Z",
        deviceId,
        idempotencyKey: "idem_123",
        ledgerId,
        localSequence: "12",
        operationId: "op_123",
        operationType: "transaction_group.create_expense.v1",
        operationVersion: 1,
        payload: {},
        payloadEncoding: "plaintext.v1",
        workspaceId,
      }),
    ).toMatchObject({
      baseRevision: "42",
      localSequence: "12",
      operationId: "op_123",
    });
  });
});
