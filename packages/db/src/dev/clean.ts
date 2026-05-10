import {
  closePostgresClient,
  createPostgresClient,
  type PglitePostgresClient,
  type PostgresClient,
} from "../postgres/client.js";
import { createConfiguredSqliteClient, type SqliteClient } from "../sqlite/client.js";

export type CleanDriver = "sqlite" | "postgres";

export type CleanDatabaseInput = {
  readonly databaseUrl: string;
  readonly driver: CleanDriver;
};

export const FASTIFLY_APP_TABLES = [
  "sync_conflicts",
  "sync_operations",
  "idempotency_receipts",
  "journal_meta",
  "transaction_tags",
  "transaction_postings",
  "transaction_journals",
  "transaction_groups",
  "balance_recalculation_queue",
  "budget_limits",
  "budgets",
  "account_meta",
  "accounts",
  "payee_mappings",
  "payee_aliases",
  "payees",
  "tags",
  "categories",
  "exchange_rates",
  "audit_log",
  "job_queue",
  "workspace_ledger_revisions",
  "workspace_invitations",
  "workspace_members",
  "ledgers",
  "workspaces",
  "devices",
  "recovery_codes",
  "passkey_challenges",
  "passkeys",
  "sessions",
  "users",
  "currencies",
] as const;

export type FastiflyAppTable = (typeof FASTIFLY_APP_TABLES)[number];

export async function cleanDatabase(input: CleanDatabaseInput): Promise<void> {
  if (input.driver === "sqlite") {
    const client = createConfiguredSqliteClient({ source: input.databaseUrl });

    try {
      cleanSqlite(client);
    } finally {
      client.close();
    }
    return;
  }

  const client = createPostgresClient({ url: input.databaseUrl });

  try {
    await cleanPostgres(client);
  } finally {
    await closePostgresClient(client);
  }
}

export function cleanSqlite(client: SqliteClient): void {
  client.pragma("foreign_keys = OFF");

  try {
    for (const tableName of FASTIFLY_APP_TABLES) {
      client.prepare(`DELETE FROM ${quoteIdentifier(tableName)}`).run();
    }
  } finally {
    client.pragma("foreign_keys = ON");
  }

  const violations = client.pragma("foreign_key_check") as unknown[];
  if (violations.length > 0) {
    throw new Error(`SQLite foreign key check failed after clean: ${JSON.stringify(violations)}`);
  }
}

export async function cleanPostgres(client: PostgresClient): Promise<void> {
  await client.unsafe(`TRUNCATE TABLE ${quotedAppTableList()} RESTART IDENTITY CASCADE`);
}

export async function cleanPglitePostgres(client: PglitePostgresClient): Promise<void> {
  await client.query(`TRUNCATE TABLE ${quotedAppTableList()} RESTART IDENTITY CASCADE`);
}

function quotedAppTableList(): string {
  return FASTIFLY_APP_TABLES.map(quoteIdentifier).join(", ");
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}
