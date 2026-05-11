import type { FastifyInstance } from "fastify";
import { z } from "zod/v4";
import { generateRecoveryCodes, hashRecoveryCode } from "../../auth/sessions.js";
import { requireAuthenticatedUser } from "../../policies.js";
import { ErrorResponseSchemas } from "../../schemas.js";
import type { RegisterAuthRoutesOptions } from "./contracts.js";
import { RecoveryCodesResponseSchema } from "./definitions.js";

export async function registerAuthRecoveryRoutes(
  app: FastifyInstance,
  options: RegisterAuthRoutesOptions,
): Promise<void> {
  const { identityRepository } = options;

  app.post(
    "/api/v1/me/recovery-codes",
    {
      onRequest: app.csrfProtection,
      schema: {
        response: {
          201: RecoveryCodesResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (_request, reply) => {
      const userId = requireAuthenticatedUser(_request);
      const recoveryCodes = generateRecoveryCodes();

      await identityRepository.replaceRecoveryCodes({
        codeHashes: recoveryCodes.map(hashRecoveryCode),
        userId,
      });

      return reply.status(201).send({ data: { recoveryCodes } });
    },
  );

  app.delete(
    "/api/v1/me/recovery-codes",
    {
      onRequest: app.csrfProtection,
      schema: {
        response: {
          204: z.null(),
          ...ErrorResponseSchemas,
        },
      },
    },
    async (_request, reply) => {
      const userId = requireAuthenticatedUser(_request);
      await identityRepository.deleteRecoveryCodesForUser(userId);

      return reply.status(204).send();
    },
  );
}
