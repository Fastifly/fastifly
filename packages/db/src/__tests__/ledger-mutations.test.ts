import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUuidV7, type SyncedId } from "@fastifly/common";
import { describe, expect, it } from "vitest";

import {
  createConfiguredSqliteClient,
  createInProcessLedgerWriteBoundary,
  createPglitePostgresDatabaseFromClient,
  createPostgresIdentityRepository,
  createPostgresLedgerMutationStore,
  createSqliteDatabaseFromClient,
  createSqliteIdentityRepository,
  createSqliteLedgerMutationStore,
  type IdentityRepository,
  type LedgerMutationEnvelope,
  type LedgerMutationError,
  LedgerMutationRunner,
  type LedgerMutationStore,
  type SqliteClient,
} from "../index.js";
import {
  createInMemoryPostgresDatabase,
  runPostgresMigrations,
  runSqliteMigrations,
} from "../testing/migrations.js";

type RunnerFactory = {
  readonly name: string;
  readonly run: (test: (context: RunnerContext) => Promise<void>) => Promise<void>;
};

type RunnerContext = {
  readonly dialect: "sqlite" | "postgres";
  readonly rawDb: SqliteClient | { readonly query: (sql: string) => Promise<unknown> };
  readonly identityRepository: IdentityRepository;
  readonly store: LedgerMutationStore<unknown>;
};

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

function createClock(date: Date) {
  return { now: () => date };
}

const repositoryClock = createClock(new Date("2026-05-09T00:00:00.000Z"));

async function createBaseState(identityRepository: IdentityRepository) {
  const user = await identityRepository.createUser({
    displayName: "Owner",
    passwordHash: "$argon2id$fixture",
    username: "Owner",
  });
  const workspaceState = await identityRepository.bootstrapDefaultWorkspace({
    userId: user.id,
  });

  return { user, workspaceState };
}

const factories: readonly RunnerFactory[] = [
  {
    name: "SQLite",
    async run(test) {
      const sqliteDir = mkdtempSync(join(tmpdir(), "fastifly-ledger-mutation-sqlite-"));
      const client = createConfiguredSqliteClient({ source: join(sqliteDir, "test.db") });

      try {
        runSqliteMigrations(client);
        const db = createSqliteDatabaseFromClient(client);
        const createId = createDeterministicIdGenerator();
        const identityRepository = createSqliteIdentityRepository(db, {
          clock: repositoryClock,
          createId,
        });
        await test({
          dialect: "sqlite",
          identityRepository,
          rawDb: client,
          store: createSqliteLedgerMutationStore(db, {
            createId,
            now: repositoryClock.now,
          }) as LedgerMutationStore<unknown>,
        });
      } finally {
        client.close();
        rmSync(sqliteDir, { force: true, recursive: true });
      }
    },
  },
  {
    name: "PostgreSQL",
    async run(test) {
      const client = await createInMemoryPostgresDatabase();

      try {
        await runPostgresMigrations(client);
        const db = createPglitePostgresDatabaseFromClient(client);
        const createId = createDeterministicIdGenerator();
        const identityRepository = createPostgresIdentityRepository(db, {
          clock: repositoryClock,
          createId,
        });
        await test({
          dialect: "postgres",
          identityRepository,
          rawDb: client,
          store: createPostgresLedgerMutationStore(db, {
            createId,
            now: repositoryClock.now,
          }) as LedgerMutationStore<unknown>,
        });
      } finally {
        await client.close();
      }
    },
  },
];

describe("ledger mutation runner", () => {
  for (const factory of factories) {
    it(`replays duplicate idempotency keys on ${factory.name}`, async () => {
      await factory.run(async ({ dialect, identityRepository, rawDb, store }) => {
        const { user, workspaceState } = await createBaseState(identityRepository);
        const dispatched: string[] = [];
        const runner = new LedgerMutationRunner({
          authorize: () => undefined,
          dispatchDomainEvents: (events) => dispatched.push(...events.map((event) => event.type)),
          now: () => new Date("2026-05-09T00:00:00.000Z"),
          store,
          writeBoundary: createInProcessLedgerWriteBoundary(),
        });
        const envelope = createEnvelope({
          actorUserId: user.id,
          ledgerId: workspaceState.ledger.id,
          workspaceId: workspaceState.workspace.id,
        });
        let calls = 0;

        const first = await runner.run({
          envelope,
          requestPayload: { amountMinor: "100" },
          handler: ({ emitEvent, recordAudit }) => {
            calls += 1;
            emitEvent({ payload: { calls }, type: "transaction.created" });
            recordAudit({
              action: "ledger.created",
              entityId: workspaceState.ledger.id,
              entityType: "ledger",
              metadataJson: { calls },
            });

            return { body: { calls }, status: 201 };
          },
        });
        const second = await runner.run({
          envelope,
          requestPayload: { amountMinor: "100" },
          handler: () => {
            calls += 1;
            return { body: { calls }, status: 201 };
          },
        });

        expect(first).toMatchObject({
          body: { calls: 1 },
          idempotencyReplayed: false,
          status: 201,
        });
        expect(second).toMatchObject({
          body: { calls: 1 },
          idempotencyReplayed: true,
          status: 201,
        });
        expect(calls).toBe(1);
        expect(dispatched).toEqual(["transaction.created"]);
        await expect(countRows(dialect, rawDb, "audit_log")).resolves.toBe(1);
        await expect(countRows(dialect, rawDb, "idempotency_receipts")).resolves.toBe(1);
      });
    });

    it(`rejects idempotency key reuse with a different request on ${factory.name}`, async () => {
      await factory.run(async ({ identityRepository, store }) => {
        const { user, workspaceState } = await createBaseState(identityRepository);
        const runner = new LedgerMutationRunner({
          authorize: () => undefined,
          store,
          writeBoundary: createInProcessLedgerWriteBoundary(),
        });
        const envelope = createEnvelope({
          actorUserId: user.id,
          ledgerId: workspaceState.ledger.id,
          workspaceId: workspaceState.workspace.id,
        });

        await runner.run({
          envelope,
          requestPayload: { amountMinor: "100" },
          handler: () => ({ body: { ok: true }, status: 201 }),
        });

        await expect(
          runner.run({
            envelope,
            requestPayload: { amountMinor: "200" },
            handler: () => ({ body: { ok: true }, status: 201 }),
          }),
        ).rejects.toMatchObject({
          code: "IDEMPOTENCY_CONFLICT",
        } satisfies Partial<LedgerMutationError>);
      });
    });

    it(`ignores expired idempotency receipts on ${factory.name}`, async () => {
      await factory.run(async ({ dialect, identityRepository, rawDb, store }) => {
        const { user, workspaceState } = await createBaseState(identityRepository);
        let now = new Date("2026-05-09T00:00:00.000Z");
        let calls = 0;
        const runner = new LedgerMutationRunner({
          authorize: () => undefined,
          now: () => now,
          receiptTtlMs: 1000,
          store,
          writeBoundary: createInProcessLedgerWriteBoundary(),
        });
        const envelope = createEnvelope({
          actorUserId: user.id,
          idempotencyKey: "idem_expires",
          ledgerId: workspaceState.ledger.id,
          workspaceId: workspaceState.workspace.id,
        });

        const first = await runner.run({
          envelope,
          requestPayload: { amountMinor: "100" },
          handler: () => {
            calls += 1;
            return { body: { calls }, status: 201 };
          },
        });
        now = new Date("2026-05-09T00:00:02.000Z");
        const second = await runner.run({
          envelope,
          requestPayload: { amountMinor: "100" },
          handler: () => {
            calls += 1;
            return { body: { calls }, status: 201 };
          },
        });

        expect(first).toMatchObject({ body: { calls: 1 }, idempotencyReplayed: false });
        expect(second).toMatchObject({ body: { calls: 2 }, idempotencyReplayed: false });
        expect(calls).toBe(2);
        await expect(countRows(dialect, rawDb, "idempotency_receipts")).resolves.toBe(1);
      });
    });

    it(`fails closed before handler execution when authorization fails on ${factory.name}`, async () => {
      await factory.run(async ({ identityRepository, store }) => {
        const { user, workspaceState } = await createBaseState(identityRepository);
        let calls = 0;
        const runner = new LedgerMutationRunner({
          authorize: () => {
            throw new Error("denied");
          },
          store,
          writeBoundary: createInProcessLedgerWriteBoundary(),
        });

        await expect(
          runner.run({
            envelope: createEnvelope({
              actorUserId: user.id,
              ledgerId: workspaceState.ledger.id,
              workspaceId: workspaceState.workspace.id,
            }),
            requestPayload: { ok: true },
            handler: () => {
              calls += 1;
              return { body: { ok: true }, status: 201 };
            },
          }),
        ).rejects.toThrow("denied");
        expect(calls).toBe(0);
      });
    });

    it(`requires explicit authorization context before handler execution on ${factory.name}`, async () => {
      await factory.run(async ({ identityRepository, store }) => {
        const { user, workspaceState } = await createBaseState(identityRepository);
        let calls = 0;
        const envelopeWithoutAuthorization: Partial<LedgerMutationEnvelope> = {
          ...createEnvelope({
            actorUserId: user.id,
            ledgerId: workspaceState.ledger.id,
            workspaceId: workspaceState.workspace.id,
          }),
        };
        delete envelopeWithoutAuthorization.authorization;
        const runner = new LedgerMutationRunner({
          authorize: () => undefined,
          store,
          writeBoundary: createInProcessLedgerWriteBoundary(),
        });

        await expect(
          runner.run({
            envelope: envelopeWithoutAuthorization as LedgerMutationEnvelope,
            requestPayload: { ok: true },
            handler: () => {
              calls += 1;
              return { body: { ok: true }, status: 201 };
            },
          }),
        ).rejects.toMatchObject({
          code: "MUTATION_FORBIDDEN",
        } satisfies Partial<LedgerMutationError>);
        expect(calls).toBe(0);
      });
    });

    it(`rejects read-only ledger state on ${factory.name}`, async () => {
      await factory.run(async ({ dialect, identityRepository, rawDb, store }) => {
        const { user, workspaceState } = await createBaseState(identityRepository);
        let calls = 0;

        if (dialect === "sqlite" && "exec" in rawDb) {
          rawDb.exec(`UPDATE ledgers SET status = 'read_only'`);
        } else if ("query" in rawDb) {
          await rawDb.query(`UPDATE ledgers SET status = 'read_only'`);
        }

        const runner = new LedgerMutationRunner({
          authorize: () => undefined,
          store,
          writeBoundary: createInProcessLedgerWriteBoundary(),
        });

        await expect(
          runner.run({
            envelope: createEnvelope({
              actorUserId: user.id,
              ledgerId: workspaceState.ledger.id,
              workspaceId: workspaceState.workspace.id,
            }),
            requestPayload: { ok: true },
            handler: () => {
              calls += 1;
              return { body: { ok: true }, status: 201 };
            },
          }),
        ).rejects.toMatchObject({
          code: "LEDGER_NOT_WRITABLE",
        } satisfies Partial<LedgerMutationError>);
        expect(calls).toBe(0);
      });
    });

    it(`enforces lifecycle write rules on ${factory.name}`, async () => {
      await factory.run(async ({ dialect, identityRepository, rawDb, store }) => {
        const { user, workspaceState } = await createBaseState(identityRepository);
        const blockedStatuses = [
          "read_only",
          "maintenance",
          "archived",
          "restore_preview",
          "pending_restore",
          "broken",
        ] as const;

        for (const status of blockedStatuses) {
          await updateLifecycle(dialect, rawDb, "ledgers", "status", status);

          await expect(
            new LedgerMutationRunner({
              authorize: () => undefined,
              store,
              writeBoundary: createInProcessLedgerWriteBoundary(),
            }).run({
              envelope: createEnvelope({
                actorUserId: user.id,
                idempotencyKey: `idem_blocked_${status}`,
                ledgerId: workspaceState.ledger.id,
                workspaceId: workspaceState.workspace.id,
              }),
              requestPayload: { status },
              handler: () => ({ body: { ok: true }, status: 201 }),
            }),
          ).rejects.toMatchObject({
            code: "LEDGER_NOT_WRITABLE",
          } satisfies Partial<LedgerMutationError>);
        }

        await updateLifecycle(dialect, rawDb, "ledgers", "status", "maintenance");
        const maintenanceResult = await new LedgerMutationRunner({
          authorize: () => undefined,
          store,
          writeBoundary: createInProcessLedgerWriteBoundary(),
        }).run({
          envelope: createEnvelope({
            actorUserId: user.id,
            idempotencyKey: "idem_maintenance_source",
            ledgerId: workspaceState.ledger.id,
            source: "maintenance",
            workspaceId: workspaceState.workspace.id,
          }),
          requestPayload: { status: "maintenance" },
          handler: () => ({ body: { ok: true }, status: 200 }),
        });

        expect(maintenanceResult).toMatchObject({ body: { ok: true }, status: 200 });

        await updateLifecycle(dialect, rawDb, "ledgers", "status", "active");
        await updateLifecycle(
          dialect,
          rawDb,
          "workspaces",
          "archived_at",
          "2026-05-09T01:00:00.000Z",
        );

        await expect(
          new LedgerMutationRunner({
            authorize: () => undefined,
            store,
            writeBoundary: createInProcessLedgerWriteBoundary(),
          }).run({
            envelope: createEnvelope({
              actorUserId: user.id,
              idempotencyKey: "idem_archived_workspace",
              ledgerId: workspaceState.ledger.id,
              workspaceId: workspaceState.workspace.id,
            }),
            requestPayload: { ok: true },
            handler: () => ({ body: { ok: true }, status: 201 }),
          }),
        ).rejects.toMatchObject({
          code: "LEDGER_NOT_WRITABLE",
        } satisfies Partial<LedgerMutationError>);
      });
    });

    it(`dispatches events only after a committed mutation on ${factory.name}`, async () => {
      await factory.run(async ({ identityRepository, store }) => {
        const { user, workspaceState } = await createBaseState(identityRepository);
        const dispatched: string[] = [];
        const runner = new LedgerMutationRunner({
          authorize: () => undefined,
          dispatchDomainEvents: (events) => dispatched.push(...events.map((event) => event.type)),
          store,
          writeBoundary: createInProcessLedgerWriteBoundary(),
        });
        const envelope = createEnvelope({
          actorUserId: user.id,
          idempotencyKey: "idem_failure",
          ledgerId: workspaceState.ledger.id,
          workspaceId: workspaceState.workspace.id,
        });

        await expect(
          runner.run({
            envelope,
            requestPayload: { ok: false },
            handler: ({ emitEvent }) => {
              emitEvent({ payload: { ok: false }, type: "should_not_dispatch" });
              throw new Error("mutation failed");
            },
          }),
        ).rejects.toThrow("mutation failed");

        expect(dispatched).toEqual([]);
      });
    });

    it(`dispatches balance dirty requests only after committed non-replayed mutations on ${factory.name}`, async () => {
      await factory.run(async ({ identityRepository, store }) => {
        const { user, workspaceState } = await createBaseState(identityRepository);
        const dispatchedReasons: string[] = [];
        const runner = new LedgerMutationRunner({
          authorize: () => undefined,
          dispatchBalanceDirtyRequests: (requests) =>
            dispatchedReasons.push(...requests.map((request) => request.reason)),
          store,
          writeBoundary: createInProcessLedgerWriteBoundary(),
        });
        const envelope = createEnvelope({
          actorUserId: user.id,
          idempotencyKey: "idem_balance_dirty",
          ledgerId: workspaceState.ledger.id,
          workspaceId: workspaceState.workspace.id,
        });

        await runner.run({
          envelope,
          requestPayload: { ok: true },
          handler: ({ markBalanceDirty }) => {
            markBalanceDirty({
              ledgerId: workspaceState.ledger.id,
              reason: "transaction.created",
              workspaceId: workspaceState.workspace.id,
            });

            return { body: { ok: true }, status: 201 };
          },
        });
        await runner.run({
          envelope,
          requestPayload: { ok: true },
          handler: ({ markBalanceDirty }) => {
            markBalanceDirty({
              ledgerId: workspaceState.ledger.id,
              reason: "should_not_dispatch_on_replay",
              workspaceId: workspaceState.workspace.id,
            });

            return { body: { ok: true }, status: 201 };
          },
        });

        await expect(
          runner.run({
            envelope: createEnvelope({
              actorUserId: user.id,
              idempotencyKey: "idem_balance_dirty_failure",
              ledgerId: workspaceState.ledger.id,
              workspaceId: workspaceState.workspace.id,
            }),
            requestPayload: { ok: false },
            handler: ({ markBalanceDirty }) => {
              markBalanceDirty({
                ledgerId: workspaceState.ledger.id,
                reason: "should_not_dispatch_on_failure",
                workspaceId: workspaceState.workspace.id,
              });
              throw new Error("failed");
            },
          }),
        ).rejects.toThrow("failed");

        expect(dispatchedReasons).toEqual(["transaction.created"]);
      });
    });

    it(`records accepted sync operations only after committed non-replayed sync mutations on ${factory.name}`, async () => {
      await factory.run(async ({ identityRepository, store }) => {
        const { user, workspaceState } = await createBaseState(identityRepository);
        const records: { hash: string; operationId: string }[] = [];
        const runner = new LedgerMutationRunner({
          authorize: () => undefined,
          recordSyncOperationAccepted: (entry) =>
            records.push({
              hash: entry.requestHash,
              operationId: entry.envelope.syncOperation?.operationId ?? "",
            }),
          store,
          writeBoundary: createInProcessLedgerWriteBoundary(),
        });
        const envelope = createEnvelope({
          actorUserId: user.id,
          idempotencyKey: "idem_sync_operation",
          ledgerId: workspaceState.ledger.id,
          syncOperationId: "operation_1",
          source: "sync",
          workspaceId: workspaceState.workspace.id,
        });

        await runner.run({
          envelope,
          requestPayload: { operationId: "operation_1" },
          handler: () => ({ body: { ok: true }, status: 202 }),
        });
        await runner.run({
          envelope,
          requestPayload: { operationId: "operation_1" },
          handler: () => ({ body: { shouldReplay: true }, status: 202 }),
        });
        await runner.run({
          envelope: createEnvelope({
            actorUserId: user.id,
            idempotencyKey: "idem_rest_operation",
            ledgerId: workspaceState.ledger.id,
            workspaceId: workspaceState.workspace.id,
          }),
          requestPayload: { operationId: "operation_2" },
          handler: () => ({ body: { ok: true }, status: 201 }),
        });

        await expect(
          runner.run({
            envelope: createEnvelope({
              actorUserId: user.id,
              idempotencyKey: "idem_sync_failure",
              ledgerId: workspaceState.ledger.id,
              syncOperationId: "operation_3",
              source: "sync",
              workspaceId: workspaceState.workspace.id,
            }),
            requestPayload: { operationId: "operation_3" },
            handler: () => {
              throw new Error("sync failed");
            },
          }),
        ).rejects.toThrow("sync failed");

        expect(records).toHaveLength(1);
        expect(records[0]?.hash).toMatch(/^[a-f0-9]{64}$/);
        expect(records[0]?.operationId).toBe("operation_1");
      });
    });

    it(`requires sync operation metadata only for sync-sourced mutations on ${factory.name}`, async () => {
      await factory.run(async ({ identityRepository, store }) => {
        const { user, workspaceState } = await createBaseState(identityRepository);
        const runner = new LedgerMutationRunner({
          authorize: () => undefined,
          store,
          writeBoundary: createInProcessLedgerWriteBoundary(),
        });

        await expect(
          runner.run({
            envelope: createEnvelope({
              actorUserId: user.id,
              ledgerId: workspaceState.ledger.id,
              source: "sync",
              workspaceId: workspaceState.workspace.id,
            }),
            requestPayload: { operationId: "operation_missing_context" },
            handler: () => ({ body: { ok: true }, status: 202 }),
          }),
        ).rejects.toMatchObject({ code: "INVALID_SYNC_OPERATION" });

        await expect(
          runner.run({
            envelope: createEnvelope({
              actorUserId: user.id,
              ledgerId: workspaceState.ledger.id,
              syncOperationId: "operation_wrong_source",
              workspaceId: workspaceState.workspace.id,
            }),
            requestPayload: { operationId: "operation_wrong_source" },
            handler: () => ({ body: { ok: true }, status: 202 }),
          }),
        ).rejects.toMatchObject({ code: "INVALID_SYNC_OPERATION" });
      });
    });

    it(`does not persist receipts, audit, or side effects for dry runs on ${factory.name}`, async () => {
      await factory.run(async ({ dialect, identityRepository, rawDb, store }) => {
        const { user, workspaceState } = await createBaseState(identityRepository);
        const events: string[] = [];
        const balanceDirtyReasons: string[] = [];
        const runner = new LedgerMutationRunner({
          authorize: () => undefined,
          dispatchBalanceDirtyRequests: (requests) =>
            balanceDirtyReasons.push(...requests.map((request) => request.reason)),
          dispatchDomainEvents: (items) => events.push(...items.map((event) => event.type)),
          store,
          writeBoundary: createInProcessLedgerWriteBoundary(),
        });

        const result = await runner.run({
          envelope: createEnvelope({
            actorUserId: user.id,
            dryRun: true,
            idempotencyKey: "idem_dry_run",
            ledgerId: workspaceState.ledger.id,
            workspaceId: workspaceState.workspace.id,
          }),
          requestPayload: { ok: true },
          handler: ({ emitEvent, markBalanceDirty, recordAudit }) => {
            emitEvent({ payload: { ok: true }, type: "transaction.previewed" });
            markBalanceDirty({
              ledgerId: workspaceState.ledger.id,
              reason: "preview",
              workspaceId: workspaceState.workspace.id,
            });
            recordAudit({
              action: "ledger.created",
              entityId: workspaceState.ledger.id,
              entityType: "ledger",
              metadataJson: { dryRun: true },
            });

            return { body: { ok: true }, status: 200 };
          },
        });

        expect(result).toMatchObject({ body: { ok: true }, idempotencyReplayed: false });
        expect(events).toEqual([]);
        expect(balanceDirtyReasons).toEqual([]);
        await expect(countRows(dialect, rawDb, "audit_log")).resolves.toBe(0);
        await expect(countRows(dialect, rawDb, "idempotency_receipts")).resolves.toBe(0);
      });
    });
  }
});

function createEnvelope(input: {
  readonly actorUserId: SyncedId;
  readonly workspaceId: SyncedId;
  readonly ledgerId: SyncedId;
  readonly idempotencyKey?: string;
  readonly source?: LedgerMutationEnvelope["source"];
  readonly dryRun?: boolean;
  readonly syncOperationId?: string;
}): LedgerMutationEnvelope {
  return {
    actorUserId: input.actorUserId,
    authorization: {
      action: "create",
      subject: "TransactionGroup",
    },
    baseRevision: null,
    deviceId: null,
    dryRun: input.dryRun ?? false,
    idempotencyKey: input.idempotencyKey ?? "idem_success",
    ledgerId: input.ledgerId,
    requestId: "request_1",
    sideEffectFlags: {
      applyRules: false,
      batchSubmission: false,
      fireWebhooks: false,
      recalculateBalances: true,
      skipNotifications: false,
    },
    source: input.source ?? "rest",
    syncOperation: input.syncOperationId
      ? {
          localSequence: "1",
          operationId: input.syncOperationId,
          operationType: "transaction_group.create_expense.v1",
        }
      : null,
    workspaceId: input.workspaceId,
  };
}

async function updateLifecycle(
  dialect: "sqlite" | "postgres",
  rawDb: RunnerContext["rawDb"],
  tableName: "workspaces" | "ledgers",
  columnName: "status" | "archived_at",
  value: string,
): Promise<void> {
  const sql =
    dialect === "postgres" && columnName === "archived_at"
      ? `UPDATE ${tableName} SET ${columnName} = '${value}'::timestamptz`
      : `UPDATE ${tableName} SET ${columnName} = '${value}'`;

  if (dialect === "sqlite" && "exec" in rawDb) {
    rawDb.exec(sql);
    return;
  }

  if ("query" in rawDb) {
    await rawDb.query(sql);
    return;
  }

  throw new Error("Unsupported test database");
}

async function countRows(
  dialect: "sqlite" | "postgres",
  rawDb: RunnerContext["rawDb"],
  tableName: "audit_log" | "idempotency_receipts",
): Promise<number> {
  if (dialect === "sqlite" && "prepare" in rawDb) {
    const row = rawDb.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get() as
      | { readonly count: unknown }
      | undefined;
    return Number(row?.count ?? 0);
  }

  if ("query" in rawDb) {
    const result = (await rawDb.query(`SELECT COUNT(*) AS count FROM ${tableName}`)) as {
      readonly rows: readonly { readonly count: unknown }[];
    };
    return Number(result.rows[0]?.count ?? 0);
  }

  throw new Error("Unsupported test database");
}
