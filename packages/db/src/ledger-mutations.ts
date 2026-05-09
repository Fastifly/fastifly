import type { SyncedId } from "@fastifly/common";
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

export type LedgerMutationEnvelope = {
  readonly requestId: string;
  readonly actorUserId: SyncedId;
  readonly deviceId?: SyncedId | null;
  readonly workspaceId: SyncedId;
  readonly ledgerId: SyncedId;
  readonly idempotencyKey?: string | null;
  readonly baseRevision?: number | null;
  readonly source: LedgerMutationSource;
  readonly dryRun: boolean;
  readonly sideEffectFlags: LedgerMutationSideEffectFlags;
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

export type LedgerMutationHandlerContext<TTransaction> = {
  readonly envelope: LedgerMutationEnvelope;
  readonly transaction: TTransaction;
  readonly emitEvent: (event: LedgerMutationDomainEvent) => void;
  readonly recordAudit: (entry: LedgerMutationAuditEntry) => void;
  readonly markBalanceDirty: (request: BalanceDirtyRequest) => void;
};

export type LedgerMutationHandler<TTransaction> = (
  context: LedgerMutationHandlerContext<TTransaction>,
) => Promise<LedgerMutationResponse> | LedgerMutationResponse;

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
  ) => Promise<LedgerMutationScope | null>;
  readonly findIdempotencyReceipt: (
    actorUserId: SyncedId,
    idempotencyKey: string,
  ) => Promise<IdempotencyReceiptRecord | null>;
  readonly createIdempotencyReceipt: (
    input: CreateIdempotencyReceiptInput,
  ) => Promise<IdempotencyReceiptRecord>;
  readonly createAuditLogEntries: (
    input: CreateAuditLogEntriesInput,
  ) => Promise<readonly LedgerMutationAuditEntry[]>;
};

export type LedgerMutationStore<TTransaction> = {
  readonly transaction: <TResult>(
    callback: (
      transactionalStore: LedgerMutationTransactionalStore,
      transaction: TTransaction,
    ) => Promise<TResult>,
  ) => Promise<TResult>;
};

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
  readonly receiptTtlMs?: number;
  readonly now?: () => Date;
};

export type LedgerMutationRunInput<TTransaction> = {
  readonly envelope: LedgerMutationEnvelope;
  readonly requestPayload: JsonObject;
  readonly handler: LedgerMutationHandler<TTransaction>;
};

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
      | "LEDGER_NOT_FOUND"
      | "LEDGER_NOT_WRITABLE"
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
    await this.#options.authorize(input.envelope);

    const requestHash = await hashJson({
      envelope: {
        baseRevision: input.envelope.baseRevision ?? null,
        source: input.envelope.source,
        workspaceId: input.envelope.workspaceId,
        ledgerId: input.envelope.ledgerId,
      },
      payload: input.requestPayload,
    });
    const lockKey = `${input.envelope.workspaceId}:${input.envelope.ledgerId}`;
    const events: LedgerMutationDomainEvent[] = [];
    const auditEntries: LedgerMutationAuditEntry[] = [];
    const balanceDirtyRequests: BalanceDirtyRequest[] = [];

    const result = await this.#options.writeBoundary.runExclusive(lockKey, async () =>
      this.#options.store.transaction(async (store, transaction) => {
        if (input.envelope.idempotencyKey) {
          const receipt = await store.findIdempotencyReceipt(
            input.envelope.actorUserId,
            input.envelope.idempotencyKey,
          );

          if (receipt) {
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

        const scope = await store.findScope(input.envelope.workspaceId, input.envelope.ledgerId);

        if (!scope) {
          throw new LedgerMutationError("Ledger scope was not found.", "LEDGER_NOT_FOUND");
        }

        assertWritableScope(input.envelope, scope);

        const response = await input.handler({
          envelope: input.envelope,
          transaction,
          emitEvent: (event) => events.push(event),
          recordAudit: (entry) => auditEntries.push(entry),
          markBalanceDirty: (request) => balanceDirtyRequests.push(request),
        });
        assertMutationResponse(response);

        if (auditEntries.length > 0 && !input.envelope.dryRun) {
          await store.createAuditLogEntries({
            entries: auditEntries,
            envelope: input.envelope,
          });
        }

        if (input.envelope.idempotencyKey && !input.envelope.dryRun) {
          const expiresAt = new Date(this.#options.now().getTime() + this.#options.receiptTtlMs);
          await store.createIdempotencyReceipt({
            actorUserId: input.envelope.actorUserId,
            deviceId: input.envelope.deviceId ?? null,
            expiresAt,
            idempotencyKey: input.envelope.idempotencyKey,
            ledgerId: input.envelope.ledgerId,
            requestHash,
            responseBodyJson: response.body,
            responseStatus: response.status,
            workspaceId: input.envelope.workspaceId,
          });
        }

        return { ...response, idempotencyReplayed: false };
      }),
    );

    if (!result.idempotencyReplayed && !input.envelope.dryRun) {
      if (events.length > 0 && this.#options.dispatchDomainEvents) {
        await this.#options.dispatchDomainEvents(events, input.envelope);
      }

      if (balanceDirtyRequests.length > 0 && this.#options.dispatchBalanceDirtyRequests) {
        await this.#options.dispatchBalanceDirtyRequests(balanceDirtyRequests, input.envelope);
      }
    }

    return result;
  }
}

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
    async transaction(callback) {
      return db.transaction(async (tx) =>
        callback(createSqliteTransactionalStore(tx, options), tx),
      );
    },
  };
}

export function createPostgresLedgerMutationStore(
  db: PostgresDatabase,
  options: { readonly createId: RepositoryIdGenerator; readonly now?: () => Date },
): LedgerMutationStore<PostgresTransaction> {
  return {
    async transaction(callback) {
      return db.transaction(async (tx) =>
        callback(createPostgresTransactionalStore(tx, options), tx),
      );
    },
  };
}

function createSqliteTransactionalStore(
  tx: SqliteTransaction,
  options: { readonly createId: RepositoryIdGenerator; readonly now?: () => Date },
): LedgerMutationTransactionalStore {
  return {
    async findScope(workspaceId, ledgerId) {
      const workspaceRows = await tx
        .select()
        .from(sqliteWorkspaces)
        .where(eq(sqliteWorkspaces.id, workspaceId))
        .limit(1);
      const ledgerRows = await tx
        .select()
        .from(sqliteLedgers)
        .where(and(eq(sqliteLedgers.id, ledgerId), eq(sqliteLedgers.workspaceId, workspaceId)))
        .limit(1);

      return workspaceRows[0] && ledgerRows[0]
        ? { workspace: toWorkspaceRecord(workspaceRows[0]), ledger: toLedgerRecord(ledgerRows[0]) }
        : null;
    },

    async findIdempotencyReceipt(actorUserId, idempotencyKey) {
      const rows = await tx
        .select()
        .from(sqliteIdempotencyReceipts)
        .where(
          and(
            eq(sqliteIdempotencyReceipts.actorUserId, actorUserId),
            eq(sqliteIdempotencyReceipts.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);

      return rows[0] ? toIdempotencyReceiptRecord(rows[0]) : null;
    },

    async createIdempotencyReceipt(input) {
      const now = (options.now ?? (() => new Date()))().toISOString();
      const rows = await tx
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
        .returning();

      const row = rows[0];
      if (!row) {
        throw new Error("Idempotency receipt insert did not return a row");
      }

      return toIdempotencyReceiptRecord(row);
    },

    async createAuditLogEntries(input) {
      const now = (options.now ?? (() => new Date()))().toISOString();
      await tx.insert(sqliteAuditLog).values(
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

function assertMutationResponse(response: LedgerMutationResponse): void {
  if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599) {
    throw new LedgerMutationError(
      "Mutation handler returned an invalid status.",
      "INVALID_MUTATION_RESPONSE",
    );
  }
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
