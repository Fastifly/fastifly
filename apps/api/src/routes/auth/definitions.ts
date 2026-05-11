import { type AuthUserSchema, parseSyncedId } from "@fastifly/common";
import type { ApiConfig } from "@fastifly/config";
import type { IdentityRepository, UserRecord } from "@fastifly/db";
import type { FastifyReply } from "fastify";
import { z } from "zod/v4";
import { DEFAULT_RECOVERY_CODE_COUNT, hashSessionToken } from "../../auth/sessions.js";

export const PasskeyOptionsResponseSchema = z
  .object({
    data: z
      .object({
        options: z.unknown(),
      })
      .strict(),
  })
  .strict();

export const PasskeySchema = z
  .object({
    id: z.uuidv7(),
    credentialId: z.string().min(1),
    name: z.string().min(1),
    createdAt: z.string().min(1),
    lastUsedAt: z.string().nullable(),
  })
  .strict();

export const PasskeyResponseSchema = z
  .object({
    data: z
      .object({
        passkey: PasskeySchema,
      })
      .strict(),
  })
  .strict();

export const PasskeyListResponseSchema = z
  .object({
    data: z
      .object({
        passkeys: z.array(PasskeySchema),
      })
      .strict(),
  })
  .strict();

export const PasskeyFinishBodySchema = z
  .object({
    response: z.record(z.string(), z.unknown()),
  })
  .strict();

export const PasskeyLoginStartBodySchema = z
  .object({
    username: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export const PasskeyParamsSchema = z
  .object({
    passkeyId: z.uuidv7(),
  })
  .strict();

export const RenamePasskeyBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
  })
  .strict();

export const RecoveryCodesResponseSchema = z
  .object({
    data: z
      .object({
        recoveryCodes: z.array(z.string().min(1)).length(DEFAULT_RECOVERY_CODE_COUNT),
      })
      .strict(),
  })
  .strict();

export const CreateInvitationBodySchema = z
  .object({
    inviteeIdentifier: z.string().trim().min(1).max(200),
    role: z.enum(["admin", "editor", "viewer"]),
  })
  .strict();

export const WorkspaceParamsSchema = z
  .object({
    workspaceId: z.uuidv7(),
  })
  .strict();

export const InvitationResponseSchema = z
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

export const InvitationTokenParamsSchema = z
  .object({
    token: z.string().trim().min(1),
  })
  .strict();

export const WorkspaceInvitationParamsSchema = z
  .object({
    invitationId: z.uuidv7(),
    workspaceId: z.uuidv7(),
  })
  .strict();

export const WorkspaceMemberParamsSchema = z
  .object({
    userId: z.uuidv7(),
    workspaceId: z.uuidv7(),
  })
  .strict();

export const UpdateWorkspaceMemberBodySchema = z
  .object({
    role: z.enum(["admin", "editor", "viewer"]),
  })
  .strict();

export const InvitationPreviewResponseSchema = z
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

export const WorkspaceMemberSchema = z
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

export const WorkspaceMemberResponseSchema = z
  .object({
    data: z
      .object({
        member: WorkspaceMemberSchema,
      })
      .strict(),
  })
  .strict();

export const WorkspaceMemberListResponseSchema = z
  .object({
    data: z
      .object({
        members: z.array(WorkspaceMemberSchema),
      })
      .strict(),
  })
  .strict();

export function toAuthUser(user: UserRecord): z.infer<typeof AuthUserSchema> {
  return {
    displayName: user.displayName,
    id: user.id,
    username: user.username,
  };
}

export function makeHttpError(statusCode: number, message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

export function setSessionCookie(
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

export function clearSessionCookie(reply: FastifyReply, config: ApiConfig): void {
  reply.clearCookie(config.sessionCookieName, {
    path: "/",
  });
}

export function createSessionExpiry(config: ApiConfig, now = new Date()): Date {
  return new Date(now.getTime() + config.sessionTtlDays * 24 * 60 * 60 * 1000);
}

export function createInvitationExpiry(config: ApiConfig, now = new Date()): Date {
  return new Date(now.getTime() + config.invitationTtlDays * 24 * 60 * 60 * 1000);
}

export function createInvitationLink(config: ApiConfig, token: string): string {
  return new URL(`/invitations/${token}`, config.openApiBaseUrl).toString();
}

export function createPasskeyChallengeExpiry(config: ApiConfig, now = new Date()): Date {
  return new Date(now.getTime() + config.webAuthnChallengeTtlMinutes * 60 * 1000);
}

export function setChallengeCookie(
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

export function clearChallengeCookie(reply: FastifyReply, cookieName: string): void {
  reply.clearCookie(cookieName, { path: "/" });
}

export function toPasskeyResponse(
  passkey: Awaited<ReturnType<IdentityRepository["createPasskey"]>>,
) {
  return {
    id: passkey.id,
    credentialId: passkey.credentialId,
    name: passkey.name,
    createdAt: passkey.createdAt,
    lastUsedAt: passkey.lastUsedAt,
  };
}

export function toWorkspaceMemberResponse(member: {
  id: string;
  workspaceId: string;
  userId: string;
  role: string;
  createdAt: string;
  updatedAt: string;
  removedAt: string | null;
  user: {
    id: string;
    disabledAt: string | null;
    displayName: string;
    username: string;
  };
}) {
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

export function parseCookieSyncedId(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    return parseSyncedId(value);
  } catch {
    return null;
  }
}

export function resolveSessionUser(
  identityRepository: IdentityRepository,
  token: string | undefined,
): Promise<UserRecord | null> {
  if (!token) {
    return Promise.resolve(null);
  }

  return identityRepository
    .findActiveSessionByTokenHash(hashSessionToken(token))
    .then((session) => {
      if (!session) {
        return null;
      }
      return identityRepository.findUserById(session.userId);
    })
    .then((user) => (user && !user.disabledAt ? user : null));
}
