import type { OutgoingHttpHeaders } from "node:http";
import { createUuidV7, type SyncedId } from "@fastifly/common";
import type {
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
  FindPendingWorkspaceInvitationInput,
  IdentityRepository,
  LedgerRecord,
  PasskeyChallengeRecord,
  PasskeyRecord,
  RecordWorkspaceAuditEventInput,
  RecoveryCodeRecord,
  RemoveWorkspaceMemberInput,
  RenamePasskeyInput,
  ReplaceRecoveryCodesInput,
  RevokeWorkspaceInvitationInput,
  SessionRecord,
  UpdatePasskeyAfterLoginInput,
  UpdateWorkspaceMemberRoleInput,
  UserRecord,
  UserWorkspaceContextRecord,
  WorkspaceInvitationRecord,
  WorkspaceMemberRecord,
  WorkspaceMemberWithUserRecord,
  WorkspaceRecord,
} from "@fastifly/db";
import { afterEach, describe, expect, it } from "vitest";

import { buildApiApp } from "../app.js";
import type { WebAuthnAdapter } from "../auth/webauthn.js";
import { injectWithCsrf } from "./helpers/csrf.js";

const apps: Awaited<ReturnType<typeof buildApiApp>>[] = [];

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

class FakeIdentityRepository implements IdentityRepository {
  readonly bootstrappedUsers: SyncedId[] = [];
  readonly contexts = new Map<SyncedId, UserWorkspaceContextRecord>();
  readonly invitations = new Map<SyncedId, WorkspaceInvitationRecord>();
  readonly auditEvents: RecordWorkspaceAuditEventInput[] = [];
  readonly members = new Map<SyncedId, WorkspaceMemberRecord>();
  readonly passkeyChallenges = new Map<SyncedId, PasskeyChallengeRecord>();
  readonly passkeys = new Map<SyncedId, PasskeyRecord>();
  readonly recoveryCodes = new Map<SyncedId, readonly RecoveryCodeRecord[]>();
  readonly sessions = new Map<SyncedId, SessionRecord>();
  readonly users = new Map<SyncedId, UserRecord>();
  readonly workspaces = new Map<SyncedId, WorkspaceRecord>();

  #createId = createDeterministicIdGenerator();

  async createUser(input: CreateUserInput): Promise<UserRecord> {
    const now = "2026-05-09T00:00:00.000Z";
    const user: UserRecord = {
      createdAt: now,
      disabledAt: null,
      displayName: input.displayName,
      id: this.#createId(),
      passwordHash: input.passwordHash,
      updatedAt: now,
      username: input.username.trim(),
      usernameNormalized: input.username.trim().toLocaleLowerCase("en-US"),
    };
    this.users.set(user.id, user);
    return user;
  }

  async findUserByNormalizedUsername(username: string): Promise<UserRecord | null> {
    const normalized = username.trim().toLocaleLowerCase("en-US");
    return (
      Array.from(this.users.values()).find((user) => user.usernameNormalized === normalized) ?? null
    );
  }

  async findUserById(id: SyncedId): Promise<UserRecord | null> {
    return this.users.get(id) ?? null;
  }

  async findWorkspaceById(id: SyncedId): Promise<WorkspaceRecord | null> {
    return this.workspaces.get(id) ?? null;
  }

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const session: SessionRecord = {
      createdAt: "2026-05-09T00:00:00.000Z",
      expiresAt: input.expiresAt.toISOString(),
      id: this.#createId(),
      ipAddress: input.ipAddress ?? null,
      revokedAt: null,
      tokenHash: input.tokenHash,
      userAgent: input.userAgent ?? null,
      userId: input.userId,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async findActiveSessionByTokenHash(
    tokenHash: string,
    now = new Date(),
  ): Promise<SessionRecord | null> {
    return (
      Array.from(this.sessions.values()).find(
        (session) =>
          session.tokenHash === tokenHash &&
          session.revokedAt === null &&
          new Date(session.expiresAt) > now,
      ) ?? null
    );
  }

  async revokeSession(sessionId: SyncedId): Promise<SessionRecord | null> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    const revokedSession: SessionRecord = {
      ...session,
      revokedAt: "2026-05-09T00:00:00.000Z",
    };
    this.sessions.set(sessionId, revokedSession);
    return revokedSession;
  }

  async bootstrapDefaultWorkspace(
    input: BootstrapDefaultWorkspaceInput,
  ): Promise<BootstrapDefaultWorkspaceResult> {
    const now = "2026-05-09T00:00:00.000Z";
    const workspace: WorkspaceRecord = {
      archivedAt: null,
      createdAt: now,
      id: this.#createId(),
      name: input.workspaceName ?? "My workspace",
      ownerUserId: input.userId,
      status: "active",
      updatedAt: now,
    };
    const membership: WorkspaceMemberRecord = {
      createdAt: now,
      id: this.#createId(),
      removedAt: null,
      role: "owner",
      updatedAt: now,
      userId: input.userId,
      workspaceId: workspace.id,
    };
    const ledger: LedgerRecord = {
      archivedAt: null,
      baseCurrencyCode: input.baseCurrencyCode ?? "USD",
      createdAt: now,
      firstDayOfWeek: input.firstDayOfWeek ?? 1,
      id: this.#createId(),
      name: input.ledgerName ?? "Main ledger",
      status: "active",
      updatedAt: now,
      workspaceId: workspace.id,
    };
    this.bootstrappedUsers.push(input.userId);
    this.workspaces.set(workspace.id, workspace);
    this.members.set(membership.id, membership);
    this.contexts.set(input.userId, {
      activeLedger: ledger,
      activeWorkspace: {
        ...workspace,
        role: membership.role,
      },
    });
    return { ledger, membership, workspace };
  }

  async findDefaultWorkspaceContextForUser(
    userId: SyncedId,
  ): Promise<UserWorkspaceContextRecord | null> {
    return this.contexts.get(userId) ?? null;
  }

  async replaceRecoveryCodes(
    input: ReplaceRecoveryCodesInput,
  ): Promise<readonly RecoveryCodeRecord[]> {
    const records = input.codeHashes.map((codeHash) => ({
      codeHash,
      createdAt: "2026-05-09T00:00:00.000Z",
      id: this.#createId(),
      usedAt: null,
      userId: input.userId,
    }));
    this.recoveryCodes.set(input.userId, records);
    return records;
  }

  async deleteRecoveryCodesForUser(userId: SyncedId): Promise<void> {
    this.recoveryCodes.delete(userId);
  }

  async createWorkspaceInvitation(
    input: CreateWorkspaceInvitationInput,
  ): Promise<WorkspaceInvitationRecord> {
    const invitation: WorkspaceInvitationRecord = {
      acceptedAt: null,
      createdAt: "2026-05-09T00:00:00.000Z",
      expiresAt: input.expiresAt.toISOString(),
      id: this.#createId(),
      invitedByUserId: input.invitedByUserId,
      inviteeIdentifier: input.inviteeIdentifier,
      revokedAt: null,
      role: input.role,
      tokenHash: input.tokenHash,
      workspaceId: input.workspaceId,
    };
    this.invitations.set(invitation.id, invitation);
    return invitation;
  }

  async findActiveWorkspaceInvitationByTokenHash(
    input: FindActiveWorkspaceInvitationInput,
  ): Promise<WorkspaceInvitationRecord | null> {
    const now = input.now ?? new Date();
    return (
      Array.from(this.invitations.values()).find(
        (invitation) =>
          invitation.tokenHash === input.tokenHash &&
          invitation.acceptedAt === null &&
          invitation.revokedAt === null &&
          new Date(invitation.expiresAt) > now,
      ) ?? null
    );
  }

  async findPendingWorkspaceInvitationByInvitee(
    input: FindPendingWorkspaceInvitationInput,
  ): Promise<WorkspaceInvitationRecord | null> {
    const now = input.now ?? new Date();
    const inviteeIdentifier = input.inviteeIdentifier.trim();
    return (
      Array.from(this.invitations.values()).find(
        (invitation) =>
          invitation.workspaceId === input.workspaceId &&
          invitation.inviteeIdentifier === inviteeIdentifier &&
          invitation.acceptedAt === null &&
          invitation.revokedAt === null &&
          new Date(invitation.expiresAt) > now,
      ) ?? null
    );
  }

  async acceptWorkspaceInvitation(
    input: AcceptWorkspaceInvitationInput,
  ): Promise<WorkspaceMemberRecord | null> {
    const invitation = this.invitations.get(input.invitationId);

    if (
      !invitation ||
      invitation.acceptedAt !== null ||
      invitation.revokedAt !== null ||
      new Date(invitation.expiresAt) <= new Date()
    ) {
      return null;
    }

    const now = "2026-05-09T00:00:00.000Z";
    const existingMember = Array.from(this.members.values()).find(
      (member) => member.workspaceId === invitation.workspaceId && member.userId === input.userId,
    );
    const member: WorkspaceMemberRecord | null = existingMember
      ? existingMember.removedAt === null
        ? null
        : {
            ...existingMember,
            removedAt: null,
            role: invitation.role,
            updatedAt: now,
          }
      : {
          createdAt: now,
          id: this.#createId(),
          removedAt: null,
          role: invitation.role,
          updatedAt: now,
          userId: input.userId,
          workspaceId: invitation.workspaceId,
        };

    if (!member) {
      return null;
    }

    this.members.set(member.id, member);
    this.invitations.set(invitation.id, {
      ...invitation,
      acceptedAt: now,
    });
    return member;
  }

  async revokeWorkspaceInvitation(
    input: RevokeWorkspaceInvitationInput,
  ): Promise<WorkspaceInvitationRecord | null> {
    const invitation = this.invitations.get(input.invitationId);

    if (
      !invitation ||
      invitation.workspaceId !== input.workspaceId ||
      invitation.acceptedAt !== null ||
      invitation.revokedAt !== null
    ) {
      return null;
    }

    const revoked = {
      ...invitation,
      revokedAt: "2026-05-09T00:00:00.000Z",
    };
    this.invitations.set(invitation.id, revoked);
    return revoked;
  }

  async declineWorkspaceInvitation(
    input: DeclineWorkspaceInvitationInput,
  ): Promise<WorkspaceInvitationRecord | null> {
    const invitation = this.invitations.get(input.invitationId);

    if (!invitation || invitation.acceptedAt !== null || invitation.revokedAt !== null) {
      return null;
    }

    const declined = {
      ...invitation,
      revokedAt: "2026-05-09T00:00:00.000Z",
    };
    this.invitations.set(invitation.id, declined);
    return declined;
  }

  async listWorkspaceMembers(
    workspaceId: SyncedId,
  ): Promise<readonly WorkspaceMemberWithUserRecord[]> {
    return Array.from(this.members.values())
      .filter((member) => member.workspaceId === workspaceId && member.removedAt === null)
      .map((member) => {
        const user = this.users.get(member.userId);

        if (!user) {
          throw new Error(`Missing fake user for workspace member ${member.id}`);
        }

        return {
          ...member,
          user: {
            disabledAt: user.disabledAt,
            displayName: user.displayName,
            id: user.id,
            username: user.username,
          },
        };
      });
  }

  async findWorkspaceMember(
    workspaceId: SyncedId,
    userId: SyncedId,
  ): Promise<WorkspaceMemberRecord | null> {
    return (
      Array.from(this.members.values()).find(
        (member) =>
          member.workspaceId === workspaceId &&
          member.userId === userId &&
          member.removedAt === null,
      ) ?? null
    );
  }

  async updateWorkspaceMemberRole(
    input: UpdateWorkspaceMemberRoleInput,
  ): Promise<WorkspaceMemberRecord | null> {
    const member = await this.findWorkspaceMember(input.workspaceId, input.userId);

    if (!member) {
      return null;
    }

    const updated = {
      ...member,
      role: input.role,
      updatedAt: "2026-05-09T00:00:00.000Z",
    };
    this.members.set(member.id, updated);
    return updated;
  }

  async removeWorkspaceMember(
    input: RemoveWorkspaceMemberInput,
  ): Promise<WorkspaceMemberRecord | null> {
    const member = await this.findWorkspaceMember(input.workspaceId, input.userId);

    if (!member) {
      return null;
    }

    const removed = {
      ...member,
      removedAt: "2026-05-09T00:00:00.000Z",
      updatedAt: "2026-05-09T00:00:00.000Z",
    };
    this.members.set(member.id, removed);
    return removed;
  }

  async recordWorkspaceAuditEvent(input: RecordWorkspaceAuditEventInput): Promise<void> {
    this.auditEvents.push(input);
  }

  async createPasskeyChallenge(
    input: CreatePasskeyChallengeInput,
  ): Promise<PasskeyChallengeRecord> {
    const challenge: PasskeyChallengeRecord = {
      challenge: input.challenge,
      consumedAt: null,
      createdAt: "2026-05-09T00:00:00.000Z",
      expiresAt: input.expiresAt.toISOString(),
      id: this.#createId(),
      kind: input.kind,
      userId: input.userId ?? null,
    };
    this.passkeyChallenges.set(challenge.id, challenge);
    return challenge;
  }

  async findActivePasskeyChallenge(
    input: FindActivePasskeyChallengeInput,
  ): Promise<PasskeyChallengeRecord | null> {
    const challenge = this.passkeyChallenges.get(input.id);

    if (
      !challenge ||
      challenge.kind !== input.kind ||
      challenge.consumedAt !== null ||
      new Date(challenge.expiresAt) <= (input.now ?? new Date())
    ) {
      return null;
    }

    return challenge;
  }

  async consumePasskeyChallenge(id: SyncedId): Promise<PasskeyChallengeRecord | null> {
    const challenge = this.passkeyChallenges.get(id);

    if (!challenge) {
      return null;
    }

    const consumed = {
      ...challenge,
      consumedAt: "2026-05-09T00:00:00.000Z",
    };
    this.passkeyChallenges.set(id, consumed);
    return consumed;
  }

  async createPasskey(input: CreatePasskeyInput): Promise<PasskeyRecord> {
    const passkey: PasskeyRecord = {
      counter: input.counter,
      createdAt: "2026-05-09T00:00:00.000Z",
      credentialId: input.credentialId,
      id: this.#createId(),
      lastUsedAt: null,
      name: input.name,
      publicKey: input.publicKey,
      transportsJson: input.transportsJson ?? null,
      userId: input.userId,
    };
    this.passkeys.set(passkey.id, passkey);
    return passkey;
  }

  async listPasskeysByUserId(userId: SyncedId): Promise<readonly PasskeyRecord[]> {
    return Array.from(this.passkeys.values()).filter((passkey) => passkey.userId === userId);
  }

  async findPasskeyByCredentialId(credentialId: string): Promise<PasskeyRecord | null> {
    return (
      Array.from(this.passkeys.values()).find((passkey) => passkey.credentialId === credentialId) ??
      null
    );
  }

  async renamePasskey(input: RenamePasskeyInput): Promise<PasskeyRecord | null> {
    const passkey = this.passkeys.get(input.id);

    if (!passkey || passkey.userId !== input.userId) {
      return null;
    }

    const renamed = {
      ...passkey,
      name: input.name,
    };
    this.passkeys.set(input.id, renamed);
    return renamed;
  }

  async deletePasskey(input: DeletePasskeyInput): Promise<PasskeyRecord | null> {
    const passkey = this.passkeys.get(input.id);

    if (!passkey || passkey.userId !== input.userId) {
      return null;
    }

    this.passkeys.delete(input.id);
    return passkey;
  }

  async updatePasskeyAfterLogin(
    input: UpdatePasskeyAfterLoginInput,
  ): Promise<PasskeyRecord | null> {
    const passkey = await this.findPasskeyByCredentialId(input.credentialId);

    if (!passkey) {
      return null;
    }

    const updated = {
      ...passkey,
      counter: input.counter,
      lastUsedAt: "2026-05-09T00:00:00.000Z",
    };
    this.passkeys.set(passkey.id, updated);
    return updated;
  }
}

const fakeWebAuthnAdapter: WebAuthnAdapter = {
  async generateRegistrationOptions() {
    return {
      challenge: "registration-challenge",
      pubKeyCredParams: [],
      rp: { id: "localhost", name: "Fastifly" },
      user: {
        displayName: "Owner",
        id: "user-handle",
        name: "Owner",
      },
    };
  },
  async verifyRegistrationResponse(input) {
    const credentialId =
      typeof input.response.id === "string" ? input.response.id : "test-passkey-credential";

    return {
      counter: 1,
      credentialId,
      publicKey: "public-key",
      transportsJson: ["internal"],
    };
  },
  async generateAuthenticationOptions(input) {
    const options: Awaited<ReturnType<WebAuthnAdapter["generateAuthenticationOptions"]>> = {
      challenge: "login-challenge",
      rpId: "localhost",
    };

    if (input.passkeys) {
      options.allowCredentials = input.passkeys.map((passkey) => ({
        id: passkey.credentialId,
        type: "public-key",
      }));
    }

    return options;
  },
  async verifyAuthenticationResponse(input) {
    return {
      counter: input.passkey.counter + 1,
      credentialId: input.passkey.credentialId,
    };
  },
};

async function makeApp(identityRepository = new FakeIdentityRepository()) {
  const app = await buildApiApp({
    config: { logLevel: "silent", nodeEnv: "test" },
    identityRepository,
    readiness: { migrations: "ok" },
    webAuthnAdapter: fakeWebAuthnAdapter,
  });
  apps.push(app);
  return { app, identityRepository };
}

function getCookiePair(response: { headers: OutgoingHttpHeaders }): string {
  return getCookiePairs(response)[0] ?? "";
}

function getCookiePairs(response: { headers: OutgoingHttpHeaders }): string[] {
  const header = response.headers["set-cookie"];
  const cookies = Array.isArray(header) ? header : header ? [header] : [];

  if (cookies.length === 0 || cookies.some((cookie) => typeof cookie !== "string")) {
    throw new Error("Expected response to set a cookie");
  }

  return cookies.map((cookie) => String(cookie).split(";")[0] ?? "");
}

function getInvitationToken(inviteLink: string): string {
  return new URL(inviteLink).pathname.split("/").at(-1) ?? "";
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("auth routes", () => {
  it("issues a CSRF token cookie and rejects unsafe auth requests without it", async () => {
    const { app } = await makeApp();

    const csrf = await app.inject({
      method: "GET",
      url: "/api/v1/auth/csrf",
    });
    expect(csrf.statusCode).toBe(200);
    expect(csrf.json()).toMatchObject({
      data: {
        csrfToken: expect.any(String),
      },
    });
    expect(String(csrf.headers["set-cookie"])).toContain("_fastifly_csrf=");
    expect(String(csrf.headers["set-cookie"])).toContain("HttpOnly");

    const response = await app.inject({
      method: "POST",
      payload: {
        password: "correct horse battery staple",
        username: "Owner",
      },
      url: "/api/v1/auth/register",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: "FORBIDDEN",
      },
    });
  });

  it("registers a user, bootstraps default workspace state, and sets an HttpOnly session", async () => {
    const { app, identityRepository } = await makeApp();

    const response = await injectWithCsrf(app, {
      method: "POST",
      payload: {
        password: "correct horse battery staple",
        username: "Owner",
      },
      url: "/api/v1/auth/register",
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      data: {
        user: {
          displayName: "Owner",
          username: "Owner",
        },
      },
    });
    expect(identityRepository.bootstrappedUsers).toHaveLength(1);
    expect(Array.from(identityRepository.sessions.values())[0]?.tokenHash).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(String(response.headers["set-cookie"])).toContain("HttpOnly");
    expect(String(response.headers["set-cookie"])).toContain("SameSite=Lax");
  });

  it("keeps password length policy on registration only", async () => {
    const { app } = await makeApp();

    const shortRegistrationPassword = await injectWithCsrf(app, {
      method: "POST",
      payload: {
        password: "seven77",
        username: "Owner",
      },
      url: "/api/v1/auth/register",
    });

    expect(shortRegistrationPassword.statusCode).toBe(400);

    await injectWithCsrf(app, {
      method: "POST",
      payload: {
        password: "register-password",
        username: "Owner",
      },
      url: "/api/v1/auth/register",
    });

    const shortLoginPassword = await injectWithCsrf(app, {
      method: "POST",
      payload: {
        password: "x",
        username: "Owner",
      },
      url: "/api/v1/auth/login",
    });

    expect(shortLoginPassword.statusCode).toBe(401);
  });

  it("logs in with a valid password and resolves the current user from the session cookie", async () => {
    const { app } = await makeApp();
    await injectWithCsrf(app, {
      method: "POST",
      payload: {
        password: "correct horse battery staple",
        username: "Owner",
      },
      url: "/api/v1/auth/register",
    });

    const failedLogin = await injectWithCsrf(app, {
      method: "POST",
      payload: {
        password: "wrong horse battery staple",
        username: "Owner",
      },
      url: "/api/v1/auth/login",
    });
    expect(failedLogin.statusCode).toBe(401);

    const login = await injectWithCsrf(app, {
      method: "POST",
      payload: {
        password: "correct horse battery staple",
        username: "owner",
      },
      url: "/api/v1/auth/login",
    });
    expect(login.statusCode).toBe(200);

    const me = await app.inject({
      headers: {
        cookie: getCookiePair(login),
      },
      method: "GET",
      url: "/api/v1/me/context",
    });

    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      data: {
        activeLedger: {
          baseCurrencyCode: "USD",
          name: "Main ledger",
        },
        activeWorkspace: {
          name: "My workspace",
          role: "owner",
        },
        user: {
          username: "Owner",
        },
      },
    });
  });

  it("rate-limits repeated password login failures before hashing can be abused", async () => {
    const { app } = await makeApp();
    await injectWithCsrf(app, {
      method: "POST",
      payload: {
        password: "correct horse battery staple",
        username: "Owner",
      },
      url: "/api/v1/auth/register",
    });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const failedLogin = await injectWithCsrf(app, {
        method: "POST",
        payload: {
          password: "wrong horse battery staple",
          username: "Owner",
        },
        url: "/api/v1/auth/login",
      });
      expect(failedLogin.statusCode).toBe(401);
    }

    const limited = await injectWithCsrf(app, {
      method: "POST",
      payload: {
        password: "wrong horse battery staple",
        username: "Owner",
      },
      url: "/api/v1/auth/login",
    });

    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({
      error: {
        code: "RATE_LIMITED",
      },
    });
  });

  it("registers, lists, renames, uses, and removes a passkey", async () => {
    const { app, identityRepository } = await makeApp();
    const register = await injectWithCsrf(app, {
      method: "POST",
      payload: {
        password: "correct horse battery staple",
        username: "Owner",
      },
      url: "/api/v1/auth/register",
    });
    const sessionCookie = getCookiePair(register);

    const startRegistration = await injectWithCsrf(app, {
      headers: { cookie: sessionCookie },
      method: "POST",
      url: "/api/v1/auth/passkeys/registration/start",
    });
    expect(startRegistration.statusCode).toBe(200);
    expect(startRegistration.json()).toMatchObject({
      data: {
        options: {
          challenge: "registration-challenge",
        },
      },
    });

    const registrationChallengeCookie = getCookiePair(startRegistration);
    const finishRegistration = await injectWithCsrf(app, {
      headers: { cookie: `${sessionCookie}; ${registrationChallengeCookie}` },
      method: "POST",
      payload: {
        response: {
          id: "test-passkey-credential",
        },
      },
      url: "/api/v1/auth/passkeys/registration/finish",
    });
    expect(finishRegistration.statusCode).toBe(201);
    const passkey = finishRegistration.json<{
      data: { passkey: { id: SyncedId; credentialId: string; name: string } };
    }>().data.passkey;
    expect(passkey).toMatchObject({
      credentialId: "test-passkey-credential",
      name: "Passkey",
    });
    expect(Array.from(identityRepository.passkeyChallenges.values())[0]?.consumedAt).not.toBeNull();

    const list = await app.inject({
      headers: { cookie: sessionCookie },
      method: "GET",
      url: "/api/v1/me/passkeys",
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      data: {
        passkeys: [
          {
            credentialId: "test-passkey-credential",
          },
        ],
      },
    });

    const rename = await injectWithCsrf(app, {
      headers: { cookie: sessionCookie },
      method: "PATCH",
      payload: { name: "Laptop" },
      url: `/api/v1/me/passkeys/${passkey.id}`,
    });
    expect(rename.statusCode).toBe(200);
    expect(rename.json()).toMatchObject({
      data: {
        passkey: {
          name: "Laptop",
        },
      },
    });

    const startLogin = await injectWithCsrf(app, {
      method: "POST",
      payload: { username: "owner" },
      url: "/api/v1/auth/passkeys/login/start",
    });
    expect(startLogin.statusCode).toBe(200);
    expect(startLogin.json()).toMatchObject({
      data: {
        options: {
          allowCredentials: [
            {
              id: "test-passkey-credential",
            },
          ],
          challenge: "login-challenge",
        },
      },
    });

    const finishLogin = await injectWithCsrf(app, {
      headers: { cookie: getCookiePair(startLogin) },
      method: "POST",
      payload: {
        response: {
          id: "test-passkey-credential",
        },
      },
      url: "/api/v1/auth/passkeys/login/finish",
    });
    expect(finishLogin.statusCode).toBe(200);
    expect(
      getCookiePairs(finishLogin).some((cookie) => cookie.startsWith("fastifly_session=")),
    ).toBe(true);
    expect(
      Array.from(identityRepository.passkeys.values()).find(
        (storedPasskey) => storedPasskey.credentialId === "test-passkey-credential",
      )?.counter,
    ).toBe(2);

    const remove = await injectWithCsrf(app, {
      headers: { cookie: sessionCookie },
      method: "DELETE",
      url: `/api/v1/me/passkeys/${passkey.id}`,
    });
    expect(remove.statusCode).toBe(204);
    expect(identityRepository.passkeys.size).toBe(0);
  });

  it("rejects duplicate registration with a conflict response", async () => {
    const { app } = await makeApp();
    const payload = {
      password: "correct horse battery staple",
      username: "Owner",
    };

    await injectWithCsrf(app, {
      method: "POST",
      payload,
      url: "/api/v1/auth/register",
    });

    const duplicate = await injectWithCsrf(app, {
      method: "POST",
      payload: {
        ...payload,
        username: "owner",
      },
      url: "/api/v1/auth/register",
    });

    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toMatchObject({
      error: {
        code: "CONFLICT",
      },
    });
  });

  it("generates one-time recovery codes and stores only hashes", async () => {
    const { app, identityRepository } = await makeApp();
    const register = await injectWithCsrf(app, {
      method: "POST",
      payload: {
        password: "correct horse battery staple",
        username: "Owner",
      },
      url: "/api/v1/auth/register",
    });
    const cookie = getCookiePair(register);

    const response = await injectWithCsrf(app, {
      headers: { cookie },
      method: "POST",
      url: "/api/v1/me/recovery-codes",
    });

    expect(response.statusCode).toBe(201);
    const codes = response.json<{ data: { recoveryCodes: string[] } }>().data.recoveryCodes;
    expect(codes).toHaveLength(10);
    const storedCodes = Array.from(identityRepository.recoveryCodes.values())[0] ?? [];
    expect(storedCodes).toHaveLength(10);
    expect(storedCodes[0]?.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(storedCodes.some((record) => codes.includes(record.codeHash))).toBe(false);

    const remove = await injectWithCsrf(app, {
      headers: { cookie },
      method: "DELETE",
      url: "/api/v1/me/recovery-codes",
    });

    expect(remove.statusCode).toBe(204);
    expect(identityRepository.recoveryCodes.size).toBe(0);
  });

  it("creates copyable workspace invite links only for roles with invite permission", async () => {
    const { app, identityRepository } = await makeApp();
    const register = await injectWithCsrf(app, {
      method: "POST",
      payload: {
        password: "correct horse battery staple",
        username: "Owner",
      },
      url: "/api/v1/auth/register",
    });
    const cookie = getCookiePair(register);
    const context = Array.from(identityRepository.contexts.values())[0];

    if (!context) {
      throw new Error("Expected registration to create a workspace context");
    }

    const response = await injectWithCsrf(app, {
      headers: { cookie },
      method: "POST",
      payload: {
        inviteeIdentifier: "partner",
        role: "editor",
      },
      url: `/api/v1/workspaces/${context.activeWorkspace.id}/invitations`,
    });

    expect(response.statusCode).toBe(201);
    const payload = response.json<{
      data: { inviteLink: string; invitation: { role: string; inviteeIdentifier: string } };
    }>();
    expect(payload.data.inviteLink).toContain("/invitations/");
    expect(payload.data.invitation).toMatchObject({
      inviteeIdentifier: "partner",
      role: "editor",
    });
    const invitation = Array.from(identityRepository.invitations.values())[0];
    expect(invitation?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.data.inviteLink).not.toContain(invitation?.tokenHash ?? "");
    expect(identityRepository.auditEvents).toContainEqual(
      expect.objectContaining({
        action: "workspace_member.invited",
        actorUserId: invitation?.invitedByUserId,
        entityId: invitation?.id,
        workspaceId: context.activeWorkspace.id,
      }),
    );

    const duplicate = await injectWithCsrf(app, {
      headers: { cookie },
      method: "POST",
      payload: {
        inviteeIdentifier: "partner",
        role: "viewer",
      },
      url: `/api/v1/workspaces/${context.activeWorkspace.id}/invitations`,
    });
    expect(duplicate.statusCode).toBe(409);
    expect(identityRepository.invitations.size).toBe(1);

    identityRepository.contexts.set(
      invitation?.invitedByUserId ?? context.activeWorkspace.ownerUserId,
      {
        ...context,
        activeWorkspace: {
          ...context.activeWorkspace,
          role: "viewer",
        },
      },
    );

    const denied = await injectWithCsrf(app, {
      headers: { cookie },
      method: "POST",
      payload: {
        inviteeIdentifier: "another",
        role: "viewer",
      },
      url: `/api/v1/workspaces/${context.activeWorkspace.id}/invitations`,
    });
    expect(denied.statusCode).toBe(403);
  });

  it("previews, accepts, declines, revokes, and manages workspace memberships", async () => {
    const { app, identityRepository } = await makeApp();
    const ownerRegister = await injectWithCsrf(app, {
      method: "POST",
      payload: {
        password: "correct horse battery staple",
        username: "Owner",
      },
      url: "/api/v1/auth/register",
    });
    const ownerCookie = getCookiePair(ownerRegister);
    const ownerContext = Array.from(identityRepository.contexts.values())[0];

    if (!ownerContext) {
      throw new Error("Expected owner registration to create a workspace context");
    }

    const createInvite = await injectWithCsrf(app, {
      headers: { cookie: ownerCookie },
      method: "POST",
      payload: {
        inviteeIdentifier: "partner",
        role: "editor",
      },
      url: `/api/v1/workspaces/${ownerContext.activeWorkspace.id}/invitations`,
    });
    expect(createInvite.statusCode).toBe(201);
    const inviteLink = createInvite.json<{ data: { inviteLink: string } }>().data.inviteLink;
    const inviteToken = getInvitationToken(inviteLink);

    const preview = await app.inject({
      method: "GET",
      url: `/api/v1/invitations/${inviteToken}`,
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      data: {
        invitation: {
          role: "editor",
          workspaceName: "My workspace",
        },
      },
    });

    const inviteeRegister = await injectWithCsrf(app, {
      method: "POST",
      payload: {
        password: "correct horse battery staple",
        username: "Partner",
      },
      url: "/api/v1/auth/register",
    });
    const inviteeCookie = getCookiePair(inviteeRegister);
    const inviteeUser = Array.from(identityRepository.users.values()).find(
      (user) => user.username === "Partner",
    );

    if (!inviteeUser) {
      throw new Error("Expected invitee registration to create a user");
    }

    const accept = await injectWithCsrf(app, {
      headers: { cookie: inviteeCookie },
      method: "POST",
      url: `/api/v1/invitations/${inviteToken}/accept`,
    });
    expect(accept.statusCode).toBe(200);
    expect(accept.json()).toMatchObject({
      data: {
        member: {
          role: "editor",
          user: {
            username: "Partner",
          },
          workspaceId: ownerContext.activeWorkspace.id,
        },
      },
    });
    expect(Array.from(identityRepository.invitations.values())[0]?.acceptedAt).not.toBeNull();
    expect(identityRepository.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "workspace_member.invited",
          workspaceId: ownerContext.activeWorkspace.id,
        }),
        expect.objectContaining({
          action: "workspace_member.joined",
          actorUserId: inviteeUser.id,
          workspaceId: ownerContext.activeWorkspace.id,
        }),
      ]),
    );

    const members = await app.inject({
      headers: { cookie: ownerCookie },
      method: "GET",
      url: `/api/v1/workspaces/${ownerContext.activeWorkspace.id}/members`,
    });
    expect(members.statusCode).toBe(200);
    expect(members.json()).toMatchObject({
      data: {
        members: [
          {
            role: "owner",
            user: {
              username: "Owner",
            },
          },
          {
            role: "editor",
            user: {
              username: "Partner",
            },
          },
        ],
      },
    });

    const updateRole = await injectWithCsrf(app, {
      headers: { cookie: ownerCookie },
      method: "PATCH",
      payload: { role: "viewer" },
      url: `/api/v1/workspaces/${ownerContext.activeWorkspace.id}/members/${inviteeUser.id}`,
    });
    expect(updateRole.statusCode).toBe(200);
    expect(updateRole.json()).toMatchObject({
      data: {
        member: {
          role: "viewer",
        },
      },
    });

    const removeMember = await injectWithCsrf(app, {
      headers: { cookie: ownerCookie },
      method: "DELETE",
      url: `/api/v1/workspaces/${ownerContext.activeWorkspace.id}/members/${inviteeUser.id}`,
    });
    expect(removeMember.statusCode).toBe(204);
    await expect(
      identityRepository.findWorkspaceMember(ownerContext.activeWorkspace.id, inviteeUser.id),
    ).resolves.toBeNull();

    const declineInvite = await injectWithCsrf(app, {
      headers: { cookie: ownerCookie },
      method: "POST",
      payload: {
        inviteeIdentifier: "decline",
        role: "viewer",
      },
      url: `/api/v1/workspaces/${ownerContext.activeWorkspace.id}/invitations`,
    });
    const declineToken = getInvitationToken(
      declineInvite.json<{ data: { inviteLink: string } }>().data.inviteLink,
    );
    const decline = await injectWithCsrf(app, {
      method: "POST",
      url: `/api/v1/invitations/${declineToken}/decline`,
    });
    expect(decline.statusCode).toBe(204);
    expect(identityRepository.auditEvents).toContainEqual(
      expect.objectContaining({
        action: "workspace_member.invite_revoked",
        metadataJson: { reason: "declined" },
        workspaceId: ownerContext.activeWorkspace.id,
      }),
    );

    const revokeInvite = await injectWithCsrf(app, {
      headers: { cookie: ownerCookie },
      method: "POST",
      payload: {
        inviteeIdentifier: "revoke",
        role: "viewer",
      },
      url: `/api/v1/workspaces/${ownerContext.activeWorkspace.id}/invitations`,
    });
    const revokePayload = revokeInvite.json<{
      data: { invitation: { id: SyncedId }; inviteLink: string };
    }>().data;
    const revoke = await injectWithCsrf(app, {
      headers: { cookie: ownerCookie },
      method: "DELETE",
      url: `/api/v1/workspaces/${ownerContext.activeWorkspace.id}/invitations/${revokePayload.invitation.id}`,
    });
    expect(revoke.statusCode).toBe(204);
    expect(identityRepository.auditEvents).toContainEqual(
      expect.objectContaining({
        action: "workspace_member.invite_revoked",
        actorUserId: ownerContext.activeWorkspace.ownerUserId,
        metadataJson: { reason: "revoked" },
        workspaceId: ownerContext.activeWorkspace.id,
      }),
    );

    const revokedPreview = await app.inject({
      method: "GET",
      url: `/api/v1/invitations/${getInvitationToken(revokePayload.inviteLink)}`,
    });
    expect(revokedPreview.statusCode).toBe(404);
  });

  it("revokes the current session on logout", async () => {
    const { app, identityRepository } = await makeApp();
    const register = await injectWithCsrf(app, {
      method: "POST",
      payload: {
        password: "correct horse battery staple",
        username: "Owner",
      },
      url: "/api/v1/auth/register",
    });
    const cookie = getCookiePair(register);

    const logout = await injectWithCsrf(app, {
      headers: { cookie },
      method: "POST",
      url: "/api/v1/auth/logout",
    });

    expect(logout.statusCode).toBe(204);
    expect(String(logout.headers["set-cookie"])).toContain("Max-Age=0");
    expect(Array.from(identityRepository.sessions.values())[0]?.revokedAt).not.toBeNull();

    const me = await app.inject({
      headers: { cookie },
      method: "GET",
      url: "/api/v1/me/context",
    });
    expect(me.statusCode).toBe(401);
  });
});
