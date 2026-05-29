import { z } from "zod";

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "../auth/password-policy.js";
import { SyncedIdSchema } from "../ids.js";
import { CurrencyCodeSchema } from "../money.js";

export const LoginCredentialsSchema = z.strictObject({
  password: z.string().min(1).max(1024),
  username: z.string().trim().min(1).max(100),
});

export const RegisterCredentialsSchema = z.strictObject({
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
  username: z.string().trim().min(1).max(100),
});

export const AuthCredentialsSchema = RegisterCredentialsSchema;

export const ChangePasswordRequestSchema = z
  .strictObject({
    currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
    newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
  })
  .refine((input) => input.currentPassword !== input.newPassword, {
    message: "New password must differ from the current password.",
    path: ["newPassword"],
  });

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

export const PasskeySchema = z.strictObject({
  createdAt: z.string().min(1),
  credentialId: z.string().min(1),
  id: SyncedIdSchema,
  lastUsedAt: z.string().nullable(),
  name: z.string().min(1),
});

export const PasskeyListResponseSchema = z.strictObject({
  data: z.strictObject({
    passkeys: z.array(PasskeySchema),
  }),
});

export const PasskeyResponseSchema = z.strictObject({
  data: z.strictObject({
    passkey: PasskeySchema,
  }),
});

export const PasskeyOptionsResponseSchema = z.strictObject({
  data: z.strictObject({
    options: z.unknown(),
  }),
});

export const StartPasskeyRegistrationRequestSchema = z.strictObject({
  currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

export const FinishPasskeyRegistrationRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(100).optional(),
  response: z.record(z.string(), z.unknown()),
});

export const FinishPasskeyLoginRequestSchema = z.strictObject({
  response: z.record(z.string(), z.unknown()),
});

export const StartPasskeyLoginRequestSchema = z.strictObject({
  username: z.string().trim().min(1).max(100).optional(),
});

export const RenamePasskeyRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
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
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
export type CreateApiKeyRequest = z.infer<typeof CreateApiKeyRequestSchema>;
export type CreatedApiKeyResponse = z.infer<typeof CreatedApiKeyResponseSchema>;
export type CsrfTokenResponse = z.infer<typeof CsrfTokenResponseSchema>;
export type FinishPasskeyLoginRequest = z.infer<typeof FinishPasskeyLoginRequestSchema>;
export type FinishPasskeyRegistrationRequest = z.infer<
  typeof FinishPasskeyRegistrationRequestSchema
>;
export type LoginCredentials = z.infer<typeof LoginCredentialsSchema>;
export type MeContextResponse = z.infer<typeof MeContextResponseSchema>;
export type Passkey = z.infer<typeof PasskeySchema>;
export type PasskeyListResponse = z.infer<typeof PasskeyListResponseSchema>;
export type PasskeyOptionsResponse = z.infer<typeof PasskeyOptionsResponseSchema>;
export type PasskeyResponse = z.infer<typeof PasskeyResponseSchema>;
export type RenamePasskeyRequest = z.infer<typeof RenamePasskeyRequestSchema>;
export type RegisterCredentials = z.infer<typeof RegisterCredentialsSchema>;
export type StartPasskeyLoginRequest = z.infer<typeof StartPasskeyLoginRequestSchema>;
export type StartPasskeyRegistrationRequest = z.infer<typeof StartPasskeyRegistrationRequestSchema>;
