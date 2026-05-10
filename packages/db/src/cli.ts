#!/usr/bin/env node

import { runFastiflyCli } from "./migrations/maintenance-cli.js";

const exitCode = await runFastiflyCli(process.argv.slice(2));
process.exitCode = exitCode;
