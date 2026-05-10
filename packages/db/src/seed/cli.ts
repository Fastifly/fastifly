import { type SeedDriver, type SeedLevel, seedDatabase } from "./index.js";

try {
  const level = parseSeedLevel(process.argv[2]);
  const driver = parseDriver(process.env.DATABASE_DRIVER);
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  await seedDatabase({ databaseUrl, driver, level });
  console.log(`Seeded Fastifly ${level} data for ${driver}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

function parseSeedLevel(value: string | undefined): SeedLevel {
  if (value === "essential" || value === "demo" || value === "e2e") {
    return value;
  }

  throw new Error("Usage: fastifly seed essential|demo|e2e");
}

function parseDriver(value: string | undefined): SeedDriver {
  if (value === "sqlite" || value === "postgres") {
    return value;
  }

  throw new Error("DATABASE_DRIVER must be `sqlite` or `postgres`.");
}
