# AGENTS.md

Fastifly: simple UX on top of a ledger-safe finance engine.

## Hard Rules
- Don't care about backword compatibility or db reset. do it like you are from scratch to make the product robust.
- use context7 for latest documentation about libraries.
- workarounds/patches are strictly prohibited. Fix root cause issues and apply features 100% production ready.
- for critical parts, do heavy/meaningful testing.
- for any simple CRUD feature: add a add {module}, button at top-right. open the dialog with create form, never inline it. use same form to add/edit. show a minimal list (tanstack datatables) with meaningful actions. to enter color: use color picker. to use icons: make/use common icons picker.
- create domain logics in common places with heavy testing.

## Prime directive
- Do not build a toy expense tracker.
- Keep UI simple; keep data model and money handling strict.

## Canonical docs (source of truth)
Read these before architecture or behavior changes:
- `ts/raw-docs`
- `docs/README.md`
- `docs/specs/architecture-v2.md`
- `docs/specs/database-v2.md`
- `docs/specs/api-v2.md`
- `docs/specs/frontend-v2.md`
- `docs/specs/implementation-start.md`
- `docs/specs/sync-v1.md`
- `docs/specs/pwa-mobile.md`
- `docs/specs/maintenance-v2.md`
- `docs/specs/backup-restore.md`
- `docs/specs/deployment.md`
- `docs/specs/consistency-review.md`
- `docs/prd/`

## Required architecture
- Modular monolith:
  - `apps/api`, `apps/web`
  - `packages/common`, `packages/authz`, `packages/db`, `packages/config`
- Backend flow: route -> service -> repository -> database.
- Frontend flow: route/component -> query/form -> API client -> API.
- Shared contracts and core domain helpers must live in `packages/common`.
- Keep generated `shadcn/ui` primitives free of product business logic.

## Non-negotiable finance and ledger rules
- Never use floats for money.
- API money uses strings, internal math uses `bigint`, DB stores integer minor units.
- Every amount must include `currencyCode`.
- Ledger postings must balance.
- Account balances are derived from postings (or verified snapshots).
- Reconciled transaction edits require explicit guarded handling.
- Synced domain entities use UUIDv7-compatible text IDs.
- Use transaction-group model (`groups -> journals -> postings`), not a flat source-of-truth `transactions` table.

## Sync and mutation safety
- Offline sync is command-based; no raw row patch sync.
- Approved offline writes are only:
  - `transaction_group.create_expense.v1`
  - `transaction_group.create_income.v1`
  - `transaction_group.create_transfer.v1`
- Ledger-affecting writes must go through the shared mutation boundary.
- Sync replay must enforce auth, membership, permissions, schema validation, idempotency, and conflict recording.

## Engineering rules
- Validate external boundaries (HTTP, sync ops, jobs, imports, env, CLI).
- Fail closed for finance/auth/sync/permissions.
- Keep business logic out of React components and Fastify routes.
- Services own domain rules; repositories own DB access.
- Do not invent new contracts from memory. Check docs and existing code first.
- No fake implementations (TODO-only logic, silent fallbacks, mock authz in production, in-memory persistence for persistent features).
- Prefer explicit, reviewable code over clever abstractions.

## Database and portability
- Support both SQLite and PostgreSQL.
- Dialect-specific schema/migration files are allowed.
- Business logic must not diverge by dialect.
- Any DB-sensitive behavior must be verified for both databases.

## API and security
- REST under `/api/v1`.
- Every endpoint must have request/response validation, stable error shape, OpenAPI docs, scope checks, permission checks, and idempotency behavior where relevant.
- Never log secrets/tokens/passwords/full auth headers.
- Use secure session defaults (HttpOnly, secure in production, SameSite, server-side sessions, strong password hashing).

## UI rules
- Beginner-first labels by default; advanced accounting detail is discoverable, not noisy.
- Mobile-first states: loading, empty, error, success, disabled, offline where relevant.
- Light/dark themes must both work.
- Avoid hardcoded user-facing strings; keep i18n-ready patterns.

## Testing rules
- Use Playwright MCP for browser validation.
- Do not run ad-hoc downloaded Playwright commands unless explicitly approved.
- Use central `data-testid` registry: `apps/web/src/testing/testid-registry.ts`.
- Cover at the lowest useful layer: unit, service, repository, API, DB, ledger invariants, frontend, and E2E where useful.
- Required invariant coverage includes expense/income/transfer/split balancing, cross-currency snapshot behavior, idempotency, stale-sync conflicts, and permission denials.

## Tooling and dependency guardrails
- Keep script split:
  - `lint` / `lint:fix` / `format` via Biome
  - `typecheck` via `tsgo` (when available)
  - `typecheck:tsc` fallback parity
  - `build` emits artifacts
- Do not add heavy infra without ADR (`Redis`, `BullMQ`, `Kafka`, `RabbitMQ`, `Elasticsearch`, `OpenSearch`, microservices, GraphQL).
- Before adding any dependency: justify necessity, ops/runtime cost, maintenance, license, and SQLite/PostgreSQL compatibility.

## Documentation and review
- If behavior/contracts change, update latest docs in the same slice.
- For non-trivial slices, run 3 review lenses before moving on:
  - CTO lens: architecture fit and long-term risk.
  - Senior engineer lens: correctness, typing, tests, maintainability.
  - User lens: workflow clarity and product behavior.
- Use Context7 for current official docs/release notes/READMEs in reviews.
- If an issue is valid but out of current scope, record it in `docs/issues/` before proceeding.
