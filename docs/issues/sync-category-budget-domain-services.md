# Sync Category And Budget Domain Services

Status: resolved
Phase: 7
Severity: previously blocking before offline category or budget writes

## Why It Matters

`docs/specs/sync-v1.md` previously listed `category.create.v1` and
`budget.assign_category_month.v1` as approved offline commands, but the implementation had no
category-create or budget-assignment domain services.

The sync replay service must not write those tables directly or create sync-only business logic.

## Affected Docs/Code

- `docs/specs/sync-v1.md`
- `docs/specs/api-v2.md`
- `packages/common/src/sync/operations.ts`
- future category and budget services/repositories
- `packages/db/src/services/sync-replay.ts`

## Resolution

Implemented on 2026-05-11:

- removed `category.create.v1` and `budget.assign_category_month.v1` from the approved v0.1
  offline command allowlist in shared contracts and canonical docs
- retained sync replay support only for transaction-group create operations that are fully routed
  through the normal finance mutation service
- documented category/budget offline writes as out of current v0.1 sync scope until domain services
  and routes exist

## Blocking Milestone

No longer blocking v0.1 offline write beta because those operation types are now out of scope.
