export type { MigrationCommand, MigrationCommandName } from "./migrations/commands.js";
export { MIGRATION_COMMANDS } from "./migrations/commands.js";
export type {
  DatabaseDialect,
  Migration,
  MigrationExecutor,
} from "./migrations/types.js";
export { runMigrations } from "./migrations/types.js";
export type {
  PostgresClient,
  PostgresClientConfig,
  PostgresDatabase,
} from "./postgres/client.js";
export {
  createPostgresClient,
  createPostgresDatabase,
  createPostgresDatabaseFromClient,
} from "./postgres/client.js";
export * as postgresSchema from "./postgres/schema.js";
export { pgSchema } from "./postgres/schema.js";
export type {
  LedgerRepositoryContext,
  RepositoryClock,
  RepositoryContext,
  WorkspaceRepositoryContext,
} from "./repositories/base.js";
export {
  assertLedgerScope,
  assertSameWorkspace,
  makeTimestamp,
  systemClock,
} from "./repositories/base.js";
export type {
  AcceptWorkspaceInvitationInput,
  BootstrapDefaultWorkspaceInput,
  BootstrapDefaultWorkspaceResult,
  CreatePasskeyChallengeInput,
  CreatePasskeyInput,
  CreateSessionInput,
  CreateUserInput,
  CreateWorkspaceInvitationInput,
  DeclineWorkspaceInvitationInput,
  DeletePasskeyInput,
  FindActivePasskeyChallengeInput,
  FindActiveWorkspaceInvitationInput,
  IdentityRepository,
  IdentityRepositoryOptions,
  LedgerRecord,
  PasskeyChallengeKind,
  PasskeyChallengeRecord,
  PasskeyRecord,
  RecoveryCodeRecord,
  RemoveWorkspaceMemberInput,
  RenamePasskeyInput,
  ReplaceRecoveryCodesInput,
  RepositoryIdGenerator,
  RevokeWorkspaceInvitationInput,
  SessionRecord,
  UpdatePasskeyAfterLoginInput,
  UpdateWorkspaceMemberRoleInput,
  UserRecord,
  UserWorkspaceContextRecord,
  WorkspaceInvitationRecord,
  WorkspaceInvitationRole,
  WorkspaceMemberRecord,
  WorkspaceMemberWithUserRecord,
  WorkspaceRecord,
} from "./repositories/identity.js";
export {
  createPostgresIdentityRepository,
  createSqliteIdentityRepository,
  normalizeUsername,
} from "./repositories/identity.js";
export type { AuditAction, JobQueueStatus, JsonObject } from "./schema-types.js";
export type { SqliteClient, SqliteClientConfig, SqliteDatabase } from "./sqlite/client.js";
export {
  createSqliteClient,
  createSqliteDatabase,
  createSqliteDatabaseFromClient,
} from "./sqlite/client.js";
export * as sqliteSchemaDefinitions from "./sqlite/schema.js";
export { sqliteSchema } from "./sqlite/schema.js";
export type { TransactionCapable } from "./transactions.js";
export { withDatabaseTransaction } from "./transactions.js";
