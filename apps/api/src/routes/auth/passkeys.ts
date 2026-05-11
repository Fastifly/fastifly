import { AuthResponseSchema } from "@fastifly/common";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import type { FastifyInstance } from "fastify";
import { z } from "zod/v4";
import { generateSessionToken, hashSessionToken } from "../../auth/sessions.js";
import { requireAuthenticatedUser } from "../../policies.js";
import { ErrorResponseSchemas } from "../../schemas.js";
import { AUTH_RATE_LIMIT, type RegisterAuthRoutesOptions } from "./contracts.js";
import {
  clearChallengeCookie,
  createPasskeyChallengeExpiry,
  createSessionExpiry,
  makeHttpError,
  PasskeyFinishBodySchema,
  PasskeyListResponseSchema,
  PasskeyLoginStartBodySchema,
  PasskeyOptionsResponseSchema,
  PasskeyParamsSchema,
  PasskeyResponseSchema,
  parseCookieSyncedId,
  RenamePasskeyBodySchema,
  setChallengeCookie,
  setSessionCookie,
  toAuthUser,
  toPasskeyResponse,
} from "./definitions.js";

export async function registerAuthPasskeyRoutes(
  app: FastifyInstance,
  options: RegisterAuthRoutesOptions,
): Promise<void> {
  const { config, identityRepository, webAuthnAdapter } = options;

  app.post(
    "/api/v1/auth/passkeys/registration/start",
    {
      onRequest: app.csrfProtection,
      schema: {
        response: {
          200: PasskeyOptionsResponseSchema,
          ...ErrorResponseSchemas,
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
      onRequest: app.csrfProtection,
      schema: {
        body: PasskeyFinishBodySchema,
        response: {
          201: PasskeyResponseSchema,
          ...ErrorResponseSchemas,
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
      config: {
        rateLimit: AUTH_RATE_LIMIT,
      },
      onRequest: app.csrfProtection,
      schema: {
        body: PasskeyLoginStartBodySchema,
        response: {
          200: PasskeyOptionsResponseSchema,
          ...ErrorResponseSchemas,
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
      config: {
        rateLimit: AUTH_RATE_LIMIT,
      },
      onRequest: app.csrfProtection,
      schema: {
        body: PasskeyFinishBodySchema,
        response: {
          200: AuthResponseSchema,
          ...ErrorResponseSchemas,
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
          ...ErrorResponseSchemas,
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
      onRequest: app.csrfProtection,
      schema: {
        body: RenamePasskeyBodySchema,
        params: PasskeyParamsSchema,
        response: {
          200: PasskeyResponseSchema,
          ...ErrorResponseSchemas,
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

  app.delete(
    "/api/v1/me/passkeys/:passkeyId",
    {
      onRequest: app.csrfProtection,
      schema: {
        params: PasskeyParamsSchema,
        response: {
          204: z.null(),
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
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
    },
  );
}
