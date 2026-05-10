import { z } from "zod";

import { SyncedIdSchema } from "../ids.js";

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
      baseCurrencyCode: z.string().length(3),
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

export type AuthCredentials = RegisterCredentials;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type CsrfTokenResponse = z.infer<typeof CsrfTokenResponseSchema>;
export type LoginCredentials = z.infer<typeof LoginCredentialsSchema>;
export type MeContextResponse = z.infer<typeof MeContextResponseSchema>;
export type RegisterCredentials = z.infer<typeof RegisterCredentialsSchema>;
