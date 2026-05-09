# Architecture

This document describes Fastifly's planned architecture.

Fastifly is a modern, self-hosted personal finance app. It should feel simple for daily use while being built on a serious ledger-ready foundation.

---

## Goals

Fastifly should be:

- easy to self-host
- fast to use every day
- mobile friendly
- PWA installable
- limited offline-write capable
- sync-ready from day one
- family/partner sharing ready
- multi-currency from day one
- SQLite-first and PostgreSQL-ready
- simple by default
- advanced when needed
- API-first
- permission-safe
- testable
- AI-agent friendly
- ready for deeper finance features over time

---

## Non-goals

Fastifly should not start as:

- a microservice system
- a Redis-dependent app
- a BullMQ-dependent app
- a Kafka/event-streaming system
- a GraphQL-first API
- a Next.js/Nuxt server-rendered app
- a React Native app
- a clone of another finance app
- a toy expense tracker with no ledger foundation

---

## System overview

Fastifly is a modular monolith.

```text
┌─────────────────────────────┐
│         Web App             │
│  Vite + React + TanStack    │
│  PWA shell                  │
└──────────────┬──────────────┘
               │ REST / JSON
               ▼
┌─────────────────────────────┐
│         Fastify API         │
│ routes, auth, authz, docs   │
└──────────────┬──────────────┘
               │ service calls
               ▼
┌─────────────────────────────┐
│       Domain Services       │
│ ledger, imports, budgets    │
└──────────────┬──────────────┘
               │ repositories
               ▼
┌─────────────────────────────┐
│       Database Layer        │
│ Drizzle + SQLite/Postgres   │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ SQLite or PostgreSQL        │
└─────────────────────────────┘
```

Production can serve the frontend as static files from the Fastify backend.

---

## Repository layout

```text
apps/
├── api/
│   ├── src/
│   │   ├── app.ts
│   │   ├── server.ts
│   │   ├── config/
│   │   ├── plugins/
│   │   ├── modules/
│   │   ├── events/
│   │   ├── jobs/
│   │   ├── cli/
│   │   └── shared/
│   └── package.json
│
└── web/
    ├── src/
    │   ├── app/
    │   ├── routes/
    │   ├── features/
    │   ├── components/
    │   ├── i18n/
    │   ├── theme/
    │   ├── pwa/
    │   └── lib/
    └── package.json

packages/
├── common/
│   ├── src/
│   │   ├── enums/
│   │   ├── schemas/
│   │   ├── types/
│   │   ├── ids/
│   │   ├── money/
│   │   ├── currency/
│   │   ├── ledger/
│   │   ├── periods/
│   │   ├── product-rules/
│   │   ├── search/
│   │   ├── rules/
│   │   ├── sync/
│   │   └── api/
│   └── package.json
│
├── authz/
│   ├── src/
│   │   ├── actions.ts
│   │   ├── subjects.ts
│   │   ├── roles.ts
│   │   ├── define-ability.ts
│   │   ├── policies.ts
│   │   └── index.ts
│   └── package.json
│
├── db/
│   ├── src/
│   │   ├── shared/
│   │   ├── sqlite/
│   │   └── postgres/
│   └── package.json
│
└── config/
    └── package.json
```

---

## Main packages

### `apps/api`

The Fastify backend.

Responsibilities:

- HTTP server
- route registration
- auth/session handling
- passkey/WebAuthn flows
- CASL authorization integration
- request/response validation
- OpenAPI documentation
- service orchestration
- domain events
- DB-backed job runner
- CLI commands
- static frontend serving in production

### `apps/web`

The Vite React frontend.

Responsibilities:

- UI routes
- TanStack Router
- TanStack Query
- TanStack Form
- dashboards
- reports
- account/transaction screens
- import workflow
- settings
- family/partner sharing screens
- mobile layout
- dark theme
- PWA manifest/service worker
- i18n integration

### `packages/common`

Shared pure TypeScript package.

Responsibilities:

- enums
- shared DTOs
- Zod schemas
- API contracts
- UUIDv7/text ID helpers
- money helpers
- currency helpers
- ledger invariants
- period utilities
- product-rule constants
- search/rule operators
- sync operation contracts
- shared error codes
- pagination contracts

Rules:

- no Fastify dependency
- no React dependency
- no Drizzle dependency
- no Node-only APIs
- no browser-only APIs

### `packages/authz`

Shared authorization package using CASL.

Responsibilities:

- roles
- actions
- subjects
- ability definitions
- CASL conditions
- contextual policy helpers
- frontend/backend shared permission logic

### `packages/db`

Database package.

Responsibilities:

- Drizzle schema definitions
- SQLite schema
- PostgreSQL schema
- migrations
- database client creation
- repository helpers
- dialect-specific query helpers

### `packages/config`

Shared configuration parsing and validation.

Responsibilities:

- environment variable schema
- common config types
- default values
- safe config validation

---

## Backend layers

Backend code follows this layering:

```text
routes
  -> services/use-cases
  -> repositories/query services
  -> database
```

### Routes

Routes are thin.

They handle:

- request validation
- auth checks
- CASL action checks
- calling a service
- formatting response

Routes should not:

- perform business logic
- calculate balances
- create ledger postings directly
- import Drizzle schema objects
- run long jobs inline

### Services

Services contain business logic.

Examples:

```text
AccountService
TransactionService
LedgerService
BudgetService
ImportService
RuleService
RecurringService
ReportService
MemberService
SettingsService
MaintenanceService
```

Services enforce invariants such as:

- balanced postings
- valid account-pair compatibility
- valid currency usage
- workspace ownership
- transaction immutability rules
- sync operation idempotency
- import idempotency
- recurring job idempotency
- last-owner protection
- reconciled transaction safety

### Repositories

Repositories hide database details.

Services should call repository interfaces.

Example:

```ts
export interface TransactionRepository {
  createGroup(input: CreateTransactionGroupInput): Promise<TransactionGroup>;
  getGroupById(input: ScopedIdInput): Promise<TransactionGroupDetail | null>;
  updateGroup(input: UpdateTransactionGroupInput): Promise<TransactionGroupDetail>;
}
```

### Query services

Complex read/query behavior should use query services.

Primary example:

```text
TransactionQueryService
```

This prevents list, report, export, search, import review, and rule test endpoints from implementing separate incompatible filters.

---

## Transaction architecture

Fastifly uses:

```text
transaction_groups
  └── transaction_journals
        └── transaction_postings
```

Meaning:

```text
transaction_group   = user-visible transaction container
transaction_journal = accounting event
transaction_posting = signed money movement
```

This supports:

- simple expense/income/transfer UI
- split transactions
- import grouping
- bulk edit
- clone/copy
- delete/void group
- expandable accounting details
- future transaction links
- recurring-generated groups

---

## Product-rule config package

Create:

```text
packages/common/src/product-rules
```

It centralizes:

- account kinds/subtypes
- source/destination account matrix
- transaction type inference
- dynamic account creation rules
- optional transaction fields
- journal metadata keys
- search operators
- rule actions
- bulk edit actions
- date range aliases
- attachment MIME allowlist
- upload size limits

Do not scatter product rules across routes, forms, services, and repositories.

---

## Ledger mutation boundary

All ledger-affecting mutations must use one mutation envelope and runner. This applies to REST routes, sync replay, imports, rules, recurring generation, bulk edits, reconciliation, and maintenance repairs.

Mutation envelope:

```text
request_id
actor_user_id
device_id nullable
workspace_id
ledger_id
idempotency_key nullable
base_revision nullable
source: rest | sync | import | rule | recurring | maintenance
dry_run
side_effect_flags
```

Side-effect flags:

```text
apply_rules
fire_webhooks
batch_submission
skip_notifications
recalculate_balances
```

Rules:

- acquire the per-ledger write boundary before mutating postings
- validate permissions at replay time, not only queue time
- reject writes against archived/read-only/maintenance ledgers
- persist idempotency receipts before returning success
- emit domain events only after the database commit
- never create a second write path for import, rules, recurring, or sync

---

## Workspace and ledger lifecycle

Workspaces and ledgers are product state, not just DB containers.

Recommended states:

```text
active
read_only
maintenance
pending_restore
restore_preview
archived
broken
```

State effects:

- `active`: normal reads and writes
- `read_only`: reads allowed, user writes blocked, maintenance reads allowed
- `maintenance`: only maintenance/restore/integrity commands run
- `pending_restore`: restore has been staged but not committed
- `restore_preview`: restored data is visible for verification before destructive replacement
- `archived`: hidden from normal workflows, retained for audit/export
- `broken`: app blocks writes until integrity or migration issue is resolved

Sync, jobs, imports, recurring generation, and API mutations must check these states before changing ledger data.

---

## Account compatibility

Transaction creation must enforce source/destination compatibility through shared product rules.

Minimum matrix:

```text
asset/liability        -> expense/external        = expense
revenue/external       -> asset/liability         = income
asset/liability        -> asset/liability         = transfer
equity/opening helper  -> asset/liability         = opening balance
reconciliation helper  -> asset/liability         = reconciliation
```

Compatibility is enforced in services, not only UI.

---

## Domain events

Fastifly uses domain events to avoid CRUD-only service sprawl.

Events:

```text
transaction.created
transaction.updated
transaction.deleted
transaction.reconciled
account.created
account.updated
budget.updated
rule.action_failed
recurring.generated
import.committed
workspace_member.invited
workspace_member.role_changed
exchange_rate.updated
backup.restored
```

Listeners own:

- audit log creation
- balance dirtying/recalculation scheduling
- report/cache invalidation
- rule execution when requested
- notification creation later
- webhook message creation later
- job enqueueing

### Mutation flags

Transaction/account mutations may accept side-effect flags:

```text
applyRules
fireWebhooks
batchSubmission
skipNotifications
recalculateBalances
```

Some may be no-ops in v0.1.

---

## Balance dirtying and recalculation

Balances are derived from postings.

If snapshots/caches are introduced, they are rebuildable.

Dirtying occurs when:

- amount changes
- account changes
- date/order changes
- currency/reporting amount changes
- transaction is deleted/voided
- transaction is reconciled/unreconciled
- exchange rate changes
- import batch is committed/undone

Recalculation starts from the earliest affected occurred date.

Commands:

```bash
fastifly maintenance recalculate-balances
fastifly maintenance recalculate-reporting-amounts
```

---

## Shared period service

Create:

```text
packages/common/src/periods
```

It supports:

```text
daily
weekly
monthly
quarterly
half-year
yearly
last7
last30
last90
last365
MTD
QTD
YTD
custom
```

Consumers:

- dashboard
- reports
- budgets
- recurring jobs
- charts
- import summaries
- future bills/subscriptions

---

## Authorization architecture

Fastifly uses CASL.

Pattern:

```text
CASL ability      → can this role perform this action on this object?
Custom policy     → is this action safe in the current business/domain context?
Repository filter → is data scoped by workspace_id and ledger_id?
```

Backend must enforce authorization. Frontend permission checks are only UX helpers.

Every user-owned query must filter by:

```text
workspace_id
ledger_id
```

where applicable.

---

## Family/partner sharing

Fastifly supports workspace sharing from day one.

Roles:

```text
owner
admin
editor
viewer
```

Invitations use copyable links, not email.

No email support is required.

Member management is available under:

```text
Settings → Members
```

---

## Authentication architecture

v0.1 auth:

```text
username/password
passkey
```

No email dependency.

Requirements:

- username login
- secure password hashing
- passkey registration/login
- recovery codes
- admin CLI reset
- HttpOnly sessions
- login rate limiting
- CSRF strategy for cookie-auth requests

---

## Job system

Fastifly uses DB-backed jobs only.

No Redis.  
No BullMQ.  
No Kafka.

Jobs:

```text
csv.import.parse
csv.import.commit
rules.apply
recurring.generate
reports.recalculate
sessions.cleanup
exchange-rates.refresh
sqlite.backup
maintenance.recalculate-balances
maintenance.recalculate-reporting-amounts
```

Default runtime:

```text
APP_ROLE=all
```

Future possible roles:

```text
APP_ROLE=api
APP_ROLE=worker
```

---

## API architecture

Use REST.

Base path:

```text
/api/v1
```

Docs:

```text
/api/openapi.json
/api/docs
```

Rules:

- all endpoints have request validation
- all endpoints have response validation where practical
- money values are strings
- IDs are strings
- errors use standard error shape
- nested validation errors map to dotted paths
- write operations support idempotency where needed
- pagination is consistent
- response contracts have fixtures for high-risk resources

---

## Sync and offline architecture

Fastifly v0.1 includes a limited, ledger-safe offline write path. This is not full collaborative CRDT sync and it is not raw table replication.

Principles:

- synced domain IDs are client-generated UUIDv7 strings
- each browser install registers a device
- offline writes are stored as versioned domain commands in an outbox
- the server validates every pushed command through normal services
- accepted commands append to a workspace/ledger operation log
- push/pull sync uses monotonic revisions
- conflicts are explicit and user-reviewable
- reconciled, import, restore, member, and maintenance operations are blocked offline unless a later ADR explicitly allows them

Core flow:

```text
User action
  -> shared validation
  -> local read model update
  -> outbox command
  -> /api/v1/sync/push when online
  -> LedgerMutationRunner on server
  -> operation log append
  -> /api/v1/sync/pull on other devices
```

Allowed offline writes in v0.1:

```text
transaction_group.create_expense.v1
transaction_group.create_income.v1
transaction_group.create_transfer.v1
category.create.v1
budget.assign_category_month.v1
```

Blocked offline in v0.1:

```text
transaction updates to reconciled data
transaction delete/void
import commit
recurring generation
backup restore
workspace/member changes
permission changes
exchange-rate changes
maintenance/correction commands
```

Sync operation names are domain commands, not raw CRUD patches. For example:

```text
transaction_group.create_expense.v1
transaction_group.create_transfer.v1
import_batch.commit.v1
recurring.generate_due.v1
```

This preserves the ledger model:

```text
command
  -> service/use-case
  -> transaction_groups
  -> transaction_journals
  -> transaction_postings
```

### LedgerMutationRunner

All ledger-affecting writes, including sync pushes, go through one runner.

Responsibilities:

- authenticate actor and device
- authorize workspace/ledger access
- acquire per-ledger write boundary
- check idempotency and operation replay
- validate base revision where required
- call service/use-case
- enforce ledger invariants
- persist operation/change log
- collect domain events
- commit once
- dispatch post-commit jobs/events
- store replay response for idempotency

This prevents the offline path from bypassing business rules.

---

## Frontend architecture

Frontend uses:

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
CASL React helpers
```

UI principles:

- simple by default
- advanced when needed
- mobile first
- dark theme
- multi-language ready
- PWA installable
- no desktop-only workflows

---

## Simple and advanced UI model

Fastifly uses one engine with multiple UI depths.

```text
Simple view
  -> daily tracking and common workflows

Advanced view
  -> ledger, imports, rules, reconciliation, deep reports
```

Do not build separate apps.

Use progressive disclosure:

```text
basic form
  -> advanced options
  -> full ledger/accounting details
```

---

## PWA and mobile architecture

Path:

```text
Vite React web app
        ↓
installable PWA
        ↓
Capacitor Android/iOS wrapper later
```

v0.1 PWA:

- manifest
- icons
- service worker
- app shell caching
- offline indicator
- update prompt
- local outbox for allowed offline commands
- sync status and conflict UI

Do not use React Native now.

---

## Deployment architecture

First supported deployment method:

```text
Docker Compose
```

Modes:

```text
app + SQLite
app + PostgreSQL 18
```

Production migrations are manual.

No email server required.  
No telemetry.  
No external queue.

---

## Semantic maintenance architecture

Fastifly distinguishes:

```text
schema migration
semantic upgrade
correction
integrity report
maintenance recalculation
```

Commands:

```bash
fastifly integrity report
fastifly integrity sums
fastifly integrity env

fastifly correction amounts
fastifly correction currencies
fastifly correction balances
fastifly correction orphaned-records
fastifly correction transfer-budgets
fastifly correction recurring

fastifly maintenance recalculate-balances
fastifly maintenance recalculate-reporting-amounts
```

---

## Observability

Use structured logs.

Each request should include:

- request ID
- method
- path
- status code
- duration
- user ID where available
- workspace ID where available

Sync logs should include:

- request ID
- workspace ID
- ledger ID
- device ID
- operation count
- accepted count
- rejected count
- conflict count
- from revision
- to revision
- duration in milliseconds

Health endpoints:

```text
GET /health
GET /ready
```

Do not log secrets or sensitive raw financial file contents.

---

## Testing architecture

Required test layers:

```text
unit tests
service tests
repository tests
API tests
database tests
ledger invariant tests
contract fixture tests
frontend component tests
E2E tests
```

Database tests must run on:

```text
SQLite
PostgreSQL
```

Critical invariants:

- postings balance
- account compatibility enforced
- account balances match postings
- money uses integer minor units
- cross-currency values preserve exchange snapshots
- imports are idempotent
- recurring jobs are idempotent
- duplicate sync operations are idempotent
- stale sync updates create conflicts
- workspace isolation works
- ledger isolation works
- CASL roles work

---

## Architecture decision records

Major changes should be recorded in:

```text
docs/decisions/
```

Use ADRs for:

- adding a required service
- adding a queue system
- changing database strategy
- adding GraphQL
- changing auth strategy
- changing frontend framework
- changing deployment model
- changing license
- adding native app architecture
