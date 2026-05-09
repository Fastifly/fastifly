import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  dialect: "sqlite",
  ...(databaseUrl ? { dbCredentials: { url: databaseUrl } } : {}),
  out: "./src/sqlite/migrations",
  schema: "./src/sqlite/schema.ts",
  strict: true,
  verbose: true,
});
