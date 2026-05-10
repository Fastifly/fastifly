# Ledger Mutation Runner

This document explains the day-one mutation boundary used for every ledger-affecting write.

The goal is simple: users must not get duplicate transactions, partial saves, hidden side effects, or different behavior depending on whether a write came from the web UI, sync replay, import, recurring jobs, rules, or maintenance tools.

## Customer-Facing Behavior

When a user saves a ledger-affecting change, Fastifly should behave as if there is one careful write path:

- retrying the same request with the same idempotency key returns the original result
- reusing an idempotency key with different content is rejected
- read-only, archived, maintenance, restore-preview, pending-restore, and broken ledgers reject normal writes
- audit entries are written inside the same database transaction as the mutation
- domain events and balance dirtying run only after the database transaction commits
- failed mutations do not dispatch side effects

This protects users from double-submitted transactions, stale offline writes, and inconsistent balances.

## Scope

All ledger-affecting writes must go through `LedgerMutationRunner`.

In scope:

- transaction create/update/delete
- imports
- recurring transaction generation
- rule actions
- reconciliation
- sync push replay
- bulk edits
- maintenance repairs that change ledger data

Out of scope:

- pure reads
- authentication/session routes
- workspace invitation acceptance unless it later creates ledger-affecting state
- static settings that do not change ledger, balance, sync, or audit behavior

## Envelope

Every mutation uses one envelope:

```text
requestId
actorUserId
deviceId nullable
workspaceId
ledgerId
authorization:
  action
  subject
idempotencyKey nullable
baseRevision nullable
source: rest | sync | import | rule | recurring | maintenance
dryRun
sideEffectFlags
```

`authorization` is required even when a route already checked permissions. The runner is the final
boundary for jobs, imports, sync replay, recurring generation, and future maintenance services that
will not naturally pass through the same Fastify route handler.

Side-effect flags:

```text
applyRules
fireWebhooks
batchSubmission
skipNotifications
recalculateBalances
```

## Runtime Flow

The runner performs the same sequence for every write:

1. Authorize the actor against the current envelope.
2. Hash the authorization context, envelope-relevant scope fields, and request payload for idempotency comparison.
3. Acquire the per-ledger write boundary.
4. Open one database transaction.
5. Check idempotency receipt replay or conflict.
6. Load workspace and ledger lifecycle state.
7. Reject non-writable lifecycle states.
8. Call the feature service/use-case handler.
9. Persist audit entries.
10. Persist idempotency receipt.
11. Commit the transaction.
12. Dispatch domain events and balance dirty requests after commit.

If the handler throws, the database transaction rolls back and post-commit dispatch does not run.

## Idempotency Rules

Retryable ledger writes use:

```text
Idempotency-Key: <retry key>
```

When a response is served from an existing receipt, API routes should expose:

```text
Idempotency-Replayed: true
```

Receipts are keyed by:

```text
actorUserId + idempotencyKey
```

This is intentional. A user's retry should replay even if the same browser or mobile client reconnects later. The receipt stores:

```text
workspaceId
ledgerId
actorUserId
deviceId
idempotencyKey
requestHash
responseStatus
responseBodyJson
createdAt
expiresAt
```

Rules:

- same key + same request hash returns the stored response
- same key + different request hash fails with `IDEMPOTENCY_CONFLICT`
- expired receipts are deleted inside the mutation transaction and do not replay
- dry-run mutations do not write receipts
- failed mutations do not write receipts

Customer-safe API messages:

| Internal condition | HTTP status | User-facing message |
|---|---:|---|
| Malformed retry key | 400 | Idempotency key is invalid. |
| Same retry key, different request | 409 | This retry key was already used for a different request. |
| Ledger missing | 404 | The requested ledger was not found. |
| Ledger is read-only/archived/unsafe | 409 | This ledger cannot be changed right now. |

API route code should not parse or emit these headers ad hoc. Use the shared API helpers:

```text
getRequestIdempotencyKey(request)
sendLedgerMutationResult(reply, result)
```

The first helper turns malformed retry keys into the standard API error shape. The second helper sets `Idempotency-Replayed: true` only when the runner returned a replayed receipt.

## Lifecycle Rules

Normal sources can write only when both workspace and ledger are `active`.

```text
rest
sync
import
rule
recurring
```

Maintenance source can write when state is:

```text
active
maintenance
```

The runner rejects:

```text
read_only
archived
restore_preview
pending_restore
broken
```

Archived rows are also rejected when `archivedAt` is set.

## Side Effects

Handlers can collect:

- domain events
- audit log entries
- balance dirty requests
- accepted sync operation records

Audit entries are stored inside the mutation transaction.

Domain events and balance dirty requests are dispatched after commit. This prevents users seeing notifications, jobs, or balance recalculation for a write that failed.

Dry-run mutations may collect events, audit entries, and balance dirty requests inside the handler, but the runner does not persist or dispatch them.

When `source` is `sync`, the mutation envelope must include sync operation metadata: `operationId`, `operationType`, and `localSequence`. The runner exposes an accepted-operation logging hook after commit with that metadata and the request hash. It does not run for failed mutations, dry-runs, REST/import/rule/recurring sources, or idempotency replays. Phase 7 should connect this hook to the durable sync operation service.

## Write Boundary

The runner requires a `LedgerWriteBoundary`.

Current implementation:

```text
createInProcessLedgerWriteBoundary()
```

This serializes writes per ledger inside one API process. It is suitable for the current single-process self-hosted development and deployment shape.

Before horizontal API scaling, add a distributed adapter. See:

```text
docs/issues/distributed-ledger-write-boundary.md
```

## Implementation Files

Core:

```text
apps/api/src/idempotency.ts
packages/db/src/ledger-mutations.ts
```

Tests:

```text
packages/db/src/__tests__/ledger-mutations.test.ts
packages/db/src/__tests__/sqlite-migrations.test.ts
packages/db/src/__tests__/postgres-migrations.test.ts
```

Related schema:

```text
idempotency_receipts
audit_log
workspaces.status
ledgers.status
```

## Acceptance Tests

Current tests verify:

- duplicate idempotency key replays the original response
- idempotency key reuse with different request content fails
- expired idempotency receipts do not replay and are replaced safely
- authorization failure fails before handler execution
- missing authorization context fails before handler execution
- finance services reject authorization context that does not match the requested operation
- read-only, maintenance, archived, restore-preview, pending-restore, broken, and archived workspace states reject normal writes
- maintenance-source writes can run against maintenance state
- domain events dispatch only after committed mutations
- balance dirty requests dispatch only after committed non-replayed mutations
- sync-sourced mutations require operation metadata
- accepted sync operation hook runs only after committed non-replayed sync mutations
- dry-runs do not persist receipts, audit entries, or side effects
- audit and idempotency rows are persisted
- SQLite and PostgreSQL migration shape includes required lifecycle/idempotency columns

## Product Review Checklist

Before any new ledger write is accepted:

- Does it use `LedgerMutationRunner`?
- Does it provide a stable idempotency key when the operation can be retried?
- Does the handler write audit entries for user-visible changes?
- Are side effects collected instead of executed inside the transaction?
- Does a failed mutation leave no queued events or balance dirty requests?
- Does the response remain stable when replayed?
- Is lifecycle state checked by the runner, not repeated ad hoc in route code?
