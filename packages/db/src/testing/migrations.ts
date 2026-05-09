import { PGlite } from "@electric-sql/pglite";
import { createClient, type Client as LibsqlClient } from "@libsql/client";

import type { Migration } from "../migrations/types.js";
import { runMigrations } from "../migrations/types.js";

export function createInMemorySqliteDatabase(): LibsqlClient {
  return createClient({ url: ":memory:" });
}

export async function createInMemoryPostgresDatabase(): Promise<PGlite> {
  return PGlite.create();
}

export async function runSqliteMigrations(
  db: LibsqlClient,
  migrations: readonly Migration[],
): Promise<void> {
  await runMigrations(
    {
      execute: async (sql) => {
        const statements = splitSqlStatements(sql);
        if (statements.length > 0) {
          await db.batch(
            statements.map((statement) => ({ sql: statement, args: [] })),
            "write",
          );
        }
      },
    },
    migrations,
  );
}

export async function runPostgresMigrations(
  db: PGlite,
  migrations: readonly Migration[],
): Promise<void> {
  await runMigrations(
    {
      execute: async (sql) => {
        await db.exec(sql);
      },
    },
    migrations,
  );
}

export function splitSqlStatements(sql: string): readonly string[] {
  const statements: string[] = [];
  let current = "";
  let quote: "'" | '"' | "`" | null = null;
  let inLineComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index] ?? "";
    const next = sql[index + 1] ?? "";

    if (inLineComment) {
      current += char;
      if (char === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (quote === null && char === "-" && next === "-") {
      inLineComment = true;
      current += char;
      continue;
    }

    if (quote === null && (char === "'" || char === '"' || char === "`")) {
      quote = char;
      current += char;
      continue;
    }

    if (quote !== null && char === quote) {
      quote = null;
      current += char;
      continue;
    }

    if (quote === null && char === ";") {
      const statement = current.trim();
      if (statement.length > 0) {
        statements.push(statement);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const statement = current.trim();
  if (statement.length > 0) {
    statements.push(statement);
  }

  return statements;
}
