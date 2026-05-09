# Architecture

This document describes the planned architecture for Fastifly.

Fastifly is a modern, self-hosted personal finance app. It should feel simple for daily use while being built on a serious ledger-ready foundation.

---

## Goals

Fastifly should be:

- easy to self-host
- fast to use every day
- mobile friendly
- multi-currency from day one
- SQLite-first but PostgreSQL-ready
- client-generated IDs for synced domain objects
- device-scoped limited offline writes from day one
- simple by default
- advanced when needed
- API-first
- testable
- agent-friendly
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
- a clone of another finance app
- a toy expense tracker with no ledger foundation

---

## System overview

Fastifly is a modular monolith.

```text
┌─────────────────────────────┐
│         Web App             │
│  Vite + React + TanStack    │
└──────────────┬──────────────┘
               │ REST / JSON
               ▼
┌─────────────────────────────┐
│         Fastify API         │
│  routes, auth, validation   │
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
│   │   ├── jobs/
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
    │   └── lib/
    └── package.json

packages/
├── common/
│   ├── src/
│   │   ├── enums/
│   │   ├── schemas/
│   │   ├── types/
│   │   ├── money/
│   │   ├── currency/
│   │   ├── ledger/
│   │   ├── ids/
│   │   ├── sync/
│   │   └── api/
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
- request/response validation
- OpenAPI documentation
- service orchestration
- background job runner
- static frontend serving in production

### `apps/web`

The Vite React frontend.

Responsibilities:

- UI routes
- forms
- dashboards
- reports
- account/transaction screens
- import workflow
- settings
- mobile layout
- dark theme
- i18n integration

### `packages/common`

Shared pure TypeScript package.

Responsibilities:

- enums
- shared DTOs
- Zod schemas
- API contracts
- money helpers
- currency helpers
- ledger invariants
- UUIDv7-compatible ID helpers
- sync operation contracts
- shared error codes
- pagination contracts

Rules:

- no Fastify dependency
- no React dependency
- no Drizzle dependency
- no Node-only APIs
- no browser-only APIs

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

## Sync and offline writes

v0.1 should include sync infrastructure now, not only as a future hook.

The supported model is limited offline command sync, not table replication or CRDT collaboration.

Core rules:

- synced domain objects use client-generated UUIDv7-compatible text IDs
- each installed client registers a device
- allowed offline writes are stored as versioned domain commands in a local outbox
- sync push replays those commands through normal backend services
- the backend writes an operation log and advances ledger revisions
- pull returns accepted operations since the client's last revision
- conflicts are explicit records, not silent overwrites

Allowed offline commands in v0.1:

```text
transaction_group.create_expense.v1
transaction_group.create_income.v1
transaction_group.create_transfer.v1
category.create.v1
budget.assign_category_month.v1
```

Unsafe offline actions remain blocked: reconciled updates, deletes/voids, import commits, recurring generation, workspace/member/permission changes, exchange-rate updates, and maintenance/correction commands.

Detailed contracts are defined in `docs/sync-v1.md`, `docs/api-v2.md`, and `docs/database-v2.md`.

---

## Backend layers

Backend code follows this layering:

```text
routes
  -> services/use-cases
  -> repositories
  -> database
```

### Routes

Routes are thin.

They handle:

- request validation
- auth checks
- calling a service
- formatting response

They should not:

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
SettingsService
```

Services enforce invariants such as:

- balanced postings
- valid currency usage
- workspace ownership
- transaction immutability rules
- import idempotency
- recurring job idempotency

### Repositories

Repositories hide database details.

Services should call repository interfaces.

Example:

```ts
export interface TransactionRepository {
  createJournal(input: CreateJournalInput): Promise<TransactionJournal>;
  listTransactions(input: TransactionListInput): Promise<Paginated<TransactionRow>>;
  getAccountBalance(input: AccountBalanceInput): Promise<MoneyAmount>;
}
```

SQLite and PostgreSQL may have different repository implementations or optimized query helpers, but service logic should remain shared.

---

## Frontend architecture

Frontend code should be organized by feature.

```text
apps/web/src/
├── routes/
├── features/
│   ├── accounts/
│   ├── transactions/
│   ├── budgets/
│   ├── imports/
│   ├── reports/
│   └── settings/
├── components/
├── lib/
├── i18n/
└── theme/
```

### State management

Use TanStack Query for server state.

Avoid duplicating server state in custom stores.

Use local component state for UI-only state.

### Forms

Use TanStack Form.

Use shared Zod schemas from `packages/common` whenever possible.

### Routing

Use TanStack Router.

Routes should be typed and organized around app sections.

### UI design

Use Tailwind CSS and shadcn/ui.

UI requirements:

- mobile responsive
- dark theme compatible
- accessible components
- loading/empty/error states
- progressive disclosure for advanced fields

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

Examples:

### Transaction form

Simple:

```text
Amount
Account
Category
Date
Description
Save
```

Advanced:

```text
Tags
Payee
Notes
Status
Exchange rate
Split details
Ledger postings
Import reference
```

### Navigation

Simple navigation:

```text
Dashboard
Transactions
Accounts
Budgets
Reports
Settings
```

Advanced navigation:

```text
Dashboard
Transactions
Ledger
Accounts
Budgets
Reports
Imports
Rules
Recurring
Currencies
Admin
Settings
```

---

## Domain modules

Planned backend modules:

```text
auth
users
workspaces
ledgers
accounts
transactions
categories
tags
budgets
imports
rules
recurring
reports
jobs
settings
audit
```

### Auth

Responsibilities:

- registration
- login
- logout
- session management
- password hashing
- user identity

Default browser auth should use server-side sessions and HttpOnly cookies.

### Workspaces

A workspace groups users and financial data.

Future use cases:

- personal workspace
- family workspace
- business workspace
- shared access

### Ledgers

A ledger is a book of financial records within a workspace.

Ledgers enable future support for:

- personal ledger
- business ledger
- family ledger
- imported ledger
- investment ledger

### Accounts

Accounts represent places or categories where money moves.

User-friendly examples:

```text
Bank
Cash
Wallet
Credit Card
Loan
Investment
```

Accounting-style kinds:

```text
asset
liability
revenue
expense
equity
```

### Transactions

Transactions are represented internally as journals and postings.

Simple UI types:

```text
expense
income
transfer
```

Internal model:

```text
transaction_journals
transaction_postings
```

### Imports

Imports should support:

- upload
- parsing
- mapping
- preview
- duplicate detection
- rule preview
- commit
- undo batch

Large imports should run through DB-backed jobs.

### Rules

Rules automate transaction cleanup.

Simple rule:

```text
When description contains "Uber", set category to Travel.
```

Advanced rule:

```text
(description contains "Uber" OR description contains "Ola")
AND amount < 3000
THEN set category = Travel
```

### Reports

Reports should start simple:

- monthly summary
- cashflow
- category breakdown
- account balances

Later reports:

- net worth
- budget trends
- multi-currency exposure
- unreconciled transactions
- audit warnings

---

## Job system

Fastifly uses a DB-backed job queue.

No Redis or BullMQ in the initial architecture.

Jobs are useful for:

```text
csv.import.parse
csv.import.commit
rules.apply
recurring.generate
reports.recalculate
sessions.cleanup
exchange-rates.refresh
sqlite.backup
```

The job system should support:

- pending/running/completed/failed states
- retry count
- max attempts
- priority
- dedupe key
- scheduled availability
- lock owner
- error message

In development and simple deployments, API and worker can run in one process.

Future option:

```text
APP_ROLE=api
APP_ROLE=worker
APP_ROLE=all
```

---

## API architecture

Use REST.

Base path:

```text
/api/v1
```

Documentation:

```text
/api/openapi.json
/api/docs
```

Standard response principles:

- predictable JSON
- typed DTOs
- stable error shape
- pagination for lists
- request ID in errors
- consistent date and money formats

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

## Configuration

Configuration should be validated at startup.

Common environment variables:

```env
APP_ENV=development
APP_PORT=3000
APP_URL=http://localhost:3000

DATABASE_DRIVER=sqlite
DATABASE_URL=./data/fastifly.db

SESSION_SECRET=change-me
COOKIE_SECURE=false

LOG_LEVEL=debug
AUTO_MIGRATE=true
```

Supported database drivers:

```text
sqlite
postgres
```

---

## Deployment model

Initial deployment targets:

```text
Docker with SQLite
Docker Compose with PostgreSQL
manual Node.js process
```

Simple deployment:

```text
Fastifly app + SQLite file
```

Advanced deployment:

```text
Fastifly app + PostgreSQL
```

Do not require Redis or external queues for normal operation.

---

## Observability

Use structured logging.

Each request should include:

- request ID
- method
- path
- status code
- duration
- user ID where available
- workspace ID where available

Do not log secrets.

Future additions:

- metrics endpoint
- health checks
- job dashboard
- audit event viewer

---

## Security architecture

Security principles:

- server-side sessions
- HttpOnly cookies
- secure cookies in production
- strong password hashing
- workspace/ledger data isolation
- strict file import handling
- no secrets in logs
- audit sensitive actions

Sensitive actions:

- login/logout
- password change
- session revoke
- transaction edit/delete
- reconciled transaction edit
- import commit/undo
- backup restore
- API token creation

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
frontend component tests
E2E tests
```

Database-related tests should run against both SQLite and PostgreSQL.

Critical invariants:

- postings balance
- account balances match postings
- money is integer minor units
- cross-currency values preserve exchange snapshots
- imports are idempotent
- recurring jobs are idempotent
- workspace isolation works

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
