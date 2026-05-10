#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedTypesPath = resolve(rootDir, "apps/web/src/api/generated/openapi.ts");
const tempDir = mkdtempSync(resolve(tmpdir(), "fastifly-openapi-"));
const tempSpecPath = resolve(tempDir, "openapi.json");

try {
  const printedSpec = run("pnpm", [
    "--filter",
    "@fastifly/api",
    "exec",
    "tsx",
    "src/openapi/print.ts",
  ]);

  writeFileSync(tempSpecPath, printedSpec.stdout);
  mkdirSync(dirname(generatedTypesPath), { recursive: true });
  run("pnpm", ["exec", "openapi-typescript", tempSpecPath, "-o", generatedTypesPath]);
  run("pnpm", ["exec", "biome", "format", "--write", generatedTypesPath]);
} finally {
  rmSync(tempDir, { force: true, recursive: true });
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
    shell: false,
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.stdout.write(result.stdout);
    throw new Error(`${command} ${args.join(" ")} failed with code ${result.status}`);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  return result;
}
