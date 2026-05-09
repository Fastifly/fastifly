import { buildApiApp } from "./app.js";
import { parseApiConfig } from "./config.js";

const config = parseApiConfig(process.env);
const app = await buildApiApp({ config });

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
