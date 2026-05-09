export type DatabaseDialect = "sqlite" | "postgres";

export type Migration = {
  readonly id: string;
  readonly dialect: DatabaseDialect;
  readonly sql: string;
};

export type MigrationExecutor = {
  readonly execute: (sql: string) => Promise<void> | void;
};

export async function runMigrations(
  executor: MigrationExecutor,
  migrations: readonly Migration[],
): Promise<void> {
  for (const migration of migrations) {
    await executor.execute(migration.sql);
  }
}
