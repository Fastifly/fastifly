# Sync Conflict Resolution Audit

Status: resolved
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

## Resolution

Implemented on 2026-05-11:

- conflict dismiss now includes actor context in repository/service boundaries
- dismiss writes an audit row with action `sync_conflict.dismissed` and conflict metadata in both
  SQLite and PostgreSQL paths
- tests now verify conflict dismiss audit records are persisted
- conflict resolution continues to avoid mutating financial rows directly

## Blocking Milestone

No longer blocking. Conflict dismiss is now traceable via audit metadata.
