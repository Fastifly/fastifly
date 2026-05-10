import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUuidV7, type SyncedId } from "@fastifly/common";
import { makeTestApiConfig } from "@fastifly/config";
import type { IdentityRepository, LedgerMutationEnvelope } from "@fastifly/db";
import { describe, expect, it } from "vitest";

import { createRuntimeAuthorization, createRuntimeDependencies } from "../runtime.js";

function createDeterministicIdGenerator(): () => SyncedId {
  let counter = 1;

  return () => {
    const value = counter;
    counter += 1;

    return createUuidV7({
      nowMs: Date.UTC(2026, 4, 9),
      randomBytes: (byteLength) => {
        const bytes = new Uint8Array(byteLength);
        bytes[byteLength - 1] = value;
        return bytes;
      },
    });
  };
}

const createId = createDeterministicIdGenerator();

describe("API runtime dependencies", () => {
  it("fails closed when database runtime config is missing", async () => {
    await expect(createRuntimeDependencies(makeTestApiConfig())).rejects.toThrow(
      "DATABASE_DRIVER is required",
    );
    await expect(
      createRuntimeDependencies(makeTestApiConfig({ databaseDriver: "sqlite" })),
    ).rejects.toThrow("DATABASE_URL is required");
  });

  it("rejects an unmigrated SQLite database before exposing the API as ready", async () => {
    const sqliteDir = mkdtempSync(join(tmpdir(), "fastifly-api-runtime-"));

    try {
      await expect(
        createRuntimeDependencies(
          makeTestApiConfig({
            databaseDriver: "sqlite",
            databaseUrl: join(sqliteDir, "fastifly.db"),
          }),
        ),
      ).rejects.toThrow("Run `pnpm db:migrate:sqlite`");
    } finally {
      rmSync(sqliteDir, { force: true, recursive: true });
    }
  });

  it("does not allow production auto migrations", async () => {
    await expect(
      createRuntimeDependencies(
        makeTestApiConfig({
          autoMigrate: true,
          cookieSecret: "x".repeat(32),
          databaseDriver: "sqlite",
          databaseUrl: ":memory:",
          nodeEnv: "production",
        }),
      ),
    ).rejects.toThrow("AUTO_MIGRATE must be false in production");
  });

  it("enforces granular ledger mutation authorization from the current workspace role", async () => {
    const workspaceId = createId();
    const actorUserId = createId();
    const authorize = createRuntimeAuthorization(
      makeIdentityRepository({
        actorUserId,
        role: "viewer",
        workspaceId,
      }),
    );
    const envelope = createEnvelope({ actorUserId, workspaceId });

    await expect(authorize(envelope)).rejects.toMatchObject({
      code: "MUTATION_FORBIDDEN",
    });
    await expect(
      createRuntimeAuthorization(
        makeIdentityRepository({
          actorUserId,
          role: "editor",
          workspaceId,
        }),
      )(envelope),
    ).resolves.toBeUndefined();
  });
});

function makeIdentityRepository(input: {
  readonly actorUserId: SyncedId;
  readonly role: "owner" | "admin" | "editor" | "viewer";
  readonly workspaceId: SyncedId;
}): IdentityRepository {
  return {
    findWorkspaceMember: async (workspaceId, userId) =>
      workspaceId === input.workspaceId && userId === input.actorUserId
        ? {
            createdAt: "2026-05-09T00:00:00.000Z",
            id: createId(),
            removedAt: null,
            role: input.role,
            updatedAt: "2026-05-09T00:00:00.000Z",
            userId,
            workspaceId,
          }
        : null,
  } as IdentityRepository;
}

function createEnvelope(input: {
  readonly actorUserId: SyncedId;
  readonly workspaceId: SyncedId;
}): LedgerMutationEnvelope {
  return {
    actorUserId: input.actorUserId,
    authorization: {
      action: "create",
      subject: "Account",
    },
    baseRevision: null,
    deviceId: null,
    dryRun: false,
    idempotencyKey: "idem_runtime_auth",
    ledgerId: createId(),
    requestId: "request_1",
    sideEffectFlags: {
      applyRules: false,
      batchSubmission: false,
      fireWebhooks: false,
      recalculateBalances: true,
      skipNotifications: false,
    },
    source: "rest",
    syncOperation: null,
    workspaceId: input.workspaceId,
  };
}
