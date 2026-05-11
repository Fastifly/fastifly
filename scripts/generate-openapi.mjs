#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import openapiTS, { astToString, COMMENT_HEADER } from "openapi-typescript";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiSourcePath = resolve(rootDir, "apps/api/src/app.ts");
const generatedTypesPath = resolve(rootDir, "apps/web/src/api/generated/openapi.ts");
const { buildApiApp } = await import(pathToFileURL(apiSourcePath).href);

const routeDependency = {};

const app = await buildApiApp({
  accountRepository: routeDependency,
  budgetQueryService: routeDependency,
  config: { logLevel: "silent", nodeEnv: "test" },
  deviceRepository: routeDependency,
  financeMutationService: routeDependency,
  identityRepository: routeDependency,
  readiness: { migrations: "ok" },
  syncQueryService: routeDependency,
  syncReplayService: routeDependency,
  transactionQueryService: routeDependency,
});

try {
  await app.ready();
  const spec = app.swagger();
  const ast = await openapiTS(spec);
  const output = `${COMMENT_HEADER}${astToString(ast)}`;
  mkdirSync(dirname(generatedTypesPath), { recursive: true });
  writeFileSync(generatedTypesPath, output);
} finally {
  await app.close();
}
