# Job Queue Worker and Recurring Automation

Status: design (pending implementation)
Date: 2026-05-27
Tracking issue: Fastifly/fastifly#9
Scope decision: separate worker process; recurring auto-post + cleanup; SQLite `BEGIN IMMEDIATE`
boundary; internal scheduler tick.

## Problem

`job_queue` exists in schema and specs, but there is no runtime that claims, executes, retries, or
fails jobs, and no scheduler. Recurring transactions only generate when a user clicks "generate";
session cleanup and idempotency-receipt pruning never run. This design adds a DB-backed worker, a
scheduler, and the idempotency anchor needed for safe automatic recurring generation.

## Goals

- A standalone worker process that reliably claims/executes/retries/fails `job_queue` rows.
- Recurring templates post themselves on schedule, idempotently, through the normal mutation path.
- Periodic `sessions.cleanup` and `idempotency.prune`.
- Safe with a separate worker process on both SQLite (single file) and PostgreSQL.
- No second write path: the worker reuses existing services and the `LedgerMutationRunner`.

## Non-goals (deferred to follow-up issues)

- Moving CSV import commit, rule application, or report recalculation onto the queue.
- Worker concurrency greater than one.
- Cross-process worker leader election beyond `dedupe_key`-guarded scheduling.
- Bank-sync or any new external dependency (no Redis/BullMQ).

## 1. Process model (`APP_ROLE`)

Add `APP_ROLE` to `packages/config` with values `api | worker | all` (default `all`).

- `api` — HTTP server only (current behavior).
- `worker` — worker poll loop + scheduler + a minimal `/health` listener; no app routes.
- `all` — both in one process (simplest single-container self-host).

The recommended production deployment for this milestone runs separate `api` and `worker`
processes from the same image. `apps/api/src/server.ts` branches on `APP_ROLE`:

- `api` / `all` → `buildProductionApiApp(config)` and listen.
- `worker` / `all` → `startWorkerRuntime(config)`.

Both paths build dependencies through the existing `createRuntimeDependencies(config)` bundle, so the
worker shares the exact repositories, services, and `LedgerMutationRunner` instance wiring the API
uses. A new `apps/api/src/worker.ts` owns the worker entrypoint and loop.

Docker: `docker-compose.*.yml` gain a `fastifly-worker` service (same image, `APP_ROLE=worker`,
same `DATABASE_*` env, no published port). Deployment docs updated.

## 2. Job repository (`packages/db`)

New repository contract with SQLite and PostgreSQL implementations, exercised by one shared test
suite:

```text
enqueue(input): upsert by dedupe_key; if an active/pending row with the same dedupe_key exists,
                return it instead of inserting a duplicate.
claimNext(workerId, now): atomically claim the next runnable job.
complete(jobId): status = succeeded.
fail(jobId, error, now): increment attempts; if attempts >= max_attempts -> failed (terminal),
                         else status = available with available_at = now + backoff(attempts).
recoverStale(now, staleLockMs): reclaim rows status = running with locked_at older than TTL
                                (crashed worker) back to available.
```

Claim semantics:

- **PostgreSQL**: `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1` over `status='available' AND
  available_at<=now` ordered by `available_at, created_at`, then `UPDATE` to `running` with
  `locked_at`, `locked_by`.
- **SQLite**: inside a `BEGIN IMMEDIATE` transaction, select one runnable id then `UPDATE` it to
  `running`; `busy_timeout` + bounded retry handle contention with the API process.

Backoff: exponential with cap (e.g., `min(maxBackoff, base * 2^attempts)`), jittered, written to
`available_at`. Job payloads are typed per job `type` (`JsonObject` columns already exist).

## 3. Worker runtime (`apps/api/src/worker.ts`)

- Poll loop: `claimNext` → dispatch by `type` via a typed handler registry → `complete` or `fail`.
  When no job is claimed, sleep `WORKER_POLL_INTERVAL_MS`.
- Concurrency 1 for this milestone (claim one job at a time).
- Stale-lock recovery runs periodically (`recoverStale`).
- Structured logs per job: `type`, `jobId`, `attempts`, `durationMs`, `outcome`, and on failure an
  audit entry (existing audit machinery) without secrets.
- Graceful shutdown: on `SIGTERM`/`SIGINT`, stop claiming, let the in-flight job finish (bounded),
  then close dependencies via the bundle's `close()`.

### Handler registry

```text
recurring.generate   -> generate one due occurrence for a template
sessions.cleanup     -> delete expired sessions
idempotency.prune    -> delete expired idempotency_receipts
```

Handlers receive `{ payload, deps, logger }`. Ledger-affecting handlers must call existing services
through `LedgerMutationRunner`; they must not touch Drizzle tables directly.

## 4. Scheduler tick (inside the worker)

A periodic tick (`WORKER_SCHEDULER_INTERVAL_MS`) enqueues due work. Every enqueue uses a
deterministic `dedupe_key` so a second worker (or an overlapping tick) cannot double-enqueue:

- **Recurring**: scan `recurring_templates` where `status='active' AND next_run_at<=now`. For each
  due `scheduled_for`, enqueue `recurring.generate` with
  `dedupe_key = recurring.generate:{templateId}:{scheduledForIso}`.
- **Sessions cleanup**: enqueue `sessions.cleanup` with a time-bucketed dedupe key.
- **Idempotency prune**: enqueue `idempotency.prune` with a time-bucketed dedupe key.

Manual escape hatch: `fastifly jobs tick` runs one scheduler pass (useful for cron-driven setups or
debugging). The existing manual `POST .../recurring/:templateId/generate` route stays unchanged.

## 5. Recurring auto-generation and the occurrence anchor

Add a `recurring_occurrences` table (both dialects), per `docs/specs/database-v2.md`:

```text
recurring_occurrences
- id
- workspace_id
- ledger_id
- recurring_template_id
- scheduled_for
- transaction_group_id
- status            (generated | skipped | failed)
- error_message
- created_at
- updated_at
unique (recurring_template_id, scheduled_for)
```

`recurring.generate` handler:

1. Insert the occurrence row first (unique constraint). If it already exists, the job is a no-op
   (idempotent replay) and completes successfully.
2. Call the existing `generateRecurringTemplate` service through `LedgerMutationRunner`
   (`source = recurring`, `recalculateBalances = true`), producing a normal transaction group.
3. Record `transaction_group_id` on the occurrence; advance `next_run_at` and `last_generated_at`
   using the shared period/cadence helpers (`packages/common`).

Double-fire is prevented by both the job `dedupe_key` and the occurrence unique constraint. A
template that is paused/archived between scan and execution is re-checked in the handler and skipped.

## 6. SQLite cross-process write safety (Decision 1 = A)

Because the worker is a separate process writing the same SQLite file as the API, the in-process
write boundary cannot serialize across processes. Fix:

- Ledger mutations on SQLite run inside a `BEGIN IMMEDIATE` transaction so SQLite acquires the write
  lock at transaction start (not lazily), making the read-revision → mutate → increment-revision
  sequence atomic across processes.
- Keep `PRAGMA busy_timeout = 5000`; add a bounded retry (small, capped) on `SQLITE_BUSY` /
  `SQLITE_BUSY_SNAPSHOT` around the mutation and the job claim.
- The existing in-process boundary remains as an intra-process optimization (harmless, reduces
  contention within one process).
- PostgreSQL is unchanged (advisory lock already serializes across processes).

This is a careful change in `packages/db/src/ledger-mutations.ts` and the SQLite transaction wrapper;
it gets a dedicated two-connection concurrency test.

## 7. Configuration

New env (validated in `packages/config`):

```text
APP_ROLE                       api | worker | all          default all
WORKER_POLL_INTERVAL_MS        idle poll sleep             default 1000
WORKER_SCHEDULER_INTERVAL_MS   scheduler tick interval     default 60000
WORKER_JOB_MAX_ATTEMPTS        default per-job max         default 5
WORKER_STALE_LOCK_MS           reclaim running jobs after  default 60000
SESSION_CLEANUP_INTERVAL_MS    cleanup cadence             default 3600000
IDEMPOTENCY_RETENTION_MS       receipt TTL for prune       default 30d
```

Invalid combinations fail fast at startup.

## 8. CLI

Extend the `fastifly` CLI:

```text
fastifly jobs tick        run one scheduler pass (enqueue due work) and exit
fastifly jobs list        list recent/pending jobs (status, attempts, type, dedupe_key)
fastifly jobs retry <id>  reset a failed job to available
```

These reuse the job repository and respect `DATABASE_DRIVER`.

## 9. Observability

- Per-job structured log line on completion/failure.
- Failure audit entries (no secrets, no payload financial detail by default).
- Scheduler tick logs counts: scanned, enqueued, skipped.
- `/health` on the worker reports the loop is alive.

## 10. Testing

Repository/runtime (SQLite and PostgreSQL):

- concurrent `claimNext` from two workers claims each job at most once
- `enqueue` with the same `dedupe_key` does not create duplicates
- `fail` retries with backoff and reaches terminal `failed` at `max_attempts`
- `recoverStale` reclaims jobs from a crashed worker
- SQLite two-connection concurrency: API + worker writes serialize without corruption or lost
  revision increments (validates the `BEGIN IMMEDIATE` change)

Recurring/scheduler:

- scheduler enqueues only due templates; not-yet-due templates are untouched
- `recurring.generate` posts through `LedgerMutationRunner` and creates balanced postings
- duplicate `recurring.generate` (same template/scheduled_for) is a no-op (occurrence unique)
- paused/archived template between scan and execute is skipped
- `next_run_at` advances correctly per cadence

Cleanup:

- `sessions.cleanup` removes only expired sessions
- `idempotency.prune` removes only expired receipts

Graceful shutdown: in-flight job completes before the worker exits.

## Acceptance

- A separate `APP_ROLE=worker` process claims and runs jobs; `api` no longer needs to run them.
- Recurring templates post automatically and idempotently, on both drivers.
- A separate worker and the API can both write SQLite safely (two-connection test passes).
- Session cleanup and idempotency pruning run on schedule.
- All new behavior is covered by SQLite + PostgreSQL tests.
- No new external dependency; no second ledger write path.

## Affected code

- `packages/config/src/index.ts` (APP_ROLE + worker config)
- `packages/db`: job repository (new), `recurring_occurrences` schema + migrations (both dialects),
  `ledger-mutations.ts` SQLite `BEGIN IMMEDIATE` + retry, CLI `jobs` commands
- `apps/api/src/server.ts` (role branch), `apps/api/src/worker.ts` (new), `runtime.ts` (share bundle)
- `docker-compose.sqlite.yml`, `docker-compose.postgres.yml`, `docs/specs/deployment.md`
- `docs/specs/maintenance-v2.md` (jobs CLI), `docs/specs/architecture-v2.md` (worker role note)
