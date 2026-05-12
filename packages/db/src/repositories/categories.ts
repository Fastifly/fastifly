import { createUuidV7, encodeFinanceCursor, type LedgerScope, parseFinanceCursor, parseSyncedId, type SyncedId } from "@fastifly/common";
import { and, asc, eq, gt, isNull, or, type SQL } from "drizzle-orm";

import type { PostgresDatabase } from "../postgres/client.js";
import { pgCategories } from "../postgres/schema.js";
import type { SqliteClient } from "../sqlite/client.js";
import type { RepositoryClock, RepositoryListPage } from "./base.js";
import { assertLedgerScope, makeTimestamp, systemClock } from "./base.js";

const CATEGORY_QUERY_LIMIT_DEFAULT = 50;
const CATEGORY_QUERY_LIMIT_MAX = 100;
const CATEGORY_CURSOR_KIND = "category.name.asc";

export type CategoryRepositoryOptions = {
  readonly clock?: RepositoryClock;
  readonly createId?: () => SyncedId;
};

export type CategoryRecord = {
  readonly id: SyncedId;
  readonly workspaceId: SyncedId;
  readonly ledgerId: SyncedId;
  readonly parentId: SyncedId | null;
  readonly counterpartyAccountId: SyncedId | null;
  readonly name: string;
  readonly color: string | null;
  readonly icon: string | null;
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CreateCategoryInput = LedgerScope & {
  readonly color?: string | null;
  readonly counterpartyAccountId: SyncedId;
  readonly icon?: string | null;
  readonly name: string;
  readonly parentId?: SyncedId | null;
};

export type ArchiveCategoryInput = LedgerScope & {
  readonly categoryId: SyncedId;
};

export type FindCategoryInput = LedgerScope & {
  readonly categoryId: SyncedId;
};

export type ListCategoriesInput = LedgerScope & {
  readonly cursor?: string | null;
  readonly includeArchived?: boolean | null;
  readonly limit?: number | null;
};

export type CategoryRepository = {
  readonly createCategory: (input: CreateCategoryInput) => MaybePromise<CategoryRecord>;
  readonly archiveCategory: (input: ArchiveCategoryInput) => MaybePromise<CategoryRecord | null>;
  readonly findCategory: (input: FindCategoryInput) => MaybePromise<CategoryRecord | null>;
  readonly listCategories: (
    input: ListCategoriesInput,
  ) => MaybePromise<RepositoryListPage<CategoryRecord>>;
};

type MaybePromise<T> = T | Promise<T>;

type CategoryRepositoryErrorCode = "PARENT_NOT_FOUND_OR_ARCHIVED";

export class CategoryRepositoryError extends Error {
  constructor(
    message: string,
    readonly code: CategoryRepositoryErrorCode,
  ) {
    super(message);
    this.name = "CategoryRepositoryError";
  }
}

type ResolvedOptions = {
  readonly clock: RepositoryClock;
  readonly createId: () => SyncedId;
};

type SqliteCategoryRow = {
  readonly id: string;
  readonly workspace_id: string;
  readonly ledger_id: string;
  readonly parent_id: string | null;
  readonly counterparty_account_id: string | null;
  readonly name: string;
  readonly color: string | null;
  readonly icon: string | null;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

function defaultCreateId(): SyncedId {
  return createUuidV7();
}

function resolveOptions(options?: CategoryRepositoryOptions): ResolvedOptions {
  return {
    clock: options?.clock ?? systemClock,
    createId: options?.createId ?? defaultCreateId,
  };
}

export function createSqliteCategoryRepository(
  client: SqliteClient,
  options?: CategoryRepositoryOptions,
): CategoryRepository {
  const resolved = resolveOptions(options);

  return {
    createCategory(input) {
      const scope = assertLedgerScope(input);
      const normalized = normalizeCreateCategoryInput(input);
      const now = makeTimestamp(resolved.clock);

      return client
        .transaction(() => {
          if (normalized.parentId) {
            assertSqliteParentCategory(client, scope, normalized.parentId);
          }

          const row = client
            .prepare<unknown[], SqliteCategoryRow>(
              `
                INSERT INTO categories (
                  id, workspace_id, ledger_id, parent_id, counterparty_account_id, name, color, icon, archived_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
                RETURNING *
              `,
            )
            .get(
              resolved.createId(),
              scope.workspaceId,
              scope.ledgerId,
              normalized.parentId,
              normalized.counterpartyAccountId,
              normalized.name,
              normalized.color,
              normalized.icon,
              now,
              now,
            );

          if (!row) {
            throw new Error("Category insert did not return a row.");
          }

          return toSqliteCategoryRecord(row);
        })
        .immediate();
    },

    archiveCategory(input) {
      const scope = assertLedgerScope(input);
      const archivedAt = makeTimestamp(resolved.clock);
      const row = client
        .prepare<unknown[], SqliteCategoryRow>(
          `
            UPDATE categories
            SET archived_at = ?, updated_at = ?
            WHERE id = ?
              AND workspace_id = ?
              AND ledger_id = ?
              AND archived_at IS NULL
            RETURNING *
          `,
        )
        .get(archivedAt, archivedAt, input.categoryId, scope.workspaceId, scope.ledgerId);

      return row ? toSqliteCategoryRecord(row) : null;
    },

    findCategory(input) {
      const scope = assertLedgerScope(input);
      const row = client
        .prepare<unknown[], SqliteCategoryRow>(
          `
            SELECT *
            FROM categories
            WHERE id = ?
              AND workspace_id = ?
              AND ledger_id = ?
            LIMIT 1
          `,
        )
        .get(input.categoryId, scope.workspaceId, scope.ledgerId);

      return row ? toSqliteCategoryRecord(row) : null;
    },

    listCategories(input) {
      const scope = assertLedgerScope(input);
      const limit = normalizeCategoryQueryLimit(input.limit);
      const cursor = input.cursor
        ? parseFinanceCursor(input.cursor, CATEGORY_CURSOR_KIND)
        : null;
      const includeArchived = Boolean(input.includeArchived);
      const archivedClause = includeArchived ? "" : "AND archived_at IS NULL";
      const cursorClause = cursor ? "AND (name > ? OR (name = ? AND id > ?))" : "";
      const params = cursor
        ? [scope.workspaceId, scope.ledgerId, cursor.sortKey, cursor.sortKey, cursor.id, limit + 1]
        : [scope.workspaceId, scope.ledgerId, limit + 1];
      const rows = client
        .prepare<unknown[], SqliteCategoryRow>(
          `
            SELECT *
            FROM categories
            WHERE workspace_id = ?
              AND ledger_id = ?
              ${archivedClause}
              ${cursorClause}
            ORDER BY name, id
            LIMIT ?
          `,
        )
        .all(...params);

      return makeCategoryListPage(rows.map(toSqliteCategoryRecord), limit);
    },
  };
}

export function createPostgresCategoryRepository(
  db: PostgresDatabase,
  options?: CategoryRepositoryOptions,
): CategoryRepository {
  const resolved = resolveOptions(options);

  return {
    async createCategory(input) {
      const scope = assertLedgerScope(input);
      const normalized = normalizeCreateCategoryInput(input);
      const now = resolved.clock.now();

      if (normalized.parentId) {
        await assertPostgresParentCategory(db, scope, normalized.parentId);
      }

      const rows = await db
        .insert(pgCategories)
        .values({
          id: resolved.createId(),
          workspaceId: scope.workspaceId,
          ledgerId: scope.ledgerId,
          parentId: normalized.parentId,
          counterpartyAccountId: normalized.counterpartyAccountId,
          name: normalized.name,
          color: normalized.color,
          icon: normalized.icon,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const row = rows[0];
      if (!row) {
        throw new Error("Category insert did not return a row.");
      }

      return toPostgresCategoryRecord(row);
    },

    async archiveCategory(input) {
      const scope = assertLedgerScope(input);
      const archivedAt = resolved.clock.now();
      const rows = await db
        .update(pgCategories)
        .set({ archivedAt, updatedAt: archivedAt })
        .where(
          and(
            eq(pgCategories.id, input.categoryId),
            eq(pgCategories.workspaceId, scope.workspaceId),
            eq(pgCategories.ledgerId, scope.ledgerId),
            isNull(pgCategories.archivedAt),
          ),
        )
        .returning();

      const row = rows[0];
      return row ? toPostgresCategoryRecord(row) : null;
    },

    async findCategory(input) {
      const scope = assertLedgerScope(input);
      const rows = await db
        .select()
        .from(pgCategories)
        .where(
          and(
            eq(pgCategories.id, input.categoryId),
            eq(pgCategories.workspaceId, scope.workspaceId),
            eq(pgCategories.ledgerId, scope.ledgerId),
          ),
        )
        .limit(1);

      const row = rows[0];
      return row ? toPostgresCategoryRecord(row) : null;
    },

    async listCategories(input) {
      const scope = assertLedgerScope(input);
      const limit = normalizeCategoryQueryLimit(input.limit);
      const cursor = input.cursor
        ? parseFinanceCursor(input.cursor, CATEGORY_CURSOR_KIND)
        : null;
      const conditions: SQL[] = [
        eq(pgCategories.workspaceId, scope.workspaceId),
        eq(pgCategories.ledgerId, scope.ledgerId),
      ];
      if (!input.includeArchived) {
        conditions.push(isNull(pgCategories.archivedAt));
      }
      if (cursor) {
        conditions.push(
          or(
            gt(pgCategories.name, cursor.sortKey),
            and(eq(pgCategories.name, cursor.sortKey), gt(pgCategories.id, cursor.id)),
          ) as SQL,
        );
      }

      const rows = await db
        .select()
        .from(pgCategories)
        .where(and(...conditions))
        .orderBy(asc(pgCategories.name), asc(pgCategories.id))
        .limit(limit + 1);

      return makeCategoryListPage(rows.map(toPostgresCategoryRecord), limit);
    },
  };
}

function normalizeCreateCategoryInput(input: CreateCategoryInput): {
  readonly counterpartyAccountId: SyncedId;
  readonly name: string;
  readonly parentId: SyncedId | null;
  readonly color: string | null;
  readonly icon: string | null;
} {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Category name is required.");
  }

  return {
    counterpartyAccountId: input.counterpartyAccountId,
    name,
    parentId: input.parentId ?? null,
    color: normalizeOptionalField(input.color),
    icon: normalizeOptionalField(input.icon),
  };
}

function normalizeOptionalField(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCategoryQueryLimit(limit?: number | null): number {
  if (!limit) {
    return CATEGORY_QUERY_LIMIT_DEFAULT;
  }

  return Math.max(1, Math.min(CATEGORY_QUERY_LIMIT_MAX, Math.trunc(limit)));
}

function makeCategoryListPage(
  rows: readonly CategoryRecord[],
  limit: number,
): RepositoryListPage<CategoryRecord> {
  const items = rows.slice(0, limit);
  const hasNextPage = rows.length > limit;
  const last = items[items.length - 1];

  return {
    hasNextPage,
    items,
    nextCursor:
      hasNextPage && last
        ? encodeFinanceCursor({
            id: last.id,
            kind: CATEGORY_CURSOR_KIND,
            sortKey: last.name,
            v: 1,
          })
        : null,
  };
}

function toSqliteCategoryRecord(row: SqliteCategoryRow): CategoryRecord {
  return {
    archivedAt: row.archived_at,
    color: row.color,
    counterpartyAccountId: row.counterparty_account_id
      ? parseSyncedId(row.counterparty_account_id)
      : null,
    createdAt: row.created_at,
    icon: row.icon,
    id: parseSyncedId(row.id),
    ledgerId: parseSyncedId(row.ledger_id),
    name: row.name,
    parentId: row.parent_id ? parseSyncedId(row.parent_id) : null,
    updatedAt: row.updated_at,
    workspaceId: parseSyncedId(row.workspace_id),
  };
}

function toPostgresCategoryRecord(row: {
  readonly id: string;
  readonly workspaceId: string;
  readonly ledgerId: string;
  readonly parentId: string | null;
  readonly counterpartyAccountId: string | null;
  readonly name: string;
  readonly color: string | null;
  readonly icon: string | null;
  readonly archivedAt: Date | string | null;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
}): CategoryRecord {
  return {
    archivedAt: toIsoTimestamp(row.archivedAt),
    color: row.color,
    counterpartyAccountId: row.counterpartyAccountId
      ? parseSyncedId(row.counterpartyAccountId)
      : null,
    createdAt: toRequiredIsoTimestamp(row.createdAt, "category.createdAt"),
    icon: row.icon,
    id: parseSyncedId(row.id),
    ledgerId: parseSyncedId(row.ledgerId),
    name: row.name,
    parentId: row.parentId ? parseSyncedId(row.parentId) : null,
    updatedAt: toRequiredIsoTimestamp(row.updatedAt, "category.updatedAt"),
    workspaceId: parseSyncedId(row.workspaceId),
  };
}

function assertSqliteParentCategory(
  client: SqliteClient,
  scope: LedgerScope,
  parentId: SyncedId,
): void {
  const row = client
    .prepare<unknown[], { readonly id: string }>(
      `
        SELECT id
        FROM categories
        WHERE id = ?
          AND workspace_id = ?
          AND ledger_id = ?
          AND archived_at IS NULL
        LIMIT 1
      `,
    )
    .get(parentId, scope.workspaceId, scope.ledgerId);

  if (!row) {
    throw new CategoryRepositoryError(
      "Parent category was not found or is archived.",
      "PARENT_NOT_FOUND_OR_ARCHIVED",
    );
  }
}

async function assertPostgresParentCategory(
  db: PostgresDatabase,
  scope: LedgerScope,
  parentId: SyncedId,
): Promise<void> {
  const rows = await db
    .select({ id: pgCategories.id })
    .from(pgCategories)
    .where(
      and(
        eq(pgCategories.id, parentId),
        eq(pgCategories.workspaceId, scope.workspaceId),
        eq(pgCategories.ledgerId, scope.ledgerId),
        isNull(pgCategories.archivedAt),
      ),
    )
    .limit(1);

  if (rows.length < 1) {
    throw new CategoryRepositoryError(
      "Parent category was not found or is archived.",
      "PARENT_NOT_FOUND_OR_ARCHIVED",
    );
  }
}

function toIsoTimestamp(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(value).toISOString();
}

function toRequiredIsoTimestamp(value: Date | string, field: string): string {
  const timestamp = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(timestamp.valueOf())) {
    throw new Error(`${field} is not a valid timestamp.`);
  }

  return timestamp.toISOString();
}
