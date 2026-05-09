# API List Cursor Pagination

Status: open
Phase: 6
Severity: blocking before public API beta

## Problem

Finance list endpoints now return stable bounded lists, but transaction and account cursor semantics are not fully implemented in the shared query layer.

This matters because large ledgers need repeatable pagination that does not skip or duplicate rows while transactions are being added. Page metadata must not claim complete cursor support until the repository/query service owns the cursor contract.

## Affected Docs/Code

- `docs/specs/api-v2.md`
- `packages/common/src/api/pagination.ts`
- `packages/common/src/api/finance.ts`
- `apps/api/src/routes/finance.ts`
- `packages/db/src/repositories/transactions.ts`
- `packages/db/src/repositories/accounts.ts`

## Suggested Fix

- Define one cursor format for finance lists.
- Make cursor values include the stable sort key and row id.
- Add cursor input to `TransactionQueryService` and account list queries.
- Fetch `limit + 1` rows to produce accurate `hasNextPage` and `nextCursor`.
- Add SQLite and PostgreSQL parity tests for cursor pagination under tied timestamps.
- Update API fixtures for account list and transaction list responses.

## Blocking Milestone

Must be fixed before Fastifly documents the API as stable for third-party clients or before large-ledger import/list workflows are shipped.
