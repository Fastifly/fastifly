import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate as migrateSqlite } from "drizzle-orm/better-sqlite3/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";

import {
  closePostgresClient,
  createPostgresClient,
  createPostgresDatabaseFromClient,
} from "../postgres/client.js";
import {
  createConfiguredSqliteClient,
  createSqliteDatabaseFromClient,
  readSqliteRuntimePragmas,
  type SqliteRuntimePragmas,
} from "../sqlite/client.js";
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
  readonly command: "backup" | "help" | "integrity" | "migrate";
  readonly subcommand?: "create" | "env" | "report" | "restore" | "status" | "sums" | "up";
  readonly driver: DatabaseDialect | undefined;
  readonly databaseUrl: string | undefined;
  readonly json: boolean;
  readonly outputPath: string | undefined;
  readonly restorePath: string | undefined;
  readonly yes: boolean;
};

type CliEnv = {
  readonly DATABASE_DRIVER?: string;
  readonly DATABASE_URL?: string;
};

type BackupMetadata = {
  readonly appVersion: string;
  readonly createdAt: string;
  readonly driver: "sqlite";
  readonly schemaVersion: number;
  readonly sourceDatabasePath: string;
};

type BackupCreateResult = {
  readonly backupPath: string;
  readonly metadata: BackupMetadata;
  readonly metadataPath: string;
};

type BackupRestoreResult = {
  readonly backupPath: string;
  readonly emergencyBackupPath: string | null;
  readonly metadata: BackupMetadata | null;
  readonly metadataPath: string | null;
  readonly restoredDatabasePath: string;
  readonly schemaVersion: number;
};

type IntegrityEnvResult = {
  readonly appVersion: string;
  readonly databaseUrl: string;
  readonly driver: DatabaseDialect;
  readonly healthy: boolean;
  readonly migrationStatus: MigrationStatus;
  readonly sqliteRuntimePragmas: SqliteRuntimePragmas | null;
  readonly timestamp: string;
};

type SumIntegrityViolation = {
  readonly currencyCode: string;
  readonly differenceMinor: string;
  readonly journalId: string;
  readonly ledgerId: string;
  readonly workspaceId: string;
};

type IntegritySumsResult = {
  readonly driver: DatabaseDialect;
  readonly healthy: boolean;
  readonly maxViolations: number;
  readonly reportingViolations: readonly SumIntegrityViolation[];
  readonly reportingViolationsCount: number;
  readonly sourceAmountViolations: readonly SumIntegrityViolation[];
  readonly sourceAmountViolationsCount: number;
};

type IntegrityReportResult = {
  readonly env: IntegrityEnvResult;
  readonly healthy: boolean;
  readonly sums: IntegritySumsResult;
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

    if (args.command === "backup") {
      assertSqliteBackupDriver(driver);

      if (args.subcommand === "create") {
        const backupResult = await runSqliteBackupCreate(databaseUrl, args.outputPath);
        printBackupCreateResult(backupResult, args.json, output);
        return 0;
      }
      if (args.subcommand === "restore") {
        const restorePath = requireRestorePath(args.restorePath);
        const restoreResult = await runSqliteBackupRestore({
          backupPath: restorePath,
          databaseUrl,
          yes: args.yes,
        });
        printBackupRestoreResult(restoreResult, args.json, output);
        return 0;
      }

      throw new Error("Expected `fastifly backup create` or `fastifly backup restore <file>`.");
    }

    if (args.command === "integrity") {
      if (args.subcommand === "env") {
        const result = await runIntegrityEnv(driver, databaseUrl);
        printIntegrityEnvResult(result, args.json, output);
        return result.healthy ? 0 : 1;
      }
      if (args.subcommand === "report") {
        const envResult = await runIntegrityEnv(driver, databaseUrl);
        const sumsResult = await runIntegritySums(driver, databaseUrl);
        const reportResult: IntegrityReportResult = {
          env: envResult,
          healthy: envResult.healthy && sumsResult.healthy,
          sums: sumsResult,
        };
        printIntegrityReportResult(reportResult, args.json, output);
        return reportResult.healthy ? 0 : 1;
      }
      if (args.subcommand === "sums") {
        const result = await runIntegritySums(driver, databaseUrl);
        printIntegritySumsResult(result, args.json, output);
        return result.healthy ? 0 : 1;
      }
      throw new Error(
        "Expected `fastifly integrity env`, `fastifly integrity report`, or `fastifly integrity sums`.",
      );
    }

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

  const client = createPostgresClient({ maxConnections: 1, url: databaseUrl });

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
  let outputPath: string | undefined;
  let yes = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      return {
        command: "help",
        databaseUrl,
        driver,
        json,
        outputPath: undefined,
        restorePath: undefined,
        yes,
      };
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--yes") {
      yes = true;
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
    if (arg === "--output") {
      outputPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg?.startsWith("--output=")) {
      outputPath = arg.slice("--output=".length);
      continue;
    }

    if (arg) {
      positional.push(arg);
    }
  }

  if (positional.length === 0) {
    return {
      command: "help",
      driver,
      databaseUrl,
      json,
      outputPath: undefined,
      restorePath: undefined,
      yes,
    };
  }
  if (positional[0] === "integrity") {
    if (positional[1] !== "env" && positional[1] !== "report" && positional[1] !== "sums") {
      throw new Error(
        "Expected `fastifly integrity env`, `fastifly integrity report`, or `fastifly integrity sums`.",
      );
    }
    return {
      command: "integrity",
      databaseUrl,
      driver,
      json,
      outputPath: undefined,
      restorePath: undefined,
      subcommand: positional[1],
      yes,
    };
  }
  if (positional[0] === "backup") {
    if (positional[1] !== "create" && positional[1] !== "restore") {
      throw new Error("Expected `fastifly backup create` or `fastifly backup restore <file>`.");
    }
    if (positional[1] === "restore" && !positional[2]) {
      throw new Error("Backup restore requires a backup file path.");
    }

    return {
      command: "backup",
      databaseUrl,
      driver,
      json,
      outputPath,
      restorePath: positional[1] === "restore" ? positional[2] : undefined,
      subcommand: positional[1],
      yes,
    };
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
    outputPath: undefined,
    restorePath: undefined,
    subcommand: positional[1],
    yes,
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

function requireRestorePath(restorePath: string | undefined): string {
  if (!restorePath) {
    throw new Error("Backup restore requires a backup file path.");
  }
  return restorePath;
}

function assertSqliteBackupDriver(driver: DatabaseDialect): void {
  if (driver !== "sqlite") {
    throw new Error(
      "Backup commands currently support DATABASE_DRIVER=sqlite only. Use pg_dump/pg_restore for PostgreSQL.",
    );
  }
}

async function runIntegrityEnv(
  driver: DatabaseDialect,
  databaseUrl: string,
): Promise<IntegrityEnvResult> {
  const migrationStatus = await readMigrationStatus(driver, databaseUrl);

  if (driver === "sqlite") {
    assertSqliteFilePath(databaseUrl, "Integrity checks require a file-based SQLite DATABASE_URL.");
    const resolvedPath = resolve(databaseUrl);

    if (!existsSync(resolvedPath)) {
      throw new Error(`SQLite database does not exist: ${resolvedPath}`);
    }

    const client = createConfiguredSqliteClient({ source: resolvedPath });

    try {
      const sqliteRuntimePragmas = readSqliteRuntimePragmas(client);
      const healthy =
        migrationStatus.pendingMigrations === 0 &&
        sqliteRuntimePragmas.foreignKeys &&
        sqliteRuntimePragmas.journalMode === "wal" &&
        sqliteRuntimePragmas.busyTimeoutMs >= 5000;
      return {
        appVersion: resolveAppVersion(),
        databaseUrl: resolvedPath,
        driver,
        healthy,
        migrationStatus,
        sqliteRuntimePragmas,
        timestamp: new Date().toISOString(),
      };
    } finally {
      client.close();
    }
  }

  const client = createPostgresClient({ maxConnections: 1, url: databaseUrl });

  try {
    await client`SELECT 1`;
    return {
      appVersion: resolveAppVersion(),
      databaseUrl,
      driver,
      healthy: migrationStatus.pendingMigrations === 0,
      migrationStatus,
      sqliteRuntimePragmas: null,
      timestamp: new Date().toISOString(),
    };
  } finally {
    await closePostgresClient(client);
  }
}

async function runIntegritySums(
  driver: DatabaseDialect,
  databaseUrl: string,
): Promise<IntegritySumsResult> {
  return driver === "sqlite"
    ? runSqliteIntegritySums(databaseUrl)
    : await runPostgresIntegritySums(databaseUrl);
}

async function runSqliteIntegritySums(databaseUrl: string): Promise<IntegritySumsResult> {
  assertSqliteFilePath(databaseUrl, "Integrity checks require a file-based SQLite DATABASE_URL.");
  const resolvedPath = resolve(databaseUrl);
  if (!existsSync(resolvedPath)) {
    throw new Error(`SQLite database does not exist: ${resolvedPath}`);
  }

  const maxViolations = 100;
  const client = createConfiguredSqliteClient({ source: resolvedPath });

  try {
    const sourceRows = client
      .prepare(
        `
          SELECT
            workspace_id AS workspaceId,
            ledger_id AS ledgerId,
            journal_id AS journalId,
            currency_code AS currencyCode,
            SUM(amount_minor) AS differenceMinor
          FROM transaction_postings
          GROUP BY workspace_id, ledger_id, journal_id, currency_code
          HAVING SUM(amount_minor) <> 0
          ORDER BY workspace_id, ledger_id, journal_id
          LIMIT ?
        `,
      )
      .safeIntegers()
      .all(maxViolations) as readonly {
      readonly currencyCode: string;
      readonly differenceMinor: bigint;
      readonly journalId: string;
      readonly ledgerId: string;
      readonly workspaceId: string;
    }[];

    const reportingRows = client
      .prepare(
        `
          SELECT
            workspace_id AS workspaceId,
            ledger_id AS ledgerId,
            journal_id AS journalId,
            reporting_currency_code AS currencyCode,
            SUM(reporting_amount_minor) AS differenceMinor
          FROM transaction_postings
          GROUP BY workspace_id, ledger_id, journal_id, reporting_currency_code
          HAVING SUM(reporting_amount_minor) <> 0
          ORDER BY workspace_id, ledger_id, journal_id
          LIMIT ?
        `,
      )
      .safeIntegers()
      .all(maxViolations) as readonly {
      readonly currencyCode: string;
      readonly differenceMinor: bigint;
      readonly journalId: string;
      readonly ledgerId: string;
      readonly workspaceId: string;
    }[];

    const sourceAmountViolations = sourceRows.map((row) => ({
      currencyCode: row.currencyCode,
      differenceMinor: row.differenceMinor.toString(),
      journalId: row.journalId,
      ledgerId: row.ledgerId,
      workspaceId: row.workspaceId,
    }));

    const reportingViolations = reportingRows.map((row) => ({
      currencyCode: row.currencyCode,
      differenceMinor: row.differenceMinor.toString(),
      journalId: row.journalId,
      ledgerId: row.ledgerId,
      workspaceId: row.workspaceId,
    }));

    return {
      driver: "sqlite",
      healthy: sourceAmountViolations.length === 0 && reportingViolations.length === 0,
      maxViolations,
      reportingViolations,
      reportingViolationsCount: reportingViolations.length,
      sourceAmountViolations,
      sourceAmountViolationsCount: sourceAmountViolations.length,
    };
  } finally {
    client.close();
  }
}

async function runPostgresIntegritySums(databaseUrl: string): Promise<IntegritySumsResult> {
  const maxViolations = 100;
  const client = createPostgresClient({ maxConnections: 1, url: databaseUrl });

  try {
    const sourceRows = await client<
      {
        readonly currencyCode: string;
        readonly differenceMinor: string;
        readonly journalId: string;
        readonly ledgerId: string;
        readonly workspaceId: string;
      }[]
    >`
      SELECT
        workspace_id AS "workspaceId",
        ledger_id AS "ledgerId",
        journal_id AS "journalId",
        currency_code AS "currencyCode",
        SUM(amount_minor)::text AS "differenceMinor"
      FROM transaction_postings
      GROUP BY workspace_id, ledger_id, journal_id, currency_code
      HAVING SUM(amount_minor) <> 0
      ORDER BY workspace_id, ledger_id, journal_id
      LIMIT ${maxViolations}
    `;
    const reportingRows = await client<
      {
        readonly currencyCode: string;
        readonly differenceMinor: string;
        readonly journalId: string;
        readonly ledgerId: string;
        readonly workspaceId: string;
      }[]
    >`
      SELECT
        workspace_id AS "workspaceId",
        ledger_id AS "ledgerId",
        journal_id AS "journalId",
        reporting_currency_code AS "currencyCode",
        SUM(reporting_amount_minor)::text AS "differenceMinor"
      FROM transaction_postings
      GROUP BY workspace_id, ledger_id, journal_id, reporting_currency_code
      HAVING SUM(reporting_amount_minor) <> 0
      ORDER BY workspace_id, ledger_id, journal_id
      LIMIT ${maxViolations}
    `;

    return {
      driver: "postgres",
      healthy: sourceRows.length === 0 && reportingRows.length === 0,
      maxViolations,
      reportingViolations: reportingRows,
      reportingViolationsCount: reportingRows.length,
      sourceAmountViolations: sourceRows,
      sourceAmountViolationsCount: sourceRows.length,
    };
  } finally {
    await closePostgresClient(client);
  }
}

async function runSqliteBackupCreate(
  databaseUrl: string,
  outputPath: string | undefined,
): Promise<BackupCreateResult> {
  assertSqliteFilePath(databaseUrl, "Backup create requires a file-based SQLite DATABASE_URL.");
  const sourcePath = resolve(databaseUrl);
  if (!existsSync(sourcePath)) {
    throw new Error(`SQLite source database does not exist: ${sourcePath}`);
  }
  const targetPath = resolveBackupPath(sourcePath, outputPath);

  if (sourcePath === targetPath) {
    throw new Error("Backup destination must be different from DATABASE_URL.");
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  const client = createConfiguredSqliteClient({ source: sourcePath });

  try {
    await client.backup(targetPath);
  } finally {
    client.close();
  }

  const status = await readSqliteMigrationStatus(sourcePath);
  const metadata: BackupMetadata = {
    appVersion: resolveAppVersion(),
    createdAt: new Date().toISOString(),
    driver: "sqlite",
    schemaVersion: status.appliedMigrations,
    sourceDatabasePath: sourcePath,
  };
  const metadataPath = `${targetPath}.meta.json`;
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

  return {
    backupPath: targetPath,
    metadata,
    metadataPath,
  };
}

async function runSqliteBackupRestore(input: {
  readonly backupPath: string;
  readonly databaseUrl: string;
  readonly yes: boolean;
}): Promise<BackupRestoreResult> {
  assertSqliteFilePath(
    input.databaseUrl,
    "Backup restore requires a file-based SQLite DATABASE_URL.",
  );
  if (!input.yes) {
    throw new Error("Backup restore is destructive. Re-run with --yes to confirm overwrite.");
  }

  const sourcePath = resolve(input.backupPath);
  const destinationPath = resolve(input.databaseUrl);

  if (!existsSync(sourcePath)) {
    throw new Error(`Backup file does not exist: ${sourcePath}`);
  }
  if (sourcePath === destinationPath) {
    throw new Error("Backup source and DATABASE_URL must be different for restore.");
  }

  const metadataPath = `${sourcePath}.meta.json`;
  const metadata = readBackupMetadata(metadataPath);

  mkdirSync(dirname(destinationPath), { recursive: true });
  const tempPath = `${destinationPath}.restore.tmp-${Date.now()}`;
  const emergencyBackupPath = existsSync(destinationPath)
    ? `${destinationPath}.pre-restore-${formatFileTimestamp(new Date())}.db`
    : null;

  try {
    if (emergencyBackupPath) {
      copyFileSync(destinationPath, emergencyBackupPath);
    }
    copyFileSync(sourcePath, tempPath);
    renameSync(tempPath, destinationPath);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }

  const status = await readSqliteMigrationStatus(destinationPath);

  return {
    backupPath: sourcePath,
    emergencyBackupPath,
    metadata,
    metadataPath: metadata ? metadataPath : null,
    restoredDatabasePath: destinationPath,
    schemaVersion: status.appliedMigrations,
  };
}

function readBackupMetadata(metadataPath: string): BackupMetadata | null {
  if (!existsSync(metadataPath)) {
    return null;
  }

  const parsed = JSON.parse(readFileSync(metadataPath, "utf8")) as {
    readonly appVersion?: string;
    readonly createdAt?: string;
    readonly driver?: string;
    readonly schemaVersion?: number;
    readonly sourceDatabasePath?: string;
  };

  if (
    typeof parsed.appVersion !== "string" ||
    typeof parsed.createdAt !== "string" ||
    parsed.driver !== "sqlite" ||
    typeof parsed.schemaVersion !== "number" ||
    typeof parsed.sourceDatabasePath !== "string"
  ) {
    throw new Error(`Backup metadata is invalid: ${metadataPath}`);
  }

  return {
    appVersion: parsed.appVersion,
    createdAt: parsed.createdAt,
    driver: "sqlite",
    schemaVersion: parsed.schemaVersion,
    sourceDatabasePath: parsed.sourceDatabasePath,
  };
}

function resolveBackupPath(sourcePath: string, outputPath: string | undefined): string {
  if (outputPath) {
    return resolve(outputPath);
  }

  const sourceExtension = extname(sourcePath) || ".db";
  const sourceBaseName = basename(sourcePath, sourceExtension);
  const backupName = `${sourceBaseName}.backup-${formatFileTimestamp(new Date())}${sourceExtension}`;
  return resolve(dirname(sourcePath), backupName);
}

function resolveAppVersion(): string {
  return process.env.FASTIFLY_APP_VERSION ?? process.env.npm_package_version ?? "0.1.0";
}

function assertSqliteFilePath(databaseUrl: string, message: string): void {
  if (databaseUrl === ":memory:" || databaseUrl.startsWith("file:")) {
    throw new Error(message);
  }
}

function formatFileTimestamp(date: Date): string {
  return [
    date.getUTCFullYear(),
    padTwo(date.getUTCMonth() + 1),
    padTwo(date.getUTCDate()),
    "-",
    padTwo(date.getUTCHours()),
    padTwo(date.getUTCMinutes()),
    padTwo(date.getUTCSeconds()),
  ].join("");
}

function padTwo(value: number): string {
  return value.toString().padStart(2, "0");
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
  const client = createPostgresClient({ maxConnections: 1, url: databaseUrl });

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

function printBackupCreateResult(
  result: BackupCreateResult,
  json: boolean,
  output: CliOutput,
): void {
  if (json) {
    output.stdout(`${JSON.stringify(result)}\n`);
    return;
  }

  output.stdout(
    [
      "Fastifly backup created",
      `backup: ${result.backupPath}`,
      `metadata: ${result.metadataPath}`,
      `schema version: ${result.metadata.schemaVersion}`,
      "",
    ].join("\n"),
  );
}

function printBackupRestoreResult(
  result: BackupRestoreResult,
  json: boolean,
  output: CliOutput,
): void {
  if (json) {
    output.stdout(`${JSON.stringify(result)}\n`);
    return;
  }

  output.stdout(
    [
      "Fastifly backup restored",
      `source backup: ${result.backupPath}`,
      `restored database: ${result.restoredDatabasePath}`,
      result.emergencyBackupPath
        ? `emergency backup: ${result.emergencyBackupPath}`
        : "emergency backup: not required",
      `schema version: ${result.schemaVersion}`,
      result.metadataPath ? `metadata: ${result.metadataPath}` : "metadata: not found",
      "",
    ].join("\n"),
  );
}

function printIntegrityEnvResult(
  result: IntegrityEnvResult,
  json: boolean,
  output: CliOutput,
): void {
  if (json) {
    output.stdout(`${JSON.stringify(result)}\n`);
    return;
  }

  output.stdout(
    [
      "Fastifly integrity env",
      `driver: ${result.driver}`,
      `database: ${result.databaseUrl}`,
      `healthy: ${result.healthy ? "yes" : "no"}`,
      `migrations pending: ${result.migrationStatus.pendingMigrations}`,
      result.sqliteRuntimePragmas
        ? `sqlite pragmas: foreign_keys=${result.sqliteRuntimePragmas.foreignKeys}, journal_mode=${result.sqliteRuntimePragmas.journalMode}, busy_timeout=${result.sqliteRuntimePragmas.busyTimeoutMs}, synchronous=${result.sqliteRuntimePragmas.synchronous}`
        : "sqlite pragmas: n/a",
      "",
    ].join("\n"),
  );
}

function printIntegritySumsResult(
  result: IntegritySumsResult,
  json: boolean,
  output: CliOutput,
): void {
  if (json) {
    output.stdout(`${JSON.stringify(result)}\n`);
    return;
  }

  output.stdout(
    [
      "Fastifly integrity sums",
      `driver: ${result.driver}`,
      `healthy: ${result.healthy ? "yes" : "no"}`,
      `source amount violations: ${result.sourceAmountViolationsCount}`,
      `reporting amount violations: ${result.reportingViolationsCount}`,
      `max violations shown: ${result.maxViolations}`,
      "",
    ].join("\n"),
  );
}

function printIntegrityReportResult(
  result: IntegrityReportResult,
  json: boolean,
  output: CliOutput,
): void {
  if (json) {
    output.stdout(`${JSON.stringify(result)}\n`);
    return;
  }

  output.stdout(
    [
      "Fastifly integrity report",
      `driver: ${result.env.driver}`,
      `database: ${result.env.databaseUrl}`,
      `healthy: ${result.healthy ? "yes" : "no"}`,
      `migrations pending: ${result.env.migrationStatus.pendingMigrations}`,
      `source amount violations: ${result.sums.sourceAmountViolationsCount}`,
      `reporting amount violations: ${result.sums.reportingViolationsCount}`,
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
    "  fastifly integrity env --driver sqlite --database-url ./data/fastifly.db",
    "  fastifly integrity report --driver sqlite --database-url ./data/fastifly.db",
    "  fastifly integrity sums --driver sqlite --database-url ./data/fastifly.db",
    "  fastifly backup create --driver sqlite --database-url ./data/fastifly.db",
    "  fastifly backup restore ./data/fastifly.backup.db --yes --driver sqlite --database-url ./data/fastifly.db",
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
