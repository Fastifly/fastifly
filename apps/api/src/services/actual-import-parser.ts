import type {
  ActualBudgetExport,
  ActualRawAccount,
  ActualRawCategory,
  ActualRawCategoryGroup,
  ActualRawPayee,
  ActualRawPayeeMapping,
  ActualRawTransaction,
} from "@fastifly/common";
import Database from "better-sqlite3";
import { unzipSync } from "fflate";

const ACTUAL_DB_FILE = "db.sqlite";
const ACTUAL_METADATA_FILE = "metadata.json";
// Bound decompressed size to defend against zip bombs. Checked against the
// entry's declared uncompressed size before any decompression happens.
const MAX_DECOMPRESSED_BYTES = 256 * 1024 * 1024;

type ActualArchiveEntries = {
  readonly dbBytes: Uint8Array;
  readonly metadataBytes?: Uint8Array;
};

export class ActualImportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActualImportParseError";
  }
}

/**
 * Parse an Actual Budget export (a ZIP containing `db.sqlite` + `metadata.json`)
 * into the raw row shape consumed by the pure mapper. Node-only: uses `fflate`
 * to unzip and `better-sqlite3` to read the embedded database from a Buffer.
 */
export function parseActualBudgetExport(zipBytes: Uint8Array): ActualBudgetExport {
  const archive = unzipArchive(zipBytes);
  const budgetName = readBudgetName(archive.metadataBytes);

  let db: Database.Database;
  try {
    db = new Database(Buffer.from(archive.dbBytes), { readonly: true, fileMustExist: true });
  } catch {
    throw new ActualImportParseError("The Actual Budget database could not be opened.");
  }

  try {
    assertActualBudgetSchema(db);
    return {
      accounts: readAccounts(db),
      budgetName,
      categories: readCategories(db),
      categoryGroups: readCategoryGroups(db),
      payeeMappings: readPayeeMappings(db),
      payees: readPayees(db),
      transactions: readTransactions(db),
    };
  } catch (error) {
    if (error instanceof ActualImportParseError) {
      throw error;
    }
    throw new ActualImportParseError("The Actual Budget database could not be read.");
  } finally {
    db.close();
  }
}

function unzipArchive(zipBytes: Uint8Array): ActualArchiveEntries {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zipBytes, {
      // Only decompress the two files we need, and reject oversized entries
      // before decompression so a zip bomb cannot exhaust memory.
      filter: (file) => {
        if (!isActualArchiveEntryName(file.name)) {
          return false;
        }
        if (file.originalSize > MAX_DECOMPRESSED_BYTES) {
          throw new ActualImportParseError("The Actual Budget file is too large to import.");
        }
        return true;
      },
    });
  } catch (error) {
    if (error instanceof ActualImportParseError) {
      throw error;
    }
    throw new ActualImportParseError("The uploaded file is not a valid ZIP archive.");
  }

  const dbEntries = findArchiveEntries(files, ACTUAL_DB_FILE);
  if (dbEntries.length === 0) {
    throw new ActualImportParseError(
      "The uploaded file is not an Actual Budget export. It must contain db.sqlite.",
    );
  }
  if (dbEntries.length > 1) {
    throw new ActualImportParseError(
      "The uploaded file contains more than one db.sqlite file. Export one Actual budget at a time.",
    );
  }
  const dbEntry = dbEntries[0];
  if (!dbEntry) {
    throw new ActualImportParseError(
      "The uploaded file is not an Actual Budget export. It must contain db.sqlite.",
    );
  }

  const metadataEntries = findArchiveEntries(files, ACTUAL_METADATA_FILE);
  if (metadataEntries.length > 1) {
    throw new ActualImportParseError(
      "The uploaded file contains more than one metadata.json file. Export one Actual budget at a time.",
    );
  }
  const metadataEntry = metadataEntries[0];

  return metadataEntry
    ? { dbBytes: dbEntry.bytes, metadataBytes: metadataEntry.bytes }
    : { dbBytes: dbEntry.bytes };
}

function isActualArchiveEntryName(name: string): boolean {
  const basename = archiveBasename(name);
  return basename === ACTUAL_DB_FILE || basename === ACTUAL_METADATA_FILE;
}

function findArchiveEntries(
  files: Record<string, Uint8Array>,
  basename: string,
): readonly { readonly bytes: Uint8Array; readonly name: string }[] {
  return Object.entries(files)
    .filter(([name]) => archiveBasename(name) === basename)
    .map(([name, bytes]) => ({ bytes, name }));
}

function archiveBasename(name: string): string {
  const parts = name.replaceAll("\\", "/").split("/").filter(Boolean);
  return parts.at(-1) ?? "";
}

function readBudgetName(metadataBytes: Uint8Array | undefined): string | null {
  if (!metadataBytes) {
    return null;
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(metadataBytes)) as unknown;
    if (parsed && typeof parsed === "object" && "budgetName" in parsed) {
      const name = (parsed as { readonly budgetName?: unknown }).budgetName;
      return typeof name === "string" && name.trim().length > 0 ? name.trim() : null;
    }
  } catch {
    return null;
  }
  return null;
}

function assertActualBudgetSchema(db: Database.Database): void {
  const missingRequiredTables = ["accounts", "transactions"].filter(
    (table) => !tableExists(db, table),
  );
  if (missingRequiredTables.length > 0) {
    throw new ActualImportParseError(
      `The SQLite database is not an Actual Budget export. Missing required table: ${missingRequiredTables.join(", ")}.`,
    );
  }
}

/** Select the requested columns from a table, tolerating schema drift. */
function selectRows(
  db: Database.Database,
  table: string,
  columns: readonly string[],
): readonly Record<string, unknown>[] {
  if (!tableExists(db, table)) {
    return [];
  }
  const existing = tableColumns(db, table);
  const projection = columns
    .map((column) => (existing.has(column) ? `"${column}"` : `NULL AS "${column}"`))
    .join(", ");
  return db.prepare(`SELECT ${projection} FROM "${table}"`).all() as Record<string, unknown>[];
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?")
    .get(table);
  return Boolean(row);
}

function tableColumns(db: Database.Database, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info("${table}")`).all() as { readonly name: string }[];
  return new Set(rows.map((row) => row.name));
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  return null;
}

function readAccounts(db: Database.Database): readonly ActualRawAccount[] {
  return selectRows(db, "accounts", [
    "id",
    "name",
    "offbudget",
    "closed",
    "type",
    "tombstone",
  ]).flatMap((row) => {
    const id = asString(row.id);
    if (!id) {
      return [];
    }
    return [
      {
        closed: asNumber(row.closed),
        id,
        name: asString(row.name),
        offbudget: asNumber(row.offbudget),
        tombstone: asNumber(row.tombstone),
        type: asString(row.type),
      },
    ];
  });
}

function readCategories(db: Database.Database): readonly ActualRawCategory[] {
  return selectRows(db, "categories", [
    "id",
    "name",
    "is_income",
    "cat_group",
    "tombstone",
  ]).flatMap((row) => {
    const id = asString(row.id);
    if (!id) {
      return [];
    }
    return [
      {
        cat_group: asString(row.cat_group),
        id,
        is_income: asNumber(row.is_income),
        name: asString(row.name),
        tombstone: asNumber(row.tombstone),
      },
    ];
  });
}

function readCategoryGroups(db: Database.Database): readonly ActualRawCategoryGroup[] {
  return selectRows(db, "category_groups", ["id", "name", "is_income", "tombstone"]).flatMap(
    (row) => {
      const id = asString(row.id);
      if (!id) {
        return [];
      }
      return [
        {
          id,
          is_income: asNumber(row.is_income),
          name: asString(row.name),
          tombstone: asNumber(row.tombstone),
        },
      ];
    },
  );
}

function readPayees(db: Database.Database): readonly ActualRawPayee[] {
  return selectRows(db, "payees", ["id", "name", "transfer_acct", "tombstone"]).flatMap((row) => {
    const id = asString(row.id);
    if (!id) {
      return [];
    }
    return [
      {
        id,
        name: asString(row.name),
        tombstone: asNumber(row.tombstone),
        transfer_acct: asString(row.transfer_acct),
      },
    ];
  });
}

function readPayeeMappings(db: Database.Database): readonly ActualRawPayeeMapping[] {
  return selectRows(db, "payee_mapping", ["id", "targetId"]).flatMap((row) => {
    const id = asString(row.id);
    const targetId = asString(row.targetId);
    if (!id || !targetId) {
      return [];
    }
    return [{ id, targetId }];
  });
}

function readTransactions(db: Database.Database): readonly ActualRawTransaction[] {
  return selectRows(db, "transactions", [
    "id",
    "isParent",
    "isChild",
    "parent_id",
    "acct",
    "category",
    "amount",
    "description",
    "notes",
    "date",
    "transferred_id",
    "starting_balance_flag",
    "cleared",
    "reconciled",
    "tombstone",
  ]).flatMap((row) => {
    const id = asString(row.id);
    if (!id) {
      return [];
    }
    return [
      {
        acct: asString(row.acct),
        amount: asNumber(row.amount),
        category: asString(row.category),
        cleared: asNumber(row.cleared),
        date: asNumber(row.date) ?? asString(row.date),
        description: asString(row.description),
        id,
        isChild: asNumber(row.isChild),
        isParent: asNumber(row.isParent),
        notes: asString(row.notes),
        parent_id: asString(row.parent_id),
        reconciled: asNumber(row.reconciled),
        starting_balance_flag: asNumber(row.starting_balance_flag),
        transferred_id: asString(row.transferred_id),
        tombstone: asNumber(row.tombstone),
      },
    ];
  });
}
