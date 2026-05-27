import { createServer, type Server } from "node:http";
import { parseApiConfig } from "@fastifly/config";
import type { FastifyInstance } from "fastify";

import { buildProductionApiApp, startWorkerRuntime, type WorkerProcess } from "./runtime.js";
import type { WorkerLogger } from "./worker.js";

const config = parseApiConfig(process.env);
const runsApi = config.appRole === "api" || config.appRole === "all";
const runsWorker = config.appRole === "worker" || config.appRole === "all";

const consoleWorkerLogger: WorkerLogger = {
  error: (obj, msg) => console.error(msg ?? "worker", obj),
  info: (obj, msg) => console.log(msg ?? "worker", obj),
  warn: (obj, msg) => console.warn(msg ?? "worker", obj),
};

let app: FastifyInstance | undefined;
let worker: WorkerProcess | undefined;
let healthServer: Server | undefined;

if (runsApi) {
  app = await buildProductionApiApp(config);
}

if (runsWorker) {
  worker = await startWorkerRuntime(config, app ? (app.log as WorkerLogger) : consoleWorkerLogger);
}

function logInfo(message: string): void {
  if (app) {
    app.log.info(message);
  } else {
    console.log(message);
  }
}

function logError(error: unknown): void {
  if (app) {
    app.log.error(error);
  } else {
    console.error(error);
  }
}

let closing = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (closing) {
    return;
  }
  closing = true;

  try {
    logInfo(`Shutting down Fastifly (${signal})`);
    await worker?.close();
    if (app) {
      await app.close();
    }
    if (healthServer) {
      await new Promise<void>((resolve) => healthServer?.close(() => resolve()));
    }
  } catch (error) {
    logError(error);
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
  if (app) {
    await app.listen({ host: config.host, port: config.port });
  } else if (runsWorker) {
    // Worker-only process: expose a minimal health endpoint for container probes.
    healthServer = createServer((request, response) => {
      if (request.url === "/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ role: "worker", status: "ok" }));
        return;
      }
      response.writeHead(404);
      response.end();
    });
    healthServer.listen(config.port, config.host);
  }
} catch (error) {
  logError(error);
  process.exitCode = 1;
}
