# Distributed Ledger Write Boundary

## Issue title

Add a production distributed adapter for the ledger write boundary before horizontally scaling API workers.

## Why it matters

`LedgerMutationRunner` requires a `LedgerWriteBoundary` and the current implementation provides an in-process per-ledger lock. That is correct for single-process self-hosted deployment and tests, but it does not serialize writes across multiple API processes or hosts.

Without a distributed adapter, two workers could mutate the same ledger concurrently in a horizontally scaled deployment.

Customer impact:

- duplicate or out-of-order transaction writes could appear under load
- balance recalculation could run from the wrong earliest change
- import/sync/retry behavior could become inconsistent between workers
- support would be harder because audit order would not prove write order across processes

## Affected docs/code

- `packages/db/src/ledger-mutations.ts`
- `docs/specs/ledger-mutation-runner.md`
- `docs/specs/architecture-v2.md`
- `docs/specs/deployment.md`

## Suggested fix

Add a production `LedgerWriteBoundary` adapter backed by database or infrastructure-level locking:

- PostgreSQL: advisory transaction locks keyed by `(workspace_id, ledger_id)`.
- SQLite/better-sqlite3: explicit single-writer deployment mode or a transaction-backed lock table with timeout semantics.
- Hosted/multi-region future: queue or distributed lock service with fencing tokens.

Document which adapter is active for each deployment mode and fail startup if a multi-worker deployment is configured with only the in-process boundary.

## Blocking milestone

Required before production horizontal API scaling or any deployment mode with more than one writer process.
