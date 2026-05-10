import type { SyncedId, SyncOperationType } from "@fastifly/common";
import { and, eq } from "drizzle-orm";

import type { PostgresDatabase } from "./postgres/client.js";
import { pgAuditLog, pgIdempotencyReceipts, pgLedgers, pgWorkspaces } from "./postgres/schema.js";
import type {
  LedgerRecord,
  RepositoryIdGenerator,
  WorkspaceRecord,
} from "./repositories/identity.js";
import { toLedgerRecord, toWorkspaceRecord } from "./repositories/identity.js";
import type { AuditAction, JsonObject } from "./schema-types.js";
import type { SqliteDatabase } from "./sqlite/client.js";
import {
  sqliteAuditLog,
  sqliteIdempotencyReceipts,
  sqliteLedgers,
  sqliteWorkspaces,
} from "./sqlite/schema.js";

export type LedgerMutationSource =
  | "rest"
  | "sync"
  | "import"
  | "rule"
  | "recurring"
  | "maintenance";

export type LedgerMutationSideEffectFlags = {
  readonly applyRules: boolean;
  readonly fireWebhooks: boolean;
  readonly batchSubmission: boolean;
  readonly skipNotifications: boolean;
  readonly recalculateBalances: boolean;
};

export type LedgerMutationAuthorizationAction =
  | "create"
  | "update"
  | "delete"
  | "archive"
  | "reconcile"
  | "import"
  | "sync"
  | "administer";

export type LedgerMutationAuthorizationSubject =
  | "Ledger"
  | "Account"
  | "Category"
  | "Budget"
  | "Tag"
  | "Payee"
  | "TransactionGroup"
  | "Import"
  | "Sync"
  | "Settings";

export type LedgerMutationAuthorizationContext = {
  readonly action: LedgerMutationAuthorizationAction;
  readonly subject: LedgerMutationAuthorizationSubject;
};

export type LedgerMutationEnvelope = {
  readonly requestId: string;
  readonly actorUserId: SyncedId;
  readonly deviceId?: SyncedId | null;
  readonly workspaceId: SyncedId;
  readonly ledgerId: SyncedId;
  readonly authorization: LedgerMutationAuthorizationContext;
  readonly idempotencyKey?: string | null;
  readonly baseRevision?: number | null;
  readonly source: LedgerMutationSource;
  readonly syncOperation?: LedgerMutationSyncOperationContext | null;
  readonly dryRun: boolean;
  readonly sideEffectFlags: LedgerMutationSideEffectFlags;
};

export type LedgerMutationSyncOperationContext = {
  readonly operationId: string;
  readonly operationType: SyncOperationType;
  readonly localSequence: string;
};

export type LedgerMutationResponse = {
  readonly status: number;
  readonly body: JsonObject;
};

export type LedgerMutationRunResult = LedgerMutationResponse & {
  readonly idempotencyReplayed: boolean;
};

export type LedgerMutationDomainEvent = {
  readonly type: string;
  readonly payload: JsonObject;
};

export type LedgerMutationAuditEntry = {
  readonly action: AuditAction;
  readonly entityType: string;
  readonly entityId: string;
  readonly metadataJson: JsonObject;
};

export type BalanceDirtyRequest = {
  readonly workspaceId: SyncedId;
  readonly ledgerId: SyncedId;
  readonly accountId?: SyncedId | null;
  readonly fromOccurredAt?: string | null;
  readonly reason: string;
};

export type LedgerMutationSyncOperationLog = {
  readonly envelope: LedgerMutationEnvelope;
  readonly requestHash: string;
  readonly result: LedgerMutationRunResult;
};

export type LedgerMutationHandlerContext<TTransaction> = {
  readonly envelope: LedgerMutationEnvelope;
  readonly transaction: TTransaction;
  readonly emitEvent: (event: LedgerMutationDomainEvent) => void;
  readonly recordAudit: (entry: LedgerMutationAuditEntry) => void;
  readonly markBalanceDirty: (request: BalanceDirtyRequest) => void;
};

export type LedgerMutationHandler<TTransaction> = (
  context: LedgerMutationHandlerContext<TTransaction>,
) => MaybePromise<LedgerMutationResponse>;

export type IdempotencyReceiptRecord = {
  readonly id: SyncedId;
  readonly workspaceId: SyncedId;
  readonly ledgerId: SyncedId | null;
  readonly actorUserId: SyncedId;
  readonly deviceId: SyncedId | null;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly responseStatus: number;
  readonly responseBodyJson: JsonObject;
  readonly createdAt: string;
  readonly expiresAt: string;
};

export type LedgerMutationScope = {
  readonly workspace: WorkspaceRecord;
  readonly ledger: LedgerRecord;
};

export type LedgerMutationTransactionalStore = {
  readonly findScope: (
    workspaceId: SyncedId,
    ledgerId: SyncedId,
  ) => MaybePromise<LedgerMutationScope | null>;
  readonly findIdempotencyReceipt: (
    actorUserId: SyncedId,
    idempotencyKey: string,
  ) => MaybePromise<IdempotencyReceiptRecord | null>;
  readonly createIdempotencyReceipt: (
    input: CreateIdempotencyReceiptInput,
  ) => MaybePromise<IdempotencyReceiptRecord>;
  readonly deleteIdempotencyReceipt: (id: SyncedId) => MaybePromise<void>;
  readonly createAuditLogEntries: (
    input: CreateAuditLogEntriesInput,
  ) => MaybePromise<readonly LedgerMutationAuditEntry[]>;
};

export type LedgerMutationSyncStore<TTransaction> = {
  readonly executionMode: "sync";
  readonly transaction: <TResult>(
    callback: (
      transactionalStore: LedgerMutationTransactionalStore,
      transaction: TTransaction,
    ) => SyncTransactionResult<TResult>,
  ) => SyncTransactionResult<TResult>;
};

export type LedgerMutationAsyncStore<TTransaction> = {
  readonly executionMode: "async";
  readonly transaction: <TResult>(
    callback: (
      transactionalStore: LedgerMutationTransactionalStore,
      transaction: TTransaction,
    ) => MaybePromise<TResult>,
  ) => Promise<TResult>;
};

export type LedgerMutationStore<TTransaction> =
  | LedgerMutationSyncStore<TTransaction>
  | LedgerMutationAsyncStore<TTransaction>;

export type LedgerWriteBoundary = {
  readonly runExclusive: <TResult>(
    key: string,
    callback: () => Promise<TResult>,
  ) => Promise<TResult>;
};

export type LedgerMutationRunnerOptions<TTransaction> = {
  readonly store: LedgerMutationStore<TTransaction>;
  readonly writeBoundary: LedgerWriteBoundary;
  readonly authorize: (envelope: LedgerMutationEnvelope) => Promise<void> | void;
  readonly dispatchDomainEvents?: (
    events: readonly LedgerMutationDomainEvent[],
    envelope: LedgerMutationEnvelope,
  ) => Promise<void> | void;
  readonly dispatchBalanceDirtyRequests?: (
    requests: readonly BalanceDirtyRequest[],
    envelope: LedgerMutationEnvelope,
  ) => Promise<void> | void;
  readonly recordSyncOperationAccepted?: (
    entry: LedgerMutationSyncOperationLog,
  ) => Promise<void> | void;
  readonly receiptTtlMs?: number;
  readonly now?: () => Date;
};

export type LedgerMutationRunInput<TTransaction> = {
  readonly envelope: LedgerMutationEnvelope;
  readonly requestPayload: JsonObject;
  readonly handler: LedgerMutationHandler<TTransaction>;
};

type MaybePromise<T> = T | Promise<T>;
type SyncTransactionResult<T> = T extends PromiseLike<unknown> ? never : T;

export type CreateIdempotencyReceiptInput = {
  readonly workspaceId: SyncedId;
  readonly ledgerId: SyncedId;
  readonly actorUserId: SyncedId;
  readonly deviceId?: SyncedId | null;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly responseStatus: number;
  readonly responseBodyJson: JsonObject;
  readonly expiresAt: Date;
};

export type CreateAuditLogEntriesInput = {
  readonly envelope: LedgerMutationEnvelope;
  readonly entries: readonly LedgerMutationAuditEntry[];
};

export class LedgerMutationError extends Error {
  constructor(
    message: string,
    readonly code:
      | "IDEMPOTENCY_CONFLICT"
      | "INVALID_SYNC_OPERATION"
      | "LEDGER_NOT_FOUND"
      | "LEDGER_NOT_WRITABLE"
      | "MUTATION_FORBIDDEN"
      | "INVALID_MUTATION_RESPONSE",
  ) {
    super(message);
    this.name = "LedgerMutationError";
  }
}

export class LedgerMutationRunner<TTransaction> {
  readonly #options: Required<
    Pick<LedgerMutationRunnerOptions<TTransaction>, "receiptTtlMs" | "now">
  > &
    Omit<LedgerMutationRunnerOptions<TTransaction>, "receiptTtlMs" | "now">;

  constructor(options: LedgerMutationRunnerOptions<TTransaction>) {
    this.#options = {
      ...options,
      now: options.now ?? (() => new Date()),
      receiptTtlMs: options.receiptTtlMs ?? 24 * 60 * 60 * 1000,
    };
  }

  async run(input: LedgerMutationRunInput<TTransaction>): Promise<LedgerMutationRunResult> {
    assertAuthorizationContext(input.envelope);
    await this.#options.authorize(input.envelope);
    assertSyncOperationContext(input.envelope);

    const requestHash = await hashJson({
      envelope: {
        authorization: input.envelope.authorization,
        baseRevision: input.envelope.baseRevision ?? null,
        dryRun: input.envelope.dryRun,
        sideEffectFlags: input.envelope.sideEffectFlags,
        source: input.envelope.source,
        syncOperation: input.envelope.syncOperation ?? null,
        workspaceId: input.envelope.workspaceId,
        ledgerId: input.envelope.ledgerId,
      },
      payload: input.requestPayload,
    });
    const lockKey = `${input.envelope.workspaceId}:${input.envelope.ledgerId}`;
    const events: LedgerMutationDomainEvent[] = [];
    const auditEntries: LedgerMutationAuditEntry[] = [];
    const balanceDirtyRequests: BalanceDirtyRequest[] = [];

    const result = await this.#options.writeBoundary.runExclusive(lockKey, async () => {
      if (this.#options.store.executionMode === "sync") {
        return assertSyncValue(
          this.#options.store.transaction((store, transaction) =>
            this.#runSyncTransaction({
              auditEntries,
              balanceDirtyRequests,
              events,
              input,
              requestHash,
              store,
              transaction,
            }),
          ),
          "Synchronous ledger mutation transaction",
        );
      }

      return this.#options.store.transaction(async (store, transaction) =>
        this.#runAsyncTransaction({
          auditEntries,
          balanceDirtyRequests,
          events,
          input,
          requestHash,
          store,
          transaction,
        }),
      );
    });

    if (!result.idempotencyReplayed && !input.envelope.dryRun) {
      if (events.length > 0 && this.#options.dispatchDomainEvents) {
        await this.#options.dispatchDomainEvents(events, input.envelope);
      }

      if (balanceDirtyRequests.length > 0 && this.#options.dispatchBalanceDirtyRequests) {
        await this.#options.dispatchBalanceDirtyRequests(balanceDirtyRequests, input.envelope);
      }

      if (input.envelope.source === "sync" && this.#options.recordSyncOperationAccepted) {
        await this.#options.recordSyncOperationAccepted({
          envelope: input.envelope,
          requestHash,
          result,
        });
      }
    }

    return result;
  }

  #runSyncTransaction(
    input: LedgerTransactionExecutionInput<TTransaction>,
  ): LedgerMutationRunResult {
    const { auditEntries, balanceDirtyRequests, events, requestHash, store, transaction } = input;
    const envelope = input.input.envelope;

    if (envelope.idempotencyKey) {
      const receipt = assertSyncValue(
        store.findIdempotencyReceipt(envelope.actorUserId, envelope.idempotencyKey),
        "Synchronous idempotency lookup",
      );

      if (receipt) {
        if (isExpiredReceipt(receipt, this.#options.now())) {
          assertSyncValue(
            store.deleteIdempotencyReceipt(receipt.id),
            "Synchronous idempotency deletion",
          );
        } else {
          if (receipt.requestHash !== requestHash) {
            throw new LedgerMutationError(
              "Idempotency key was already used with a different request.",
              "IDEMPOTENCY_CONFLICT",
            );
          }

          return {
            body: receipt.responseBodyJson,
            idempotencyReplayed: true,
            status: receipt.responseStatus,
          };
        }
      }
    }

    const scope = assertSyncValue(
      store.findScope(envelope.workspaceId, envelope.ledgerId),
      "Synchronous ledger scope lookup",
    );

    if (!scope) {
      throw new LedgerMutationError("Ledger scope was not found.", "LEDGER_NOT_FOUND");
    }

    assertWritableScope(envelope, scope);

    const response = assertSyncValue(
      input.input.handler({
        envelope,
        transaction,
        emitEvent: (event) => events.push(event),
        recordAudit: (entry) => auditEntries.push(entry),
        markBalanceDirty: (request) => balanceDirtyRequests.push(request),
      }),
      "Synchronous ledger mutation handler",
    );
    assertMutationResponse(response);

    if (auditEntries.length > 0 && !envelope.dryRun) {
      assertSyncValue(
        store.createAuditLogEntries({
          entries: auditEntries,
          envelope,
        }),
        "Synchronous audit log insert",
      );
    }

    if (envelope.idempotencyKey && !envelope.dryRun) {
      const expiresAt = new Date(this.#options.now().getTime() + this.#options.receiptTtlMs);
      assertSyncValue(
        store.createIdempotencyReceipt({
          actorUserId: envelope.actorUserId,
          deviceId: envelope.deviceId ?? null,
          expiresAt,
          idempotencyKey: envelope.idempotencyKey,
          ledgerId: envelope.ledgerId,
          requestHash,
          responseBodyJson: response.body,
          responseStatus: response.status,
          workspaceId: envelope.workspaceId,
        }),
        "Synchronous idempotency receipt insert",
      );
    }

    return { ...response, idempotencyReplayed: false };
  }

  async #runAsyncTransaction(
    input: LedgerTransactionExecutionInput<TTransaction>,
  ): Promise<LedgerMutationRunResult> {
    const { auditEntries, balanceDirtyRequests, events, requestHash, store, transaction } = input;
    const envelope = input.input.envelope;

    if (envelope.idempotencyKey) {
      const receipt = await store.findIdempotencyReceipt(
        envelope.actorUserId,
        envelope.idempotencyKey,
      );

      if (receipt) {
        if (isExpiredReceipt(receipt, this.#options.now())) {
          await store.deleteIdempotencyReceipt(receipt.id);
        } else {
          if (receipt.requestHash !== requestHash) {
            throw new LedgerMutationError(
              "Idempotency key was already used with a different request.",
              "IDEMPOTENCY_CONFLICT",
            );
          }

          return {
            body: receipt.responseBodyJson,
            idempotencyReplayed: true,
            status: receipt.responseStatus,
          };
        }
      }
    }

    const scope = await store.findScope(envelope.workspaceId, envelope.ledgerId);

    if (!scope) {
      throw new LedgerMutationError("Ledger scope was not found.", "LEDGER_NOT_FOUND");
    }

    assertWritableScope(envelope, scope);

    const response = await input.input.handler({
      envelope,
      transaction,
      emitEvent: (event) => events.push(event),
      recordAudit: (entry) => auditEntries.push(entry),
      markBalanceDirty: (request) => balanceDirtyRequests.push(request),
    });
    assertMutationResponse(response);

    if (auditEntries.length > 0 && !envelope.dryRun) {
      await store.createAuditLogEntries({
        entries: auditEntries,
        envelope,
      });
    }

    if (envelope.idempotencyKey && !envelope.dryRun) {
      const expiresAt = new Date(this.#options.now().getTime() + this.#options.receiptTtlMs);
      await store.createIdempotencyReceipt({
        actorUserId: envelope.actorUserId,
        deviceId: envelope.deviceId ?? null,
        expiresAt,
        idempotencyKey: envelope.idempotencyKey,
        ledgerId: envelope.ledgerId,
        requestHash,
        responseBodyJson: response.body,
        responseStatus: response.status,
        workspaceId: envelope.workspaceId,
      });
    }

    return { ...response, idempotencyReplayed: false };
  }
}

type LedgerTransactionExecutionInput<TTransaction> = {
  readonly auditEntries: LedgerMutationAuditEntry[];
  readonly balanceDirtyRequests: BalanceDirtyRequest[];
  readonly events: LedgerMutationDomainEvent[];
  readonly input: LedgerMutationRunInput<TTransaction>;
  readonly requestHash: string;
  readonly store: LedgerMutationTransactionalStore;
  readonly transaction: TTransaction;
};

export function createInProcessLedgerWriteBoundary(): LedgerWriteBoundary {
  const tails = new Map<string, Promise<void>>();

  return {
    async runExclusive(key, callback) {
      const previous = tails.get(key) ?? Promise.resolve();
      let release: () => void = () => undefined;
      const current = new Promise<void>((resolve) => {
        release = resolve;
      });
      const tail = previous.then(() => current);
      tails.set(key, tail);

      await previous;

      try {
        return await callback();
      } finally {
        release();
        if (tails.get(key) === tail) {
          tails.delete(key);
        }
      }
    },
  };
}

type SqliteTransaction = Parameters<Parameters<SqliteDatabase["transaction"]>[0]>[0];
type PostgresTransaction = Parameters<Parameters<PostgresDatabase["transaction"]>[0]>[0];

export function createSqliteLedgerMutationStore(
  db: SqliteDatabase,
  options: { readonly createId: RepositoryIdGenerator; readonly now?: () => Date },
): LedgerMutationStore<SqliteTransaction> {
  return {
    executionMode: "sync",
    transaction<TResult>(
      callback: (
        transactionalStore: LedgerMutationTransactionalStore,
        transaction: SqliteTransaction,
      ) => SyncTransactionResult<TResult>,
    ) {
      const result = db.transaction(
        (tx) => {
          const value = assertSyncValue(
            callback(createSqliteTransactionalStore(tx, options), tx),
            "Synchronous SQLite ledger mutation store callback",
          );
          return value as never;
        },
        { behavior: "immediate" },
      );

      return result as SyncTransactionResult<TResult>;
    },
  };
}

export function createPostgresLedgerMutationStore(
  db: PostgresDatabase,
  options: { readonly createId: RepositoryIdGenerator; readonly now?: () => Date },
): LedgerMutationStore<PostgresTransaction> {
  return {
    executionMode: "async",
    async transaction(callback) {
      return db.transaction(
        async (tx) => await callback(createPostgresTransactionalStore(tx, options), tx),
      );
    },
  };
}

function createSqliteTransactionalStore(
  tx: SqliteTransaction,
  options: { readonly createId: RepositoryIdGenerator; readonly now?: () => Date },
): LedgerMutationTransactionalStore {
  return {
    findScope(workspaceId, ledgerId) {
      const workspaceRows = tx
        .select()
        .from(sqliteWorkspaces)
        .where(eq(sqliteWorkspaces.id, workspaceId))
        .limit(1)
        .all();
      const ledgerRows = tx
        .select()
        .from(sqliteLedgers)
        .where(and(eq(sqliteLedgers.id, ledgerId), eq(sqliteLedgers.workspaceId, workspaceId)))
        .limit(1)
        .all();

      return workspaceRows[0] && ledgerRows[0]
        ? { workspace: toWorkspaceRecord(workspaceRows[0]), ledger: toLedgerRecord(ledgerRows[0]) }
        : null;
    },

    findIdempotencyReceipt(actorUserId, idempotencyKey) {
      const rows = tx
        .select()
        .from(sqliteIdempotencyReceipts)
        .where(
          and(
            eq(sqliteIdempotencyReceipts.actorUserId, actorUserId),
            eq(sqliteIdempotencyReceipts.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1)
        .all();

      return rows[0] ? toIdempotencyReceiptRecord(rows[0]) : null;
    },

    createIdempotencyReceipt(input) {
      const now = (options.now ?? (() => new Date()))().toISOString();
      const rows = tx
        .insert(sqliteIdempotencyReceipts)
        .values({
          id: options.createId(),
          workspaceId: input.workspaceId,
          ledgerId: input.ledgerId,
          actorUserId: input.actorUserId,
          deviceId: input.deviceId ?? null,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          responseStatus: input.responseStatus,
          responseBodyJson: input.responseBodyJson,
          createdAt: now,
          expiresAt: input.expiresAt.toISOString(),
        })
        .returning()
        .all();

      const row = rows[0];
      if (!row) {
        throw new Error("Idempotency receipt insert did not return a row");
      }

      return toIdempotencyReceiptRecord(row);
    },

    deleteIdempotencyReceipt(id) {
      tx.delete(sqliteIdempotencyReceipts).where(eq(sqliteIdempotencyReceipts.id, id)).run();
    },

    createAuditLogEntries(input) {
      const now = (options.now ?? (() => new Date()))().toISOString();
      tx.insert(sqliteAuditLog)
        .values(
          input.entries.map((entry) => ({
            id: options.createId(),
            workspaceId: input.envelope.workspaceId,
            ledgerId: input.envelope.ledgerId,
            actorUserId: input.envelope.actorUserId,
            action: entry.action,
            entityType: entry.entityType,
            entityId: entry.entityId,
            metadataJson: entry.metadataJson,
            createdAt: now,
          })),
        )
        .run();

      return input.entries;
    },
  };
}

function createPostgresTransactionalStore(
  tx: PostgresTransaction,
  options: { readonly createId: RepositoryIdGenerator; readonly now?: () => Date },
): LedgerMutationTransactionalStore {
  return {
    async findScope(workspaceId, ledgerId) {
      const workspaceRows = await tx
        .select()
        .from(pgWorkspaces)
        .where(eq(pgWorkspaces.id, workspaceId))
        .limit(1);
      const ledgerRows = await tx
        .select()
        .from(pgLedgers)
        .where(and(eq(pgLedgers.id, ledgerId), eq(pgLedgers.workspaceId, workspaceId)))
        .limit(1);

      return workspaceRows[0] && ledgerRows[0]
        ? { workspace: toWorkspaceRecord(workspaceRows[0]), ledger: toLedgerRecord(ledgerRows[0]) }
        : null;
    },

    async findIdempotencyReceipt(actorUserId, idempotencyKey) {
      const rows = await tx
        .select()
        .from(pgIdempotencyReceipts)
        .where(
          and(
            eq(pgIdempotencyReceipts.actorUserId, actorUserId),
            eq(pgIdempotencyReceipts.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);

      return rows[0] ? toIdempotencyReceiptRecord(rows[0]) : null;
    },

    async createIdempotencyReceipt(input) {
      const rows = await tx
        .insert(pgIdempotencyReceipts)
        .values({
          id: options.createId(),
          workspaceId: input.workspaceId,
          ledgerId: input.ledgerId,
          actorUserId: input.actorUserId,
          deviceId: input.deviceId ?? null,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          responseStatus: input.responseStatus,
          responseBodyJson: input.responseBodyJson,
          createdAt: (options.now ?? (() => new Date()))(),
          expiresAt: input.expiresAt,
        })
        .returning();

      const row = rows[0];
      if (!row) {
        throw new Error("Idempotency receipt insert did not return a row");
      }

      return toIdempotencyReceiptRecord(row);
    },

    async deleteIdempotencyReceipt(id) {
      await tx.delete(pgIdempotencyReceipts).where(eq(pgIdempotencyReceipts.id, id));
    },

    async createAuditLogEntries(input) {
      const now = (options.now ?? (() => new Date()))();
      await tx.insert(pgAuditLog).values(
        input.entries.map((entry) => ({
          id: options.createId(),
          workspaceId: input.envelope.workspaceId,
          ledgerId: input.envelope.ledgerId,
          actorUserId: input.envelope.actorUserId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          metadataJson: entry.metadataJson,
          createdAt: now,
        })),
      );

      return input.entries;
    },
  };
}

function assertWritableScope(envelope: LedgerMutationEnvelope, scope: LedgerMutationScope): void {
  if (scope.workspace.archivedAt || scope.ledger.archivedAt) {
    throw new LedgerMutationError("Ledger scope is archived.", "LEDGER_NOT_WRITABLE");
  }

  const allowedStatuses =
    envelope.source === "maintenance" ? new Set(["active", "maintenance"]) : new Set(["active"]);

  if (!allowedStatuses.has(scope.workspace.status) || !allowedStatuses.has(scope.ledger.status)) {
    throw new LedgerMutationError("Ledger scope is not writable.", "LEDGER_NOT_WRITABLE");
  }
}

function assertSyncOperationContext(envelope: LedgerMutationEnvelope): void {
  if (envelope.source === "sync" && !envelope.syncOperation) {
    throw new LedgerMutationError(
      "Sync mutations require operation metadata.",
      "INVALID_SYNC_OPERATION",
    );
  }

  if (envelope.source !== "sync" && envelope.syncOperation) {
    throw new LedgerMutationError(
      "Only sync mutations can include operation metadata.",
      "INVALID_SYNC_OPERATION",
    );
  }
}

function assertAuthorizationContext(envelope: LedgerMutationEnvelope): void {
  const authorization = envelope.authorization;

  if (!authorization?.action || !authorization.subject) {
    throw new LedgerMutationError(
      "Ledger mutation authorization context is required.",
      "MUTATION_FORBIDDEN",
    );
  }
}

function assertMutationResponse(response: LedgerMutationResponse): void {
  if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599) {
    throw new LedgerMutationError(
      "Mutation handler returned an invalid status.",
      "INVALID_MUTATION_RESPONSE",
    );
  }
}

function assertSyncValue<TValue>(value: MaybePromise<TValue>, label: string): TValue {
  if (isPromiseLike(value)) {
    throw new Error(`${label} returned a promise inside a synchronous SQLite transaction.`);
  }

  return value;
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { readonly then?: unknown }).then === "function"
  );
}

function isExpiredReceipt(receipt: IdempotencyReceiptRecord, now: Date): boolean {
  const expiresAt = Date.parse(receipt.expiresAt);
  return Number.isNaN(expiresAt) || expiresAt <= now.getTime();
}

async function hashJson(value: unknown): Promise<string> {
  const data = new TextEncoder().encode(stableStringify(value));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(",")}}`;
}

function toIdempotencyReceiptRecord(
  row: typeof sqliteIdempotencyReceipts.$inferSelect | typeof pgIdempotencyReceipts.$inferSelect,
): IdempotencyReceiptRecord {
  return {
    id: row.id as SyncedId,
    workspaceId: row.workspaceId as SyncedId,
    ledgerId: row.ledgerId as SyncedId | null,
    actorUserId: row.actorUserId as SyncedId,
    deviceId: row.deviceId as SyncedId | null,
    idempotencyKey: row.idempotencyKey,
    requestHash: row.requestHash,
    responseStatus: row.responseStatus,
    responseBodyJson: row.responseBodyJson,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : row.expiresAt,
  };
}
