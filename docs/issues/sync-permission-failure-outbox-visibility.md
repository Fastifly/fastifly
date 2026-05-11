# Sync Permission Failure Outbox Visibility

Status: resolved
Phase: 7
Severity: blocking before offline write beta

## Why It Matters

Phase 7 stop conditions require permission failure to be visible to outbox UI.

Current sync replay applies each operation through normal finance services, but if a domain-level
permission denial is thrown during replay, push handling aborts the request instead of returning a
per-operation rejected result.

This prevents the client outbox from reliably classifying one operation as rejected while still
receiving accepted/rejected/conflict outcomes for the rest of the batch.

## Affected Docs/Code

- `docs/specs/implementation-start.md`
- `packages/db/src/services/sync-replay.ts`
- `apps/api/src/routes/sync.ts`
- `apps/api/src/errors.ts`

## Resolution

Implemented on 2026-05-11:

- sync replay now catches `LedgerMutationError(MUTATION_FORBIDDEN)` at the per-operation boundary
  and records a stable rejected reason `permission_denied`
- batch replay continues for the remaining operations
- rejected operations are returned in `POST /api/v1/sync/push` response
- service tests now cover forbidden + accepted operations in the same batch
- rejected operations remain without accepted server revisions

## Blocking Milestone

Phase 7 stop condition "permission failure is visible to outbox UI" is now satisfied.
