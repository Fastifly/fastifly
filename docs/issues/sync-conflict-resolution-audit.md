# Sync Conflict Resolution Audit

Status: open
Phase: 7
Severity: blocking before conflict resolution is enabled for real users

## Why It Matters

Conflict dismissal now marks the conflict as `dismissed` and records `resolved_at`, but the
canonical sync spec says dismissed conflicts need audit metadata. A user-visible conflict decision is
not a ledger mutation, but it is still a finance-support decision that should be traceable.

## Affected Docs/Code

- `docs/specs/sync-v1.md`
- `docs/specs/api-v2.md`
- `packages/db/src/repositories/sync.ts`
- `packages/db/src/services/sync-query.ts`
- `apps/api/src/routes/sync.ts`

## Suggested Fix

- Add actor-aware audit metadata for conflict dismiss/resolve actions.
- Either record a `sync_conflict.dismissed` audit row through the existing audit table or add
  explicit `resolved_by` and `resolution_note` fields if the product wants inline conflict metadata.
- Keep financial row changes out of conflict resolution unless a new explicit command is created and
  replayed through normal services.

## Blocking Milestone

Required before conflict resolution is exposed outside controlled development tests.
