#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_POSTGRES_URL = "postgres://fastifly:fastifly@127.0.0.1:55432/fastifly";
const WAIT_TIMEOUT_MS = 90_000;
const WAIT_POLL_INTERVAL_MS = 1_500;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const dbPackageDir = path.resolve(repoRoot, "packages", "db");

function resolveDatabaseUrl() {
  return (
    process.env.FASTIFLY_TEST_POSTGRES_URL ??
    process.env.TEST_POSTGRES_DATABASE_URL ??
    DEFAULT_POSTGRES_URL
  );
}

function isManagedLocalUrl(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    const host = parsed.hostname;
    const port = parsed.port || "5432";
    return (host === "127.0.0.1" || host === "localhost") && port === "55432";
  } catch {
    return false;
  }
}

function canConnect(databaseUrl, timeoutMs = 2_500) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(databaseUrl);
    } catch {
      resolve(false);
      return;
    }

    const host = parsed.hostname;
    const port = Number(parsed.port || "5432");

    const socket = new net.Socket();
    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      cleanup();
      resolve(true);
    });
    socket.once("timeout", () => {
      cleanup();
      resolve(false);
    });
    socket.once("error", () => {
      cleanup();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function waitForDatabase(databaseUrl) {
  const start = Date.now();
  while (Date.now() - start < WAIT_TIMEOUT_MS) {
    if (await canConnect(databaseUrl)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_INTERVAL_MS));
  }
  throw new Error(`Timed out after ${WAIT_TIMEOUT_MS}ms waiting for PostgreSQL at ${databaseUrl}.`);
}

function ensureDockerPostgresStarted() {
  execFileSync(
    "docker",
    ["compose", "-f", "docker-compose.dev-postgres.yml", "up", "-d", "postgres"],
    {
      cwd: repoRoot,
      stdio: "inherit",
    },
  );
}

function runRuntimeTest(databaseUrl) {
  execFileSync("pnpm", ["exec", "vitest", "run", "src/__tests__/postgres-js-runtime.test.ts"], {
    cwd: dbPackageDir,
    stdio: "inherit",
    env: {
      ...process.env,
      FASTIFLY_TEST_POSTGRES_URL: databaseUrl,
    },
  });
}

async function main() {
  const databaseUrl = resolveDatabaseUrl();

  if (!(await canConnect(databaseUrl))) {
    if (!isManagedLocalUrl(databaseUrl)) {
      throw new Error(
        `PostgreSQL is unreachable at ${databaseUrl}. Set FASTIFLY_TEST_POSTGRES_URL/TEST_POSTGRES_DATABASE_URL to a reachable instance.`,
      );
    }

    console.log(
      `[fastifly] PostgreSQL not reachable at ${databaseUrl}. Starting local docker-compose service...`,
    );
    ensureDockerPostgresStarted();
    console.log("[fastifly] Waiting for PostgreSQL readiness...");
    await waitForDatabase(databaseUrl);
  }

  runRuntimeTest(databaseUrl);
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? `[fastifly] ${error.message}`
      : "[fastifly] Failed to prepare PostgreSQL runtime test.",
  );
  process.exit(1);
});
