import { createUuidV7 } from "@fastifly/common";
import { describe, expect, it } from "vitest";

import { runFastiflyCli } from "../migrations/maintenance-cli.js";
import { createSqliteJobRepository } from "../repositories/jobs.js";
import { createConfiguredSqliteClient } from "../sqlite/client.js";
import { createOutputBuffer, createSqliteFixture } from "./maintenance-cli.helpers.js";

async function seedFailedJob(databaseUrl: string): Promise<string> {
  const client = createConfiguredSqliteClient({ source: databaseUrl });
  try {
    const repository = createSqliteJobRepository(client, { createId: createUuidV7 });
    const now = new Date();
    const job = await repository.enqueue({
      maxAttempts: 1,
      payload: {},
      type: "recurring.generate",
    });
    await repository.claimNext("seed-worker", now);
    await repository.fail(job.id, now, 1000); // maxAttempts 1 -> terminal failed
    return job.id;
  } finally {
    client.close();
  }
}

describe("Fastifly maintenance CLI: jobs", () => {
  it("lists jobs and retries a failed job on SQLite", async () => {
    const fixture = createSqliteFixture("fastifly-cli-jobs-");
    try {
      await expect(
        runFastiflyCli(
          ["migrate", "up"],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: fixture.databaseUrl },
          createOutputBuffer().output,
        ),
      ).resolves.toBe(0);

      const jobId = await seedFailedJob(fixture.databaseUrl);

      const listOutput = createOutputBuffer();
      await expect(
        runFastiflyCli(
          ["jobs", "list", "--json"],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: fixture.databaseUrl },
          listOutput.output,
        ),
      ).resolves.toBe(0);
      const listed = JSON.parse(listOutput.stdout.join("")) as {
        readonly jobs: readonly { readonly id: string; readonly status: string }[];
      };
      expect(listed.jobs).toHaveLength(1);
      expect(listed.jobs[0]?.status).toBe("failed");

      const retryOutput = createOutputBuffer();
      await expect(
        runFastiflyCli(
          ["jobs", "retry", jobId, "--json"],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: fixture.databaseUrl },
          retryOutput.output,
        ),
      ).resolves.toBe(0);
      const retried = JSON.parse(retryOutput.stdout.join("")) as {
        readonly jobs: readonly { readonly status: string; readonly attempts: number }[];
      };
      expect(retried.jobs[0]?.status).toBe("available");
      expect(retried.jobs[0]?.attempts).toBe(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("returns a non-zero exit code when retrying an unknown job", async () => {
    const fixture = createSqliteFixture("fastifly-cli-jobs-missing-");
    try {
      await expect(
        runFastiflyCli(
          ["migrate", "up"],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: fixture.databaseUrl },
          createOutputBuffer().output,
        ),
      ).resolves.toBe(0);

      const output = createOutputBuffer();
      await expect(
        runFastiflyCli(
          ["jobs", "retry", "nonexistent-job"],
          { DATABASE_DRIVER: "sqlite", DATABASE_URL: fixture.databaseUrl },
          output.output,
        ),
      ).resolves.toBe(1);
      expect(output.stderr.join("")).toContain("No failed job found");
    } finally {
      fixture.cleanup();
    }
  });
});
