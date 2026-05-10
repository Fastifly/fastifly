import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

const defaultTiltPort = 10360;
const tiltPort = parsePort(process.env.FASTIFLY_TILT_PORT, defaultTiltPort);

if (!isCommandAvailable("tilt", ["version"])) {
  printFatal(
    [
      "Tilt is required to run Fastifly dev mode.",
      "Install Tilt and retry:",
      "  https://docs.tilt.dev/install.html",
      "",
      "After install, run:",
      "  pnpm start",
    ].join("\n"),
  );
  process.exit(1);
}

const tilt = spawn("tilt", ["up", "--port", String(tiltPort)], {
  stdio: "inherit",
  env: process.env,
});

tilt.on("error", (error) => {
  printFatal(`Failed to start Tilt: ${error.message}`);
  process.exit(1);
});

tilt.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

function isCommandAvailable(command, args) {
  const result = spawnSync(command, args, {
    stdio: "ignore",
    shell: false,
  });

  if (result.error && result.error.code === "ENOENT") {
    return false;
  }

  return true;
}

function parsePort(rawValue, fallbackPort) {
  if (!rawValue) {
    return fallbackPort;
  }
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    printFatal(`FASTIFLY_TILT_PORT must be an integer between 1 and 65535. Received: ${rawValue}`);
    process.exit(1);
  }

  return parsed;
}

function printFatal(message) {
  process.stderr.write(`${message}\n`);
}
