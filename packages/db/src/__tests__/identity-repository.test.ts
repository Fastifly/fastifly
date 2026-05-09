import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUuidV7, type SyncedId } from "@fastifly/common";
import { describe, expect, it } from "vitest";

import {
  createConfiguredSqliteClient,
  createPostgresDatabaseFromClient,
  createPostgresIdentityRepository,
  createSqliteDatabaseFromClient,
  createSqliteIdentityRepository,
  normalizeUsername,
} from "../index.js";
import {
  createInMemoryPostgresDatabase,
  runPostgresMigrations,
  runSqliteMigrations,
} from "../testing/migrations.js";
import { readMigration } from "./migration-files.js";

type RepositoryFactory = {
  readonly name: string;
  readonly run: (
    test: (repo: ReturnType<typeof createSqliteIdentityRepository>) => Promise<void>,
  ) => Promise<void>;
};

function createDeterministicIdGenerator(): () => SyncedId {
  let counter = 1;

  return () => {
    const value = counter;
    counter += 1;

    return createUuidV7({
      nowMs: Date.UTC(2026, 4, 9),
      randomBytes: (byteLength) => {
        const bytes = new Uint8Array(byteLength);
        bytes[byteLength - 1] = value;
        return bytes;
      },
    });
  };
}

function createClock(date: Date) {
  return { now: () => date };
}

const repositoryFactories: readonly RepositoryFactory[] = [
  {
    name: "SQLite",
    async run(test) {
      const sqliteDir = mkdtempSync(join(tmpdir(), "fastifly-sqlite-"));
      const client = createConfiguredSqliteClient({ source: join(sqliteDir, "test.db") });

      try {
        await runSqliteMigrations(client, [
          readMigration("sqlite", "0001_foundation"),
          readMigration("sqlite", "0002_passkey_challenges"),
        ]);
        const repo = createSqliteIdentityRepository(createSqliteDatabaseFromClient(client), {
          clock: createClock(new Date("2026-05-09T00:00:00.000Z")),
          createId: createDeterministicIdGenerator(),
        });

        await test(repo);
      } finally {
        client.close();
        rmSync(sqliteDir, { force: true, recursive: true });
      }
    },
  },
  {
    name: "PostgreSQL",
    async run(test) {
      const client = await createInMemoryPostgresDatabase();

      try {
        await runPostgresMigrations(client, [
          readMigration("postgres", "0001_foundation"),
          readMigration("postgres", "0002_passkey_challenges"),
        ]);
        const repo = createPostgresIdentityRepository(createPostgresDatabaseFromClient(client), {
          clock: createClock(new Date("2026-05-09T00:00:00.000Z")),
          createId: createDeterministicIdGenerator(),
        });

        await test(repo);
      } finally {
        await client.close();
      }
    },
  },
];

describe("identity repository", () => {
  it("normalizes usernames with stable lowercase semantics", () => {
    expect(normalizeUsername("  Owner.Name  ")).toBe("owner.name");
  });

  for (const factory of repositoryFactories) {
    it(`creates users, sessions, and default workspace state on ${factory.name}`, async () => {
      await factory.run(async (repo) => {
        const user = await repo.createUser({
          displayName: " Main Owner ",
          passwordHash: "$argon2id$fixture",
          username: " Owner ",
        });

        expect(user.username).toBe("Owner");
        expect(user.usernameNormalized).toBe("owner");
        expect(user.displayName).toBe("Main Owner");

        await expect(repo.findUserByNormalizedUsername("oWnEr")).resolves.toMatchObject({
          id: user.id,
          usernameNormalized: "owner",
        });
        await expect(repo.findUserById(user.id)).resolves.toMatchObject({ id: user.id });

        const workspaceState = await repo.bootstrapDefaultWorkspace({
          baseCurrencyCode: "INR",
          firstDayOfWeek: 1,
          ledgerName: "Primary",
          userId: user.id,
          workspaceName: "Personal",
        });

        expect(workspaceState.workspace.ownerUserId).toBe(user.id);
        await expect(repo.findWorkspaceById(workspaceState.workspace.id)).resolves.toMatchObject({
          id: workspaceState.workspace.id,
          name: "Personal",
        });
        expect(workspaceState.membership).toMatchObject({
          role: "owner",
          userId: user.id,
          workspaceId: workspaceState.workspace.id,
        });
        expect(workspaceState.ledger).toMatchObject({
          baseCurrencyCode: "INR",
          name: "Primary",
          workspaceId: workspaceState.workspace.id,
        });
        await expect(repo.findDefaultWorkspaceContextForUser(user.id)).resolves.toMatchObject({
          activeLedger: {
            id: workspaceState.ledger.id,
            workspaceId: workspaceState.workspace.id,
          },
          activeWorkspace: {
            id: workspaceState.workspace.id,
            role: "owner",
          },
        });

        const session = await repo.createSession({
          expiresAt: new Date("2026-05-10T00:00:00.000Z"),
          ipAddress: "127.0.0.1",
          tokenHash: "sha256-token-hash",
          userAgent: "vitest",
          userId: user.id,
        });

        await expect(
          repo.findActiveSessionByTokenHash(
            "sha256-token-hash",
            new Date("2026-05-09T12:00:00.000Z"),
          ),
        ).resolves.toMatchObject({ id: session.id, userId: user.id });

        await expect(repo.revokeSession(session.id)).resolves.toMatchObject({
          id: session.id,
          revokedAt: "2026-05-09T00:00:00.000Z",
        });
        await expect(
          repo.findActiveSessionByTokenHash(
            "sha256-token-hash",
            new Date("2026-05-09T12:00:00.000Z"),
          ),
        ).resolves.toBeNull();

        const recoveryCodes = await repo.replaceRecoveryCodes({
          codeHashes: ["hash-one", "hash-two"],
          userId: user.id,
        });
        expect(recoveryCodes).toHaveLength(2);
        expect(recoveryCodes[0]).toMatchObject({
          codeHash: "hash-one",
          userId: user.id,
        });
        await expect(
          repo.replaceRecoveryCodes({
            codeHashes: ["hash-three"],
            userId: user.id,
          }),
        ).resolves.toHaveLength(1);
        await expect(repo.deleteRecoveryCodesForUser(user.id)).resolves.toBeUndefined();

        const invitation = await repo.createWorkspaceInvitation({
          expiresAt: new Date("2026-05-16T00:00:00.000Z"),
          invitedByUserId: user.id,
          inviteeIdentifier: "partner",
          role: "editor",
          tokenHash: "invite-token-hash",
          workspaceId: workspaceState.workspace.id,
        });
        expect(invitation).toMatchObject({
          inviteeIdentifier: "partner",
          invitedByUserId: user.id,
          role: "editor",
          tokenHash: "invite-token-hash",
          workspaceId: workspaceState.workspace.id,
        });
        await expect(
          repo.findActiveWorkspaceInvitationByTokenHash({
            now: new Date("2026-05-10T00:00:00.000Z"),
            tokenHash: "invite-token-hash",
          }),
        ).resolves.toMatchObject({ id: invitation.id });

        const invitee = await repo.createUser({
          displayName: "Partner",
          passwordHash: "$argon2id$fixture",
          username: "Partner",
        });
        await expect(
          repo.acceptWorkspaceInvitation({
            invitationId: invitation.id,
            userId: invitee.id,
          }),
        ).resolves.toMatchObject({
          role: "editor",
          userId: invitee.id,
          workspaceId: workspaceState.workspace.id,
        });
        await expect(
          repo.findActiveWorkspaceInvitationByTokenHash({
            now: new Date("2026-05-10T00:00:00.000Z"),
            tokenHash: "invite-token-hash",
          }),
        ).resolves.toBeNull();
        await expect(repo.listWorkspaceMembers(workspaceState.workspace.id)).resolves.toMatchObject(
          [
            {
              role: "owner",
              user: { username: "Owner" },
            },
            {
              role: "editor",
              user: { username: "Partner" },
            },
          ],
        );
        await expect(
          repo.updateWorkspaceMemberRole({
            role: "viewer",
            userId: invitee.id,
            workspaceId: workspaceState.workspace.id,
          }),
        ).resolves.toMatchObject({ role: "viewer" });
        await expect(
          repo.removeWorkspaceMember({
            userId: invitee.id,
            workspaceId: workspaceState.workspace.id,
          }),
        ).resolves.toMatchObject({ removedAt: "2026-05-09T00:00:00.000Z" });
        await expect(
          repo.findWorkspaceMember(workspaceState.workspace.id, invitee.id),
        ).resolves.toBeNull();

        const reactivationInvitation = await repo.createWorkspaceInvitation({
          expiresAt: new Date("2026-05-16T00:00:00.000Z"),
          invitedByUserId: user.id,
          inviteeIdentifier: "partner",
          role: "admin",
          tokenHash: "reactivation-token-hash",
          workspaceId: workspaceState.workspace.id,
        });
        await expect(
          repo.acceptWorkspaceInvitation({
            invitationId: reactivationInvitation.id,
            userId: invitee.id,
          }),
        ).resolves.toMatchObject({
          removedAt: null,
          role: "admin",
          userId: invitee.id,
        });

        const revokedInvitation = await repo.createWorkspaceInvitation({
          expiresAt: new Date("2026-05-16T00:00:00.000Z"),
          invitedByUserId: user.id,
          inviteeIdentifier: "revoked",
          role: "viewer",
          tokenHash: "revoked-token-hash",
          workspaceId: workspaceState.workspace.id,
        });
        await expect(
          repo.revokeWorkspaceInvitation({
            invitationId: revokedInvitation.id,
            workspaceId: workspaceState.workspace.id,
          }),
        ).resolves.toMatchObject({ revokedAt: "2026-05-09T00:00:00.000Z" });

        const declinedInvitation = await repo.createWorkspaceInvitation({
          expiresAt: new Date("2026-05-16T00:00:00.000Z"),
          invitedByUserId: user.id,
          inviteeIdentifier: "declined",
          role: "viewer",
          tokenHash: "declined-token-hash",
          workspaceId: workspaceState.workspace.id,
        });
        await expect(
          repo.declineWorkspaceInvitation({ invitationId: declinedInvitation.id }),
        ).resolves.toMatchObject({ revokedAt: "2026-05-09T00:00:00.000Z" });

        const challenge = await repo.createPasskeyChallenge({
          challenge: "registration-challenge",
          expiresAt: new Date("2026-05-09T00:05:00.000Z"),
          kind: "registration",
          userId: user.id,
        });
        await expect(
          repo.findActivePasskeyChallenge({
            id: challenge.id,
            kind: "registration",
            now: new Date("2026-05-09T00:01:00.000Z"),
          }),
        ).resolves.toMatchObject({
          challenge: "registration-challenge",
          userId: user.id,
        });
        await expect(repo.consumePasskeyChallenge(challenge.id)).resolves.toMatchObject({
          consumedAt: "2026-05-09T00:00:00.000Z",
        });
        await expect(
          repo.findActivePasskeyChallenge({
            id: challenge.id,
            kind: "registration",
            now: new Date("2026-05-09T00:01:00.000Z"),
          }),
        ).resolves.toBeNull();

        const passkey = await repo.createPasskey({
          counter: 1,
          credentialId: "credential-id",
          name: "Laptop",
          publicKey: "public-key",
          transportsJson: ["internal"],
          userId: user.id,
        });
        await expect(repo.listPasskeysByUserId(user.id)).resolves.toMatchObject([
          {
            credentialId: "credential-id",
            name: "Laptop",
          },
        ]);
        await expect(repo.findPasskeyByCredentialId("credential-id")).resolves.toMatchObject({
          id: passkey.id,
          userId: user.id,
        });
        await expect(
          repo.renamePasskey({
            id: passkey.id,
            name: "Phone",
            userId: user.id,
          }),
        ).resolves.toMatchObject({ name: "Phone" });
        await expect(
          repo.updatePasskeyAfterLogin({
            counter: 2,
            credentialId: "credential-id",
          }),
        ).resolves.toMatchObject({
          counter: 2,
          lastUsedAt: "2026-05-09T00:00:00.000Z",
        });
        await expect(
          repo.deletePasskey({
            id: passkey.id,
            userId: user.id,
          }),
        ).resolves.toMatchObject({ id: passkey.id });
      });
    });

    it(`rejects duplicate normalized usernames on ${factory.name}`, async () => {
      await factory.run(async (repo) => {
        await repo.createUser({
          displayName: "Owner",
          passwordHash: "$argon2id$fixture",
          username: "Owner",
        });

        await expect(
          repo.createUser({
            displayName: "Duplicate",
            passwordHash: "$argon2id$fixture",
            username: "OWNER",
          }),
        ).rejects.toThrow();
      });
    });
  }
});
