import { createUuidV7, parseSyncedId, type SyncedId } from "@fastifly/common";
import { and, asc, eq, gt, isNull } from "drizzle-orm";

import type { PostgresDatabase } from "../postgres/client.js";
import {
  pgLedgers,
  pgPasskeyChallenges,
  pgPasskeys,
  pgRecoveryCodes,
  pgSessions,
  pgUsers,
  pgWorkspaceInvitations,
  pgWorkspaceMembers,
  pgWorkspaces,
} from "../postgres/schema.js";
import type { SqliteDatabase } from "../sqlite/client.js";
import {
  sqliteLedgers,
  sqlitePasskeyChallenges,
  sqlitePasskeys,
  sqliteRecoveryCodes,
  sqliteSessions,
  sqliteUsers,
  sqliteWorkspaceInvitations,
  sqliteWorkspaceMembers,
  sqliteWorkspaces,
} from "../sqlite/schema.js";
import type { RepositoryClock } from "./base.js";
import { makeTimestamp, systemClock } from "./base.js";

export type RepositoryIdGenerator = () => SyncedId;

export type IdentityRepositoryOptions = {
  readonly clock?: RepositoryClock;
  readonly createId?: RepositoryIdGenerator;
};

export type UserRecord = {
  readonly id: SyncedId;
  readonly username: string;
  readonly usernameNormalized: string;
  readonly displayName: string;
  readonly passwordHash: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly disabledAt: string | null;
};

export type SessionRecord = {
  readonly id: SyncedId;
  readonly userId: SyncedId;
  readonly tokenHash: string;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
};

export type WorkspaceRecord = {
  readonly id: SyncedId;
  readonly name: string;
  readonly ownerUserId: SyncedId;
  readonly status: WorkspaceLedgerLifecycleStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
};

export type WorkspaceLedgerLifecycleStatus =
  | "active"
  | "read_only"
  | "maintenance"
  | "archived"
  | "restore_preview"
  | "pending_restore"
  | "broken";

export type WorkspaceMemberRecord = {
  readonly id: SyncedId;
  readonly workspaceId: SyncedId;
  readonly userId: SyncedId;
  readonly role: "owner" | "admin" | "editor" | "viewer";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly removedAt: string | null;
};

export type WorkspaceMemberWithUserRecord = WorkspaceMemberRecord & {
  readonly user: Pick<UserRecord, "id" | "username" | "displayName" | "disabledAt">;
};

export type LedgerRecord = {
  readonly id: SyncedId;
  readonly workspaceId: SyncedId;
  readonly name: string;
  readonly baseCurrencyCode: string;
  readonly firstDayOfWeek: number;
  readonly status: WorkspaceLedgerLifecycleStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
};

export type RecoveryCodeRecord = {
  readonly id: SyncedId;
  readonly userId: SyncedId;
  readonly codeHash: string;
  readonly createdAt: string;
  readonly usedAt: string | null;
};

export type WorkspaceInvitationRole = "admin" | "editor" | "viewer";

export type WorkspaceInvitationRecord = {
  readonly id: SyncedId;
  readonly workspaceId: SyncedId;
  readonly invitedByUserId: SyncedId;
  readonly inviteeIdentifier: string;
  readonly role: WorkspaceInvitationRole;
  readonly tokenHash: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly acceptedAt: string | null;
  readonly revokedAt: string | null;
};

export type PasskeyChallengeKind = "registration" | "login";

export type PasskeyChallengeRecord = {
  readonly id: SyncedId;
  readonly userId: SyncedId | null;
  readonly kind: PasskeyChallengeKind;
  readonly challenge: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly consumedAt: string | null;
};

export type PasskeyRecord = {
  readonly id: SyncedId;
  readonly userId: SyncedId;
  readonly credentialId: string;
  readonly publicKey: string;
  readonly counter: number;
  readonly transportsJson: readonly string[] | null;
  readonly name: string;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
};

export type CreateUserInput = {
  readonly username: string;
  readonly displayName: string;
  readonly passwordHash: string;
};

export type CreateSessionInput = {
  readonly userId: SyncedId;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly userAgent?: string | null;
  readonly ipAddress?: string | null;
};

export type BootstrapDefaultWorkspaceInput = {
  readonly userId: SyncedId;
  readonly workspaceName?: string;
  readonly ledgerName?: string;
  readonly baseCurrencyCode?: string;
  readonly firstDayOfWeek?: number;
};

export type ReplaceRecoveryCodesInput = {
  readonly userId: SyncedId;
  readonly codeHashes: readonly string[];
};

export type CreateWorkspaceInvitationInput = {
  readonly workspaceId: SyncedId;
  readonly invitedByUserId: SyncedId;
  readonly inviteeIdentifier: string;
  readonly role: WorkspaceInvitationRole;
  readonly tokenHash: string;
  readonly expiresAt: Date;
};

export type FindActiveWorkspaceInvitationInput = {
  readonly tokenHash: string;
  readonly now?: Date;
};

export type AcceptWorkspaceInvitationInput = {
  readonly invitationId: SyncedId;
  readonly userId: SyncedId;
};

export type RevokeWorkspaceInvitationInput = {
  readonly invitationId: SyncedId;
  readonly workspaceId: SyncedId;
};

export type DeclineWorkspaceInvitationInput = {
  readonly invitationId: SyncedId;
};

export type UpdateWorkspaceMemberRoleInput = {
  readonly workspaceId: SyncedId;
  readonly userId: SyncedId;
  readonly role: Exclude<WorkspaceMemberRecord["role"], "owner">;
};

export type RemoveWorkspaceMemberInput = {
  readonly workspaceId: SyncedId;
  readonly userId: SyncedId;
};

export type CreatePasskeyChallengeInput = {
  readonly userId?: SyncedId | null;
  readonly kind: PasskeyChallengeKind;
  readonly challenge: string;
  readonly expiresAt: Date;
};

export type FindActivePasskeyChallengeInput = {
  readonly id: SyncedId;
  readonly kind: PasskeyChallengeKind;
  readonly now?: Date;
};

export type CreatePasskeyInput = {
  readonly userId: SyncedId;
  readonly credentialId: string;
  readonly publicKey: string;
  readonly counter: number;
  readonly transportsJson?: readonly string[] | null;
  readonly name: string;
};

export type RenamePasskeyInput = {
  readonly id: SyncedId;
  readonly userId: SyncedId;
  readonly name: string;
};

export type DeletePasskeyInput = {
  readonly id: SyncedId;
  readonly userId: SyncedId;
};

export type UpdatePasskeyAfterLoginInput = {
  readonly credentialId: string;
  readonly counter: number;
};

export type BootstrapDefaultWorkspaceResult = {
  readonly workspace: WorkspaceRecord;
  readonly membership: WorkspaceMemberRecord;
  readonly ledger: LedgerRecord;
};

export type UserWorkspaceContextRecord = {
  readonly activeWorkspace: WorkspaceRecord & {
    readonly role: WorkspaceMemberRecord["role"];
  };
  readonly activeLedger: LedgerRecord;
};

export type IdentityRepository = {
  readonly createUser: (input: CreateUserInput) => Promise<UserRecord>;
  readonly findUserByNormalizedUsername: (username: string) => Promise<UserRecord | null>;
  readonly findUserById: (id: SyncedId) => Promise<UserRecord | null>;
  readonly findWorkspaceById: (id: SyncedId) => Promise<WorkspaceRecord | null>;
  readonly createSession: (input: CreateSessionInput) => Promise<SessionRecord>;
  readonly findActiveSessionByTokenHash: (
    tokenHash: string,
    now?: Date,
  ) => Promise<SessionRecord | null>;
  readonly revokeSession: (sessionId: SyncedId) => Promise<SessionRecord | null>;
  readonly bootstrapDefaultWorkspace: (
    input: BootstrapDefaultWorkspaceInput,
  ) => Promise<BootstrapDefaultWorkspaceResult>;
  readonly findDefaultWorkspaceContextForUser: (
    userId: SyncedId,
  ) => Promise<UserWorkspaceContextRecord | null>;
  readonly replaceRecoveryCodes: (
    input: ReplaceRecoveryCodesInput,
  ) => Promise<readonly RecoveryCodeRecord[]>;
  readonly deleteRecoveryCodesForUser: (userId: SyncedId) => Promise<void>;
  readonly createWorkspaceInvitation: (
    input: CreateWorkspaceInvitationInput,
  ) => Promise<WorkspaceInvitationRecord>;
  readonly findActiveWorkspaceInvitationByTokenHash: (
    input: FindActiveWorkspaceInvitationInput,
  ) => Promise<WorkspaceInvitationRecord | null>;
  readonly acceptWorkspaceInvitation: (
    input: AcceptWorkspaceInvitationInput,
  ) => Promise<WorkspaceMemberRecord | null>;
  readonly revokeWorkspaceInvitation: (
    input: RevokeWorkspaceInvitationInput,
  ) => Promise<WorkspaceInvitationRecord | null>;
  readonly declineWorkspaceInvitation: (
    input: DeclineWorkspaceInvitationInput,
  ) => Promise<WorkspaceInvitationRecord | null>;
  readonly listWorkspaceMembers: (
    workspaceId: SyncedId,
  ) => Promise<readonly WorkspaceMemberWithUserRecord[]>;
  readonly findWorkspaceMember: (
    workspaceId: SyncedId,
    userId: SyncedId,
  ) => Promise<WorkspaceMemberRecord | null>;
  readonly updateWorkspaceMemberRole: (
    input: UpdateWorkspaceMemberRoleInput,
  ) => Promise<WorkspaceMemberRecord | null>;
  readonly removeWorkspaceMember: (
    input: RemoveWorkspaceMemberInput,
  ) => Promise<WorkspaceMemberRecord | null>;
  readonly createPasskeyChallenge: (
    input: CreatePasskeyChallengeInput,
  ) => Promise<PasskeyChallengeRecord>;
  readonly findActivePasskeyChallenge: (
    input: FindActivePasskeyChallengeInput,
  ) => Promise<PasskeyChallengeRecord | null>;
  readonly consumePasskeyChallenge: (id: SyncedId) => Promise<PasskeyChallengeRecord | null>;
  readonly createPasskey: (input: CreatePasskeyInput) => Promise<PasskeyRecord>;
  readonly listPasskeysByUserId: (userId: SyncedId) => Promise<readonly PasskeyRecord[]>;
  readonly findPasskeyByCredentialId: (credentialId: string) => Promise<PasskeyRecord | null>;
  readonly renamePasskey: (input: RenamePasskeyInput) => Promise<PasskeyRecord | null>;
  readonly deletePasskey: (input: DeletePasskeyInput) => Promise<PasskeyRecord | null>;
  readonly updatePasskeyAfterLogin: (
    input: UpdatePasskeyAfterLoginInput,
  ) => Promise<PasskeyRecord | null>;
};

type SqliteUserRow = typeof sqliteUsers.$inferSelect;
type SqliteSessionRow = typeof sqliteSessions.$inferSelect;
type SqlitePasskeyRow = typeof sqlitePasskeys.$inferSelect;
type SqlitePasskeyChallengeRow = typeof sqlitePasskeyChallenges.$inferSelect;
type SqliteWorkspaceRow = typeof sqliteWorkspaces.$inferSelect;
type SqliteWorkspaceMemberRow = typeof sqliteWorkspaceMembers.$inferSelect;
type SqliteLedgerRow = typeof sqliteLedgers.$inferSelect;
type SqliteRecoveryCodeRow = typeof sqliteRecoveryCodes.$inferSelect;
type SqliteWorkspaceInvitationRow = typeof sqliteWorkspaceInvitations.$inferSelect;

type PostgresUserRow = typeof pgUsers.$inferSelect;
type PostgresSessionRow = typeof pgSessions.$inferSelect;
type PostgresPasskeyRow = typeof pgPasskeys.$inferSelect;
type PostgresPasskeyChallengeRow = typeof pgPasskeyChallenges.$inferSelect;
type PostgresWorkspaceRow = typeof pgWorkspaces.$inferSelect;
type PostgresWorkspaceMemberRow = typeof pgWorkspaceMembers.$inferSelect;
type PostgresLedgerRow = typeof pgLedgers.$inferSelect;
type PostgresRecoveryCodeRow = typeof pgRecoveryCodes.$inferSelect;
type PostgresWorkspaceInvitationRow = typeof pgWorkspaceInvitations.$inferSelect;

const DEFAULT_WORKSPACE_NAME = "My workspace";
const DEFAULT_LEDGER_NAME = "Main ledger";
const DEFAULT_BASE_CURRENCY_CODE = "USD";
const DEFAULT_FIRST_DAY_OF_WEEK = 1;

function resolveOptions(
  options: IdentityRepositoryOptions = {},
): Required<IdentityRepositoryOptions> {
  return {
    clock: options.clock ?? systemClock,
    createId: options.createId ?? createUuidV7,
  };
}

export function normalizeUsername(username: string): string {
  return username.trim().toLocaleLowerCase("en-US");
}

function assertCreated<T>(rows: readonly T[], entityName: string): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`${entityName} insert did not return a row`);
  }

  return row;
}

function toIsoString(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function toUserRecord(row: SqliteUserRow | PostgresUserRow): UserRecord {
  return {
    id: parseSyncedId(row.id),
    username: row.username,
    usernameNormalized: row.usernameNormalized,
    displayName: row.displayName,
    passwordHash: row.passwordHash,
    createdAt: toIsoString(row.createdAt) ?? "",
    updatedAt: toIsoString(row.updatedAt) ?? "",
    disabledAt: toIsoString(row.disabledAt),
  };
}

function toSessionRecord(row: SqliteSessionRow | PostgresSessionRow): SessionRecord {
  return {
    id: parseSyncedId(row.id),
    userId: parseSyncedId(row.userId),
    tokenHash: row.tokenHash,
    userAgent: row.userAgent,
    ipAddress: row.ipAddress,
    createdAt: toIsoString(row.createdAt) ?? "",
    expiresAt: toIsoString(row.expiresAt) ?? "",
    revokedAt: toIsoString(row.revokedAt),
  };
}

function toPasskeyRecord(row: SqlitePasskeyRow | PostgresPasskeyRow): PasskeyRecord {
  return {
    id: parseSyncedId(row.id),
    userId: parseSyncedId(row.userId),
    credentialId: row.credentialId,
    publicKey: row.publicKey,
    counter: row.counter,
    transportsJson: row.transportsJson,
    name: row.name,
    createdAt: toIsoString(row.createdAt) ?? "",
    lastUsedAt: toIsoString(row.lastUsedAt),
  };
}

function toPasskeyChallengeRecord(
  row: SqlitePasskeyChallengeRow | PostgresPasskeyChallengeRow,
): PasskeyChallengeRecord {
  return {
    id: parseSyncedId(row.id),
    userId: row.userId ? parseSyncedId(row.userId) : null,
    kind: row.kind as PasskeyChallengeKind,
    challenge: row.challenge,
    createdAt: toIsoString(row.createdAt) ?? "",
    expiresAt: toIsoString(row.expiresAt) ?? "",
    consumedAt: toIsoString(row.consumedAt),
  };
}

export function toWorkspaceRecord(row: SqliteWorkspaceRow | PostgresWorkspaceRow): WorkspaceRecord {
  return {
    id: parseSyncedId(row.id),
    name: row.name,
    ownerUserId: parseSyncedId(row.ownerUserId),
    status: row.status as WorkspaceLedgerLifecycleStatus,
    createdAt: toIsoString(row.createdAt) ?? "",
    updatedAt: toIsoString(row.updatedAt) ?? "",
    archivedAt: toIsoString(row.archivedAt),
  };
}

function toWorkspaceMemberRecord(
  row: SqliteWorkspaceMemberRow | PostgresWorkspaceMemberRow,
): WorkspaceMemberRecord {
  return {
    id: parseSyncedId(row.id),
    workspaceId: parseSyncedId(row.workspaceId),
    userId: parseSyncedId(row.userId),
    role: row.role as WorkspaceMemberRecord["role"],
    createdAt: toIsoString(row.createdAt) ?? "",
    updatedAt: toIsoString(row.updatedAt) ?? "",
    removedAt: toIsoString(row.removedAt),
  };
}

export function toLedgerRecord(row: SqliteLedgerRow | PostgresLedgerRow): LedgerRecord {
  return {
    id: parseSyncedId(row.id),
    workspaceId: parseSyncedId(row.workspaceId),
    name: row.name,
    baseCurrencyCode: row.baseCurrencyCode,
    firstDayOfWeek: row.firstDayOfWeek,
    status: row.status as WorkspaceLedgerLifecycleStatus,
    createdAt: toIsoString(row.createdAt) ?? "",
    updatedAt: toIsoString(row.updatedAt) ?? "",
    archivedAt: toIsoString(row.archivedAt),
  };
}

function toRecoveryCodeRecord(
  row: SqliteRecoveryCodeRow | PostgresRecoveryCodeRow,
): RecoveryCodeRecord {
  return {
    id: parseSyncedId(row.id),
    userId: parseSyncedId(row.userId),
    codeHash: row.codeHash,
    createdAt: toIsoString(row.createdAt) ?? "",
    usedAt: toIsoString(row.usedAt),
  };
}

function toWorkspaceInvitationRecord(
  row: SqliteWorkspaceInvitationRow | PostgresWorkspaceInvitationRow,
): WorkspaceInvitationRecord {
  return {
    id: parseSyncedId(row.id),
    workspaceId: parseSyncedId(row.workspaceId),
    invitedByUserId: parseSyncedId(row.invitedByUserId),
    inviteeIdentifier: row.inviteeIdentifier,
    role: row.role as WorkspaceInvitationRole,
    tokenHash: row.tokenHash,
    createdAt: toIsoString(row.createdAt) ?? "",
    expiresAt: toIsoString(row.expiresAt) ?? "",
    acceptedAt: toIsoString(row.acceptedAt),
    revokedAt: toIsoString(row.revokedAt),
  };
}

function toUserWorkspaceContextRecord(
  workspace: WorkspaceRecord,
  membership: WorkspaceMemberRecord,
  ledger: LedgerRecord,
): UserWorkspaceContextRecord {
  return {
    activeLedger: ledger,
    activeWorkspace: {
      ...workspace,
      role: membership.role,
    },
  };
}

export function createSqliteIdentityRepository(
  db: SqliteDatabase,
  options?: IdentityRepositoryOptions,
): IdentityRepository {
  const resolved = resolveOptions(options);

  return {
    async createUser(input) {
      const now = makeTimestamp(resolved.clock);
      const user = assertCreated(
        await db
          .insert(sqliteUsers)
          .values({
            id: resolved.createId(),
            username: input.username.trim(),
            usernameNormalized: normalizeUsername(input.username),
            displayName: input.displayName.trim(),
            passwordHash: input.passwordHash,
            createdAt: now,
            updatedAt: now,
          })
          .returning(),
        "User",
      );

      return toUserRecord(user);
    },

    async findUserByNormalizedUsername(username) {
      const normalizedUsername = normalizeUsername(username);
      const rows = await db
        .select()
        .from(sqliteUsers)
        .where(eq(sqliteUsers.usernameNormalized, normalizedUsername))
        .limit(1);

      return rows[0] ? toUserRecord(rows[0]) : null;
    },

    async findUserById(id) {
      const rows = await db.select().from(sqliteUsers).where(eq(sqliteUsers.id, id)).limit(1);

      return rows[0] ? toUserRecord(rows[0]) : null;
    },

    async findWorkspaceById(id) {
      const rows = await db
        .select()
        .from(sqliteWorkspaces)
        .where(eq(sqliteWorkspaces.id, id))
        .limit(1);

      return rows[0] ? toWorkspaceRecord(rows[0]) : null;
    },

    async createSession(input) {
      const now = makeTimestamp(resolved.clock);
      const session = assertCreated(
        await db
          .insert(sqliteSessions)
          .values({
            id: resolved.createId(),
            userId: input.userId,
            tokenHash: input.tokenHash,
            userAgent: input.userAgent ?? null,
            ipAddress: input.ipAddress ?? null,
            createdAt: now,
            expiresAt: input.expiresAt.toISOString(),
          })
          .returning(),
        "Session",
      );

      return toSessionRecord(session);
    },

    async findActiveSessionByTokenHash(tokenHash, now = resolved.clock.now()) {
      const rows = await db
        .select()
        .from(sqliteSessions)
        .where(
          and(
            eq(sqliteSessions.tokenHash, tokenHash),
            isNull(sqliteSessions.revokedAt),
            gt(sqliteSessions.expiresAt, now.toISOString()),
          ),
        )
        .limit(1);

      return rows[0] ? toSessionRecord(rows[0]) : null;
    },

    async revokeSession(sessionId) {
      const revokedAt = makeTimestamp(resolved.clock);
      const rows = await db
        .update(sqliteSessions)
        .set({ revokedAt })
        .where(eq(sqliteSessions.id, sessionId))
        .returning();

      return rows[0] ? toSessionRecord(rows[0]) : null;
    },

    async bootstrapDefaultWorkspace(input) {
      return db.transaction(async (tx) => {
        const now = makeTimestamp(resolved.clock);
        const workspace = assertCreated(
          await tx
            .insert(sqliteWorkspaces)
            .values({
              id: resolved.createId(),
              name: input.workspaceName?.trim() || DEFAULT_WORKSPACE_NAME,
              ownerUserId: input.userId,
              createdAt: now,
              updatedAt: now,
            })
            .returning(),
          "Workspace",
        );
        const membership = assertCreated(
          await tx
            .insert(sqliteWorkspaceMembers)
            .values({
              id: resolved.createId(),
              workspaceId: workspace.id,
              userId: input.userId,
              role: "owner",
              createdAt: now,
              updatedAt: now,
            })
            .returning(),
          "Workspace membership",
        );
        const ledger = assertCreated(
          await tx
            .insert(sqliteLedgers)
            .values({
              id: resolved.createId(),
              workspaceId: workspace.id,
              name: input.ledgerName?.trim() || DEFAULT_LEDGER_NAME,
              baseCurrencyCode: input.baseCurrencyCode ?? DEFAULT_BASE_CURRENCY_CODE,
              firstDayOfWeek: input.firstDayOfWeek ?? DEFAULT_FIRST_DAY_OF_WEEK,
              createdAt: now,
              updatedAt: now,
            })
            .returning(),
          "Ledger",
        );

        return {
          ledger: toLedgerRecord(ledger),
          membership: toWorkspaceMemberRecord(membership),
          workspace: toWorkspaceRecord(workspace),
        };
      });
    },

    async findDefaultWorkspaceContextForUser(userId) {
      const memberships = await db
        .select()
        .from(sqliteWorkspaceMembers)
        .where(
          and(eq(sqliteWorkspaceMembers.userId, userId), isNull(sqliteWorkspaceMembers.removedAt)),
        )
        .orderBy(asc(sqliteWorkspaceMembers.createdAt), asc(sqliteWorkspaceMembers.id));

      for (const membershipRow of memberships) {
        const workspaceRows = await db
          .select()
          .from(sqliteWorkspaces)
          .where(
            and(
              eq(sqliteWorkspaces.id, membershipRow.workspaceId),
              isNull(sqliteWorkspaces.archivedAt),
            ),
          )
          .limit(1);
        const ledgerRows = await db
          .select()
          .from(sqliteLedgers)
          .where(
            and(
              eq(sqliteLedgers.workspaceId, membershipRow.workspaceId),
              isNull(sqliteLedgers.archivedAt),
            ),
          )
          .orderBy(asc(sqliteLedgers.createdAt))
          .limit(1);

        if (workspaceRows[0] && ledgerRows[0]) {
          return toUserWorkspaceContextRecord(
            toWorkspaceRecord(workspaceRows[0]),
            toWorkspaceMemberRecord(membershipRow),
            toLedgerRecord(ledgerRows[0]),
          );
        }
      }

      return null;
    },

    async replaceRecoveryCodes(input) {
      return db.transaction(async (tx) => {
        await tx.delete(sqliteRecoveryCodes).where(eq(sqliteRecoveryCodes.userId, input.userId));

        if (input.codeHashes.length === 0) {
          return [];
        }

        const now = makeTimestamp(resolved.clock);
        const rows = await tx
          .insert(sqliteRecoveryCodes)
          .values(
            input.codeHashes.map((codeHash) => ({
              id: resolved.createId(),
              userId: input.userId,
              codeHash,
              createdAt: now,
            })),
          )
          .returning();

        return rows.map(toRecoveryCodeRecord);
      });
    },

    async deleteRecoveryCodesForUser(userId) {
      await db.delete(sqliteRecoveryCodes).where(eq(sqliteRecoveryCodes.userId, userId));
    },

    async createWorkspaceInvitation(input) {
      const now = makeTimestamp(resolved.clock);
      const row = assertCreated(
        await db
          .insert(sqliteWorkspaceInvitations)
          .values({
            id: resolved.createId(),
            workspaceId: input.workspaceId,
            invitedByUserId: input.invitedByUserId,
            inviteeIdentifier: input.inviteeIdentifier.trim(),
            role: input.role,
            tokenHash: input.tokenHash,
            createdAt: now,
            expiresAt: input.expiresAt.toISOString(),
          })
          .returning(),
        "Workspace invitation",
      );

      return toWorkspaceInvitationRecord(row);
    },

    async findActiveWorkspaceInvitationByTokenHash(input) {
      const rows = await db
        .select()
        .from(sqliteWorkspaceInvitations)
        .where(
          and(
            eq(sqliteWorkspaceInvitations.tokenHash, input.tokenHash),
            isNull(sqliteWorkspaceInvitations.acceptedAt),
            isNull(sqliteWorkspaceInvitations.revokedAt),
            gt(
              sqliteWorkspaceInvitations.expiresAt,
              (input.now ?? resolved.clock.now()).toISOString(),
            ),
          ),
        )
        .limit(1);

      return rows[0] ? toWorkspaceInvitationRecord(rows[0]) : null;
    },

    async acceptWorkspaceInvitation(input) {
      return db.transaction(async (tx) => {
        const now = makeTimestamp(resolved.clock);
        const invitationRows = await tx
          .select()
          .from(sqliteWorkspaceInvitations)
          .where(
            and(
              eq(sqliteWorkspaceInvitations.id, input.invitationId),
              isNull(sqliteWorkspaceInvitations.acceptedAt),
              isNull(sqliteWorkspaceInvitations.revokedAt),
              gt(sqliteWorkspaceInvitations.expiresAt, now),
            ),
          )
          .limit(1);
        const invitation = invitationRows[0];

        if (!invitation) {
          return null;
        }

        const existingMembershipRows = await tx
          .select()
          .from(sqliteWorkspaceMembers)
          .where(
            and(
              eq(sqliteWorkspaceMembers.workspaceId, invitation.workspaceId),
              eq(sqliteWorkspaceMembers.userId, input.userId),
            ),
          )
          .limit(1);
        const existingMembership = existingMembershipRows[0];
        const membership = existingMembership
          ? existingMembership.removedAt === null
            ? null
            : assertCreated(
                await tx
                  .update(sqliteWorkspaceMembers)
                  .set({
                    removedAt: null,
                    role: invitation.role,
                    updatedAt: now,
                  })
                  .where(eq(sqliteWorkspaceMembers.id, existingMembership.id))
                  .returning(),
                "Workspace membership",
              )
          : assertCreated(
              await tx
                .insert(sqliteWorkspaceMembers)
                .values({
                  id: resolved.createId(),
                  workspaceId: invitation.workspaceId,
                  userId: input.userId,
                  role: invitation.role,
                  createdAt: now,
                  updatedAt: now,
                })
                .returning(),
              "Workspace membership",
            );

        if (!membership) {
          return null;
        }

        await tx
          .update(sqliteWorkspaceInvitations)
          .set({ acceptedAt: now })
          .where(eq(sqliteWorkspaceInvitations.id, input.invitationId));

        return toWorkspaceMemberRecord(membership);
      });
    },

    async revokeWorkspaceInvitation(input) {
      const rows = await db
        .update(sqliteWorkspaceInvitations)
        .set({ revokedAt: makeTimestamp(resolved.clock) })
        .where(
          and(
            eq(sqliteWorkspaceInvitations.id, input.invitationId),
            eq(sqliteWorkspaceInvitations.workspaceId, input.workspaceId),
            isNull(sqliteWorkspaceInvitations.acceptedAt),
            isNull(sqliteWorkspaceInvitations.revokedAt),
          ),
        )
        .returning();

      return rows[0] ? toWorkspaceInvitationRecord(rows[0]) : null;
    },

    async declineWorkspaceInvitation(input) {
      const rows = await db
        .update(sqliteWorkspaceInvitations)
        .set({ revokedAt: makeTimestamp(resolved.clock) })
        .where(
          and(
            eq(sqliteWorkspaceInvitations.id, input.invitationId),
            isNull(sqliteWorkspaceInvitations.acceptedAt),
            isNull(sqliteWorkspaceInvitations.revokedAt),
          ),
        )
        .returning();

      return rows[0] ? toWorkspaceInvitationRecord(rows[0]) : null;
    },

    async listWorkspaceMembers(workspaceId) {
      const rows = await db
        .select()
        .from(sqliteWorkspaceMembers)
        .where(
          and(
            eq(sqliteWorkspaceMembers.workspaceId, workspaceId),
            isNull(sqliteWorkspaceMembers.removedAt),
          ),
        )
        .orderBy(asc(sqliteWorkspaceMembers.createdAt));
      const members: WorkspaceMemberWithUserRecord[] = [];

      for (const row of rows) {
        const userRows = await db
          .select()
          .from(sqliteUsers)
          .where(eq(sqliteUsers.id, row.userId))
          .limit(1);
        const user = userRows[0];

        if (user) {
          members.push({
            ...toWorkspaceMemberRecord(row),
            user: {
              disabledAt: toIsoString(user.disabledAt),
              displayName: user.displayName,
              id: parseSyncedId(user.id),
              username: user.username,
            },
          });
        }
      }

      return members;
    },

    async findWorkspaceMember(workspaceId, userId) {
      const rows = await db
        .select()
        .from(sqliteWorkspaceMembers)
        .where(
          and(
            eq(sqliteWorkspaceMembers.workspaceId, workspaceId),
            eq(sqliteWorkspaceMembers.userId, userId),
            isNull(sqliteWorkspaceMembers.removedAt),
          ),
        )
        .limit(1);

      return rows[0] ? toWorkspaceMemberRecord(rows[0]) : null;
    },

    async updateWorkspaceMemberRole(input) {
      const rows = await db
        .update(sqliteWorkspaceMembers)
        .set({ role: input.role, updatedAt: makeTimestamp(resolved.clock) })
        .where(
          and(
            eq(sqliteWorkspaceMembers.workspaceId, input.workspaceId),
            eq(sqliteWorkspaceMembers.userId, input.userId),
            isNull(sqliteWorkspaceMembers.removedAt),
          ),
        )
        .returning();

      return rows[0] ? toWorkspaceMemberRecord(rows[0]) : null;
    },

    async removeWorkspaceMember(input) {
      const now = makeTimestamp(resolved.clock);
      const rows = await db
        .update(sqliteWorkspaceMembers)
        .set({ removedAt: now, updatedAt: now })
        .where(
          and(
            eq(sqliteWorkspaceMembers.workspaceId, input.workspaceId),
            eq(sqliteWorkspaceMembers.userId, input.userId),
            isNull(sqliteWorkspaceMembers.removedAt),
          ),
        )
        .returning();

      return rows[0] ? toWorkspaceMemberRecord(rows[0]) : null;
    },

    async createPasskeyChallenge(input) {
      const now = makeTimestamp(resolved.clock);
      const row = assertCreated(
        await db
          .insert(sqlitePasskeyChallenges)
          .values({
            id: resolved.createId(),
            userId: input.userId ?? null,
            kind: input.kind,
            challenge: input.challenge,
            createdAt: now,
            expiresAt: input.expiresAt.toISOString(),
          })
          .returning(),
        "Passkey challenge",
      );

      return toPasskeyChallengeRecord(row);
    },

    async findActivePasskeyChallenge(input) {
      const rows = await db
        .select()
        .from(sqlitePasskeyChallenges)
        .where(
          and(
            eq(sqlitePasskeyChallenges.id, input.id),
            eq(sqlitePasskeyChallenges.kind, input.kind),
            isNull(sqlitePasskeyChallenges.consumedAt),
            gt(
              sqlitePasskeyChallenges.expiresAt,
              (input.now ?? resolved.clock.now()).toISOString(),
            ),
          ),
        )
        .limit(1);

      return rows[0] ? toPasskeyChallengeRecord(rows[0]) : null;
    },

    async consumePasskeyChallenge(id) {
      const rows = await db
        .update(sqlitePasskeyChallenges)
        .set({ consumedAt: makeTimestamp(resolved.clock) })
        .where(eq(sqlitePasskeyChallenges.id, id))
        .returning();

      return rows[0] ? toPasskeyChallengeRecord(rows[0]) : null;
    },

    async createPasskey(input) {
      const now = makeTimestamp(resolved.clock);
      const row = assertCreated(
        await db
          .insert(sqlitePasskeys)
          .values({
            id: resolved.createId(),
            userId: input.userId,
            credentialId: input.credentialId,
            publicKey: input.publicKey,
            counter: input.counter,
            transportsJson: input.transportsJson ? [...input.transportsJson] : null,
            name: input.name.trim() || "Passkey",
            createdAt: now,
          })
          .returning(),
        "Passkey",
      );

      return toPasskeyRecord(row);
    },

    async listPasskeysByUserId(userId) {
      const rows = await db
        .select()
        .from(sqlitePasskeys)
        .where(eq(sqlitePasskeys.userId, userId))
        .orderBy(asc(sqlitePasskeys.createdAt));

      return rows.map(toPasskeyRecord);
    },

    async findPasskeyByCredentialId(credentialId) {
      const rows = await db
        .select()
        .from(sqlitePasskeys)
        .where(eq(sqlitePasskeys.credentialId, credentialId))
        .limit(1);

      return rows[0] ? toPasskeyRecord(rows[0]) : null;
    },

    async renamePasskey(input) {
      const rows = await db
        .update(sqlitePasskeys)
        .set({ name: input.name.trim() || "Passkey" })
        .where(and(eq(sqlitePasskeys.id, input.id), eq(sqlitePasskeys.userId, input.userId)))
        .returning();

      return rows[0] ? toPasskeyRecord(rows[0]) : null;
    },

    async deletePasskey(input) {
      const rows = await db
        .delete(sqlitePasskeys)
        .where(and(eq(sqlitePasskeys.id, input.id), eq(sqlitePasskeys.userId, input.userId)))
        .returning();

      return rows[0] ? toPasskeyRecord(rows[0]) : null;
    },

    async updatePasskeyAfterLogin(input) {
      const rows = await db
        .update(sqlitePasskeys)
        .set({
          counter: input.counter,
          lastUsedAt: makeTimestamp(resolved.clock),
        })
        .where(eq(sqlitePasskeys.credentialId, input.credentialId))
        .returning();

      return rows[0] ? toPasskeyRecord(rows[0]) : null;
    },
  };
}

export function createPostgresIdentityRepository(
  db: PostgresDatabase,
  options?: IdentityRepositoryOptions,
): IdentityRepository {
  const resolved = resolveOptions(options);

  return {
    async createUser(input) {
      const now = resolved.clock.now();
      const user = assertCreated(
        await db
          .insert(pgUsers)
          .values({
            id: resolved.createId(),
            username: input.username.trim(),
            usernameNormalized: normalizeUsername(input.username),
            displayName: input.displayName.trim(),
            passwordHash: input.passwordHash,
            createdAt: now,
            updatedAt: now,
          })
          .returning(),
        "User",
      );

      return toUserRecord(user);
    },

    async findUserByNormalizedUsername(username) {
      const normalizedUsername = normalizeUsername(username);
      const rows = await db
        .select()
        .from(pgUsers)
        .where(eq(pgUsers.usernameNormalized, normalizedUsername))
        .limit(1);

      return rows[0] ? toUserRecord(rows[0]) : null;
    },

    async findUserById(id) {
      const rows = await db.select().from(pgUsers).where(eq(pgUsers.id, id)).limit(1);

      return rows[0] ? toUserRecord(rows[0]) : null;
    },

    async findWorkspaceById(id) {
      const rows = await db.select().from(pgWorkspaces).where(eq(pgWorkspaces.id, id)).limit(1);

      return rows[0] ? toWorkspaceRecord(rows[0]) : null;
    },

    async createSession(input) {
      const now = resolved.clock.now();
      const session = assertCreated(
        await db
          .insert(pgSessions)
          .values({
            id: resolved.createId(),
            userId: input.userId,
            tokenHash: input.tokenHash,
            userAgent: input.userAgent ?? null,
            ipAddress: input.ipAddress ?? null,
            createdAt: now,
            expiresAt: input.expiresAt,
          })
          .returning(),
        "Session",
      );

      return toSessionRecord(session);
    },

    async findActiveSessionByTokenHash(tokenHash, now = resolved.clock.now()) {
      const rows = await db
        .select()
        .from(pgSessions)
        .where(
          and(
            eq(pgSessions.tokenHash, tokenHash),
            isNull(pgSessions.revokedAt),
            gt(pgSessions.expiresAt, now),
          ),
        )
        .limit(1);

      return rows[0] ? toSessionRecord(rows[0]) : null;
    },

    async revokeSession(sessionId) {
      const revokedAt = resolved.clock.now();
      const rows = await db
        .update(pgSessions)
        .set({ revokedAt })
        .where(eq(pgSessions.id, sessionId))
        .returning();

      return rows[0] ? toSessionRecord(rows[0]) : null;
    },

    async bootstrapDefaultWorkspace(input) {
      return db.transaction(async (tx) => {
        const now = resolved.clock.now();
        const workspace = assertCreated(
          await tx
            .insert(pgWorkspaces)
            .values({
              id: resolved.createId(),
              name: input.workspaceName?.trim() || DEFAULT_WORKSPACE_NAME,
              ownerUserId: input.userId,
              createdAt: now,
              updatedAt: now,
            })
            .returning(),
          "Workspace",
        );
        const membership = assertCreated(
          await tx
            .insert(pgWorkspaceMembers)
            .values({
              id: resolved.createId(),
              workspaceId: workspace.id,
              userId: input.userId,
              role: "owner",
              createdAt: now,
              updatedAt: now,
            })
            .returning(),
          "Workspace membership",
        );
        const ledger = assertCreated(
          await tx
            .insert(pgLedgers)
            .values({
              id: resolved.createId(),
              workspaceId: workspace.id,
              name: input.ledgerName?.trim() || DEFAULT_LEDGER_NAME,
              baseCurrencyCode: input.baseCurrencyCode ?? DEFAULT_BASE_CURRENCY_CODE,
              firstDayOfWeek: input.firstDayOfWeek ?? DEFAULT_FIRST_DAY_OF_WEEK,
              createdAt: now,
              updatedAt: now,
            })
            .returning(),
          "Ledger",
        );

        return {
          ledger: toLedgerRecord(ledger),
          membership: toWorkspaceMemberRecord(membership),
          workspace: toWorkspaceRecord(workspace),
        };
      });
    },

    async findDefaultWorkspaceContextForUser(userId) {
      const memberships = await db
        .select()
        .from(pgWorkspaceMembers)
        .where(and(eq(pgWorkspaceMembers.userId, userId), isNull(pgWorkspaceMembers.removedAt)))
        .orderBy(asc(pgWorkspaceMembers.createdAt), asc(pgWorkspaceMembers.id));

      for (const membershipRow of memberships) {
        const workspaceRows = await db
          .select()
          .from(pgWorkspaces)
          .where(
            and(eq(pgWorkspaces.id, membershipRow.workspaceId), isNull(pgWorkspaces.archivedAt)),
          )
          .limit(1);
        const ledgerRows = await db
          .select()
          .from(pgLedgers)
          .where(
            and(eq(pgLedgers.workspaceId, membershipRow.workspaceId), isNull(pgLedgers.archivedAt)),
          )
          .orderBy(asc(pgLedgers.createdAt))
          .limit(1);

        if (workspaceRows[0] && ledgerRows[0]) {
          return toUserWorkspaceContextRecord(
            toWorkspaceRecord(workspaceRows[0]),
            toWorkspaceMemberRecord(membershipRow),
            toLedgerRecord(ledgerRows[0]),
          );
        }
      }

      return null;
    },

    async replaceRecoveryCodes(input) {
      return db.transaction(async (tx) => {
        await tx.delete(pgRecoveryCodes).where(eq(pgRecoveryCodes.userId, input.userId));

        if (input.codeHashes.length === 0) {
          return [];
        }

        const now = resolved.clock.now();
        const rows = await tx
          .insert(pgRecoveryCodes)
          .values(
            input.codeHashes.map((codeHash) => ({
              id: resolved.createId(),
              userId: input.userId,
              codeHash,
              createdAt: now,
            })),
          )
          .returning();

        return rows.map(toRecoveryCodeRecord);
      });
    },

    async deleteRecoveryCodesForUser(userId) {
      await db.delete(pgRecoveryCodes).where(eq(pgRecoveryCodes.userId, userId));
    },

    async createWorkspaceInvitation(input) {
      const now = resolved.clock.now();
      const row = assertCreated(
        await db
          .insert(pgWorkspaceInvitations)
          .values({
            id: resolved.createId(),
            workspaceId: input.workspaceId,
            invitedByUserId: input.invitedByUserId,
            inviteeIdentifier: input.inviteeIdentifier.trim(),
            role: input.role,
            tokenHash: input.tokenHash,
            createdAt: now,
            expiresAt: input.expiresAt,
          })
          .returning(),
        "Workspace invitation",
      );

      return toWorkspaceInvitationRecord(row);
    },

    async findActiveWorkspaceInvitationByTokenHash(input) {
      const rows = await db
        .select()
        .from(pgWorkspaceInvitations)
        .where(
          and(
            eq(pgWorkspaceInvitations.tokenHash, input.tokenHash),
            isNull(pgWorkspaceInvitations.acceptedAt),
            isNull(pgWorkspaceInvitations.revokedAt),
            gt(pgWorkspaceInvitations.expiresAt, input.now ?? resolved.clock.now()),
          ),
        )
        .limit(1);

      return rows[0] ? toWorkspaceInvitationRecord(rows[0]) : null;
    },

    async acceptWorkspaceInvitation(input) {
      return db.transaction(async (tx) => {
        const now = resolved.clock.now();
        const invitationRows = await tx
          .select()
          .from(pgWorkspaceInvitations)
          .where(
            and(
              eq(pgWorkspaceInvitations.id, input.invitationId),
              isNull(pgWorkspaceInvitations.acceptedAt),
              isNull(pgWorkspaceInvitations.revokedAt),
              gt(pgWorkspaceInvitations.expiresAt, now),
            ),
          )
          .limit(1);
        const invitation = invitationRows[0];

        if (!invitation) {
          return null;
        }

        const existingMembershipRows = await tx
          .select()
          .from(pgWorkspaceMembers)
          .where(
            and(
              eq(pgWorkspaceMembers.workspaceId, invitation.workspaceId),
              eq(pgWorkspaceMembers.userId, input.userId),
            ),
          )
          .limit(1);
        const existingMembership = existingMembershipRows[0];
        const membership = existingMembership
          ? existingMembership.removedAt === null
            ? null
            : assertCreated(
                await tx
                  .update(pgWorkspaceMembers)
                  .set({
                    removedAt: null,
                    role: invitation.role,
                    updatedAt: now,
                  })
                  .where(eq(pgWorkspaceMembers.id, existingMembership.id))
                  .returning(),
                "Workspace membership",
              )
          : assertCreated(
              await tx
                .insert(pgWorkspaceMembers)
                .values({
                  id: resolved.createId(),
                  workspaceId: invitation.workspaceId,
                  userId: input.userId,
                  role: invitation.role,
                  createdAt: now,
                  updatedAt: now,
                })
                .returning(),
              "Workspace membership",
            );

        if (!membership) {
          return null;
        }

        await tx
          .update(pgWorkspaceInvitations)
          .set({ acceptedAt: now })
          .where(eq(pgWorkspaceInvitations.id, input.invitationId));

        return toWorkspaceMemberRecord(membership);
      });
    },

    async revokeWorkspaceInvitation(input) {
      const rows = await db
        .update(pgWorkspaceInvitations)
        .set({ revokedAt: resolved.clock.now() })
        .where(
          and(
            eq(pgWorkspaceInvitations.id, input.invitationId),
            eq(pgWorkspaceInvitations.workspaceId, input.workspaceId),
            isNull(pgWorkspaceInvitations.acceptedAt),
            isNull(pgWorkspaceInvitations.revokedAt),
          ),
        )
        .returning();

      return rows[0] ? toWorkspaceInvitationRecord(rows[0]) : null;
    },

    async declineWorkspaceInvitation(input) {
      const rows = await db
        .update(pgWorkspaceInvitations)
        .set({ revokedAt: resolved.clock.now() })
        .where(
          and(
            eq(pgWorkspaceInvitations.id, input.invitationId),
            isNull(pgWorkspaceInvitations.acceptedAt),
            isNull(pgWorkspaceInvitations.revokedAt),
          ),
        )
        .returning();

      return rows[0] ? toWorkspaceInvitationRecord(rows[0]) : null;
    },

    async listWorkspaceMembers(workspaceId) {
      const rows = await db
        .select()
        .from(pgWorkspaceMembers)
        .where(
          and(
            eq(pgWorkspaceMembers.workspaceId, workspaceId),
            isNull(pgWorkspaceMembers.removedAt),
          ),
        )
        .orderBy(asc(pgWorkspaceMembers.createdAt));
      const members: WorkspaceMemberWithUserRecord[] = [];

      for (const row of rows) {
        const userRows = await db.select().from(pgUsers).where(eq(pgUsers.id, row.userId)).limit(1);
        const user = userRows[0];

        if (user) {
          members.push({
            ...toWorkspaceMemberRecord(row),
            user: {
              disabledAt: toIsoString(user.disabledAt),
              displayName: user.displayName,
              id: parseSyncedId(user.id),
              username: user.username,
            },
          });
        }
      }

      return members;
    },

    async findWorkspaceMember(workspaceId, userId) {
      const rows = await db
        .select()
        .from(pgWorkspaceMembers)
        .where(
          and(
            eq(pgWorkspaceMembers.workspaceId, workspaceId),
            eq(pgWorkspaceMembers.userId, userId),
            isNull(pgWorkspaceMembers.removedAt),
          ),
        )
        .limit(1);

      return rows[0] ? toWorkspaceMemberRecord(rows[0]) : null;
    },

    async updateWorkspaceMemberRole(input) {
      const rows = await db
        .update(pgWorkspaceMembers)
        .set({ role: input.role, updatedAt: resolved.clock.now() })
        .where(
          and(
            eq(pgWorkspaceMembers.workspaceId, input.workspaceId),
            eq(pgWorkspaceMembers.userId, input.userId),
            isNull(pgWorkspaceMembers.removedAt),
          ),
        )
        .returning();

      return rows[0] ? toWorkspaceMemberRecord(rows[0]) : null;
    },

    async removeWorkspaceMember(input) {
      const now = resolved.clock.now();
      const rows = await db
        .update(pgWorkspaceMembers)
        .set({ removedAt: now, updatedAt: now })
        .where(
          and(
            eq(pgWorkspaceMembers.workspaceId, input.workspaceId),
            eq(pgWorkspaceMembers.userId, input.userId),
            isNull(pgWorkspaceMembers.removedAt),
          ),
        )
        .returning();

      return rows[0] ? toWorkspaceMemberRecord(rows[0]) : null;
    },

    async createPasskeyChallenge(input) {
      const now = resolved.clock.now();
      const row = assertCreated(
        await db
          .insert(pgPasskeyChallenges)
          .values({
            id: resolved.createId(),
            userId: input.userId ?? null,
            kind: input.kind,
            challenge: input.challenge,
            createdAt: now,
            expiresAt: input.expiresAt,
          })
          .returning(),
        "Passkey challenge",
      );

      return toPasskeyChallengeRecord(row);
    },

    async findActivePasskeyChallenge(input) {
      const rows = await db
        .select()
        .from(pgPasskeyChallenges)
        .where(
          and(
            eq(pgPasskeyChallenges.id, input.id),
            eq(pgPasskeyChallenges.kind, input.kind),
            isNull(pgPasskeyChallenges.consumedAt),
            gt(pgPasskeyChallenges.expiresAt, input.now ?? resolved.clock.now()),
          ),
        )
        .limit(1);

      return rows[0] ? toPasskeyChallengeRecord(rows[0]) : null;
    },

    async consumePasskeyChallenge(id) {
      const rows = await db
        .update(pgPasskeyChallenges)
        .set({ consumedAt: resolved.clock.now() })
        .where(eq(pgPasskeyChallenges.id, id))
        .returning();

      return rows[0] ? toPasskeyChallengeRecord(rows[0]) : null;
    },

    async createPasskey(input) {
      const now = resolved.clock.now();
      const row = assertCreated(
        await db
          .insert(pgPasskeys)
          .values({
            id: resolved.createId(),
            userId: input.userId,
            credentialId: input.credentialId,
            publicKey: input.publicKey,
            counter: input.counter,
            transportsJson: input.transportsJson ? [...input.transportsJson] : null,
            name: input.name.trim() || "Passkey",
            createdAt: now,
          })
          .returning(),
        "Passkey",
      );

      return toPasskeyRecord(row);
    },

    async listPasskeysByUserId(userId) {
      const rows = await db
        .select()
        .from(pgPasskeys)
        .where(eq(pgPasskeys.userId, userId))
        .orderBy(asc(pgPasskeys.createdAt));

      return rows.map(toPasskeyRecord);
    },

    async findPasskeyByCredentialId(credentialId) {
      const rows = await db
        .select()
        .from(pgPasskeys)
        .where(eq(pgPasskeys.credentialId, credentialId))
        .limit(1);

      return rows[0] ? toPasskeyRecord(rows[0]) : null;
    },

    async renamePasskey(input) {
      const rows = await db
        .update(pgPasskeys)
        .set({ name: input.name.trim() || "Passkey" })
        .where(and(eq(pgPasskeys.id, input.id), eq(pgPasskeys.userId, input.userId)))
        .returning();

      return rows[0] ? toPasskeyRecord(rows[0]) : null;
    },

    async deletePasskey(input) {
      const rows = await db
        .delete(pgPasskeys)
        .where(and(eq(pgPasskeys.id, input.id), eq(pgPasskeys.userId, input.userId)))
        .returning();

      return rows[0] ? toPasskeyRecord(rows[0]) : null;
    },

    async updatePasskeyAfterLogin(input) {
      const rows = await db
        .update(pgPasskeys)
        .set({
          counter: input.counter,
          lastUsedAt: resolved.clock.now(),
        })
        .where(eq(pgPasskeys.credentialId, input.credentialId))
        .returning();

      return rows[0] ? toPasskeyRecord(rows[0]) : null;
    },
  };
}
