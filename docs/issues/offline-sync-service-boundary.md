# Offline Sync Service Boundary

Status: partially resolved
Phase: 7
Severity: blocking before offline write beta

## Why It Matters

The shared sync contracts define approved offline command names, but the API does not yet expose
the full server-side replay boundary for authenticated devices, idempotency, conflict records, and
normal service reuse.

Fastifly must not add raw row patch sync or sync-only business logic. Offline commands need to run
through the same domain services and ledger mutation runner as online writes.

## Affected Docs/Code

- `docs/specs/sync-v1.md`
- `docs/specs/api-v2.md`
- `docs/specs/database-v2.md`
- `packages/common/src/sync/operations.ts`
- future sync replay routes/services/repositories

## Suggested Fix

- Add a sync replay service that validates device/session/workspace/ledger state.
- Persist operation receipts and explicit conflict records.
- Enforce idempotency before invoking domain services.
- Route approved transaction commands through the normal finance mutation service.
- Add SQLite and PostgreSQL tests for replay idempotency and stale-base conflicts.

## Progress

Implemented on 2026-05-10:

- Added SQLite/PostgreSQL `workspace_ledger_revisions`, `sync_operations`, and `sync_conflicts`
  schemas plus generated Drizzle migrations.
- Added a sync repository for device lookup, operation replay lookup, revision increments, rejected
  operations, and conflict records.
- Added a sync replay service that validates devices, replays duplicate operations, records stale
  base revision conflicts, rejects invalid operations, and routes transaction create commands through
  the normal finance mutation service.
- Added `POST /api/v1/sync/push` with shared request/response schemas and route-level `sync` auth.
- Added tests for repository parity, replay idempotency, stale conflicts, revoked devices, and API
  route permission behavior.
- Added device registration/list/revoke repositories and API routes so sync push no longer depends
  on manually seeded devices.
- Added sync pull/status contracts, repository reads, query service, and API routes for clients to
  fetch accepted operations after a revision and inspect current server revision/conflict count.
- Updated sync pull/status to match the canonical paginated contract with `hasMore`,
  `nextSinceRevision`, `openConflicts`, and `lastOperationAt`.
- Added conflict list and dismiss endpoints backed by SQLite/PostgreSQL repository behavior.

Remaining before offline write beta:

- `category.create.v1` and `budget.assign_category_month.v1` need real domain services or must be
  removed from the approved offline command list. Tracked in
  `docs/issues/sync-category-budget-domain-services.md`.

## Blocking Milestone

Required before offline writes are enabled outside controlled development tests.
