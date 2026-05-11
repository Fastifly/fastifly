# Job Queue Runtime Worker Gap

Status: open  
Phase: 10  
Severity: high before production background automation

## Why It Matters

`job_queue` is present in schema and specs, but there is no runtime worker loop that:

- claims available jobs safely
- executes handlers
- retries with backoff
- marks terminal failure
- emits audit/metrics for failures

Without this, recurring/import/rule workloads cannot move from synchronous/manual triggers to reliable background execution.

## Affected Docs/Code

- `docs/specs/maintenance-v2.md`
- `docs/specs/architecture-v2.md`
- `docs/specs/database-v2.md` (`job_queue`)
- `packages/db/src/sqlite/schema.ts`
- `packages/db/src/postgres/schema.ts`
- `apps/api/src` (no worker bootstrap/runner yet)

## Suggested Fix

1. Add `packages/db` job repository APIs: claim, heartbeat, complete, fail, retry schedule, dedupe enforcement.
2. Add `apps/api` worker runtime with DB-polling runner per queue.
3. Register typed handlers for import, recurring generation, rule apply, and maintenance tasks.
4. Add end-to-end tests for dedupe, retry backoff, max-attempt terminal state, and idempotent handler behavior on SQLite + PostgreSQL.

## Blocking Milestone

Required before enabling automatic recurring/import/rule jobs in production.
