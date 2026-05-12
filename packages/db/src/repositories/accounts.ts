import {
  type AccountKind,
  AccountKindSchema,
  type AccountSubtype,
  AccountSubtypeSchema,
  createUuidV7,
  encodeFinanceCursor,
  isUserHeldAccountKind,
  type LedgerScope,
  parseFinanceCursor,
  parseSyncedId,
  type SyncedId,
} from "@fastifly/common";
import { and, asc, eq, gt, isNull, ne, or, sql } from "drizzle-orm";

import type { PostgresDatabase } from "../postgres/client.js";
import {
  pgAccounts,
  pgLedgers,
  pgTransactionGroups,
  pgTransactionJournals,
  pgTransactionPostings,
} from "../postgres/schema.js";
import type { SqliteClient } from "../sqlite/client.js";
import {
  bindSqliteMoneyMinor,
  prepareSqliteMoneyStatement,
  readRequiredSqliteMoneyMinor,
  readSqliteMoneyMinor,
} from "../sqlite/money.js";
import type { RepositoryClock, RepositoryListPage } from "./base.js";
import { assertLedgerScope, makeTimestamp, systemClock } from "./base.js";

const OPENING_BALANCE_ACCOUNT_NAME_PREFIX = "Opening Balances";

export type AccountRepositoryOptions = {
  readonly clock?: RepositoryClock;
  readonly createId?: () => SyncedId;
};

export type AccountRecord = {
  readonly id: SyncedId;
  readonly workspaceId: SyncedId;
  readonly ledgerId: SyncedId;
  readonly name: string;
  readonly kind: AccountKind;
  readonly subtype: AccountSubtype;
  readonly currencyCode: string;
  readonly openingBalanceMinor: bigint | null;
  readonly openingBalanceDate: string | null;
  readonly isActive: boolean;
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AccountBalanceRecord = {
  readonly accountId: SyncedId;
  readonly currencyCode: string;
  readonly balanceMinor: bigint;
  readonly reportingCurrencyCode: string;
  readonly reportingBalanceMinor: bigint;
};

export type CreateAccountInput = LedgerScope & {
  readonly name: string;
  readonly kind: AccountKind;
  readonly subtype: AccountSubtype;
  readonly currencyCode: string;
  readonly openingBalanceMinor?: bigint | null;
  readonly openingBalanceDate?: string | null;
  readonly createdBy?: SyncedId | null;
};

export type CreateAccountResult = {
  readonly account: AccountRecord;
  readonly openingBalanceGroupId: SyncedId | null;
  readonly openingBalanceJournalId: SyncedId | null;
};

export type ArchiveAccountInput = LedgerScope & {
  readonly accountId: SyncedId;
};

export type FindAccountInput = LedgerScope & {
  readonly accountId: SyncedId;
};

export type ListAccountsInput = LedgerScope & {
  readonly cursor?: string | null;
  readonly limit?: number | null;
};

export type AccountRepository = {
  readonly createAccount: (input: CreateAccountInput) => MaybePromise<CreateAccountResult>;
  readonly archiveAccount: (input: ArchiveAccountInput) => MaybePromise<AccountRecord | null>;
  readonly findAccount: (input: FindAccountInput) => MaybePromise<AccountRecord | null>;
  readonly listAccounts: (
    input: ListAccountsInput,
  ) => MaybePromise<RepositoryListPage<AccountRecord>>;
  readonly getAccountBalance: (
    input: FindAccountInput,
  ) => MaybePromise<AccountBalanceRecord | null>;
};

type MaybePromise<T> = T | Promise<T>;

type ResolvedOptions = {
  readonly clock: RepositoryClock;
  readonly createId: () => SyncedId;
};

type SqliteAccountRow = {
  readonly id: string;
  readonly workspace_id: string;
  readonly ledger_id: string;
  readonly name: string;
  readonly kind: string;
  readonly subtype: string;
  readonly currency_code: string;
  readonly opening_balance_minor: bigint | number | string | null;
  readonly opening_balance_date: string | null;
  readonly is_active: bigint | boolean | number | string;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

type SqliteBalanceRow = {
  readonly account_id: string;
  readonly currency_code: string;
  readonly balance_minor: bigint | number | string;
  readonly reporting_currency_code: string | null;
  readonly reporting_balance_minor: bigint | number | string;
};

type PostgresTransaction = Parameters<Parameters<PostgresDatabase["transaction"]>[0]>[0];
type PostgresExecutor = PostgresDatabase | PostgresTransaction;

function defaultCreateId(): SyncedId {
  return createUuidV7();
}

function resolveOptions(options?: AccountRepositoryOptions): ResolvedOptions {
  return {
    clock: options?.clock ?? systemClock,
    createId: options?.createId ?? defaultCreateId,
  };
}

export function createSqliteAccountRepository(
  client: SqliteClient,
  options?: AccountRepositoryOptions,
): AccountRepository {
  const resolved = resolveOptions(options);

  return {
    createAccount(input) {
      const scope = assertLedgerScope(input);
      const normalized = normalizeCreateAccountInput(input);
      const now = makeTimestamp(resolved.clock);

      return client
        .transaction(() => {
          assertSqliteLedgerScope(client, scope);
          maybeAlignSqliteLedgerBaseCurrencyBeforeFirstJournal(client, {
            currencyCode: normalized.currencyCode,
            kind: normalized.kind,
            ledgerId: scope.ledgerId,
            now,
            workspaceId: scope.workspaceId,
          });
          const account = insertSqliteAccount(client, {
            ...normalized,
            id: resolved.createId(),
            now,
            workspaceId: scope.workspaceId,
            ledgerId: scope.ledgerId,
          });
          const openingBalance = hasOpeningBalance(normalized)
            ? insertSqliteOpeningBalance(client, {
                account,
                amountMinor: normalized.openingBalanceMinor,
                createdBy: input.createdBy ?? null,
                createId: resolved.createId,
                now,
                openingBalanceDate: normalized.openingBalanceDate,
              })
            : null;

          return {
            account,
            openingBalanceGroupId: openingBalance?.groupId ?? null,
            openingBalanceJournalId: openingBalance?.journalId ?? null,
          };
        })
        .immediate();
    },

    archiveAccount(input) {
      const scope = assertLedgerScope(input);
      const archivedAt = makeTimestamp(resolved.clock);
      const row = client
        .prepare<unknown[], SqliteAccountRow>(
          `
            UPDATE accounts
            SET is_active = 0, archived_at = ?, updated_at = ?
            WHERE id = ?
              AND workspace_id = ?
              AND ledger_id = ?
              AND archived_at IS NULL
            RETURNING *
          `,
        )
        .get(archivedAt, archivedAt, input.accountId, scope.workspaceId, scope.ledgerId);

      return row ? toSqliteAccountRecord(row) : null;
    },

    findAccount(input) {
      const scope = assertLedgerScope(input);
      const row = prepareSqliteMoneyStatement<SqliteAccountRow>(
        client,
        `
          SELECT *
          FROM accounts
          WHERE id = ?
            AND workspace_id = ?
            AND ledger_id = ?
          LIMIT 1
        `,
      ).get(input.accountId, scope.workspaceId, scope.ledgerId);

      return row ? toSqliteAccountRecord(row) : null;
    },

    listAccounts(scopeInput) {
      const scope = assertLedgerScope(scopeInput);
      const limit = normalizeAccountQueryLimit(scopeInput.limit);
      const cursor = scopeInput.cursor
        ? parseFinanceCursor(scopeInput.cursor, "account.name.asc")
        : null;
      const cursorClause = cursor ? "AND (name > ? OR (name = ? AND id > ?))" : "";
      const params = cursor
        ? [scope.workspaceId, scope.ledgerId, cursor.sortKey, cursor.sortKey, cursor.id, limit + 1]
        : [scope.workspaceId, scope.ledgerId, limit + 1];
      const rows = prepareSqliteMoneyStatement<SqliteAccountRow>(
        client,
        `
          SELECT *
          FROM accounts
          WHERE workspace_id = ?
            AND ledger_id = ?
            AND is_active = 1
            AND archived_at IS NULL
            AND NOT (kind = 'equity' AND subtype IN ('opening_helper', 'reconciliation_helper'))
            ${cursorClause}
          ORDER BY name, id
          LIMIT ?
        `,
      ).all(...params);

      return makeAccountListPage(rows.map(toSqliteAccountRecord), limit);
    },

    getAccountBalance(input) {
      const scope = assertLedgerScope(input);
      const row = prepareSqliteMoneyStatement<SqliteBalanceRow>(
        client,
        `
          SELECT
            accounts.id AS account_id,
            accounts.currency_code,
            COALESCE(SUM(
              CASE
                WHEN transaction_journals.id IS NOT NULL
                  AND transaction_journals.deleted_at IS NULL
                  AND transaction_journals.status <> 'void'
                THEN transaction_postings.amount_minor
                ELSE 0
              END
            ), 0) AS balance_minor,
            COALESCE(MAX(transaction_postings.reporting_currency_code), accounts.currency_code) AS reporting_currency_code,
            COALESCE(SUM(
              CASE
                WHEN transaction_journals.id IS NOT NULL
                  AND transaction_journals.deleted_at IS NULL
                  AND transaction_journals.status <> 'void'
                THEN transaction_postings.reporting_amount_minor
                ELSE 0
              END
            ), 0) AS reporting_balance_minor
          FROM accounts
          LEFT JOIN transaction_postings
            ON transaction_postings.account_id = accounts.id
            AND transaction_postings.workspace_id = accounts.workspace_id
            AND transaction_postings.ledger_id = accounts.ledger_id
          LEFT JOIN transaction_journals
            ON transaction_journals.id = transaction_postings.journal_id
            AND transaction_journals.workspace_id = accounts.workspace_id
            AND transaction_journals.ledger_id = accounts.ledger_id
          WHERE accounts.id = ?
            AND accounts.workspace_id = ?
            AND accounts.ledger_id = ?
          GROUP BY accounts.id, accounts.currency_code
          LIMIT 1
        `,
      ).get(input.accountId, scope.workspaceId, scope.ledgerId);

      return row ? toSqliteBalanceRecord(row) : null;
    },
  };
}

export function createPostgresAccountRepository(
  db: PostgresExecutor,
  options?: AccountRepositoryOptions,
): AccountRepository {
  const resolved = resolveOptions(options);

  return {
    async createAccount(input) {
      const scope = assertLedgerScope(input);
      const normalized = normalizeCreateAccountInput(input);

      return runPostgresWrite(db, async (tx) => {
        const now = resolved.clock.now();
        await assertPostgresLedgerScope(tx, scope);
        await maybeAlignPostgresLedgerBaseCurrencyBeforeFirstJournal(tx, {
          currencyCode: normalized.currencyCode,
          kind: normalized.kind,
          ledgerId: scope.ledgerId,
          now,
          workspaceId: scope.workspaceId,
        });
        const accountRow = assertCreated(
          await tx
            .insert(pgAccounts)
            .values({
              id: resolved.createId(),
              workspaceId: scope.workspaceId,
              ledgerId: scope.ledgerId,
              name: normalized.name,
              kind: normalized.kind,
              subtype: normalized.subtype,
              currencyCode: normalized.currencyCode,
              openingBalanceMinor: normalized.openingBalanceMinor,
              openingBalanceDate: normalized.openingBalanceDate,
              isActive: true,
              createdAt: now,
              updatedAt: now,
            })
            .returning(),
          "Account",
        );
        const account = toPostgresAccountRecord(accountRow);
        const openingBalance = hasOpeningBalance(normalized)
          ? await insertPostgresOpeningBalance(tx, {
              account,
              amountMinor: normalized.openingBalanceMinor,
              createdBy: input.createdBy ?? null,
              createId: resolved.createId,
              now,
              openingBalanceDate: normalized.openingBalanceDate,
            })
          : null;

        return {
          account,
          openingBalanceGroupId: openingBalance?.groupId ?? null,
          openingBalanceJournalId: openingBalance?.journalId ?? null,
        };
      });
    },

    async archiveAccount(input) {
      const scope = assertLedgerScope(input);
      const archivedAt = resolved.clock.now();
      const rows = await db
        .update(pgAccounts)
        .set({ archivedAt, isActive: false, updatedAt: archivedAt })
        .where(
          and(
            eq(pgAccounts.id, input.accountId),
            eq(pgAccounts.workspaceId, scope.workspaceId),
            eq(pgAccounts.ledgerId, scope.ledgerId),
            isNull(pgAccounts.archivedAt),
          ),
        )
        .returning();

      return rows[0] ? toPostgresAccountRecord(rows[0]) : null;
    },

    async findAccount(input) {
      const scope = assertLedgerScope(input);
      const rows = await db
        .select()
        .from(pgAccounts)
        .where(
          and(
            eq(pgAccounts.id, input.accountId),
            eq(pgAccounts.workspaceId, scope.workspaceId),
            eq(pgAccounts.ledgerId, scope.ledgerId),
          ),
        )
        .limit(1);

      return rows[0] ? toPostgresAccountRecord(rows[0]) : null;
    },

    async listAccounts(scopeInput) {
      const scope = assertLedgerScope(scopeInput);
      const limit = normalizeAccountQueryLimit(scopeInput.limit);
      const cursor = scopeInput.cursor
        ? parseFinanceCursor(scopeInput.cursor, "account.name.asc")
        : null;
      const rows = await db
        .select()
        .from(pgAccounts)
        .where(
          and(
            eq(pgAccounts.workspaceId, scope.workspaceId),
            eq(pgAccounts.ledgerId, scope.ledgerId),
            eq(pgAccounts.isActive, true),
            isNull(pgAccounts.archivedAt),
            sql`NOT (${pgAccounts.kind} = 'equity' AND ${pgAccounts.subtype} IN ('opening_helper', 'reconciliation_helper'))`,
            cursor
              ? or(
                  gt(pgAccounts.name, cursor.sortKey),
                  and(eq(pgAccounts.name, cursor.sortKey), gt(pgAccounts.id, cursor.id)),
                )
              : undefined,
          ),
        )
        .orderBy(asc(pgAccounts.name), asc(pgAccounts.id))
        .limit(limit + 1);

      return makeAccountListPage(rows.map(toPostgresAccountRecord), limit);
    },

    async getAccountBalance(input) {
      const scope = assertLedgerScope(input);
      const rows = await db
        .select({
          accountId: pgAccounts.id,
          balanceMinor: sql<bigint>`COALESCE(SUM(
            CASE
              WHEN ${pgTransactionJournals.id} IS NOT NULL
                AND ${pgTransactionJournals.deletedAt} IS NULL
                AND ${pgTransactionJournals.status} <> 'void'
              THEN ${pgTransactionPostings.amountMinor}
              ELSE 0
            END
          ), 0)::bigint`,
          currencyCode: pgAccounts.currencyCode,
          reportingBalanceMinor: sql<bigint>`COALESCE(SUM(
            CASE
              WHEN ${pgTransactionJournals.id} IS NOT NULL
                AND ${pgTransactionJournals.deletedAt} IS NULL
                AND ${pgTransactionJournals.status} <> 'void'
              THEN ${pgTransactionPostings.reportingAmountMinor}
              ELSE 0
            END
          ), 0)::bigint`,
          reportingCurrencyCode: sql<string>`COALESCE(MAX(${pgTransactionPostings.reportingCurrencyCode}), ${pgAccounts.currencyCode})`,
        })
        .from(pgAccounts)
        .leftJoin(
          pgTransactionPostings,
          and(
            eq(pgTransactionPostings.accountId, pgAccounts.id),
            eq(pgTransactionPostings.workspaceId, pgAccounts.workspaceId),
            eq(pgTransactionPostings.ledgerId, pgAccounts.ledgerId),
          ),
        )
        .leftJoin(
          pgTransactionJournals,
          and(
            eq(pgTransactionJournals.id, pgTransactionPostings.journalId),
            eq(pgTransactionJournals.workspaceId, pgAccounts.workspaceId),
            eq(pgTransactionJournals.ledgerId, pgAccounts.ledgerId),
          ),
        )
        .where(
          and(
            eq(pgAccounts.id, input.accountId),
            eq(pgAccounts.workspaceId, scope.workspaceId),
            eq(pgAccounts.ledgerId, scope.ledgerId),
          ),
        )
        .groupBy(pgAccounts.id, pgAccounts.currencyCode)
        .limit(1);

      const row = rows[0];
      return row
        ? {
            accountId: parseSyncedId(row.accountId),
            balanceMinor: readPostgresMoneyMinor(row.balanceMinor),
            currencyCode: row.currencyCode,
            reportingBalanceMinor: readPostgresMoneyMinor(row.reportingBalanceMinor),
            reportingCurrencyCode: row.reportingCurrencyCode,
          }
        : null;
    },
  };
}

function normalizeCreateAccountInput(input: CreateAccountInput) {
  const openingBalanceMinor = input.openingBalanceMinor ?? null;
  const openingBalanceDate = input.openingBalanceDate ?? null;
  if ((openingBalanceMinor === null) !== (openingBalanceDate === null)) {
    throw new Error("Opening balance amount and date must be provided together.");
  }

  return {
    currencyCode: normalizeCurrencyCode(input.currencyCode),
    kind: AccountKindSchema.parse(input.kind),
    name: normalizeName(input.name),
    openingBalanceDate,
    openingBalanceMinor,
    subtype: AccountSubtypeSchema.parse(input.subtype),
  };
}

function normalizeAccountQueryLimit(limit: number | null | undefined): number {
  if (limit === null || limit === undefined) {
    return 50;
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Account query limit must be an integer from 1 to 100.");
  }

  return limit;
}

function makeAccountListPage(
  rows: readonly AccountRecord[],
  limit: number,
): RepositoryListPage<AccountRecord> {
  const items = rows.slice(0, limit);
  const lastItem = items.at(-1);

  return {
    hasNextPage: rows.length > limit,
    items,
    nextCursor:
      rows.length > limit && lastItem
        ? encodeFinanceCursor({
            id: lastItem.id,
            kind: "account.name.asc",
            sortKey: lastItem.name,
            v: 1,
          })
        : null,
  };
}

function hasOpeningBalance(
  input: ReturnType<typeof normalizeCreateAccountInput>,
): input is ReturnType<typeof normalizeCreateAccountInput> & {
  readonly openingBalanceDate: string;
  readonly openingBalanceMinor: bigint;
} {
  return input.openingBalanceMinor !== null && input.openingBalanceDate !== null;
}

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error("Account name is required.");
  }

  return trimmed;
}

function normalizeCurrencyCode(currencyCode: string): string {
  const normalized = currencyCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("Account currency code must be a three-letter uppercase code.");
  }

  return normalized;
}

function openingBalanceOccurredAt(openingBalanceDate: string): string {
  return `${openingBalanceDate}T00:00:00.000Z`;
}

function assertCreated<TRow>(rows: readonly TRow[], entity: string): TRow {
  const row = rows[0];
  if (!row) {
    throw new Error(`${entity} was not created.`);
  }

  return row;
}

function assertSqliteLedgerScope(client: SqliteClient, scope: LedgerScope): void {
  const row = client
    .prepare(
      `
        SELECT id
        FROM ledgers
        WHERE id = ?
          AND workspace_id = ?
          AND archived_at IS NULL
        LIMIT 1
      `,
    )
    .get(scope.ledgerId, scope.workspaceId);

  if (!row) {
    throw new Error("Ledger scope was not found.");
  }
}

async function assertPostgresLedgerScope(db: PostgresExecutor, scope: LedgerScope): Promise<void> {
  const rows = await db.execute(sql`
    SELECT id
    FROM ledgers
    WHERE id = ${scope.ledgerId}
      AND workspace_id = ${scope.workspaceId}
      AND archived_at IS NULL
    LIMIT 1
  `);

  if (extractRows(rows).length === 0) {
    throw new Error("Ledger scope was not found.");
  }
}

function maybeAlignSqliteLedgerBaseCurrencyBeforeFirstJournal(
  client: SqliteClient,
  input: {
    readonly currencyCode: string;
    readonly kind: AccountKind;
    readonly ledgerId: SyncedId;
    readonly now: string;
    readonly workspaceId: SyncedId;
  },
): void {
  if (!isUserHeldAccountKind(input.kind)) {
    return;
  }

  const ledgerRow = client
    .prepare<
      [SyncedId, SyncedId],
      {
        readonly base_currency_code: string;
      }
    >(
      `
        SELECT base_currency_code
        FROM ledgers
        WHERE id = ?
          AND workspace_id = ?
          AND archived_at IS NULL
        LIMIT 1
      `,
    )
    .get(input.ledgerId, input.workspaceId);
  if (!ledgerRow || ledgerRow.base_currency_code === input.currencyCode) {
    return;
  }

  const hasJournalRow = client
    .prepare<
      [SyncedId, SyncedId],
      {
        readonly id: string;
      }
    >(
      `
        SELECT id
        FROM transaction_journals
        WHERE workspace_id = ?
          AND ledger_id = ?
          AND deleted_at IS NULL
        LIMIT 1
      `,
    )
    .get(input.workspaceId, input.ledgerId);
  if (hasJournalRow) {
    return;
  }

  const mismatchedUserHeldAccount = client
    .prepare<
      [SyncedId, SyncedId, string],
      {
        readonly id: string;
      }
    >(
      `
        SELECT id
        FROM accounts
        WHERE workspace_id = ?
          AND ledger_id = ?
          AND is_active = 1
          AND archived_at IS NULL
          AND kind IN ('asset', 'liability')
          AND currency_code <> ?
        LIMIT 1
      `,
    )
    .get(input.workspaceId, input.ledgerId, input.currencyCode);
  if (mismatchedUserHeldAccount) {
    return;
  }

  client
    .prepare(
      `
        UPDATE ledgers
        SET base_currency_code = ?, updated_at = ?
        WHERE id = ?
          AND workspace_id = ?
          AND archived_at IS NULL
      `,
    )
    .run(input.currencyCode, input.now, input.ledgerId, input.workspaceId);
}

async function maybeAlignPostgresLedgerBaseCurrencyBeforeFirstJournal(
  db: PostgresExecutor,
  input: {
    readonly currencyCode: string;
    readonly kind: AccountKind;
    readonly ledgerId: SyncedId;
    readonly now: Date;
    readonly workspaceId: SyncedId;
  },
): Promise<void> {
  if (!isUserHeldAccountKind(input.kind)) {
    return;
  }

  const ledgerRows = await db
    .select({
      baseCurrencyCode: pgLedgers.baseCurrencyCode,
    })
    .from(pgLedgers)
    .where(
      and(
        eq(pgLedgers.id, input.ledgerId),
        eq(pgLedgers.workspaceId, input.workspaceId),
        isNull(pgLedgers.archivedAt),
      ),
    )
    .limit(1);
  const ledger = ledgerRows[0];
  if (!ledger || ledger.baseCurrencyCode === input.currencyCode) {
    return;
  }

  const existingJournal = await db
    .select({ id: pgTransactionJournals.id })
    .from(pgTransactionJournals)
    .where(
      and(
        eq(pgTransactionJournals.workspaceId, input.workspaceId),
        eq(pgTransactionJournals.ledgerId, input.ledgerId),
        isNull(pgTransactionJournals.deletedAt),
      ),
    )
    .limit(1);
  if (existingJournal[0]) {
    return;
  }

  const mismatchedUserHeldAccount = await db
    .select({ id: pgAccounts.id })
    .from(pgAccounts)
    .where(
      and(
        eq(pgAccounts.workspaceId, input.workspaceId),
        eq(pgAccounts.ledgerId, input.ledgerId),
        eq(pgAccounts.isActive, true),
        isNull(pgAccounts.archivedAt),
        or(eq(pgAccounts.kind, "asset"), eq(pgAccounts.kind, "liability")),
        ne(pgAccounts.currencyCode, input.currencyCode),
      ),
    )
    .limit(1);
  if (mismatchedUserHeldAccount[0]) {
    return;
  }

  await db
    .update(pgLedgers)
    .set({
      baseCurrencyCode: input.currencyCode,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(pgLedgers.id, input.ledgerId),
        eq(pgLedgers.workspaceId, input.workspaceId),
        isNull(pgLedgers.archivedAt),
      ),
    );
}

function insertSqliteAccount(
  client: SqliteClient,
  input: ReturnType<typeof normalizeCreateAccountInput> & {
    readonly id: SyncedId;
    readonly workspaceId: SyncedId;
    readonly ledgerId: SyncedId;
    readonly now: string;
  },
): AccountRecord {
  const row = prepareSqliteMoneyStatement<SqliteAccountRow>(
    client,
    `
      INSERT INTO accounts (
        id,
        workspace_id,
        ledger_id,
        name,
        kind,
        subtype,
        currency_code,
        opening_balance_minor,
        opening_balance_date,
        is_active,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      RETURNING *
    `,
  ).get(
    input.id,
    input.workspaceId,
    input.ledgerId,
    input.name,
    input.kind,
    input.subtype,
    input.currencyCode,
    input.openingBalanceMinor === null
      ? null
      : bindSqliteMoneyMinor(input.openingBalanceMinor, "opening_balance_minor"),
    input.openingBalanceDate,
    input.now,
    input.now,
  );

  if (!row) {
    throw new Error("Account was not created.");
  }

  return toSqliteAccountRecord(row);
}

function insertSqliteOpeningBalance(
  client: SqliteClient,
  input: {
    readonly account: AccountRecord;
    readonly amountMinor: bigint;
    readonly createdBy: SyncedId | null;
    readonly createId: () => SyncedId;
    readonly now: string;
    readonly openingBalanceDate: string;
  },
): { readonly groupId: SyncedId; readonly journalId: SyncedId } {
  const helperAccount = findOrCreateSqliteOpeningBalanceAccount(client, input);
  const groupId = input.createId();
  const journalId = input.createId();
  const helperPostingId = input.createId();
  const accountPostingId = input.createId();

  client
    .prepare(
      `
        INSERT INTO transaction_groups (
          id, workspace_id, ledger_id, title, type, source, created_by, updated_by, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, 'opening_balance', 'system', ?, ?, ?, ?)
      `,
    )
    .run(
      groupId,
      input.account.workspaceId,
      input.account.ledgerId,
      `Opening balance for ${input.account.name}`,
      input.createdBy,
      input.createdBy,
      input.now,
      input.now,
    );

  client
    .prepare(
      `
        INSERT INTO transaction_journals (
          id, workspace_id, ledger_id, group_id, type, occurred_at, description, status, source,
          created_by, updated_by, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, 'opening_balance', ?, ?, 'cleared', 'system', ?, ?, ?, ?)
      `,
    )
    .run(
      journalId,
      input.account.workspaceId,
      input.account.ledgerId,
      groupId,
      openingBalanceOccurredAt(input.openingBalanceDate),
      `Opening balance for ${input.account.name}`,
      input.createdBy,
      input.createdBy,
      input.now,
      input.now,
    );

  insertSqlitePosting(client, {
    accountId: helperAccount.id,
    amountMinor: -input.amountMinor,
    createdAt: input.now,
    currencyCode: input.account.currencyCode,
    id: helperPostingId,
    journalId,
    ledgerId: input.account.ledgerId,
    reportingAmountMinor: -input.amountMinor,
    reportingCurrencyCode: input.account.currencyCode,
    workspaceId: input.account.workspaceId,
  });
  insertSqlitePosting(client, {
    accountId: input.account.id,
    amountMinor: input.amountMinor,
    createdAt: input.now,
    currencyCode: input.account.currencyCode,
    id: accountPostingId,
    journalId,
    ledgerId: input.account.ledgerId,
    reportingAmountMinor: input.amountMinor,
    reportingCurrencyCode: input.account.currencyCode,
    workspaceId: input.account.workspaceId,
  });

  return { groupId, journalId };
}

function findOrCreateSqliteOpeningBalanceAccount(
  client: SqliteClient,
  input: {
    readonly account: AccountRecord;
    readonly createId: () => SyncedId;
    readonly now: string;
  },
): AccountRecord {
  const existing = prepareSqliteMoneyStatement<SqliteAccountRow>(
    client,
    `
      SELECT *
      FROM accounts
      WHERE workspace_id = ?
        AND ledger_id = ?
        AND kind = 'equity'
        AND subtype = 'opening_helper'
        AND currency_code = ?
        AND archived_at IS NULL
      ORDER BY created_at, id
      LIMIT 1
    `,
  ).get(input.account.workspaceId, input.account.ledgerId, input.account.currencyCode);

  if (existing) {
    return toSqliteAccountRecord(existing);
  }

  try {
    return insertSqliteAccount(client, {
      currencyCode: input.account.currencyCode,
      id: input.createId(),
      kind: "equity",
      ledgerId: input.account.ledgerId,
      name: `${OPENING_BALANCE_ACCOUNT_NAME_PREFIX} (${input.account.currencyCode})`,
      now: input.now,
      openingBalanceDate: null,
      openingBalanceMinor: null,
      subtype: "opening_helper",
      workspaceId: input.account.workspaceId,
    });
  } catch (error) {
    if (!isSqliteUniqueConstraintError(error)) {
      throw error;
    }

    const concurrentRow = prepareSqliteMoneyStatement<SqliteAccountRow>(
      client,
      `
        SELECT *
        FROM accounts
        WHERE workspace_id = ?
          AND ledger_id = ?
          AND kind = 'equity'
          AND subtype = 'opening_helper'
          AND currency_code = ?
          AND archived_at IS NULL
        ORDER BY created_at, id
        LIMIT 1
      `,
    ).get(input.account.workspaceId, input.account.ledgerId, input.account.currencyCode);

    if (!concurrentRow) {
      throw error;
    }

    return toSqliteAccountRecord(concurrentRow);
  }
}

function insertSqlitePosting(
  client: SqliteClient,
  input: {
    readonly id: SyncedId;
    readonly workspaceId: SyncedId;
    readonly ledgerId: SyncedId;
    readonly journalId: SyncedId;
    readonly accountId: SyncedId;
    readonly amountMinor: bigint;
    readonly currencyCode: string;
    readonly reportingAmountMinor: bigint;
    readonly reportingCurrencyCode: string;
    readonly createdAt: string;
  },
): void {
  prepareSqliteMoneyStatement(
    client,
    `
      INSERT INTO transaction_postings (
        id, workspace_id, ledger_id, journal_id, account_id, amount_minor, currency_code,
        reporting_amount_minor, reporting_currency_code, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    input.id,
    input.workspaceId,
    input.ledgerId,
    input.journalId,
    input.accountId,
    bindSqliteMoneyMinor(input.amountMinor, "amount_minor"),
    input.currencyCode,
    bindSqliteMoneyMinor(input.reportingAmountMinor, "reporting_amount_minor"),
    input.reportingCurrencyCode,
    input.createdAt,
  );
}

async function insertPostgresOpeningBalance(
  db: PostgresExecutor,
  input: {
    readonly account: AccountRecord;
    readonly amountMinor: bigint;
    readonly createdBy: SyncedId | null;
    readonly createId: () => SyncedId;
    readonly now: Date;
    readonly openingBalanceDate: string;
  },
): Promise<{ readonly groupId: SyncedId; readonly journalId: SyncedId }> {
  const helperAccount = await findOrCreatePostgresOpeningBalanceAccount(db, input);
  const groupId = input.createId();
  const journalId = input.createId();

  await db.insert(pgTransactionGroups).values({
    id: groupId,
    workspaceId: input.account.workspaceId,
    ledgerId: input.account.ledgerId,
    title: `Opening balance for ${input.account.name}`,
    type: "opening_balance",
    source: "system",
    createdBy: input.createdBy,
    updatedBy: input.createdBy,
    createdAt: input.now,
    updatedAt: input.now,
  });
  await db.insert(pgTransactionJournals).values({
    id: journalId,
    workspaceId: input.account.workspaceId,
    ledgerId: input.account.ledgerId,
    groupId,
    type: "opening_balance",
    occurredAt: new Date(openingBalanceOccurredAt(input.openingBalanceDate)),
    description: `Opening balance for ${input.account.name}`,
    status: "cleared",
    source: "system",
    createdBy: input.createdBy,
    updatedBy: input.createdBy,
    createdAt: input.now,
    updatedAt: input.now,
  });
  await db.insert(pgTransactionPostings).values([
    {
      id: input.createId(),
      workspaceId: input.account.workspaceId,
      ledgerId: input.account.ledgerId,
      journalId,
      accountId: helperAccount.id,
      amountMinor: -input.amountMinor,
      currencyCode: input.account.currencyCode,
      reportingAmountMinor: -input.amountMinor,
      reportingCurrencyCode: input.account.currencyCode,
      createdAt: input.now,
    },
    {
      id: input.createId(),
      workspaceId: input.account.workspaceId,
      ledgerId: input.account.ledgerId,
      journalId,
      accountId: input.account.id,
      amountMinor: input.amountMinor,
      currencyCode: input.account.currencyCode,
      reportingAmountMinor: input.amountMinor,
      reportingCurrencyCode: input.account.currencyCode,
      createdAt: input.now,
    },
  ]);

  return { groupId, journalId };
}

async function findOrCreatePostgresOpeningBalanceAccount(
  db: PostgresExecutor,
  input: {
    readonly account: AccountRecord;
    readonly createId: () => SyncedId;
    readonly now: Date;
  },
): Promise<AccountRecord> {
  const existing = await db
    .select()
    .from(pgAccounts)
    .where(
      and(
        eq(pgAccounts.workspaceId, input.account.workspaceId),
        eq(pgAccounts.ledgerId, input.account.ledgerId),
        eq(pgAccounts.kind, "equity"),
        eq(pgAccounts.subtype, "opening_helper"),
        eq(pgAccounts.currencyCode, input.account.currencyCode),
        isNull(pgAccounts.archivedAt),
      ),
    )
    .orderBy(asc(pgAccounts.createdAt), asc(pgAccounts.id))
    .limit(1);

  if (existing[0]) {
    return toPostgresAccountRecord(existing[0]);
  }

  try {
    const row = assertCreated(
      await db
        .insert(pgAccounts)
        .values({
          id: input.createId(),
          workspaceId: input.account.workspaceId,
          ledgerId: input.account.ledgerId,
          name: `${OPENING_BALANCE_ACCOUNT_NAME_PREFIX} (${input.account.currencyCode})`,
          kind: "equity",
          subtype: "opening_helper",
          currencyCode: input.account.currencyCode,
          isActive: true,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .returning(),
      "Opening balance helper account",
    );

    return toPostgresAccountRecord(row);
  } catch (error) {
    if (!isPostgresUniqueConstraintError(error)) {
      throw error;
    }

    const concurrentRows = await db
      .select()
      .from(pgAccounts)
      .where(
        and(
          eq(pgAccounts.workspaceId, input.account.workspaceId),
          eq(pgAccounts.ledgerId, input.account.ledgerId),
          eq(pgAccounts.kind, "equity"),
          eq(pgAccounts.subtype, "opening_helper"),
          eq(pgAccounts.currencyCode, input.account.currencyCode),
          isNull(pgAccounts.archivedAt),
        ),
      )
      .orderBy(asc(pgAccounts.createdAt), asc(pgAccounts.id))
      .limit(1);

    if (!concurrentRows[0]) {
      throw error;
    }

    return toPostgresAccountRecord(concurrentRows[0]);
  }
}

function isSqliteUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String(error.code) : "";
  return code.startsWith("SQLITE_CONSTRAINT");
}

function isPostgresUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return "code" in error && String(error.code) === "23505";
}

function toSqliteAccountRecord(row: SqliteAccountRow): AccountRecord {
  return {
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    currencyCode: row.currency_code,
    id: parseSyncedId(row.id),
    isActive: readSqliteBoolean(row.is_active, "is_active"),
    kind: AccountKindSchema.parse(row.kind),
    ledgerId: parseSyncedId(row.ledger_id),
    name: row.name,
    openingBalanceDate: row.opening_balance_date,
    openingBalanceMinor: readSqliteMoneyMinor(row.opening_balance_minor, "opening_balance_minor"),
    subtype: AccountSubtypeSchema.parse(row.subtype),
    updatedAt: row.updated_at,
    workspaceId: parseSyncedId(row.workspace_id),
  };
}

function toPostgresAccountRecord(row: typeof pgAccounts.$inferSelect): AccountRecord {
  return {
    archivedAt: toNullableIsoString(row.archivedAt),
    createdAt: toRequiredIsoString(row.createdAt),
    currencyCode: row.currencyCode,
    id: parseSyncedId(row.id),
    isActive: row.isActive,
    kind: AccountKindSchema.parse(row.kind),
    ledgerId: parseSyncedId(row.ledgerId),
    name: row.name,
    openingBalanceDate: row.openingBalanceDate,
    openingBalanceMinor: row.openingBalanceMinor,
    subtype: AccountSubtypeSchema.parse(row.subtype),
    updatedAt: toRequiredIsoString(row.updatedAt),
    workspaceId: parseSyncedId(row.workspaceId),
  };
}

function toSqliteBalanceRecord(row: SqliteBalanceRow): AccountBalanceRecord {
  return {
    accountId: parseSyncedId(row.account_id),
    balanceMinor: readRequiredSqliteMoneyMinor(row.balance_minor, "amount_minor"),
    currencyCode: row.currency_code,
    reportingBalanceMinor: readRequiredSqliteMoneyMinor(
      row.reporting_balance_minor,
      "reporting_amount_minor",
    ),
    reportingCurrencyCode: row.reporting_currency_code ?? row.currency_code,
  };
}

function readSqliteBoolean(value: bigint | boolean | number | string, columnName: string): boolean {
  if (value === true || value === 1 || value === 1n || value === "1") {
    return true;
  }
  if (value === false || value === 0 || value === 0n || value === "0") {
    return false;
  }

  throw new TypeError(`SQLite ${columnName} value must be boolean-compatible.`);
}

function readPostgresMoneyMinor(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === "string" && /^-?(0|[1-9][0-9]*)$/.test(value)) {
    return BigInt(value);
  }

  throw new TypeError("PostgreSQL money value must be an integer.");
}

function toNullableIsoString(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function toRequiredIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function runPostgresWrite<TResult>(
  db: PostgresExecutor,
  callback: (tx: PostgresExecutor) => Promise<TResult>,
): Promise<TResult> {
  return "transaction" in db ? db.transaction(callback) : callback(db);
}

function extractRows(result: unknown): readonly unknown[] {
  if (Array.isArray(result)) {
    return result;
  }
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { readonly rows?: unknown }).rows;
    return Array.isArray(rows) ? rows : [];
  }

  return [];
}
