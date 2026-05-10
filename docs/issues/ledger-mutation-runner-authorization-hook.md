# Ledger Mutation Runner Authorization Hook

Status: resolved
Phase: 6
Severity: blocking before new ledger write routes

## Why It Matters

API routes perform permission checks before calling finance services, and the production runtime
adds service-level workspace membership checks before ledger mutations run.

The resolved gap was granular service-level action authorization. Future jobs, imports, sync replay,
or maintenance commands must pass an explicit action/subject context so the runner can enforce the
same permission policy without relying on route handlers.

## Affected Docs/Code

- `docs/specs/architecture-v2.md`
- `docs/specs/ledger-mutation-runner.md`
- `apps/api/src/runtime.ts`
- `apps/api/src/routes/finance.ts`
- future import, sync, recurring, and job services

## Resolution

- `LedgerMutationEnvelope` now requires an `authorization` action/subject context.
- `LedgerMutationRunner` fails closed before handler execution when that context is missing.
- The production runtime authorizer now derives CASL ability from the current workspace membership
  and enforces the envelope action/subject.
- Finance services reject mismatched authorization context before calling the runner.
- Route-level permission checks remain as fast user-facing guards, while the runner is the final
  service boundary.
- Tests cover missing authorization context, mismatched finance-service context, and runtime
  role-based denial.

## Blocking Milestone

Resolved for current Phase 6 account and transaction writes. New ledger-affecting write paths still
must provide explicit envelope authorization context.
