# Ledger Mutation Runner Authorization Hook

Status: partially resolved
Phase: 6
Severity: blocking before new ledger write routes

## Why It Matters

Current API routes perform permission checks before calling finance services, and the production
runtime now adds a service-level workspace membership check before ledger mutations run.

The remaining gap is granular service-level action authorization. Future jobs, imports, sync replay,
or maintenance commands must pass an explicit action context so the runner can enforce the same
permission policy without relying on route handlers.

## Affected Docs/Code

- `docs/specs/architecture-v2.md`
- `docs/specs/ledger-mutation-runner.md`
- `apps/api/src/runtime.ts`
- `apps/api/src/routes/finance.ts`
- future import, sync, recurring, and job services

## Suggested Fix

- Extend the `LedgerMutationEnvelope` with the requested action/resource context.
- Add an authz-backed `LedgerMutationRunner` authorization adapter.
- Keep route-level permission checks, but make the runner the final granular enforcement boundary.
- Add tests proving direct service calls fail without permission context.

## Blocking Milestone

Required before adding more ledger-affecting write paths beyond the current account and transaction
routes.
