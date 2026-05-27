# Job Queue Worker + Recurring Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone DB-backed worker process that claims/executes/retries jobs, a scheduler that posts recurring transactions automatically and idempotently, and periodic session/idempotency cleanup.

**Architecture:** Same image runs as `APP_ROLE=api|worker|all`. The worker reuses `createRuntimeDependencies()` (same repositories + `LedgerMutationRunner`, no second write path). A new job repository (SQLite + Postgres) backs a poll loop and a scheduler tick. Recurring generation is anchored by a new `recurring_occurrences` table (`unique(recurring_template_id, scheduled_for)`) plus a job `dedupe_key`.

**Tech Stack:** TypeScript, Fastify, Drizzle (better-sqlite3 + postgres.js), Zod v4, Vitest. No new external dependency.

**Key code facts (verified):**
- SQLite ledger mutations already use `db.transaction(..., { behavior: "immediate" })` and `busy_timeout=5000`; cross-process write serialization is already provided by SQLite's write lock. Worker safety only needs the job-claim to also use an immediate transaction + a small `SQLITE_BUSY` retry.
- Postgres write boundary already uses `pg_try_advisory_lock` (cross-process safe).
- `createRuntimeDependencies(config)` in `apps/api/src/runtime.ts` returns `{ appOptions, close }`; `appOptions` already exposes `workflowService`, `identityRepository`, etc.
- Config lives in `packages/config/src/index.ts` (`ApiConfigSchema`, `parseApiConfig`, `makeTestApiConfig`).
- `job_queue` columns: `id, type, status, payloadJson, dedupeKey, attempts, maxAttempts, availableAt, lockedAt, lockedBy, createdAt, updatedAt`. `JobQueueStatus` in `packages/db/src/schema-types.ts`.

---

### Task 0: Feature branch

- [ ] Create branch `feat/job-queue-worker` from `main` (do not sweep unrelated working-tree changes into commits; `git add` only feature files).

### Task 1: Config — APP_ROLE + worker settings

**Files:** Modify `packages/config/src/index.ts`; Test `packages/config/src/__tests__/*`.

- [ ] Add to `ApiConfigSchema`: `appRole: z.enum(["api","worker","all"]).default("all")`, `workerPollIntervalMs` (default 1000, min 50), `workerSchedulerIntervalMs` (default 60000, min 1000), `workerJobMaxAttempts` (default 5, 1-50), `workerStaleLockMs` (default 60000, min 1000), `sessionCleanupIntervalMs` (default 3_600_000), `idempotencyRetentionMs` (default 30d).
- [ ] Map env in `parseApiConfig`: `APP_ROLE`, `WORKER_POLL_INTERVAL_MS`, `WORKER_SCHEDULER_INTERVAL_MS`, `WORKER_JOB_MAX_ATTEMPTS`, `WORKER_STALE_LOCK_MS`, `SESSION_CLEANUP_INTERVAL_MS`, `IDEMPOTENCY_RETENTION_MS`.
- [ ] Test: default `appRole==="all"`; `APP_ROLE=worker` parses; invalid role rejected; numeric coercion works. Run the config test file; expect pass.
- [ ] Commit.

### Task 2: `recurring_occurrences` schema + dual migrations

**Files:** Modify `packages/db/src/sqlite/schema.ts`, `packages/db/src/postgres/schema.ts`, `packages/db/src/schema-types.ts`; generate migrations in both `migrations/` dirs; export table from `packages/db/src/index.ts` if pattern requires.

- [ ] Add `RecurringOccurrenceStatus = "generated" | "skipped" | "failed"` to schema-types.
- [ ] Add `recurring_occurrences` table to both dialect schemas: columns `id, workspace_id, ledger_id, recurring_template_id, scheduled_for (timestamp), transaction_group_id (nullable), status, error_message (nullable), created_at, updated_at`; `unique(recurring_template_id, scheduled_for)`; indexes on `(workspace_id, ledger_id)` and `recurring_template_id`. Match FK/`idText`/`timestampText` patterns already used in the file.
- [ ] Generate migrations: `pnpm db:generate:sqlite` and `pnpm db:generate:postgres`.
- [ ] Add `recurring_occurrences` to `REQUIRED_CORE_TABLES` in `apps/api/src/runtime.ts` only if other recurring tables are listed there (they are: keep consistent — add it).
- [ ] Test: existing `sqlite-migrations.test.ts` / `postgres-migrations.test.ts` assert table presence; extend their required-table lists. Run both; expect pass.
- [ ] Commit.

### Task 3: Job repository (contract + dual-dialect impl)

**Files:** Create `packages/db/src/repositories/jobs.ts`; export from `packages/db/src/index.ts`; Test `packages/db/src/__tests__/jobs-repository.test.ts`.

Contract:

```ts
export type JobRecord = {
  readonly id: string; readonly type: string; readonly status: JobQueueStatus;
  readonly payload: JsonObject; readonly dedupeKey: string | null;
  readonly attempts: number; readonly maxAttempts: number;
  readonly availableAt: Date; readonly lockedAt: Date | null; readonly lockedBy: string | null;
  readonly createdAt: Date; readonly updatedAt: Date;
};
export type EnqueueJobInput = {
  readonly type: string; readonly payload: JsonObject;
  readonly dedupeKey?: string | null; readonly availableAt?: Date; readonly maxAttempts?: number;
};
export type JobRepository = {
  enqueue(input: EnqueueJobInput): Promise<JobRecord>;          // dedupe: return existing pending/available row with same dedupeKey
  claimNext(workerId: string, now: Date): Promise<JobRecord | null>;
  complete(jobId: string): Promise<void>;
  fail(jobId: string, error: string, now: Date, backoffMs: number): Promise<void>;
  recoverStale(now: Date, staleLockMs: number): Promise<number>; // returns reclaimed count
};
```

- [ ] SQLite impl: `enqueue` inside immediate tx — select existing non-terminal row by `dedupeKey`; if found return it, else insert with `status="available"`, `attempts=0`. `claimNext` inside immediate tx: select one `status="available" AND available_at<=now` ordered `available_at, created_at` limit 1, then update to `running, lockedAt, lockedBy`. `fail`: `attempts+1`; if `>= maxAttempts` → `failed`, else `available` with `availableAt=now+backoff`. `recoverStale`: update `running` rows with `lockedAt < now-staleLockMs` back to `available`.
- [ ] Postgres impl: same semantics; `claimNext` uses `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1` inside `db.transaction`.
- [ ] Shared test suite parametrized over both drivers (follow existing dual-dialect test harness): enqueue inserts; duplicate dedupeKey returns same row (no second insert); claimNext returns runnable job and marks running; claimNext returns null when none runnable / availableAt in future; complete sets succeeded; fail retries then terminal at maxAttempts; recoverStale reclaims; **concurrent claim**: two `claimNext` calls (Postgres: parallel; SQLite: sequential under immediate tx) never claim the same job twice.
- [ ] Run jobs-repository tests on SQLite + Postgres; expect pass.
- [ ] Commit.

### Task 4: SQLite cross-process safety hardening + 2-connection test

**Files:** Modify `packages/db/src/repositories/jobs.ts` (ensure immediate tx for claim — done in Task 3); add a small retry helper `withSqliteBusyRetry` in `packages/db/src/sqlite/` (or reuse if exists); Test `packages/db/src/__tests__/sqlite-worker-concurrency.test.ts`.

- [ ] Add `withSqliteBusyRetry(fn, { retries, baseDelayMs })` that retries on `err.code === "SQLITE_BUSY"`/`"SQLITE_BUSY_SNAPSHOT"`. Wrap job claim and (if needed) enqueue.
- [ ] Test: open two better-sqlite3 connections to one temp file (simulating api + worker). Concurrently/interleaved: connection A runs a ledger mutation (revision increment) while connection B claims+runs a job that also mutates; assert no lost revision increment, no corruption, both transactions commit, final revision count correct.
- [ ] Run; expect pass.
- [ ] Commit.

### Task 5: Cleanup + recurring repo methods

**Files:** Modify identity repository (`packages/db/src/repositories/identity.ts`) and workflow repository (`packages/db/src/repositories/workflows.ts`); add idempotency prune (locate the idempotency receipt store — `ledger-mutations.ts` transactional store creates receipts; add a standalone prune via a small repo or extend an existing one). Tests alongside.

- [ ] `identityRepository.deleteExpiredSessions(now): Promise<number>` — delete `sessions` where `expiresAt < now`.
- [ ] `deleteExpiredIdempotencyReceipts(now): Promise<number>` — delete `idempotency_receipts` where `expiresAt < now` (add to a suitable repo; both dialects).
- [ ] `workflowRepository.listDueRecurringTemplates(now, limit): Promise<DueRecurringTemplate[]>` — active templates with `next_run_at <= now`.
- [ ] `workflowRepository.recordRecurringOccurrence(input)` and `advanceRecurringSchedule(templateId, nextRunAt, lastGeneratedAt)` (or fold into existing generate path).
- [ ] Tests for each (dual-dialect): only-expired removed; only-due listed; occurrence unique conflict surfaces as "already exists".
- [ ] Run; commit.

### Task 6: Worker runtime + handler registry + scheduler

**Files:** Create `apps/api/src/worker.ts` (runtime + loop + scheduler), `apps/api/src/worker-handlers.ts` (handlers); Modify `apps/api/src/runtime.ts` to expose a worker dependency bundle (`createWorkerDependencies(config)` returning `{ jobRepository, workflowService, identityRepository, pruneIdempotency, workflowRepository, close }`); Test `apps/api/src/__tests__/worker.test.ts`.

- [ ] Extend runtime: build `jobRepository` (sqlite/postgres) in both `create*RuntimeDependencies`; expose what the worker needs (reuse `workflowService`, `identityRepository`).
- [ ] Handler registry `{ "recurring.generate", "sessions.cleanup", "idempotency.prune" }`:
  - `recurring.generate(payload {templateId, workspaceId, ledgerId, scheduledFor})`: insert occurrence (skip if exists), re-check template active, call `workflowService.generateRecurringTemplate({ actorUserId: template.createdBy, scope, templateId })` through the runner (`source: "recurring"`), record `transaction_group_id`, advance schedule. Idempotent on replay.
  - `sessions.cleanup`: `deleteExpiredSessions(now)`.
  - `idempotency.prune`: `deleteExpiredIdempotencyReceipts(now)`.
- [ ] Worker loop: `claimNext` → dispatch → `complete`/`fail(backoff)`; periodic `recoverStale`; sleep `workerPollIntervalMs` when idle; structured logs.
- [ ] Scheduler tick (`workerSchedulerIntervalMs`): enqueue `recurring.generate` for each due template (dedupeKey `recurring.generate:{templateId}:{scheduledForIso}`); enqueue `sessions.cleanup` / `idempotency.prune` on their cadences (time-bucketed dedupeKey).
- [ ] Graceful shutdown: SIGTERM/SIGINT stop claiming, await in-flight, `close()`.
- [ ] Tests (fast intervals / injected clock): scheduler enqueues only due templates; recurring.generate posts balanced transaction and is idempotent on duplicate; cleanup handlers remove only expired; loop claims+completes a job; fail path backs off; shutdown drains.
- [ ] Run; commit.

### Task 7: Entry wiring (server.ts role branch)

**Files:** Modify `apps/api/src/server.ts`.

- [ ] Branch on `config.appRole`: `api`/`all` → build+listen API; `worker`/`all` → `startWorker(config)`. For `worker`-only, still expose a minimal `/health` (reuse app or a tiny http server). Wire SIGTERM to close both.
- [ ] Manual check: `APP_ROLE=worker DATABASE_DRIVER=sqlite ... node server` starts the loop; `APP_ROLE=api` starts only HTTP.
- [ ] Commit.

### Task 8: CLI jobs commands

**Files:** Modify `packages/db/src/migrations/maintenance-cli.ts` (or the CLI entry that registers commands).

- [ ] `fastifly jobs tick` (run one scheduler pass and exit), `fastifly jobs list` (recent/pending), `fastifly jobs retry <id>` (reset failed→available). Reuse job repository; respect `DATABASE_DRIVER`.
- [ ] Test in the maintenance-cli test style.
- [ ] Commit.

### Task 9: Docker + docs

**Files:** Modify `docker-compose.sqlite.yml`, `docker-compose.postgres.yml`, `docs/specs/deployment.md`, `docs/specs/maintenance-v2.md`, `docs/specs/architecture-v2.md`.

- [ ] Add `fastifly-worker` service (same image/build target, `APP_ROLE=worker`, same `DATABASE_*`, no port) to both compose files.
- [ ] Document the worker service, `APP_ROLE`, jobs CLI, and the recurring automation behavior.
- [ ] Commit.

### Task 10: Full verification

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test` (turbo) — includes new tests
- [ ] `pnpm test:sqlite`
- [ ] `pnpm test:postgres:pglite` (and `test:postgres:runtime` if a PG instance is available)
- [ ] Fix any failures; commit. Report.

---

## Self-review

- **Spec coverage:** APP_ROLE/process model (T1,T7,T9), job repo (T3), SQLite safety (T4), recurring + occurrence anchor (T2,T5,T6), scheduler (T6), cleanup (T5,T6), config (T1), CLI (T8), docker/docs (T9), tests (every task + T10). All spec sections mapped.
- **Type consistency:** `JobRepository` methods (`enqueue/claimNext/complete/fail/recoverStale`) referenced consistently in T3/T4/T6/T8. `recurring_occurrences` columns consistent T2/T5/T6.
- **Scope:** import/rules/reports-to-jobs and concurrency>1 explicitly deferred (separate issues).
- **Placeholders:** none; tricky code (immediate tx, claim queries, dedupe, idempotent recurring) specified.
