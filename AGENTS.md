# AGENTS.md

This file defines development rules for AI coding agents and human contributors working on Fastifly.

Fastifly is a modern, self-hosted personal finance app. The UI should be simple by default, but the backend must be designed for serious finance workflows from day one.

---

## Prime directive

Do not build a toy expense tracker.

Build a simple user experience on top of a ledger-safe finance engine.

```text
Simple UI.
Serious data model.
Safe money handling.
Portable database design.
```

---

## Canonical documentation

Use the latest canonical docs only when implementing or changing architecture.

Read these first:

```text
docs/README.md
docs/specs/architecture-v2.md
docs/specs/database-v2.md
docs/specs/api-v2.md
docs/specs/frontend-v2.md
docs/specs/implementation-start.md
docs/specs/sync-v1.md
docs/specs/pwa-mobile.md
docs/specs/maintenance-v2.md
docs/specs/backup-restore.md
docs/specs/deployment.md
docs/prd/
docs/specs/consistency-review.md
```

Raw docs:

```text
ts/raw-docs/
```

Raw docs are research evidence and historical notes. They are not the product spec. If raw docs and latest docs disagree, latest docs win.

---

## Before implementation

Before writing feature code, verify these are true for the area you touch:

1. Latest docs define the behavior.
2. Money representation is string API amounts, `bigint` internal math, and integer minor units in DB.
3. Synced domain objects use UUIDv7-compatible text IDs.
4. SQLite and PostgreSQL are both accounted for.
5. Workspace and ledger scoping are explicit.
6. Permission checks use shared authz/service policies.
7. Ledger-affecting writes go through the shared mutation boundary.
8. Sync replay, idempotency, and conflict behavior are considered.
9. API request/response schemas and error shapes are stable.
10. Tests cover the behavior at the lowest useful layer.

If a required behavior is not documented, update the latest canonical doc before implementing.

---

## Project stack

Use the agreed stack unless an architecture decision record changes it.

### Backend

```text
Node.js 24 LTS
TypeScript
Fastify
Zod v4
Drizzle ORM v1 beta/RC
SQLite
PostgreSQL 18
better-sqlite3
postgres.js
DB-backed jobs
OpenAPI + Scalar
```

### Frontend

```text
Vite
React
TypeScript
TanStack Router
TanStack Query
TanStack Form
Zod v4
Tailwind CSS
shadcn/ui
i18n-ready architecture
```

### Do not add by default

Do not add these without an ADR:

```text
Redis
BullMQ
Kafka
RabbitMQ
Elasticsearch
OpenSearch
microservices
GraphQL
Next.js server mode
Nuxt server mode
server-side frontend runtime
```

---

## Required architecture

Fastifly is a modular monolith.

```text
apps/
├── api/
└── web/

packages/
├── common/
├── authz/
├── db/
├── config/
```

Backend flow:

```text
Fastify route
  -> service/use-case
  -> repository
  -> database
```

Frontend flow:

```text
route/component
  -> TanStack Form / TanStack Query
  -> generated or shared API client
  -> Fastify API
```

Shared contracts:

```text
packages/common
  -> enums
  -> types
  -> Zod schemas
  -> money helpers
  -> UUIDv7/text ID helpers
  -> currency helpers
  -> ledger invariants
  -> product rules
  -> sync operation contracts
  -> API contracts
```

---

## Non-negotiable finance rules

### 1. Never use floats for money

Never store, calculate, or compare money as floating point values.

Wrong:

```ts
const amount = 125.5;
```

Right:

```ts
const amountMinor = 12550n;
const currencyCode = "INR";
```

API values may need to be strings:

```json
{
  "amountMinor": "12550",
  "currencyCode": "INR"
}
```

### 2. Every financial amount must have a currency

Wrong:

```ts
{ amountMinor: "12550" }
```

Right:

```ts
{ amountMinor: "12550", currencyCode: "INR" }
```

### 3. Ledger postings must balance

Transaction journals must be internally valid.

For same-currency journals:

```text
sum(postings.amount_minor) = 0
```

For cross-currency journals:

```text
original amounts must be preserved
reporting/base currency amounts must balance
exchange-rate snapshot must be stored
```

### 4. Account balances are derived

Do not store current account balance as the source of truth.

Balance should be derived from postings or maintained as a verified cache/snapshot.

### 5. Reconciled data is sensitive

Editing reconciled transactions should require explicit handling and tests.

### 6. Synced IDs are generated before persistence

Use UUIDv7-compatible text IDs for synced domain objects.

Do not use auto-increment IDs for objects that may be created through normal API writes, imports, or approved offline commands.

### 7. Use the transaction group model

Visible transactions are groups:

```text
transaction_groups
  -> transaction_journals
  -> transaction_postings
```

Do not implement a flat `transactions` table as the source of truth.

### 8. Offline sync is command-based

Approved offline writes go through a local command outbox and server sync replay.

Do not implement raw row patch sync.

Do not broaden offline support without updating `docs/specs/sync-v1.md`, `docs/specs/api-v2.md`, and `docs/specs/database-v2.md`.

---

## Code quality and anti-hallucination rules

Code must be boring, explicit, and traceable to the docs.

### Linting, formatting, and TypeScript checking

Use Biome for formatting, import organization, and non-semantic lint rules.

Use `tsgo` from `@typescript/native-preview` for fast local type-checking when available.

Use `tsc` for build/declaration output until `tsgo` has the required emit/project-reference parity.

Required script split:

```text
lint           -> biome check .
lint:fix       -> biome check --write .
format         -> biome format --write .
typecheck      -> tsgo
typecheck:tsc  -> tsc fallback/parity check
build          -> tsc or bundler build that emits artifacts
```

### Do not invent architecture

Before creating a new package, table, endpoint, enum, job type, permission action, or sync operation:

1. Search the latest docs.
2. Search existing code.
3. Reuse the established contract if it exists.
4. If it does not exist, add or update the relevant latest doc first.

Do not invent names, routes, status values, or schema fields from memory.

### No fake implementation

Do not add placeholder logic that looks real.

Forbidden:

```text
TODO-only service methods
fake balance calculations
mock permission checks in production code
empty catch blocks
silent fallbacks for money parsing
unvalidated JSON blobs for domain data
temporary in-memory stores for persisted features
```

If a feature is not implemented, fail explicitly with a typed error or keep it out of the route/UI.

### Keep domain logic centralized

Do not duplicate business rules across:

```text
React components
Fastify route handlers
SQLite repositories
PostgreSQL repositories
sync replay handlers
import handlers
job handlers
```

Shared rules belong in services, `packages/common`, or documented policy helpers.

### Strong typing required

Use precise types.

Avoid:

```text
any
unknown without narrowing
stringly typed status values outside shared enums
untyped JSON payloads
unchecked casts
```

Acceptable exceptions must be small, local, justified in code, and tested.

### Validate boundaries

Validate at every external boundary:

```text
HTTP body/query/params
sync operation payloads
job payloads
import rows
environment variables
backup metadata
CLI arguments
```

Use shared Zod schemas where possible.

### Fail closed

For finance, auth, permissions, backup, restore, sync, and imports:

- unknown status means reject
- unknown permission means deny
- invalid money means reject
- invalid account pair means reject
- stale sync base revision means conflict
- pending migration means unhealthy readiness

Do not silently coerce unsafe input.

### Keep implementation reviewable

Prefer small services and explicit control flow.

Do not add clever abstractions unless they remove real duplication already visible in the codebase.

Every non-trivial implementation should include tests and doc updates when contracts change.

### Implementation review

Every non-trivial implementation slice must be reviewed before moving on.

This includes:

- phase transitions
- new packages
- new dependencies
- database schema or migration changes
- auth, security, permission, sync, money, backup, restore, import, or ledger logic
- public API contract changes

The review must use both:

- Context7 for current library/framework documentation
- current online sources, preferring official docs, release notes, and package READMEs

Run three separate review cycles:

1. CTO review: architecture fit, sequencing, long-term risk, missing foundations.
2. Senior software engineer review: correctness, type safety, tests, dependency usage, maintainability.
3. User review: workflow usefulness, visible behavior, confusing gaps, product expectations.

Do not create review files.

Fix issues immediately when they are in scope for the current slice.

If a valid issue should be fixed later, record it in `docs/issues/` with:

- issue title
- why it matters
- affected docs/code
- suggested fix
- blocking milestone

Do not continue past the slice until in-scope findings are fixed and deferred findings are captured in `docs/issues/`.

---

## UI rules

### Simple by default

Default screens should not expose accounting terms unnecessarily.

Good simple labels:

```text
Expense
Income
Transfer
Account
Category
Budget
Report
```

Avoid showing these to beginners unless needed:

```text
journal
posting
debit
credit
equity
contra account
```

### Advanced when needed

Every advanced feature should be discoverable but not noisy.

Use:

```text
More options
Advanced details
Show ledger entry
Advanced table
```

Do not create two separate apps. Create one app with simple and advanced views.

### Mobile first

Every screen must work on mobile.

Required states:

```text
loading
empty
error
success
disabled
offline/failure where relevant
```

### Dark theme

All UI must work in light and dark themes.

Use Tailwind and shadcn/ui theme tokens. Do not hardcode colors that break dark mode.

### Multi-language ready

Do not hardcode user-facing text when adding new UI.

Use the i18n structure once available.

---

## Backend rules

### Routes

Routes may:

- validate request
- check auth
- call service
- return response

Routes must not:

- contain transaction accounting logic
- call Drizzle directly
- calculate balances directly
- perform long-running imports directly
- duplicate validation from shared schemas

### Services

Services own business rules.

Examples:

```text
createExpense
createIncome
createTransfer
createSplitTransaction
commitImportBatch
applyRules
generateRecurringTransactions
calculateReport
```

Ledger-affecting services must run through the shared mutation envelope/runner described in `docs/specs/architecture-v2.md`.

The runner owns:

```text
request context
workspace/ledger scope
permission check
idempotency
base revision check
domain events
balance dirtying
sync operation log
post-commit jobs
```

### Repositories

Repositories own database access.

Services should call repository interfaces, not Drizzle table objects.

### Background jobs

Use DB-backed jobs only for now.

Do not introduce BullMQ or Redis.

Long-running work should not happen in HTTP request handlers.

Use jobs for:

```text
CSV import parse
CSV import commit
rule application
recurring transaction generation
report recalculation
session cleanup
exchange-rate refresh
backup tasks
```

Job payloads must be schema-validated. Jobs must be idempotent or have a dedupe key.

---

## Database rules

Fastifly supports both SQLite and PostgreSQL.

### Dialect-specific schemas are allowed

Drizzle schema files may be dialect-specific:

```text
packages/db/src/sqlite/
packages/db/src/postgres/
```

This is acceptable because Drizzle uses dialect-specific builders.

### Business logic must not be duplicated

Do not duplicate services for SQLite and PostgreSQL.

Allowed:

```text
sqlite schema
postgres schema
sqlite migration
postgres migration
dialect-specific repository query optimization
```

Not allowed:

```text
sqlite transaction service
postgres transaction service
duplicated ledger logic
duplicated validation logic
duplicated API logic
```

### Use shared common contracts

Enums, Zod schemas, DTOs, and money/ledger helpers should live in `packages/common`.

Product rules should also live in `packages/common`, including:

```text
account kinds/subtypes
source/destination account matrix
transaction type inference
sync operation names
rule/search operators
bulk edit actions
date range aliases
```

### Test both databases

Any database-sensitive feature must be tested against SQLite and PostgreSQL.

---

## Validation rules

Use Zod v4 for shared validation.

Validation belongs in:

```text
packages/common/src/schemas
```

Fastify routes should reuse shared schemas where possible.

Frontend forms should reuse shared schemas where possible.

Do not create separate incompatible frontend/backend validation rules.

---

## API rules

Use REST first.

API routes should be versioned:

```text
/api/v1
```

Every endpoint must have:

- request validation
- response validation
- stable error shape
- OpenAPI documentation
- workspace/ledger scoping where applicable
- permission enforcement where applicable
- idempotency behavior for retryable writes

Standard error shape:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {},
    "requestId": "req_..."
  }
}
```

---

## Sync rules

v0.1 includes limited offline command sync.

Approved offline commands:

```text
transaction_group.create_expense.v1
transaction_group.create_income.v1
transaction_group.create_transfer.v1
category.create.v1
budget.assign_category_month.v1
```

All other writes are online-only unless `docs/specs/sync-v1.md`, `docs/specs/api-v2.md`, and `docs/specs/database-v2.md` are updated.

Sync replay must:

- authenticate user and device
- reject revoked devices
- re-check current workspace membership and permissions
- check workspace/ledger lifecycle state
- validate operation schema
- enforce idempotency
- call normal domain services
- create explicit conflict records when needed

Do not create sync-only business logic.

---

## Security rules

Never log:

```text
passwords
session tokens
API tokens
bank credentials
raw secrets
full authorization headers
```

Authentication defaults:

```text
HttpOnly cookies
secure cookies in production
SameSite=Lax or Strict
server-side sessions
password hashing with Argon2id or approved alternative
```

All user-owned data must be scoped by workspace/ledger ownership.

---

## Testing rules

### Browser and UI testing

Use Playwright MCP for browser UI testing, manual visual QA, responsive checks,
and page-flow verification.

Do not run ad-hoc downloaded Playwright commands such as:

```text
pnpm dlx playwright ...
npx playwright ...
```

Do not add Playwright dependencies or download Playwright browsers unless the
user explicitly approves that change. If Playwright MCP is unavailable, report
the blocker and use only existing repo-local verification commands until the
MCP server is available.

Required test types:

```text
unit tests
service tests
repository tests
API tests
database tests
ledger invariant tests
frontend component tests
E2E tests where useful
```

Required ledger tests:

```text
expense balances correctly
income balances correctly
transfer balances correctly
split transaction balances correctly
cross-currency transaction stores exchange snapshot
account balance equals posting sum
import commit is idempotent
recurring job is idempotent
reconciled transaction edit is guarded
sync operation replay is idempotent
stale sync operation creates conflict
permission failure during sync replay is visible
```

Required quality tests for new shared behavior:

```text
invalid input rejects clearly
permission denial is enforced server-side
SQLite and PostgreSQL behavior match
API contract fixture stays stable
money parsing rejects unsafe values
idempotency replay returns previous result
```

---

## Dependency rules

Before adding a dependency, check:

1. Is it needed?
2. Can the platform or existing dependency do it?
3. Does it increase runtime memory/CPU?
4. Does it add a required service?
5. Does it work with SQLite and PostgreSQL?
6. Does it work well with AI agents and TypeScript?
7. Is it actively maintained?
8. Does it have a compatible license?

Do not add heavy infrastructure for future possibilities.

---

## File placement rules

Use this placement:

```text
packages/common
  shared pure TypeScript only

packages/db
  Drizzle schemas, migrations, db clients, repository helpers

apps/api
  Fastify server, routes, services, jobs

apps/web
  React UI, routes, components, frontend features

docs
  latest canonical docs, PRDs, deployment, backup/restore, decisions
```

`packages/common` must not depend on Fastify, React, Drizzle, filesystem APIs, or browser-only APIs.

---

## Documentation rules

Update docs when changing:

```text
environment variables
database schema
API behavior
architecture rules
deployment behavior
security-sensitive behavior
money handling
ledger behavior
sync behavior
permission behavior
backup/restore behavior
public API contracts
```

Update latest-version docs only.

---

## Forbidden shortcuts

Do not:

- store money as float
- skip PostgreSQL support when changing database code
- skip SQLite support when changing database code
- put business logic in React components
- put business logic in Fastify route handlers
- create separate SQLite and PostgreSQL business services
- add Redis/BullMQ “just in case”
- add raw row sync
- add auto-increment IDs for synced domain objects
- bypass the ledger mutation runner for financial writes
- bypass permission checks in sync, jobs, imports, or maintenance
- invent APIs/tables/enums that are not in latest docs
- leave fake production logic behind a TODO
- hide advanced transaction complexity incorrectly
- copy UI/assets/text from other finance apps
- ignore mobile layout
- ignore dark mode
- hardcode user-visible strings everywhere

---

## Preferred behavior for AI agents

When asked to implement a feature:

1. Read the relevant latest docs.
2. Check existing shared schemas/enums/product rules first.
3. Add or update common types if needed.
4. Add database schema/migrations for both SQLite and PostgreSQL if needed.
5. Add repository methods.
6. Add service logic through the correct mutation boundary.
7. Add Fastify route.
8. Add frontend API/query/form code.
9. Add UI with loading/empty/error/offline/permission states.
10. Add tests.
11. Update latest docs if contracts changed.

When uncertain, choose correctness and simplicity over clever abstractions.
