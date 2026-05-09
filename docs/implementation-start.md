# Implementation Start

This document defines what must be true before implementation starts and the order to build the TypeScript app.

Use this with:

- `AGENTS.md`
- `docs/architecture-v2.md`
- `docs/database-v2.md`
- `docs/api-v2.md`
- `docs/sync-v1.md`
- `docs/frontend-v2.md`
- `docs/prd/fastify_finance_app_implementation_prd.md`

## Implementation Gates

Do not start feature implementation until these gates are satisfied.

### 1. Canonical docs only

Use latest docs as source of truth.

Canonical:

```text
docs/architecture-v2.md
docs/database-v2.md
docs/api-v2.md
docs/frontend-v2.md
docs/sync-v1.md
docs/pwa-mobile.md
docs/maintenance-v2.md
docs/backup-restore.md
docs/deployment.md
docs/prd/
```

Raw docs are research notes. They are not implementation authority.

### 2. Workspace scaffold

The repo must have:

```text
package.json
pnpm-workspace.yaml
tsconfig.base.json
apps/api
apps/web
packages/common
packages/db
packages/config
packages/authz
```

TypeScript project references and package exports must be decided before feature code spreads.

### 3. Code quality baseline

Required before feature modules:

```text
strict TypeScript
Biome lint command
Biome format command
typecheck command using tsgo when available
typecheck:tsc fallback/parity command
test command
CI command or local equivalent
```

Rules:

- no `any` without a narrow local justification
- no fake production logic
- no in-memory persistence for real product features
- no unchecked JSON domain payloads
- no route-handler business logic
- no React component business logic

### 3.1 Implementation review gate

Every non-trivial implementation slice must be reviewed as three separate review cycles before moving on.

This includes:

- phase transitions
- new packages
- new dependencies
- database schema or migration changes
- auth, security, permission, sync, money, backup, restore, import, or ledger logic
- public API contract changes

Required review personas:

```text
CTO
senior software engineer
user
```

Required research:

```text
Context7 docs for every changed framework/library surface
current online sources, preferring official docs, release notes, package READMEs, and security notes
```

Review output:

```text
Do not create review files.
Fix in-scope findings immediately.
Record only deferred findings in docs/issues/.
```

Each deferred issue file must include:

- issue title
- why it matters
- affected docs/code
- suggested fix
- blocking milestone

Do not continue past the slice until in-scope findings are fixed and deferred findings are captured in `docs/issues/`.

### 4. Common package first

`packages/common` must exist before API/database/frontend feature work.

Minimum contents:

```text
money helpers
currency helpers
UUIDv7-compatible ID helpers
API error contracts
pagination contracts
workspace/ledger scoped IDs
product-rule constants
account compatibility matrix
transaction type inference
sync operation names
Zod schemas for shared DTOs
```

This prevents backend, frontend, sync, and tests from inventing different names and shapes.

### 5. Database parity shell

`packages/db` must support SQLite and PostgreSQL from the first schema.

Required:

```text
sqlite schema entrypoint
postgres schema entrypoint
sqlite migration folder
postgres migration folder
database driver factory
transaction wrapper
repository test harness that can run against both dialects
SQLite runtime pragma check
```

Do not implement a feature only against SQLite and promise PostgreSQL later.

### 6. Money and IDs

Money:

```text
API: amountMinor string
Internal math: bigint
DB: integer/bigint minor units
```

IDs:

```text
synced domain objects: UUIDv7-compatible text IDs
no auto-increment IDs for synced objects
```

These choices must be available in shared helpers before the first table/service.

### 7. API shell

API foundation before domain routes:

```text
Fastify app factory
config plugin
request ID
logger
standard error serializer
health endpoint
readiness endpoint
OpenAPI endpoint
Scalar docs endpoint
cookie/session plugin slot
CSRF strategy slot
auth context hook
authz ability hook
```

Every endpoint must use request/response schemas and standard errors.

### 8. Auth and authorization foundation

Before financial data routes:

```text
users
sessions
passkeys
recovery codes
workspace members
copyable invitations
CASL actions/subjects/roles
service policy helpers
workspace/ledger scoped repository helpers
```

Frontend permission checks are UX only. Backend and repositories enforce scope.

### 9. Ledger mutation runner

Before transactions, imports, rules, recurring, or sync replay:

```text
LedgerMutationRunner
mutation envelope
idempotency receipt handling
workspace/ledger lifecycle check
permission check
per-ledger write boundary
domain event collection
post-commit side-effect dispatch
balance dirtying hook
sync operation metadata and logging hook
```

No ledger-affecting write may bypass this runner.

### 10. Sync infrastructure is day-one

Before offline-capable UI:

```text
devices table/service
sync_operations table/service
sync_conflicts table/service
workspace_ledger_revisions
client outbox contract
POST /sync/push
GET /sync/pull
GET /sync/status
conflict list/resolve contracts
```

Approved offline commands only:

```text
transaction_group.create_expense.v1
transaction_group.create_income.v1
transaction_group.create_transfer.v1
category.create.v1
budget.assign_category_month.v1
```

All other writes are online-only.

### 11. PWA safety

Before enabling service worker caching:

```text
precache app shell only
financial API routes network-only/no-store
auth/session routes network-only/no-store
import/export/backup routes network-only/no-store
offline status UI
sync status UI
pending outbox count
conflict entry point
logout local-data clearing behavior
```

Do not store secrets in `localStorage`.

### 12. Testing matrix

Minimum test matrix before core finance work:

```text
unit tests
shared schema tests
money tests
ID tests
API contract tests
SQLite repository tests
PostgreSQL repository tests
migration tests
authz policy tests
sync replay tests
frontend smoke tests
PWA cache safety tests
```

## Best Starting Order

### Phase 0: Repository foundation

Deliver:

```text
pnpm workspace
root package scripts
strict TypeScript baseline
lint/format/typecheck/test commands
workspace package exports
CI skeleton
```

Stop condition:

- `pnpm install`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm typecheck:tsc`
- `pnpm test`

all run successfully, even if tests are minimal.

Use Biome for linting and formatting. Use `tsgo` for fast type-checking when available, but keep `tsc` available for build/declaration parity.

### Phase 1: Shared contracts

Build `packages/common`.

Deliver:

```text
money module
currency module
ID module
API error module
pagination module
workspace/ledger scope types
product rules
account compatibility matrix
sync operation constants
Zod schema structure
contract fixture folder
```

Stop condition:

- money parsing rejects unsafe values
- ID generation is tested
- account compatibility matrix is tested
- shared schemas compile in API and web contexts

### Phase 2: Database foundation

Build `packages/db`.

Deliver:

```text
SQLite driver
PostgreSQL driver
schema entrypoints
migration folders
migration runner command shape
transaction wrapper
repository base helpers
dual-dialect test harness
```

First schemas:

```text
users
sessions
passkeys
recovery_codes
workspaces
workspace_members
workspace_invitations
ledgers
devices
idempotency_receipts
job_queue
audit_log
```

Stop condition:

- clean SQLite migration works
- clean PostgreSQL migration works
- repository smoke tests pass on both dialects

### Phase 3: API foundation

Build `apps/api`.

Deliver:

```text
Fastify app factory
config validation
request ID
structured logger
error serializer
health/readiness
OpenAPI/Scalar
cookie/session setup
CSRF setup
auth context hook
authz ability hook
static serving placeholder
```

Stop condition:

- `/health` works
- `/ready` reflects migration/config state
- `/api/openapi.json` works
- standard error fixture is tested
- if no frontend build exists yet, static serving must be explicitly marked as deferred to the frontend/PWA phase

### Phase 4: Auth, workspace, ledger, permissions

Deliver:

```text
register/login/logout
sessions
passkey registration/login skeleton or complete flow
recovery codes
default workspace creation
default ledger creation
workspace workspace roles
copyable invite links
CASL abilities
service policies
repository scope helpers
```

Stop condition:

- user can register and log in
- default workspace and ledger exist
- workspace isolation tests pass
- viewer/editor/admin/owner policies pass

### Phase 5: Ledger mutation foundation

Deliver:

```text
LedgerMutationRunner
mutation envelope
idempotency receipt service
domain event collector
balance dirtying queue hook
workspace/ledger lifecycle checks
per-ledger write boundary
audit event hook
sync operation metadata and logging hook
```

Stop condition:

- duplicate idempotency key replays previous result
- permission failure fails closed
- read-only/maintenance ledger rejects writes
- events dispatch only after commit
- sync-sourced mutations require operation metadata
- accepted sync operation hook runs only after committed sync mutations

### Phase 6: Core finance schema and services

Deliver:

```text
currencies
exchange_rates
accounts
categories
tags
payees
payee aliases/mappings
budgets
transaction_groups
transaction_journals
transaction_postings
journal_meta
account_meta
balance_recalculation_queue
```

Services:

```text
create account
archive account
create expense
create income
create transfer
create split transaction
opening balance
account balance query
TransactionQueryService
```

Stop condition:

- ledger invariants pass
- account compatibility matrix is enforced
- cross-currency snapshot is stored
- account balances derive from postings
- SQLite and PostgreSQL behavior match

### Phase 7: Sync foundation

Deliver:

```text
device registration
sync push
sync pull
sync status
sync conflicts
operation log
revision tracking
outbox contracts
```

Stop condition:

- accepted sync operation calls normal service
- duplicate operation replays previous result
- revoked device cannot push
- stale base revision creates conflict
- permission failure is visible to outbox UI

### Phase 8: Frontend and PWA shell

Deliver:

```text
Vite React app
TanStack Router
TanStack Query
TanStack Form
API client
theme provider
i18n structure
permission helpers
layout shell
mobile navigation
PWA manifest/service worker
offline status
sync status
pending outbox count
conflict entry point
```

Stop condition:

- app loads
- login flow works
- dashboard shell works on mobile and desktop
- dark mode works
- service worker does not cache sensitive API responses

### Phase 9: Daily finance workflows

Build product features on the foundation:

```text
accounts UI
transaction create UI
transaction list
budgets
dashboard
reports
CSV import preview/commit/undo
rules
recurring
backup/restore CLI
maintenance commands
```

Each feature must include:

```text
API contract fixtures
service tests
SQLite/PostgreSQL tests if DB-sensitive
frontend loading/empty/error/offline/permission states
mobile layout
dark mode
docs update if contract changes
```

## First Commit Target

The first implementation commit should contain only foundation scaffolding:

```text
package.json
pnpm-workspace.yaml
tsconfig.base.json
apps/api/package.json
apps/web/package.json
packages/common/package.json
packages/db/package.json
packages/config/package.json
packages/authz/package.json
minimal lint/typecheck/test setup
```

Do not add finance feature code in the first scaffold commit.
