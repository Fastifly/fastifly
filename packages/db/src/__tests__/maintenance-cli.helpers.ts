import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function createOutputBuffer() {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    output: {
      stderr(message: string) {
        stderr.push(message);
      },
      stdout(message: string) {
        stdout.push(message);
      },
    },
    stderr,
    stdout,
  };
}

export function createSqliteFixture(prefix: string): {
  readonly databaseUrl: string;
  readonly cleanup: () => void;
} {
  const sqliteDir = mkdtempSync(join(tmpdir(), prefix));
  const databaseUrl = join(sqliteDir, "fastifly.db");

  return {
    databaseUrl,
    cleanup: () => {
      rmSync(sqliteDir, { force: true, recursive: true });
    },
  };
}
