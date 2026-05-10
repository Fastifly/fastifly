import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { migrate as migrateSqlite } from "drizzle-orm/better-sqlite3/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";

import {
  closePostgresClient,
  createPostgresClient,
  createPostgresDatabaseFromClient,
} from "../postgres/client.js";
import { createConfiguredSqliteClient, createSqliteDatabaseFromClient } from "../sqlite/client.js";
import type { DatabaseDialect } from "./commands.js";

const sqliteMigrationsFolder = fileURLToPath(new URL("../sqlite/migrations", import.meta.url));
const postgresMigrationsFolder = fileURLToPath(new URL("../postgres/migrations", import.meta.url));

export type MigrationStatus = {
  readonly driver: DatabaseDialect;
  readonly databaseUrl: string;
  readonly migrationFolder: string;
  readonly totalMigrations: number;
  readonly appliedMigrations: number;
  readonly pendingMigrations: number;
};

export type CliOutput = {
  readonly stdout: (message: string) => void;
  readonly stderr: (message: string) => void;
};

type ParsedCliArgs = {
  readonly command: "help" | "migrate";
  readonly subcommand?: "status" | "up";
  readonly driver: DatabaseDialect | undefined;
  readonly databaseUrl: string | undefined;
  readonly json: boolean;
};

type CliEnv = {
  readonly DATABASE_DRIVER?: string;
  readonly DATABASE_URL?: string;
};

export async function runFastiflyCli(
  argv: readonly string[],
  env: CliEnv = process.env,
  output: CliOutput = consoleOutput,
): Promise<number> {
  try {
    const args = parseCliArgs(argv, env);

    if (args.command === "help") {
      output.stdout(helpText());
      return 0;
    }

    const driver = requireDatabaseDriver(args.driver);
    const databaseUrl = requireDatabaseUrl(args.databaseUrl);

    if (args.subcommand === "up") {
      await runMigrations(driver, databaseUrl);
    }

    const status = await readMigrationStatus(driver, databaseUrl);
    printMigrationStatus(status, args.json, output);

    return status.pendingMigrations === 0 ? 0 : 1;
  } catch (error) {
    output.stderr(error instanceof Error ? error.message : "Unknown CLI error.");
    return 1;
  }
}

export async function readMigrationStatus(
  driver: DatabaseDialect,
  databaseUrl: string,
): Promise<MigrationStatus> {
  return driver === "sqlite"
    ? readSqliteMigrationStatus(databaseUrl)
    : await readPostgresMigrationStatus(databaseUrl);
}

export async function runMigrations(driver: DatabaseDialect, databaseUrl: string): Promise<void> {
  if (driver === "sqlite") {
    const client = createConfiguredSqliteClient({ source: databaseUrl });

    try {
      migrateSqlite(createSqliteDatabaseFromClient(client), {
        migrationsFolder: sqliteMigrationsFolder,
      });
    } finally {
      client.close();
    }
    return;
  }

  const client = createPostgresClient({ url: databaseUrl });

  try {
    await migratePostgres(createPostgresDatabaseFromClient(client), {
      migrationsFolder: postgresMigrationsFolder,
    });
  } finally {
    await closePostgresClient(client);
  }
}

function parseCliArgs(argv: readonly string[], env: CliEnv): ParsedCliArgs {
  const positional: string[] = [];
  let driver = parseOptionalDatabaseDriver(env.DATABASE_DRIVER);
  let databaseUrl = env.DATABASE_URL;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      return { command: "help", databaseUrl, driver, json };
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--driver") {
      driver = parseOptionalDatabaseDriver(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg?.startsWith("--driver=")) {
      driver = parseOptionalDatabaseDriver(arg.slice("--driver=".length));
      continue;
    }
    if (arg === "--database-url") {
      databaseUrl = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg?.startsWith("--database-url=")) {
      databaseUrl = arg.slice("--database-url=".length);
      continue;
    }

    if (arg) {
      positional.push(arg);
    }
  }

  if (positional.length === 0) {
    return { command: "help", driver, databaseUrl, json };
  }
  if (positional[0] !== "migrate") {
    throw new Error(`Unknown command: ${positional[0]}`);
  }
  if (positional[1] !== "status" && positional[1] !== "up") {
    throw new Error("Expected `fastifly migrate status` or `fastifly migrate up`.");
  }

  return {
    command: "migrate",
    databaseUrl,
    driver,
    json,
    subcommand: positional[1],
  };
}

function parseOptionalDatabaseDriver(value: string | undefined): DatabaseDialect | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (value === "sqlite" || value === "postgres") {
    return value;
  }
  throw new Error("DATABASE_DRIVER must be `sqlite` or `postgres`.");
}

function requireDatabaseDriver(driver: DatabaseDialect | undefined): DatabaseDialect {
  if (!driver) {
    throw new Error("DATABASE_DRIVER is required. Use `sqlite` or `postgres`.");
  }

  return driver;
}

function requireDatabaseUrl(databaseUrl: string | undefined): string {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  return databaseUrl;
}

async function readSqliteMigrationStatus(databaseUrl: string): Promise<MigrationStatus> {
  const totalMigrations = countMigrationFolders(sqliteMigrationsFolder);
  const databaseExists = databaseUrl === ":memory:" || existsSync(databaseUrl);

  if (!databaseExists) {
    return {
      appliedMigrations: 0,
      databaseUrl,
      driver: "sqlite",
      migrationFolder: sqliteMigrationsFolder,
      pendingMigrations: totalMigrations,
      totalMigrations,
    };
  }

  const client = createConfiguredSqliteClient({ source: databaseUrl });

  try {
    const hasMigrationTable =
      (client
        .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ? LIMIT 1")
        .get("__drizzle_migrations") as { readonly "1": number } | undefined) !== undefined;
    const appliedMigrations = hasMigrationTable
      ? Number(
          (
            client.prepare("SELECT COUNT(*) AS count FROM __drizzle_migrations").get() as {
              readonly count: number;
            }
          ).count,
        )
      : 0;

    return toStatus({
      appliedMigrations,
      databaseUrl,
      driver: "sqlite",
      migrationFolder: sqliteMigrationsFolder,
      totalMigrations,
    });
  } finally {
    client.close();
  }
}

async function readPostgresMigrationStatus(databaseUrl: string): Promise<MigrationStatus> {
  const totalMigrations = countMigrationFolders(postgresMigrationsFolder);
  const client = createPostgresClient({ url: databaseUrl });

  try {
    const tableResult = await client<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = '__drizzle_migrations'
      ) AS "exists"
    `;
    const hasMigrationTable = tableResult[0]?.exists ?? false;
    const countResult = hasMigrationTable
      ? await client<
          { count: string }[]
        >`SELECT COUNT(*)::text AS count FROM "__drizzle_migrations"`
      : [{ count: "0" }];

    return toStatus({
      appliedMigrations: Number(countResult[0]?.count ?? "0"),
      databaseUrl,
      driver: "postgres",
      migrationFolder: postgresMigrationsFolder,
      totalMigrations,
    });
  } finally {
    await closePostgresClient(client);
  }
}

function toStatus(input: Omit<MigrationStatus, "pendingMigrations">): MigrationStatus {
  return {
    ...input,
    pendingMigrations: Math.max(0, input.totalMigrations - input.appliedMigrations),
  };
}

function countMigrationFolders(folder: string): number {
  return readdirSync(folder, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length;
}

function printMigrationStatus(status: MigrationStatus, json: boolean, output: CliOutput): void {
  if (json) {
    output.stdout(`${JSON.stringify(status)}\n`);
    return;
  }

  output.stdout(
    [
      "Fastifly migration status",
      `driver: ${status.driver}`,
      `database: ${status.databaseUrl}`,
      `migration folder: ${status.migrationFolder}`,
      `migrations: ${status.appliedMigrations} applied, ${status.pendingMigrations} pending, ${status.totalMigrations} total`,
      "",
    ].join("\n"),
  );
}

function helpText(): string {
  return [
    "Fastifly maintenance CLI",
    "",
    "Usage:",
    "  fastifly migrate status --driver sqlite --database-url ./data/fastifly.db",
    "  fastifly migrate up --driver postgres --database-url postgres://user:pass@host:5432/db",
    "",
    "Environment:",
    "  DATABASE_DRIVER=sqlite|postgres",
    "  DATABASE_URL=<database-url-or-sqlite-path>",
    "",
  ].join("\n");
}

const consoleOutput: CliOutput = {
  stderr(message) {
    process.stderr.write(message.endsWith("\n") ? message : `${message}\n`);
  },
  stdout(message) {
    process.stdout.write(message);
  },
};
