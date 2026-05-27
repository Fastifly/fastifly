import type { FastifyInstance } from "fastify";
import { z } from "zod/v4";
import { apiKeyDisplayPrefix, generateApiKeyToken, hashApiKeyToken } from "../../auth/api-keys.js";
import { requireAuthenticatedUser } from "../../policies.js";
import { ErrorResponseSchemas } from "../../schemas.js";
import { AUTH_RATE_LIMIT, type RegisterAuthRoutesOptions } from "./contracts.js";
import {
  ApiKeyListResponseSchema,
  ApiKeyParamsSchema,
  CreateApiKeyBodySchema,
  CreatedApiKeyResponseSchema,
  makeHttpError,
  toApiKeyResponse,
} from "./definitions.js";

export async function registerAuthApiKeyRoutes(
  app: FastifyInstance,
  options: RegisterAuthRoutesOptions,
): Promise<void> {
  const { identityRepository } = options;

  app.get(
    "/api/v1/me/api-keys",
    {
      schema: {
        response: {
          200: ApiKeyListResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const userId = requireAuthenticatedUser(request);
      const apiKeys = await identityRepository.listApiKeysForUser(userId);

      return { data: { apiKeys: apiKeys.map(toApiKeyResponse) } };
    },
  );

  app.post(
    "/api/v1/me/api-keys",
    {
      config: {
        rateLimit: AUTH_RATE_LIMIT,
      },
      onRequest: app.csrfProtection,
      schema: {
        body: CreateApiKeyBodySchema,
        response: {
          201: CreatedApiKeyResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const userId = requireAuthenticatedUser(request);
      const input = CreateApiKeyBodySchema.parse(request.body);

      const token = generateApiKeyToken();
      const apiKey = await identityRepository.createApiKey({
        name: input.name,
        tokenHash: hashApiKeyToken(token),
        tokenPrefix: apiKeyDisplayPrefix(token),
        userId,
      });

      // The plaintext token is only ever returned here, at creation time.
      return reply.status(201).send({ data: { apiKey: toApiKeyResponse(apiKey), token } });
    },
  );

  app.delete(
    "/api/v1/me/api-keys/:apiKeyId",
    {
      onRequest: app.csrfProtection,
      schema: {
        params: ApiKeyParamsSchema,
        response: {
          204: z.null(),
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const userId = requireAuthenticatedUser(request);
      const params = ApiKeyParamsSchema.parse(request.params);

      const revoked = await identityRepository.revokeApiKey({
        apiKeyId: params.apiKeyId,
        userId,
      });

      if (!revoked) {
        throw makeHttpError(404, "API key was not found.");
      }

      return reply.status(204).send();
    },
  );
}
