import { z } from "zod/v4";

const EnvBooleanSchema = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((value) => value === true || value === "true" || value === "1");

export const ApiConfigSchema = z
  .strictObject({
    autoMigrate: EnvBooleanSchema.default(false),
    cookieSecure: EnvBooleanSchema.optional(),
    databaseDriver: z.enum(["sqlite", "postgres"]).optional(),
    databaseUrl: z.string().min(1).optional(),
    nodeEnv: z.enum(["development", "test", "production"]).default("development"),
    host: z.string().min(1).default("127.0.0.1"),
    port: z.coerce.number().int().min(1).max(65_535).default(3000),
    logLevel: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    openApiBaseUrl: z.url().default("http://localhost:3000"),
    cookieSecret: z.string().min(32).optional(),
    sessionCookieName: z.string().min(1).default("fastifly_session"),
    sessionTtlDays: z.coerce.number().int().min(1).max(365).default(30),
    invitationTtlDays: z.coerce.number().int().min(1).max(90).default(7),
    csrfCookieName: z.string().min(1).default("_fastifly_csrf"),
    passkeyRegistrationChallengeCookieName: z
      .string()
      .min(1)
      .default("fastifly_passkey_registration"),
    passkeyLoginChallengeCookieName: z.string().min(1).default("fastifly_passkey_login"),
    webAuthnRpName: z.string().min(1).default("Fastifly"),
    webAuthnRpId: z.string().min(1).optional(),
    webAuthnOrigin: z.url().optional(),
    webAuthnChallengeTtlMinutes: z.coerce.number().int().min(1).max(30).default(5),
  })
  .superRefine((config, ctx) => {
    if (config.nodeEnv === "production" && !config.cookieSecret) {
      ctx.addIssue({
        code: "custom",
        message: "COOKIE_SECRET is required in production.",
        path: ["cookieSecret"],
      });
    }
    if (config.nodeEnv === "production" && config.databaseDriver && !config.databaseUrl) {
      ctx.addIssue({
        code: "custom",
        message: "DATABASE_URL is required when DATABASE_DRIVER is configured.",
        path: ["databaseUrl"],
      });
    }
  });

export type ApiConfig = z.infer<typeof ApiConfigSchema>;

export function parseApiConfig(env: Record<string, string | undefined>): ApiConfig {
  return ApiConfigSchema.parse({
    autoMigrate: env.AUTO_MIGRATE,
    cookieSecure: env.COOKIE_SECURE,
    databaseDriver: env.DATABASE_DRIVER,
    databaseUrl: env.DATABASE_URL,
    nodeEnv: env.APP_ENV ?? env.NODE_ENV,
    host: env.HOST,
    port: env.APP_PORT ?? env.PORT,
    logLevel: env.LOG_LEVEL,
    openApiBaseUrl: env.APP_URL ?? env.OPENAPI_BASE_URL,
    cookieSecret: env.SESSION_SECRET ?? env.COOKIE_SECRET,
    sessionCookieName: env.SESSION_COOKIE_NAME,
    sessionTtlDays: env.SESSION_TTL_DAYS,
    invitationTtlDays: env.INVITATION_TTL_DAYS,
    csrfCookieName: env.CSRF_COOKIE_NAME,
    passkeyRegistrationChallengeCookieName: env.PASSKEY_REGISTRATION_CHALLENGE_COOKIE_NAME,
    passkeyLoginChallengeCookieName: env.PASSKEY_LOGIN_CHALLENGE_COOKIE_NAME,
    webAuthnRpName: env.WEBAUTHN_RP_NAME,
    webAuthnRpId: env.WEBAUTHN_RP_ID,
    webAuthnOrigin: env.WEBAUTHN_ORIGIN,
    webAuthnChallengeTtlMinutes: env.WEBAUTHN_CHALLENGE_TTL_MINUTES,
  });
}

export function makeTestApiConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return ApiConfigSchema.parse({
    nodeEnv: "test",
    logLevel: "silent",
    openApiBaseUrl: "http://localhost:3000",
    ...overrides,
  });
}
