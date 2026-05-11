# Phase 9 Daily Workflows Surface Gap

Status: closed
Phase: 9
Severity: blocking before Phase 9 completion and public beta
Resolved: 2026-05-11

## Why It Matters

`docs/specs/implementation-start.md` Phase 9 requires daily finance workflows beyond the current
accounts/transactions/budgets/reports shell.

The current app and API expose core finance routes and UI shells, but the required product workflows
for imports, rules, and recurring are not yet implemented end-to-end.

Without these surfaces, the product cannot satisfy the Phase 9 stop condition.

## Affected Docs/Code

- `docs/specs/implementation-start.md` (Phase 9 stop condition)
- `docs/specs/api-v2.md` (import/rule/recurring endpoint contracts)
- `docs/specs/frontend-v2.md` (imports/rules/recurring UI workflows)
- `apps/api/src/routes/finance.ts` (currently accounts/budgets/transactions only)
- `apps/api/src/app.ts` (no import/rule/recurring route registration)
- `apps/web/src/ui/app-shell.tsx` (no imports/rules/recurring screens)

## Applied Fix

Implemented end-to-end workflow surfaces across DB, API, and web:

1. Import workflow
   - DB: `import_jobs` model + repository integration
   - API: CSV upload, preview rows, commit, and undo routes
   - Service: parse/commit/undo through normal finance mutation pipeline
   - UI: imports page with create, commit, undo, and status history

2. Rules workflow
   - DB: `rules` model + repository integration
   - API: CRUD + test + apply routes
   - Service: test and apply against shared transaction query results
   - UI: rules page with create/list/test/apply flows

3. Recurring workflow
   - DB: `recurring_templates` model + repository integration
   - API: CRUD + generate routes
   - Service: generation via normal transaction creation pipeline
   - UI: recurring templates page with create/list/manual generate

Also completed:

- shared `packages/common` API contracts and fixtures
- authz subject/policy coverage for workflow entities
- API route tests in `apps/api/src/__tests__/workflow-routes.test.ts`
- OpenAPI generation and web client type integration

## Verification

- `pnpm --filter @fastifly/web typecheck` passes
- `pnpm --filter @fastifly/web test` passes
- `pnpm typecheck` passes
- `pnpm test` passes
- `pnpm api:generate` includes imports/rules/recurring endpoints

## Blocking Milestone

Resolved for Phase 9 completion criteria.
