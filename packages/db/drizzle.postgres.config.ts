import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  ...(databaseUrl ? { dbCredentials: { url: databaseUrl } } : {}),
  out: "./src/postgres/migrations",
  schema: "./src/postgres/schema.ts",
  strict: true,
  verbose: true,
});
