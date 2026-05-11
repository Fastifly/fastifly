import {
  AuthResponseSchema,
  CsrfTokenResponseSchema,
  LoginCredentialsSchema,
  MeContextResponseSchema,
  RegisterCredentialsSchema,
} from "@fastifly/common";
import type { FastifyInstance } from "fastify";
import { z } from "zod/v4";
import { hashPassword, verifyPasswordHash } from "../../auth/passwords.js";
import { generateSessionToken, hashSessionToken } from "../../auth/sessions.js";
import { ErrorResponseSchemas } from "../../schemas.js";
import { AUTH_RATE_LIMIT, type RegisterAuthRoutesOptions } from "./contracts.js";
import {
  clearSessionCookie,
  createSessionExpiry,
  makeHttpError,
  setSessionCookie,
  toAuthUser,
} from "./definitions.js";

export async function registerAuthIdentityRoutes(
  app: FastifyInstance,
  options: RegisterAuthRoutesOptions,
): Promise<void> {
  const { config, identityRepository } = options;

  app.get(
    "/api/v1/auth/csrf",
    {
      schema: {
        response: {
          200: CsrfTokenResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (_request, reply) => ({
      data: {
        csrfToken: await reply.generateCsrf(),
      },
    }),
  );

  app.post(
    "/api/v1/auth/register",
    {
      config: {
        rateLimit: AUTH_RATE_LIMIT,
      },
      onRequest: app.csrfProtection,
      schema: {
        body: RegisterCredentialsSchema,
        response: {
          201: AuthResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const input = RegisterCredentialsSchema.parse(request.body);
      const existingUser = await identityRepository.findUserByNormalizedUsername(input.username);

      if (existingUser) {
        throw makeHttpError(409, "Username is already registered.");
      }

      let user: Awaited<ReturnType<typeof identityRepository.createUser>>;

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
      config: {
        rateLimit: AUTH_RATE_LIMIT,
      },
      onRequest: app.csrfProtection,
      schema: {
        body: LoginCredentialsSchema,
        response: {
          200: AuthResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const input = LoginCredentialsSchema.parse(request.body);
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

  app.post(
    "/api/v1/auth/logout",
    {
      onRequest: app.csrfProtection,
      schema: {
        response: {
          204: z.null(),
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
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
    },
  );

  app.get(
    "/api/v1/me/context",
    {
      schema: {
        response: {
          200: MeContextResponseSchema,
          ...ErrorResponseSchemas,
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
}
