import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUuidV7, type SyncedId } from "@fastifly/common";
import { describe, expect, it } from "vitest";

import {
  createInProcessLedgerWriteBoundary,
  createPostgresDatabaseFromClient,
  createPostgresIdentityRepository,
  createPostgresLedgerMutationStore,
  createSqliteClient,
  createSqliteDatabaseFromClient,
  createSqliteIdentityRepository,
  createSqliteLedgerMutationStore,
  type IdentityRepository,
  type LedgerMutationEnvelope,
  type LedgerMutationError,
  LedgerMutationRunner,
  type LedgerMutationStore,
} from "../index.js";
import {
  createInMemoryPostgresDatabase,
  runPostgresMigrations,
  runSqliteMigrations,
} from "../testing/migrations.js";
import { readMigration } from "./migration-files.js";

type RunnerFactory = {
  readonly name: string;
  readonly run: (test: (context: RunnerContext) => Promise<void>) => Promise<void>;
};

type RunnerContext = {
  readonly dialect: "sqlite" | "postgres";
  readonly rawDb: {
    readonly execute?: (sql: string) => Promise<unknown>;
    readonly query?: (sql: string) => Promise<unknown>;
  };
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
      const client = createSqliteClient({ url: `file:${join(sqliteDir, "test.db")}` });

      try {
        await runSqliteMigrations(client, [
          readMigration("sqlite", "0001_foundation"),
          readMigration("sqlite", "0002_passkey_challenges"),
        ]);
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
        await runPostgresMigrations(client, [
          readMigration("postgres", "0001_foundation"),
          readMigration("postgres", "0002_passkey_challenges"),
        ]);
        const db = createPostgresDatabaseFromClient(client);
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

    it(`rejects read-only ledger state on ${factory.name}`, async () => {
      await factory.run(async ({ dialect, identityRepository, rawDb, store }) => {
        const { user, workspaceState } = await createBaseState(identityRepository);
        let calls = 0;

        if (dialect === "sqlite" && rawDb.execute) {
          await rawDb.execute(`UPDATE ledgers SET status = 'read_only'`);
        } else if (rawDb.query) {
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
  }
});

function createEnvelope(input: {
  readonly actorUserId: SyncedId;
  readonly workspaceId: SyncedId;
  readonly ledgerId: SyncedId;
  readonly idempotencyKey?: string;
}): LedgerMutationEnvelope {
  return {
    actorUserId: input.actorUserId,
    baseRevision: null,
    deviceId: null,
    dryRun: false,
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
    source: "rest",
    workspaceId: input.workspaceId,
  };
}

async function countRows(
  dialect: "sqlite" | "postgres",
  rawDb: RunnerContext["rawDb"],
  tableName: "audit_log" | "idempotency_receipts",
): Promise<number> {
  if (dialect === "sqlite" && rawDb.execute) {
    const result = (await rawDb.execute(`SELECT COUNT(*) AS count FROM ${tableName}`)) as {
      readonly rows: readonly { readonly count: unknown }[];
    };
    return Number(result.rows[0]?.count ?? 0);
  }

  if (rawDb.query) {
    const result = (await rawDb.query(`SELECT COUNT(*) AS count FROM ${tableName}`)) as {
      readonly rows: readonly { readonly count: unknown }[];
    };
    return Number(result.rows[0]?.count ?? 0);
  }

  throw new Error("Unsupported test database");
}
