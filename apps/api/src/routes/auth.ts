import { parseSyncedId } from "@fastifly/common";
import type { ApiConfig } from "@fastifly/config";
import type { IdentityRepository, UserRecord, WorkspaceMemberWithUserRecord } from "@fastifly/db";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod/v4";
import {
  hashPassword,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  verifyPasswordHash,
} from "../auth/passwords.js";
import {
  DEFAULT_RECOVERY_CODE_COUNT,
  generateInvitationToken,
  generateRecoveryCodes,
  generateSessionToken,
  hashInvitationToken,
  hashRecoveryCode,
  hashSessionToken,
} from "../auth/sessions.js";
import type { WebAuthnAdapter } from "../auth/webauthn.js";
import { requireAbility, requireActiveWorkspace, requireAuthenticatedUser } from "../policies.js";

const AuthCredentialsSchema = z
  .object({
    username: z.string().trim().min(1).max(100),
    password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
  })
  .strict();

const AuthUserSchema = z
  .object({
    id: z.uuidv7(),
    username: z.string().min(1),
    displayName: z.string().min(1),
  })
  .strict();

const AuthResponseSchema = z
  .object({
    data: z
      .object({
        user: AuthUserSchema,
      })
      .strict(),
  })
  .strict();

const MeContextResponseSchema = z
  .object({
    data: z
      .object({
        user: AuthUserSchema,
        activeWorkspace: z
          .object({
            id: z.uuidv7(),
            name: z.string().min(1),
            role: z.enum(["owner", "admin", "editor", "viewer"]),
          })
          .strict(),
        activeLedger: z
          .object({
            id: z.uuidv7(),
            name: z.string().min(1),
            baseCurrencyCode: z.string().length(3),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

const PasskeyOptionsResponseSchema = z
  .object({
    data: z
      .object({
        options: z.unknown(),
      })
      .strict(),
  })
  .strict();

const PasskeySchema = z
  .object({
    id: z.uuidv7(),
    credentialId: z.string().min(1),
    name: z.string().min(1),
    createdAt: z.string().min(1),
    lastUsedAt: z.string().nullable(),
  })
  .strict();

const PasskeyResponseSchema = z
  .object({
    data: z
      .object({
        passkey: PasskeySchema,
      })
      .strict(),
  })
  .strict();

const PasskeyListResponseSchema = z
  .object({
    data: z
      .object({
        passkeys: z.array(PasskeySchema),
      })
      .strict(),
  })
  .strict();

const PasskeyFinishBodySchema = z
  .object({
    response: z.record(z.string(), z.unknown()),
  })
  .strict();

const PasskeyLoginStartBodySchema = z
  .object({
    username: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

const PasskeyParamsSchema = z
  .object({
    passkeyId: z.uuidv7(),
  })
  .strict();

const RenamePasskeyBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
  })
  .strict();

const RecoveryCodesResponseSchema = z
  .object({
    data: z
      .object({
        recoveryCodes: z.array(z.string().min(1)).length(DEFAULT_RECOVERY_CODE_COUNT),
      })
      .strict(),
  })
  .strict();

const CreateInvitationBodySchema = z
  .object({
    inviteeIdentifier: z.string().trim().min(1).max(200),
    role: z.enum(["admin", "editor", "viewer"]),
  })
  .strict();

const WorkspaceParamsSchema = z
  .object({
    workspaceId: z.uuidv7(),
  })
  .strict();

const InvitationResponseSchema = z
  .object({
    data: z
      .object({
        invitation: z
          .object({
            id: z.uuidv7(),
            workspaceId: z.uuidv7(),
            inviteeIdentifier: z.string().min(1),
            role: z.enum(["admin", "editor", "viewer"]),
            expiresAt: z.string().min(1),
          })
          .strict(),
        inviteLink: z.url(),
      })
      .strict(),
  })
  .strict();

const InvitationTokenParamsSchema = z
  .object({
    token: z.string().trim().min(1),
  })
  .strict();

const WorkspaceInvitationParamsSchema = z
  .object({
    invitationId: z.uuidv7(),
    workspaceId: z.uuidv7(),
  })
  .strict();

const WorkspaceMemberParamsSchema = z
  .object({
    userId: z.uuidv7(),
    workspaceId: z.uuidv7(),
  })
  .strict();

const UpdateWorkspaceMemberBodySchema = z
  .object({
    role: z.enum(["admin", "editor", "viewer"]),
  })
  .strict();

const InvitationPreviewResponseSchema = z
  .object({
    data: z
      .object({
        invitation: z
          .object({
            id: z.uuidv7(),
            workspaceId: z.uuidv7(),
            workspaceName: z.string().min(1),
            inviteeIdentifier: z.string().min(1),
            role: z.enum(["admin", "editor", "viewer"]),
            expiresAt: z.string().min(1),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

const WorkspaceMemberSchema = z
  .object({
    id: z.uuidv7(),
    workspaceId: z.uuidv7(),
    userId: z.uuidv7(),
    role: z.enum(["owner", "admin", "editor", "viewer"]),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    removedAt: z.string().nullable(),
    user: z
      .object({
        id: z.uuidv7(),
        username: z.string().min(1),
        displayName: z.string().min(1),
        disabledAt: z.string().nullable(),
      })
      .strict(),
  })
  .strict();

const WorkspaceMemberResponseSchema = z
  .object({
    data: z
      .object({
        member: WorkspaceMemberSchema,
      })
      .strict(),
  })
  .strict();

const WorkspaceMemberListResponseSchema = z
  .object({
    data: z
      .object({
        members: z.array(WorkspaceMemberSchema),
      })
      .strict(),
  })
  .strict();

export type RegisterAuthRoutesOptions = {
  readonly identityRepository: IdentityRepository;
  readonly config: ApiConfig;
  readonly webAuthnAdapter: WebAuthnAdapter;
};

function toAuthUser(user: UserRecord): z.infer<typeof AuthUserSchema> {
  return {
    displayName: user.displayName,
    id: user.id,
    username: user.username,
  };
}

function makeHttpError(statusCode: number, message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

function setSessionCookie(
  reply: FastifyReply,
  config: ApiConfig,
  token: string,
  expiresAt: Date,
): void {
  reply.setCookie(config.sessionCookieName, token, {
    expires: expiresAt,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: config.cookieSecure ?? config.nodeEnv === "production",
  });
}

function clearSessionCookie(reply: FastifyReply, config: ApiConfig): void {
  reply.clearCookie(config.sessionCookieName, {
    path: "/",
  });
}

function createSessionExpiry(config: ApiConfig, now = new Date()): Date {
  return new Date(now.getTime() + config.sessionTtlDays * 24 * 60 * 60 * 1000);
}

function createInvitationExpiry(config: ApiConfig, now = new Date()): Date {
  return new Date(now.getTime() + config.invitationTtlDays * 24 * 60 * 60 * 1000);
}

function createInvitationLink(config: ApiConfig, token: string): string {
  return new URL(`/invitations/${token}`, config.openApiBaseUrl).toString();
}

function createPasskeyChallengeExpiry(config: ApiConfig, now = new Date()): Date {
  return new Date(now.getTime() + config.webAuthnChallengeTtlMinutes * 60 * 1000);
}

function setChallengeCookie(
  reply: FastifyReply,
  config: ApiConfig,
  cookieName: string,
  challengeId: string,
  expiresAt: Date,
): void {
  reply.setCookie(cookieName, challengeId, {
    expires: expiresAt,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: config.cookieSecure ?? config.nodeEnv === "production",
  });
}

function clearChallengeCookie(reply: FastifyReply, cookieName: string): void {
  reply.clearCookie(cookieName, { path: "/" });
}

function toPasskeyResponse(passkey: Awaited<ReturnType<IdentityRepository["createPasskey"]>>) {
  return {
    id: passkey.id,
    credentialId: passkey.credentialId,
    name: passkey.name,
    createdAt: passkey.createdAt,
    lastUsedAt: passkey.lastUsedAt,
  };
}

function toWorkspaceMemberResponse(member: WorkspaceMemberWithUserRecord) {
  return {
    id: member.id,
    workspaceId: member.workspaceId,
    userId: member.userId,
    role: member.role,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
    removedAt: member.removedAt,
    user: member.user,
  };
}

function parseCookieSyncedId(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    return parseSyncedId(value);
  } catch {
    return null;
  }
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  options: RegisterAuthRoutesOptions,
): Promise<void> {
  const { config, identityRepository, webAuthnAdapter } = options;

  app.post(
    "/api/v1/auth/register",
    {
      schema: {
        body: AuthCredentialsSchema,
        response: {
          201: AuthResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const input = AuthCredentialsSchema.parse(request.body);
      const existingUser = await identityRepository.findUserByNormalizedUsername(input.username);

      if (existingUser) {
        throw makeHttpError(409, "Username is already registered.");
      }

      let user: UserRecord;

      try {
        user = await identityRepository.createUser({
          displayName: input.username.trim(),
          passwordHash: await hashPassword(input.password),
          username: input.username,
        });
      } catch (error) {
        if (await identityRepository.findUserByNormalizedUsername(input.username)) {
          throw makeHttpError(409, "Username is already registered.");
        }

        throw error;
      }

      await identityRepository.bootstrapDefaultWorkspace({ userId: user.id });

      const token = generateSessionToken();
      const expiresAt = createSessionExpiry(config);
      await identityRepository.createSession({
        expiresAt,
        tokenHash: hashSessionToken(token),
        userId: user.id,
      });
      setSessionCookie(reply, config, token, expiresAt);

      return reply.status(201).send({ data: { user: toAuthUser(user) } });
    },
  );

  app.post(
    "/api/v1/auth/login",
    {
      schema: {
        body: AuthCredentialsSchema,
        response: {
          200: AuthResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const input = AuthCredentialsSchema.parse(request.body);
      const user = await identityRepository.findUserByNormalizedUsername(input.username);

      if (!user || user.disabledAt) {
        throw makeHttpError(401, "Invalid username or password.");
      }

      const passwordMatches = await verifyPasswordHash({
        password: input.password,
        passwordHash: user.passwordHash,
      });

      if (!passwordMatches) {
        throw makeHttpError(401, "Invalid username or password.");
      }

      const token = generateSessionToken();
      const expiresAt = createSessionExpiry(config);
      await identityRepository.createSession({
        expiresAt,
        tokenHash: hashSessionToken(token),
        userId: user.id,
      });
      setSessionCookie(reply, config, token, expiresAt);

      return { data: { user: toAuthUser(user) } };
    },
  );

  app.post("/api/v1/auth/logout", async (request, reply) => {
    const token = request.cookies[config.sessionCookieName];

    if (token) {
      const session = await identityRepository.findActiveSessionByTokenHash(
        hashSessionToken(token),
      );

      if (session) {
        await identityRepository.revokeSession(session.id);
      }
    }

    clearSessionCookie(reply, config);
    return reply.status(204).send();
  });

  app.get(
    "/api/v1/me/context",
    {
      schema: {
        response: {
          200: MeContextResponseSchema,
        },
      },
    },
    async (request) => {
      if (request.authContext.kind !== "user") {
        throw makeHttpError(401, "Authentication is required.");
      }

      const user = await identityRepository.findUserById(request.authContext.userId);

      if (!user || user.disabledAt) {
        throw makeHttpError(401, "Authentication is required.");
      }

      const workspaceContext =
        request.workspaceContext ??
        (await identityRepository.findDefaultWorkspaceContextForUser(user.id));

      if (!workspaceContext) {
        throw makeHttpError(403, "No active workspace is available.");
      }

      return {
        data: {
          activeLedger: {
            baseCurrencyCode: workspaceContext.activeLedger.baseCurrencyCode,
            id: workspaceContext.activeLedger.id,
            name: workspaceContext.activeLedger.name,
          },
          activeWorkspace: {
            id: workspaceContext.activeWorkspace.id,
            name: workspaceContext.activeWorkspace.name,
            role: workspaceContext.activeWorkspace.role,
          },
          user: toAuthUser(user),
        },
      };
    },
  );

  app.post(
    "/api/v1/auth/passkeys/registration/start",
    {
      schema: {
        response: {
          200: PasskeyOptionsResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = requireAuthenticatedUser(request);
      const user = await identityRepository.findUserById(userId);

      if (!user || user.disabledAt) {
        throw makeHttpError(401, "Authentication is required.");
      }

      const existingPasskeys = await identityRepository.listPasskeysByUserId(user.id);
      const passkeyOptions = await webAuthnAdapter.generateRegistrationOptions({
        config,
        displayName: user.displayName,
        existingPasskeys,
        userId: user.id,
        username: user.username,
      });
      const expiresAt = createPasskeyChallengeExpiry(config);
      const challenge = await identityRepository.createPasskeyChallenge({
        challenge: passkeyOptions.challenge,
        expiresAt,
        kind: "registration",
        userId: user.id,
      });
      setChallengeCookie(
        reply,
        config,
        config.passkeyRegistrationChallengeCookieName,
        challenge.id,
        expiresAt,
      );

      return { data: { options: passkeyOptions } };
    },
  );

  app.post(
    "/api/v1/auth/passkeys/registration/finish",
    {
      schema: {
        body: PasskeyFinishBodySchema,
        response: {
          201: PasskeyResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = requireAuthenticatedUser(request);
      const challengeId = parseCookieSyncedId(
        request.cookies[config.passkeyRegistrationChallengeCookieName],
      );

      if (!challengeId) {
        throw makeHttpError(400, "Passkey registration challenge is missing.");
      }

      const challenge = await identityRepository.findActivePasskeyChallenge({
        id: challengeId,
        kind: "registration",
      });

      if (!challenge || challenge.userId !== userId) {
        throw makeHttpError(400, "Passkey registration challenge is invalid.");
      }

      const body = PasskeyFinishBodySchema.parse(request.body);
      const verifiedCredential = await webAuthnAdapter.verifyRegistrationResponse({
        config,
        expectedChallenge: challenge.challenge,
        response: body.response as unknown as RegistrationResponseJSON,
      });

      if (!verifiedCredential) {
        throw makeHttpError(400, "Passkey registration failed.");
      }

      const passkey = await identityRepository.createPasskey({
        counter: verifiedCredential.counter,
        credentialId: verifiedCredential.credentialId,
        name: "Passkey",
        publicKey: verifiedCredential.publicKey,
        transportsJson: verifiedCredential.transportsJson,
        userId,
      });
      await identityRepository.consumePasskeyChallenge(challenge.id);
      clearChallengeCookie(reply, config.passkeyRegistrationChallengeCookieName);

      return reply.status(201).send({ data: { passkey: toPasskeyResponse(passkey) } });
    },
  );

  app.post(
    "/api/v1/auth/passkeys/login/start",
    {
      schema: {
        body: PasskeyLoginStartBodySchema,
        response: {
          200: PasskeyOptionsResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const input = PasskeyLoginStartBodySchema.parse(request.body ?? {});
      const user = input.username
        ? await identityRepository.findUserByNormalizedUsername(input.username)
        : null;
      const passkeys = user ? await identityRepository.listPasskeysByUserId(user.id) : undefined;
      const passkeyOptions = await webAuthnAdapter.generateAuthenticationOptions(
        passkeys ? { config, passkeys } : { config },
      );
      const expiresAt = createPasskeyChallengeExpiry(config);
      const challenge = await identityRepository.createPasskeyChallenge({
        challenge: passkeyOptions.challenge,
        expiresAt,
        kind: "login",
        userId: user?.id ?? null,
      });
      setChallengeCookie(
        reply,
        config,
        config.passkeyLoginChallengeCookieName,
        challenge.id,
        expiresAt,
      );

      return { data: { options: passkeyOptions } };
    },
  );

  app.post(
    "/api/v1/auth/passkeys/login/finish",
    {
      schema: {
        body: PasskeyFinishBodySchema,
        response: {
          200: AuthResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const challengeId = parseCookieSyncedId(
        request.cookies[config.passkeyLoginChallengeCookieName],
      );

      if (!challengeId) {
        throw makeHttpError(400, "Passkey login challenge is missing.");
      }

      const challenge = await identityRepository.findActivePasskeyChallenge({
        id: challengeId,
        kind: "login",
      });

      if (!challenge) {
        throw makeHttpError(400, "Passkey login challenge is invalid.");
      }

      const body = PasskeyFinishBodySchema.parse(request.body);
      const passkey = await identityRepository.findPasskeyByCredentialId(
        String(body.response.id ?? ""),
      );

      if (!passkey || (challenge.userId && passkey.userId !== challenge.userId)) {
        throw makeHttpError(401, "Passkey login failed.");
      }

      const verifiedCredential = await webAuthnAdapter.verifyAuthenticationResponse({
        config,
        expectedChallenge: challenge.challenge,
        passkey,
        response: body.response as unknown as AuthenticationResponseJSON,
      });

      if (!verifiedCredential) {
        throw makeHttpError(401, "Passkey login failed.");
      }

      const user = await identityRepository.findUserById(passkey.userId);

      if (!user || user.disabledAt) {
        throw makeHttpError(401, "Passkey login failed.");
      }

      await identityRepository.updatePasskeyAfterLogin({
        counter: verifiedCredential.counter,
        credentialId: verifiedCredential.credentialId,
      });
      await identityRepository.consumePasskeyChallenge(challenge.id);
      clearChallengeCookie(reply, config.passkeyLoginChallengeCookieName);

      const token = generateSessionToken();
      const expiresAt = createSessionExpiry(config);
      await identityRepository.createSession({
        expiresAt,
        tokenHash: hashSessionToken(token),
        userId: user.id,
      });
      setSessionCookie(reply, config, token, expiresAt);

      return { data: { user: toAuthUser(user) } };
    },
  );

  app.get(
    "/api/v1/me/passkeys",
    {
      schema: {
        response: {
          200: PasskeyListResponseSchema,
        },
      },
    },
    async (request) => {
      const userId = requireAuthenticatedUser(request);
      const passkeys = await identityRepository.listPasskeysByUserId(userId);

      return { data: { passkeys: passkeys.map(toPasskeyResponse) } };
    },
  );

  app.patch(
    "/api/v1/me/passkeys/:passkeyId",
    {
      schema: {
        body: RenamePasskeyBodySchema,
        params: PasskeyParamsSchema,
        response: {
          200: PasskeyResponseSchema,
        },
      },
    },
    async (request) => {
      const userId = requireAuthenticatedUser(request);
      const params = PasskeyParamsSchema.parse(request.params);
      const input = RenamePasskeyBodySchema.parse(request.body);
      const passkey = await identityRepository.renamePasskey({
        id: params.passkeyId,
        name: input.name,
        userId,
      });

      if (!passkey) {
        throw makeHttpError(404, "Passkey was not found.");
      }

      return { data: { passkey: toPasskeyResponse(passkey) } };
    },
  );

  app.delete("/api/v1/me/passkeys/:passkeyId", async (request, reply) => {
    const userId = requireAuthenticatedUser(request);
    const params = PasskeyParamsSchema.parse(request.params);
    const user = await identityRepository.findUserById(userId);
    const existingPasskeys = await identityRepository.listPasskeysByUserId(userId);

    if (!user || user.disabledAt) {
      throw makeHttpError(401, "Authentication is required.");
    }

    if (!user.passwordHash && existingPasskeys.length <= 1) {
      throw makeHttpError(409, "At least one usable sign-in method must remain.");
    }

    const passkey = await identityRepository.deletePasskey({
      id: params.passkeyId,
      userId,
    });

    if (!passkey) {
      throw makeHttpError(404, "Passkey was not found.");
    }

    return reply.status(204).send();
  });

  app.post(
    "/api/v1/me/recovery-codes",
    {
      schema: {
        response: {
          201: RecoveryCodesResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = requireAuthenticatedUser(request);
      const recoveryCodes = generateRecoveryCodes();

      await identityRepository.replaceRecoveryCodes({
        codeHashes: recoveryCodes.map(hashRecoveryCode),
        userId,
      });

      return reply.status(201).send({ data: { recoveryCodes } });
    },
  );

  app.delete("/api/v1/me/recovery-codes", async (request, reply) => {
    const userId = requireAuthenticatedUser(request);
    await identityRepository.deleteRecoveryCodesForUser(userId);

    return reply.status(204).send();
  });

  app.post(
    "/api/v1/workspaces/:workspaceId/invitations",
    {
      schema: {
        body: CreateInvitationBodySchema,
        params: WorkspaceParamsSchema,
        response: {
          201: InvitationResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = requireAuthenticatedUser(request);
      const params = WorkspaceParamsSchema.parse(request.params);
      const input = CreateInvitationBodySchema.parse(request.body);

      requireActiveWorkspace(request, params.workspaceId);
      requireAbility(request, "invite", "WorkspaceInvitation");

      const pendingInvitation = await identityRepository.findPendingWorkspaceInvitationByInvitee({
        inviteeIdentifier: input.inviteeIdentifier,
        workspaceId: params.workspaceId,
      });

      if (pendingInvitation) {
        throw makeHttpError(409, "A pending invitation already exists for this invitee.");
      }

      const token = generateInvitationToken();
      const invitation = await identityRepository.createWorkspaceInvitation({
        expiresAt: createInvitationExpiry(config),
        invitedByUserId: userId,
        inviteeIdentifier: input.inviteeIdentifier,
        role: input.role,
        tokenHash: hashInvitationToken(token),
        workspaceId: params.workspaceId,
      });
      await identityRepository.recordWorkspaceAuditEvent({
        action: "workspace_member.invited",
        actorUserId: userId,
        entityId: invitation.id,
        entityType: "workspace_invitation",
        metadataJson: {
          inviteeIdentifier: invitation.inviteeIdentifier,
          role: invitation.role,
        },
        workspaceId: params.workspaceId,
      });

      return reply.status(201).send({
        data: {
          invitation: {
            expiresAt: invitation.expiresAt,
            id: invitation.id,
            inviteeIdentifier: invitation.inviteeIdentifier,
            role: invitation.role,
            workspaceId: invitation.workspaceId,
          },
          inviteLink: createInvitationLink(config, token),
        },
      });
    },
  );

  app.get(
    "/api/v1/invitations/:token",
    {
      schema: {
        params: InvitationTokenParamsSchema,
        response: {
          200: InvitationPreviewResponseSchema,
        },
      },
    },
    async (request) => {
      const params = InvitationTokenParamsSchema.parse(request.params);
      const invitation = await identityRepository.findActiveWorkspaceInvitationByTokenHash({
        tokenHash: hashInvitationToken(params.token),
      });

      if (!invitation) {
        throw makeHttpError(404, "Invitation was not found.");
      }

      const workspace = await identityRepository.findWorkspaceById(invitation.workspaceId);

      if (!workspace || workspace.archivedAt) {
        throw makeHttpError(404, "Invitation was not found.");
      }

      return {
        data: {
          invitation: {
            expiresAt: invitation.expiresAt,
            id: invitation.id,
            inviteeIdentifier: invitation.inviteeIdentifier,
            role: invitation.role,
            workspaceId: invitation.workspaceId,
            workspaceName: workspace.name,
          },
        },
      };
    },
  );

  app.post(
    "/api/v1/invitations/:token/accept",
    {
      schema: {
        params: InvitationTokenParamsSchema,
        response: {
          200: WorkspaceMemberResponseSchema,
        },
      },
    },
    async (request) => {
      const userId = requireAuthenticatedUser(request);
      const params = InvitationTokenParamsSchema.parse(request.params);
      const user = await identityRepository.findUserById(userId);
      const invitation = await identityRepository.findActiveWorkspaceInvitationByTokenHash({
        tokenHash: hashInvitationToken(params.token),
      });

      if (!user || user.disabledAt) {
        throw makeHttpError(401, "Authentication is required.");
      }

      if (!invitation) {
        throw makeHttpError(404, "Invitation was not found.");
      }

      const member = await identityRepository.acceptWorkspaceInvitation({
        invitationId: invitation.id,
        userId,
      });

      if (!member) {
        throw makeHttpError(409, "Invitation can no longer be accepted.");
      }

      await identityRepository.recordWorkspaceAuditEvent({
        action: "workspace_member.joined",
        actorUserId: userId,
        entityId: member.id,
        entityType: "workspace_member",
        metadataJson: {
          invitationId: invitation.id,
          role: member.role,
        },
        workspaceId: member.workspaceId,
      });

      return {
        data: {
          member: toWorkspaceMemberResponse({
            ...member,
            user: {
              disabledAt: user.disabledAt,
              displayName: user.displayName,
              id: user.id,
              username: user.username,
            },
          }),
        },
      };
    },
  );

  app.post(
    "/api/v1/invitations/:token/decline",
    {
      schema: {
        params: InvitationTokenParamsSchema,
      },
    },
    async (request, reply) => {
      const params = InvitationTokenParamsSchema.parse(request.params);
      const invitation = await identityRepository.findActiveWorkspaceInvitationByTokenHash({
        tokenHash: hashInvitationToken(params.token),
      });

      if (!invitation) {
        throw makeHttpError(404, "Invitation was not found.");
      }

      await identityRepository.declineWorkspaceInvitation({ invitationId: invitation.id });
      await identityRepository.recordWorkspaceAuditEvent({
        action: "workspace_member.invite_revoked",
        actorUserId: null,
        entityId: invitation.id,
        entityType: "workspace_invitation",
        metadataJson: { reason: "declined" },
        workspaceId: invitation.workspaceId,
      });

      return reply.status(204).send();
    },
  );

  app.delete(
    "/api/v1/workspaces/:workspaceId/invitations/:invitationId",
    {
      schema: {
        params: WorkspaceInvitationParamsSchema,
      },
    },
    async (request, reply) => {
      const userId = requireAuthenticatedUser(request);
      const params = WorkspaceInvitationParamsSchema.parse(request.params);

      requireActiveWorkspace(request, params.workspaceId);
      requireAbility(request, "revoke", "WorkspaceInvitation");

      const invitation = await identityRepository.revokeWorkspaceInvitation({
        invitationId: params.invitationId,
        workspaceId: params.workspaceId,
      });

      if (!invitation) {
        throw makeHttpError(404, "Invitation was not found.");
      }

      await identityRepository.recordWorkspaceAuditEvent({
        action: "workspace_member.invite_revoked",
        actorUserId: userId,
        entityId: invitation.id,
        entityType: "workspace_invitation",
        metadataJson: { reason: "revoked" },
        workspaceId: invitation.workspaceId,
      });

      return reply.status(204).send();
    },
  );

  app.get(
    "/api/v1/workspaces/:workspaceId/members",
    {
      schema: {
        params: WorkspaceParamsSchema,
        response: {
          200: WorkspaceMemberListResponseSchema,
        },
      },
    },
    async (request) => {
      requireAuthenticatedUser(request);
      const params = WorkspaceParamsSchema.parse(request.params);

      requireActiveWorkspace(request, params.workspaceId);
      requireAbility(request, "read", "WorkspaceMember");

      const members = await identityRepository.listWorkspaceMembers(params.workspaceId);

      return { data: { members: members.map(toWorkspaceMemberResponse) } };
    },
  );

  app.patch(
    "/api/v1/workspaces/:workspaceId/members/:userId",
    {
      schema: {
        body: UpdateWorkspaceMemberBodySchema,
        params: WorkspaceMemberParamsSchema,
        response: {
          200: WorkspaceMemberResponseSchema,
        },
      },
    },
    async (request) => {
      requireAuthenticatedUser(request);
      const params = WorkspaceMemberParamsSchema.parse(request.params);
      const input = UpdateWorkspaceMemberBodySchema.parse(request.body);

      requireActiveWorkspace(request, params.workspaceId);
      requireAbility(request, "update", "WorkspaceMember");

      const target = await identityRepository.findWorkspaceMember(
        params.workspaceId,
        params.userId,
      );

      if (!target) {
        throw makeHttpError(404, "Workspace member was not found.");
      }

      if (target.role === "owner") {
        throw makeHttpError(409, "Workspace owners cannot be changed through member editing.");
      }

      const updated = await identityRepository.updateWorkspaceMemberRole({
        role: input.role,
        userId: params.userId,
        workspaceId: params.workspaceId,
      });
      const user = await identityRepository.findUserById(params.userId);

      if (!updated || !user) {
        throw makeHttpError(404, "Workspace member was not found.");
      }

      return {
        data: {
          member: toWorkspaceMemberResponse({
            ...updated,
            user: {
              disabledAt: user.disabledAt,
              displayName: user.displayName,
              id: user.id,
              username: user.username,
            },
          }),
        },
      };
    },
  );

  app.delete(
    "/api/v1/workspaces/:workspaceId/members/:userId",
    {
      schema: {
        params: WorkspaceMemberParamsSchema,
      },
    },
    async (request, reply) => {
      requireAuthenticatedUser(request);
      const params = WorkspaceMemberParamsSchema.parse(request.params);

      requireActiveWorkspace(request, params.workspaceId);
      requireAbility(request, "delete", "WorkspaceMember");

      const target = await identityRepository.findWorkspaceMember(
        params.workspaceId,
        params.userId,
      );

      if (!target) {
        throw makeHttpError(404, "Workspace member was not found.");
      }

      if (target.role === "owner") {
        throw makeHttpError(409, "Workspace owners cannot be removed.");
      }

      await identityRepository.removeWorkspaceMember({
        userId: params.userId,
        workspaceId: params.workspaceId,
      });

      return reply.status(204).send();
    },
  );
}

export async function resolveSessionUser(
  identityRepository: IdentityRepository,
  token: string | undefined,
): Promise<UserRecord | null> {
  if (!token) {
    return null;
  }

  const session = await identityRepository.findActiveSessionByTokenHash(hashSessionToken(token));

  if (!session) {
    return null;
  }

  const user = await identityRepository.findUserById(session.userId);
  return user && !user.disabledAt ? user : null;
}
