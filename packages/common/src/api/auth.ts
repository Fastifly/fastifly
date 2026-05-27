import { z } from "zod";

import { SyncedIdSchema } from "../ids.js";
import { CurrencyCodeSchema } from "../money.js";

export const LoginCredentialsSchema = z.strictObject({
  password: z.string().min(1).max(1024),
  username: z.string().trim().min(1).max(100),
});

export const RegisterCredentialsSchema = z.strictObject({
  password: z.string().min(8).max(1024),
  username: z.string().trim().min(1).max(100),
});

export const AuthCredentialsSchema = RegisterCredentialsSchema;

export const AuthUserSchema = z.strictObject({
  displayName: z.string().min(1),
  id: SyncedIdSchema,
  username: z.string().min(1),
});

export const AuthResponseSchema = z.strictObject({
  data: z.strictObject({
    user: AuthUserSchema,
  }),
});

export const CsrfTokenResponseSchema = z.strictObject({
  data: z.strictObject({
    csrfToken: z.string().min(1),
  }),
});

export const MeContextResponseSchema = z.strictObject({
  data: z.strictObject({
    activeLedger: z.strictObject({
      baseCurrencyCode: CurrencyCodeSchema,
      id: SyncedIdSchema,
      name: z.string().min(1),
    }),
    activeWorkspace: z.strictObject({
      id: SyncedIdSchema,
      name: z.string().min(1),
      role: z.enum(["owner", "admin", "editor", "viewer"]),
    }),
    user: AuthUserSchema,
  }),
});

export const ApiKeySchema = z.strictObject({
  createdAt: z.string().min(1),
  id: SyncedIdSchema,
  lastUsedAt: z.string().nullable(),
  name: z.string().min(1),
  revokedAt: z.string().nullable(),
  tokenPrefix: z.string().min(1),
});

export const ApiKeyListResponseSchema = z.strictObject({
  data: z.strictObject({
    apiKeys: z.array(ApiKeySchema),
  }),
});

export const CreateApiKeyRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
});

export const CreatedApiKeyResponseSchema = z.strictObject({
  data: z.strictObject({
    apiKey: ApiKeySchema,
    token: z.string().min(1),
  }),
});

export type AuthCredentials = RegisterCredentials;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type ApiKey = z.infer<typeof ApiKeySchema>;
export type ApiKeyListResponse = z.infer<typeof ApiKeyListResponseSchema>;
export type CreateApiKeyRequest = z.infer<typeof CreateApiKeyRequestSchema>;
export type CreatedApiKeyResponse = z.infer<typeof CreatedApiKeyResponseSchema>;
export type CsrfTokenResponse = z.infer<typeof CsrfTokenResponseSchema>;
export type LoginCredentials = z.infer<typeof LoginCredentialsSchema>;
export type MeContextResponse = z.infer<typeof MeContextResponseSchema>;
export type RegisterCredentials = z.infer<typeof RegisterCredentialsSchema>;
