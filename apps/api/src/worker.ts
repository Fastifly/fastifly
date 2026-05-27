import { parseSyncedId } from "@fastifly/common";
import type { ApiConfig } from "@fastifly/config";
import {
  type EnqueueJobInput,
  type JobRecord,
  type JobRepository,
  type WorkerStore,
  withSqliteBusyRetry,
} from "@fastifly/db";
import { z } from "zod/v4";

import {
  type FinanceWorkflowService,
  FinanceWorkflowServiceError,
} from "./services/finance-workflows.js";

export type WorkerLogger = {
  readonly info: (obj: unknown, msg?: string) => void;
  readonly warn: (obj: unknown, msg?: string) => void;
  readonly error: (obj: unknown, msg?: string) => void;
};

export const noopWorkerLogger: WorkerLogger = {
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
};

export type WorkerDependencies = {
  readonly jobRepository: JobRepository;
  readonly workerStore: WorkerStore;
  readonly workflowService: FinanceWorkflowService;
};

export const RECURRING_GENERATE_JOB = "recurring.generate";
export const SESSIONS_CLEANUP_JOB = "sessions.cleanup";
export const IDEMPOTENCY_PRUNE_JOB = "idempotency.prune";

const RecurringGeneratePayloadSchema = z.object({
  actorUserId: z.string().min(1),
  ledgerId: z.string().min(1),
  recurringTemplateId: z.string().min(1),
  scheduledFor: z.string().min(1),
  workspaceId: z.string().min(1),
});

type WorkerHandlerContext = {
  readonly deps: WorkerDependencies;
  readonly now: Date;
  readonly logger: WorkerLogger;
};

type WorkerHandler = (
  payload: Record<string, unknown>,
  context: WorkerHandlerContext,
) => Promise<void>;

const SKIPPABLE_RECURRING_ERROR_CODES = new Set([
  "RECURRING_TEMPLATE_NOT_FOUND",
  "IMPORT_JOB_INVALID_STATE",
]);

async function handleRecurringGenerate(
  rawPayload: Record<string, unknown>,
  { deps, logger }: WorkerHandlerContext,
): Promise<void> {
  const payload = RecurringGeneratePayloadSchema.parse(rawPayload);
  const scope = {
    ledgerId: parseSyncedId(payload.ledgerId),
    workspaceId: parseSyncedId(payload.workspaceId),
  };
  const recurringTemplateId = parseSyncedId(payload.recurringTemplateId);
  // Deterministic key so a job retry replays the same mutation instead of creating a duplicate.
  const idempotencyKey = `recurring:${payload.recurringTemplateId}:${payload.scheduledFor}`;

  try {
    const result = await deps.workflowService.generateRecurringTemplate({
      actorUserId: parseSyncedId(payload.actorUserId),
      idempotencyKey,
      occurredAt: payload.scheduledFor,
      recurringTemplateId,
      requestId: `worker:${idempotencyKey}`,
      scope,
    });
    await deps.workerStore.recordRecurringOccurrence({
      ledgerId: scope.ledgerId,
      recurringTemplateId,
      scheduledFor: payload.scheduledFor,
      status: "generated",
      transactionGroupId: result.transactionGroup.id,
      workspaceId: scope.workspaceId,
    });
  } catch (error) {
    if (
      error instanceof FinanceWorkflowServiceError &&
      SKIPPABLE_RECURRING_ERROR_CODES.has(error.code)
    ) {
      // The template was paused/archived/removed between scheduling and execution. Record and move on.
      logger.warn({ code: error.code, recurringTemplateId }, "recurring generation skipped");
      await deps.workerStore.recordRecurringOccurrence({
        errorMessage: error.message,
        ledgerId: scope.ledgerId,
        recurringTemplateId,
        scheduledFor: payload.scheduledFor,
        status: "skipped",
        transactionGroupId: null,
        workspaceId: scope.workspaceId,
      });
      return;
    }
    throw error;
  }
}

async function handleSessionsCleanup(
  _payload: Record<string, unknown>,
  { deps, now, logger }: WorkerHandlerContext,
): Promise<void> {
  const removed = await deps.workerStore.deleteExpiredSessions(now);
  logger.info({ removed }, "expired sessions cleaned up");
}

async function handleIdempotencyPrune(
  _payload: Record<string, unknown>,
  { deps, now, logger }: WorkerHandlerContext,
): Promise<void> {
  const removed = await deps.workerStore.deleteExpiredIdempotencyReceipts(now);
  logger.info({ removed }, "expired idempotency receipts pruned");
}

const handlerRegistry: Record<string, WorkerHandler> = {
  [IDEMPOTENCY_PRUNE_JOB]: handleIdempotencyPrune,
  [RECURRING_GENERATE_JOB]: handleRecurringGenerate,
  [SESSIONS_CLEANUP_JOB]: handleSessionsCleanup,
};

const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 5 * 60_000;

function computeBackoffMs(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempts);
}

export type WorkerRuntimeOptions = {
  readonly deps: WorkerDependencies;
  readonly config: ApiConfig;
  readonly logger?: WorkerLogger;
  readonly now?: () => Date;
  readonly workerId?: string;
  /** When true, claim/scheduler DB calls are wrapped in SQLite busy-retry. */
  readonly sqliteBusyRetry?: boolean;
};

export type WorkerRuntime = {
  /** Claim and execute a single job. Returns true when a job was processed. */
  readonly processNextJob: () => Promise<boolean>;
  /** Drain all currently runnable jobs. */
  readonly drainJobs: () => Promise<number>;
  /** Enqueue due recurring generations and periodic cleanup jobs. */
  readonly runSchedulerTick: () => Promise<void>;
  readonly recoverStaleJobs: () => Promise<number>;
  readonly start: () => void;
  readonly stop: () => Promise<void>;
};

export function createWorkerRuntime(options: WorkerRuntimeOptions): WorkerRuntime {
  const { config, deps } = options;
  const logger = options.logger ?? noopWorkerLogger;
  const now = options.now ?? (() => new Date());
  const workerId =
    options.workerId ?? `worker-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  const withRetry = <T>(fn: () => Promise<T>): Promise<T> =>
    options.sqliteBusyRetry ? withSqliteBusyRetry(fn) : fn();

  const claimEnqueue = async (input: EnqueueJobInput): Promise<void> => {
    await withRetry(() => deps.jobRepository.enqueue(input));
  };

  async function runJob(job: JobRecord): Promise<void> {
    const handler = handlerRegistry[job.type];
    const startedAt = Date.now();
    if (!handler) {
      logger.error({ jobId: job.id, type: job.type }, "no handler registered for job type");
      await deps.jobRepository.fail(job.id, now(), computeBackoffMs(job.attempts));
      return;
    }

    try {
      await handler(job.payload, { deps, logger, now: now() });
      await deps.jobRepository.complete(job.id, now());
      logger.info(
        {
          attempts: job.attempts,
          durationMs: Date.now() - startedAt,
          jobId: job.id,
          type: job.type,
        },
        "job completed",
      );
    } catch (error) {
      logger.error(
        { attempts: job.attempts, error: String(error), jobId: job.id, type: job.type },
        "job failed",
      );
      await deps.jobRepository.fail(job.id, now(), computeBackoffMs(job.attempts));
    }
  }

  const processNextJob = async (): Promise<boolean> => {
    const job = await withRetry(() => deps.jobRepository.claimNext(workerId, now()));
    if (!job) {
      return false;
    }
    await runJob(job);
    return true;
  };

  const drainJobs = async (): Promise<number> => {
    let processed = 0;
    while (await processNextJob()) {
      processed += 1;
    }
    return processed;
  };

  const runSchedulerTick = async (): Promise<void> => {
    const current = now();
    const dueTemplates = await withRetry(() =>
      deps.workerStore.listDueRecurringTemplates(current, 100),
    );
    for (const template of dueTemplates) {
      await claimEnqueue({
        dedupeKey: `${RECURRING_GENERATE_JOB}:${template.id}:${template.nextRunAt}`,
        maxAttempts: config.workerJobMaxAttempts,
        payload: {
          actorUserId: template.createdBy,
          ledgerId: template.ledgerId,
          recurringTemplateId: template.id,
          scheduledFor: template.nextRunAt,
          workspaceId: template.workspaceId,
        },
        type: RECURRING_GENERATE_JOB,
      });
    }

    const cleanupBucket = Math.floor(current.getTime() / config.sessionCleanupIntervalMs);
    await claimEnqueue({
      dedupeKey: `${SESSIONS_CLEANUP_JOB}:${cleanupBucket}`,
      payload: {},
      type: SESSIONS_CLEANUP_JOB,
    });
    await claimEnqueue({
      dedupeKey: `${IDEMPOTENCY_PRUNE_JOB}:${cleanupBucket}`,
      payload: {},
      type: IDEMPOTENCY_PRUNE_JOB,
    });
  };

  const recoverStaleJobs = async (): Promise<number> =>
    withRetry(() => deps.jobRepository.recoverStale(now(), config.workerStaleLockMs));

  // Timer-driven loop on top of the testable primitives above.
  let pollTimer: NodeJS.Timeout | null = null;
  let schedulerTimer: NodeJS.Timeout | null = null;
  let running = false;
  let inFlight: Promise<unknown> = Promise.resolve();

  const track = <T>(promise: Promise<T>): Promise<T> => {
    inFlight = inFlight.then(() => promise).catch(() => undefined);
    return promise;
  };

  const start = (): void => {
    if (running) {
      return;
    }
    running = true;
    logger.info({ workerId }, "worker runtime started");

    const poll = async (): Promise<void> => {
      if (!running) {
        return;
      }
      try {
        await track(drainJobs());
      } catch (error) {
        logger.error({ error: String(error) }, "worker poll failed");
      }
      if (running) {
        pollTimer = setTimeout(() => void poll(), config.workerPollIntervalMs);
      }
    };

    const schedule = async (): Promise<void> => {
      if (!running) {
        return;
      }
      try {
        await track(runSchedulerTick());
        await track(recoverStaleJobs());
      } catch (error) {
        logger.error({ error: String(error) }, "worker scheduler tick failed");
      }
      if (running) {
        schedulerTimer = setTimeout(() => void schedule(), config.workerSchedulerIntervalMs);
      }
    };

    void schedule();
    void poll();
  };

  const stop = async (): Promise<void> => {
    running = false;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    if (schedulerTimer) {
      clearTimeout(schedulerTimer);
      schedulerTimer = null;
    }
    await inFlight;
    logger.info({ workerId }, "worker runtime stopped");
  };

  return { drainJobs, processNextJob, recoverStaleJobs, runSchedulerTick, start, stop };
}
