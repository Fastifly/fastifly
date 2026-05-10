import { type CleanDriver, cleanDatabase } from "./clean.js";

try {
  const driver = parseDriver(process.env.DATABASE_DRIVER);
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  await cleanDatabase({ databaseUrl, driver });
  console.log(`Cleaned Fastifly app tables for ${driver}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

function parseDriver(value: string | undefined): CleanDriver {
  if (value === "sqlite" || value === "postgres") {
    return value;
  }

  throw new Error("DATABASE_DRIVER must be `sqlite` or `postgres`.");
}
