import { buildApiApp } from "../app.js";

const routeDependency = {} as never;

const app = await buildApiApp({
  accountRepository: routeDependency,
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
  process.stdout.write(`${JSON.stringify(app.swagger(), null, 2)}\n`);
} finally {
  await app.close();
}
