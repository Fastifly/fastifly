# Sync Category And Budget Domain Services

Status: open
Phase: 7
Severity: blocking before offline category or budget writes

## Why It Matters

`docs/specs/sync-v1.md` lists `category.create.v1` and `budget.assign_category_month.v1` as
approved offline commands, but the current implementation has no category-create or budget-assignment
domain services yet.

The sync replay service must not write those tables directly or create sync-only business logic.

## Affected Docs/Code

- `docs/specs/sync-v1.md`
- `docs/specs/api-v2.md`
- `packages/common/src/sync/operations.ts`
- future category and budget services/repositories
- `packages/db/src/services/sync-replay.ts`

## Suggested Fix

- Add normal online category and budget domain services first.
- Add repository methods and API routes for those online writes.
- Route the sync commands through those same services.
- Add SQLite/PostgreSQL tests for replay idempotency, permission denial, and stale conflict behavior.
- If those features are not in v0.1 scope, remove the two operation names from the approved sync
  contracts before enabling offline writes.

## Blocking Milestone

Required before offline category or budget writes are enabled.
