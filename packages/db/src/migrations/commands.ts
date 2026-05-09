import type { DatabaseDialect } from "./types.js";

export type MigrationCommandName =
  | "generate:sqlite"
  | "generate:postgres"
  | "migrate:sqlite"
  | "migrate:postgres";

export type MigrationCommand = {
  readonly name: MigrationCommandName;
  readonly dialect: DatabaseDialect;
  readonly mutatesDatabase: boolean;
  readonly requiresBackup: boolean;
  readonly description: string;
};

export const MIGRATION_COMMANDS: readonly MigrationCommand[] = [
  {
    name: "generate:sqlite",
    dialect: "sqlite",
    mutatesDatabase: false,
    requiresBackup: false,
    description: "Generate SQLite migration files from the SQLite Drizzle schema.",
  },
  {
    name: "generate:postgres",
    dialect: "postgres",
    mutatesDatabase: false,
    requiresBackup: false,
    description: "Generate PostgreSQL migration files from the PostgreSQL Drizzle schema.",
  },
  {
    name: "migrate:sqlite",
    dialect: "sqlite",
    mutatesDatabase: true,
    requiresBackup: true,
    description: "Apply pending SQLite migrations after the caller has taken a backup.",
  },
  {
    name: "migrate:postgres",
    dialect: "postgres",
    mutatesDatabase: true,
    requiresBackup: true,
    description: "Apply pending PostgreSQL migrations after the caller has taken a backup.",
  },
];
