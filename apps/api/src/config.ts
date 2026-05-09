import { z } from "zod/v4";

export const ApiConfigSchema = z
  .object({
    nodeEnv: z.enum(["development", "test", "production"]).default("development"),
    host: z.string().min(1).default("127.0.0.1"),
    port: z.coerce.number().int().min(1).max(65_535).default(3000),
    logLevel: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    openApiBaseUrl: z.url().default("http://localhost:3000"),
    cookieSecret: z.string().min(32).optional(),
    csrfCookieName: z.string().min(1).default("_fastifly_csrf"),
  })
  .strict();

export type ApiConfig = z.infer<typeof ApiConfigSchema>;

export function parseApiConfig(env: Record<string, string | undefined>): ApiConfig {
  return ApiConfigSchema.parse({
    nodeEnv: env.NODE_ENV,
    host: env.HOST,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    openApiBaseUrl: env.OPENAPI_BASE_URL,
    cookieSecret: env.COOKIE_SECRET,
    csrfCookieName: env.CSRF_COOKIE_NAME,
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
