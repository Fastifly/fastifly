import { parseApiConfig } from "@fastifly/config";

import { buildProductionApiApp } from "./runtime.js";

const config = parseApiConfig(process.env);
const app = await buildProductionApiApp(config);

let closing = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (closing) {
    return;
  }
  closing = true;

  try {
    app.log.info({ signal }, "Shutting down Fastifly API");
    await app.close();
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
