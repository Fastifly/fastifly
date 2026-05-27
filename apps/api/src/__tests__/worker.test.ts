import { createUuidV7, type SyncedId } from "@fastifly/common";
import { makeTestApiConfig } from "@fastifly/config";
import type {
  DueRecurringTemplate,
  EnqueueJobInput,
  JobRecord,
  JobRepository,
  WorkerStore,
} from "@fastifly/db";
import { beforeEach, describe, expect, it } from "vitest";

import {
  type FinanceWorkflowService,
  FinanceWorkflowServiceError,
} from "../services/finance-workflows.js";
import {
  createWorkerRuntime,
  IDEMPOTENCY_PRUNE_JOB,
  RECURRING_GENERATE_JOB,
  SESSIONS_CLEANUP_JOB,
} from "../worker.js";

const T0 = new Date("2026-05-27T10:00:00.000Z");
const config = makeTestApiConfig({});

function createFakeJobRepository(): JobRepository {
  const jobs = new Map<string, JobRecord>();
  const order = new Map<string, number>();
  let seq = 0;

  return {
    async enqueue(input: EnqueueJobInput) {
      if (input.dedupeKey != null) {
        for (const job of jobs.values()) {
          if (job.dedupeKey === input.dedupeKey) {
            return job;
          }
        }
      }
      seq += 1;
      const id = `job_${seq}`;
      // Use the same fixed clock the runtime is given (`now: () => T0`) so job
      // claimability does not depend on the real wall clock.
      const nowIso = T0.toISOString();
      const record: JobRecord = {
        attempts: 0,
        availableAt: input.availableAt ? input.availableAt.toISOString() : nowIso,
        createdAt: nowIso,
        dedupeKey: input.dedupeKey ?? null,
        id,
        lockedAt: null,
        lockedBy: null,
        maxAttempts: input.maxAttempts ?? 5,
        payload: input.payload,
        status: "available",
        type: input.type,
        updatedAt: nowIso,
      };
      jobs.set(id, record);
      order.set(id, seq);
      return record;
    },
    async claimNext(workerId, now) {
      const nowIso = now.toISOString();
      const candidate = [...jobs.values()]
        .filter((job) => job.status === "available" && job.availableAt <= nowIso)
        .sort((a, b) =>
          a.availableAt === b.availableAt
            ? (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
            : a.availableAt < b.availableAt
              ? -1
              : 1,
        )[0];
      if (!candidate) {
        return null;
      }
      const updated: JobRecord = {
        ...candidate,
        lockedAt: nowIso,
        lockedBy: workerId,
        status: "running",
      };
      jobs.set(candidate.id, updated);
      return updated;
    },
    async complete(jobId, now) {
      const job = jobs.get(jobId);
      if (job) {
        jobs.set(jobId, { ...job, status: "succeeded", updatedAt: now.toISOString() });
      }
    },
    async fail(jobId, now, backoffMs) {
      const job = jobs.get(jobId);
      if (!job) {
        return;
      }
      const attempts = job.attempts + 1;
      const terminal = attempts >= job.maxAttempts;
      jobs.set(jobId, {
        ...job,
        attempts,
        availableAt: terminal ? job.availableAt : new Date(now.getTime() + backoffMs).toISOString(),
        lockedAt: null,
        lockedBy: null,
        status: terminal ? "failed" : "available",
      });
    },
    async recoverStale() {
      return 0;
    },
    async listRecent(limit) {
      return [...jobs.values()]
        .sort((a, b) => (order.get(b.id) ?? 0) - (order.get(a.id) ?? 0))
        .slice(0, limit);
    },
    async retry() {
      return null;
    },
  };
}

type FakeWorkerStore = WorkerStore & {
  readonly occurrences: { readonly status: string; readonly transactionGroupId: string | null }[];
  setDue: (templates: readonly DueRecurringTemplate[]) => void;
  sessionsCleaned: number;
  receiptsPruned: number;
};

function createFakeWorkerStore(): FakeWorkerStore {
  let due: readonly DueRecurringTemplate[] = [];
  const store: FakeWorkerStore = {
    occurrences: [],
    receiptsPruned: 0,
    sessionsCleaned: 0,
    setDue(templates) {
      due = templates;
    },
    async listDueRecurringTemplates() {
      return due;
    },
    async recordRecurringOccurrence(input) {
      store.occurrences.push({
        status: input.status,
        transactionGroupId: input.transactionGroupId,
      });
    },
    async deleteExpiredSessions() {
      store.sessionsCleaned += 1;
      return 3;
    },
    async deleteExpiredIdempotencyReceipts() {
      store.receiptsPruned += 1;
      return 2;
    },
  };
  return store;
}

type StubWorkflowService = {
  service: FinanceWorkflowService;
  readonly calls: { readonly idempotencyKey: string | null; readonly occurredAt: string | null }[];
  behavior: "ok" | "skip" | "fail";
};

function createStubWorkflowService(): StubWorkflowService {
  const stub: StubWorkflowService = {
    behavior: "ok",
    calls: [],
    service: {
      async generateRecurringTemplate(input: {
        readonly idempotencyKey: string | null;
        readonly occurredAt: string | null;
      }) {
        stub.calls.push({ idempotencyKey: input.idempotencyKey, occurredAt: input.occurredAt });
        if (stub.behavior === "skip") {
          throw new FinanceWorkflowServiceError("paused", "IMPORT_JOB_INVALID_STATE");
        }
        if (stub.behavior === "fail") {
          throw new Error("generation boom");
        }
        return {
          recurringTemplate: {} as never,
          transactionGroup: { id: "grp_1" as SyncedId } as never,
        };
      },
    } as unknown as FinanceWorkflowService,
  };
  return stub;
}

function makeDueTemplate(): DueRecurringTemplate {
  return {
    createdBy: createUuidV7(),
    id: createUuidV7(),
    ledgerId: createUuidV7(),
    nextRunAt: T0.toISOString(),
    workspaceId: createUuidV7(),
  };
}

describe("worker runtime", () => {
  let jobRepository: JobRepository;
  let workerStore: FakeWorkerStore;
  let workflow: StubWorkflowService;

  beforeEach(() => {
    jobRepository = createFakeJobRepository();
    workerStore = createFakeWorkerStore();
    workflow = createStubWorkflowService();
  });

  function createRuntime() {
    return createWorkerRuntime({
      config,
      deps: { jobRepository, workerStore, workflowService: workflow.service },
      now: () => T0,
    });
  }

  it("schedules due recurring templates and generates them idempotently", async () => {
    const template = makeDueTemplate();
    workerStore.setDue([template]);
    const runtime = createRuntime();

    await runtime.runSchedulerTick();
    expect(await runtime.processNextJob()).toBe(true); // recurring.generate runs first

    expect(workflow.calls).toHaveLength(1);
    expect(workflow.calls[0]).toEqual({
      idempotencyKey: `recurring:${template.id}:${template.nextRunAt}`,
      occurredAt: template.nextRunAt,
    });
    expect(workerStore.occurrences).toEqual([{ status: "generated", transactionGroupId: "grp_1" }]);

    const recurringJob = (await jobRepository.listRecent(10)).find(
      (job) => job.type === RECURRING_GENERATE_JOB,
    );
    expect(recurringJob?.status).toBe("succeeded");
  });

  it("does not enqueue duplicate recurring jobs across scheduler ticks", async () => {
    workerStore.setDue([makeDueTemplate()]);
    const runtime = createRuntime();

    await runtime.runSchedulerTick();
    await runtime.runSchedulerTick();

    const recurringJobs = (await jobRepository.listRecent(50)).filter(
      (job) => job.type === RECURRING_GENERATE_JOB,
    );
    expect(recurringJobs).toHaveLength(1);
  });

  it("skips paused templates without failing the job", async () => {
    workerStore.setDue([makeDueTemplate()]);
    workflow.behavior = "skip";
    const runtime = createRuntime();

    await runtime.runSchedulerTick();
    await runtime.processNextJob();

    expect(workerStore.occurrences).toEqual([{ status: "skipped", transactionGroupId: null }]);
    const recurringJob = (await jobRepository.listRecent(10)).find(
      (job) => job.type === RECURRING_GENERATE_JOB,
    );
    expect(recurringJob?.status).toBe("succeeded");
  });

  it("retries the job with backoff when generation throws an unexpected error", async () => {
    workerStore.setDue([makeDueTemplate()]);
    workflow.behavior = "fail";
    const runtime = createRuntime();

    await runtime.runSchedulerTick();
    await runtime.processNextJob();

    const recurringJob = (await jobRepository.listRecent(10)).find(
      (job) => job.type === RECURRING_GENERATE_JOB,
    );
    expect(recurringJob?.status).toBe("available");
    expect(recurringJob?.attempts).toBe(1);
    expect(recurringJob?.availableAt).toBe(new Date(T0.getTime() + 1000).toISOString());
  });

  it("runs session cleanup and idempotency prune jobs", async () => {
    workerStore.setDue([]);
    const runtime = createRuntime();

    await runtime.runSchedulerTick();
    const processed = await runtime.drainJobs();

    expect(processed).toBe(2); // sessions.cleanup + idempotency.prune
    expect(workerStore.sessionsCleaned).toBe(1);
    expect(workerStore.receiptsPruned).toBe(1);

    const types = (await jobRepository.listRecent(10)).map((job) => job.type).sort();
    expect(types).toEqual([IDEMPOTENCY_PRUNE_JOB, SESSIONS_CLEANUP_JOB]);
  });
});
