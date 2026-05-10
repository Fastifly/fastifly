# Offline Sync Service Boundary

Status: open
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

## Blocking Milestone

Required before offline writes are enabled outside controlled development tests.
