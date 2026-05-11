# Distributed Ledger Write Boundary

Status: resolved
Resolved in phase: 7
Severity: closed

## Issue Title

Add a production distributed adapter for the ledger write boundary before horizontally scaling API workers.

## Why It Mattered

`LedgerMutationRunner` previously used only an in-process per-ledger lock. That was correct for
single-process self-hosted runs, but it did not serialize writes across multiple PostgreSQL API
processes.

## Applied Fix

- added `createPostgresAdvisoryLedgerWriteBoundary()` in
  `packages/db/src/ledger-mutations.ts`
- wired PostgreSQL runtime to use the advisory boundary in `apps/api/src/runtime.ts`
- added `POSTGRES_LEDGER_LOCK_ACQUIRE_TIMEOUT_MS` config in `packages/config/src/index.ts`
- added tests:
  - `packages/db/src/__tests__/postgres-ledger-write-boundary.test.ts`
  - `packages/config/src/__tests__/api-config.test.ts` timeout parsing coverage

## Acceptance

- PostgreSQL runtime serializes ledger-affecting writes across processes via advisory locks
- lock acquisition timeout is explicit and configurable
- SQLite remains documented as single-writer self-hosted mode
