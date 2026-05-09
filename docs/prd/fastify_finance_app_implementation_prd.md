# Implementation PRD: Modern SQLite/PostgreSQL Personal Finance App

**Working title:** FinLite / LedgerLite / PocketLedger  
**Document type:** Product + implementation requirements specification  
**Version:** 1.0  
**Date:** 2026-05-05  
**Primary stack:** Fastify + TypeScript + Drizzle + SQLite/PostgreSQL + Vite React  
**Status:** Implementation-ready draft

---

## 1. Executive summary

Build a modern, self-hosted personal finance application that launches quickly with an easy user experience but is architected from day one for Firefly-level feature depth over time.

The product should feel simple for normal users:

- Add income.
- Add expense.
- Transfer money.
- See account balances.
- Track budgets.
- Import CSV files.
- View clean reports.

Internally, it must be built as a serious ledger system:

- Multi-ledger ready from day one.
- Double-entry-compatible transaction model from day one.
- Multi-currency from day one.
- SQLite and PostgreSQL from day one.
- Client-generated UUIDv7-compatible IDs for synced domain objects from day one.
- Limited offline command sync from day one.
- Mobile-first, dark-theme-first, multilingual-ready UI from day one.
- Shared contracts, shared Zod schemas, shared enums, and shared money/ledger logic from day one.

The app should be easy to run:

```text
Simple install:     app + SQLite
Advanced install:   app + PostgreSQL 18
Not included now:   Redis, BullMQ, microservices, external queue dependency
```

The guiding rule is:

```text
Lite = faster launch and easier UX.
Lite does not mean weak architecture.
```

---

## 2. Core technical decisions

### 2.1 Final stack

| Area | Decision |
|---|---|
| Runtime | Node.js 24 LTS |
| Language | TypeScript |
| Backend framework | Fastify |
| Validation | Zod v4 |
| ORM/query layer | Drizzle ORM v1 beta/RC, isolated behind repositories |
| Databases | SQLite + PostgreSQL 18 from v0.1 |
| SQLite driver | `better-sqlite3`, latest compatible version pinned in lockfile |
| PostgreSQL driver | `postgres` / postgres.js |
| Frontend | Vite + React + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| Routing | TanStack Router |
| Server state | TanStack Query |
| Forms | TanStack Form + Zod v4 |
| Tables | TanStack Table |
| Charts | Apache ECharts initially; Recharts allowed for simple charts |
| Internationalization | i18next + react-i18next |
| Theme | shadcn/ui CSS variables + Tailwind dark mode |
| API docs | Fastify OpenAPI + Scalar API Reference |
| Package manager | pnpm workspace |
| Background jobs | DB-backed job queue only |
| Explicitly excluded now | BullMQ, Redis, microservices, GraphQL |

### 2.2 Version assumptions as of 2026-05-05

- Node.js 24 is the target LTS line.
- PostgreSQL 18 is the target PostgreSQL major version; use the latest PostgreSQL 18.x patch available during implementation.
- SQLite 3.53.1 is the current SQLite release as of 2026-05-05.
- Zod v4 is stable and should be used for all shared validation contracts.
- Drizzle v1 beta/RC should be used only with exact version pinning and strict repository isolation.

### 2.3 BullMQ decision

Do **not** add BullMQ or Redis for now.

Reason:

- It weakens the simple install story.
- It adds another mandatory service if used incorrectly.
- v0.1 background jobs can be handled by a DB-backed queue.
- SQLite installs should remain one app process plus one SQLite file.
- PostgreSQL installs should remain app plus PostgreSQL.

Current decision:

```text
Use DB-backed jobs only.
Do not add BullMQ.
Do not add Redis.
Do not build a queue adapter abstraction yet.
```

Future decision point:

```text
Reconsider external queues only after real usage shows DB-backed jobs are insufficient.
```

---

## 3. Product positioning

### 3.1 Recommended positioning

```text
A modern, SQLite-first personal finance manager.
Simple to start. Powerful enough to grow.
Self-hosted. Multi-currency. Mobile-friendly. Beautiful UI.
```

### 3.2 Avoid this positioning

Do not present the product as merely:

```text
A Firefly clone
```

Better wording:

```text
A simpler, modern personal finance manager inspired by the needs of self-hosted users who want power without complexity.
```

### 3.3 Product promise

- Setup in minutes.
- SQLite by default.
- PostgreSQL for advanced users.
- Clean modern UI.
- Mobile-friendly from v0.1.
- Multi-currency support from v0.1.
- Simple workflows first, advanced controls later.

---

## 4. Goals and non-goals

### 4.1 Product goals

1. Launch fast with a polished MVP.
2. Keep installation simple.
3. Make the UI much easier and more modern than traditional finance apps.
4. Support SQLite and PostgreSQL from the first public release.
5. Support multi-currency and multi-language foundations from the first release.
6. Store money safely using integer minor units and/or exact string representations.
7. Use a double-entry-compatible internal ledger model even if the UI is simple.
8. Support mobile users with a first-class responsive design.
9. Create a GitHub project that is attractive to contributors and AI coding agents.
10. Keep the architecture ready for future features such as rules, recurring transactions, advanced imports, advanced reports, multi-user mode, and Firefly import/migration.

### 4.2 Technical goals

1. Shared common contracts for API, validation, enums, money, currency, ledger, localization, and theme.
2. Strict separation between routes, services, repositories, and database dialect code.
3. Database tests must run against both SQLite and PostgreSQL.
4. Every API endpoint must have request and response schemas.
5. Every business entity owned by a user must be workspace-scoped and ledger-scoped where applicable.
6. Drizzle must not leak into route handlers or UI code.
7. Database schema duplication must be minimized using shared common definitions, not avoided through over-clever abstractions.

### 4.3 Non-goals for v0.1

Do not build these in the first release:

- BullMQ.
- Redis.
- GraphQL.
- Microservices.
- Bank integration APIs.
- Investment portfolio engine.
- Payroll/business accounting compliance features.
- Complex multi-tenant enterprise RBAC.
- Elasticsearch/OpenSearch.
- Server-side rendered marketing site.
- Mobile native app.

---

## 5. Target users

### 5.1 Primary users

1. Self-hosted personal finance users.
2. Users who find existing finance apps too complex.
3. Users who want SQLite-first deployment.
4. Users who want modern UI and mobile-friendly personal finance tracking.
5. Developers and homelab users who like simple Docker setups.

### 5.2 Secondary users

1. Families who want shared ledgers.
2. Freelancers who need slightly more structure than a spreadsheet.
3. Power users who want PostgreSQL and future advanced features.
4. Existing Firefly users who may want a simpler UI later.

---

## 6. Success metrics

### 6.1 Launch metrics

- First public release installable through Docker with SQLite.
- Demo screenshots and GIFs in README.
- `/api/health` endpoint working.
- `/api/openapi.json` generated.
- SQLite and PostgreSQL CI test matrix passing.
- Basic dashboard working on mobile and desktop.

### 6.2 Product metrics

- User can create first account in under 2 minutes.
- User can add first expense in under 30 seconds after login.
- Dashboard loads quickly with 10,000 local transactions.
- CSV import preview handles common spreadsheet exports.
- Empty states are clear and polished.

### 6.3 Engineering metrics

- No money calculations use JavaScript floating-point numbers.
- Every ledger journal balances according to defined invariants.
- All business logic has unit tests.
- Database integration tests pass on both SQLite and PostgreSQL.
- All route request/response payloads are validated.
- No user-owned data is returned across workspace boundaries.

---

## 7. Architecture overview

### 7.1 High-level architecture

```text
Vite React static app
        ↓
Fastify REST API
        ↓
Services / use-cases
        ↓
Repositories
        ↓
Drizzle dialect layer
        ↓
SQLite or PostgreSQL
```

Production runtime:

```text
One Node.js process
One Fastify server
One selected database backend
Static frontend served by Fastify
DB-backed in-process job runner
```

### 7.2 Deployment modes

#### Simple SQLite mode

```text
App process
SQLite database file
Static frontend served by app
DB-backed jobs inside same process
```

#### PostgreSQL mode

```text
App process
PostgreSQL 18 database
Static frontend served by app
DB-backed jobs inside same process
```

#### Future advanced mode

Possible future shape, not for v0.1:

```text
API process
Worker process
PostgreSQL
External queue, if justified later
```

---

## 8. Repository structure

Use a pnpm monorepo.

```text
finance-app/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── app.ts
│   │   │   ├── server.ts
│   │   │   ├── config/
│   │   │   ├── plugins/
│   │   │   ├── modules/
│   │   │   ├── repositories/
│   │   │   ├── services/
│   │   │   ├── jobs/
│   │   │   ├── workers/
│   │   │   └── shared/
│   │   ├── public/
│   │   └── package.json
│   │
│   └── web/
│       ├── src/
│       │   ├── app/
│       │   ├── routes/
│       │   ├── features/
│       │   ├── components/
│       │   ├── i18n/
│       │   ├── theme/
│       │   ├── lib/
│       │   └── styles/
│       └── package.json
│
├── packages/
│   ├── common/
│   │   ├── src/
│   │   │   ├── enums/
│   │   │   ├── schemas/
│   │   │   ├── types/
│   │   │   ├── api/
│   │   │   ├── money/
│   │   │   ├── currency/
│   │   │   ├── locale/
│   │   │   ├── theme/
│   │   │   ├── ledger/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── db/
│   │   ├── src/
│   │   │   ├── shared/
│   │   │   ├── sqlite/
│   │   │   │   ├── schema/
│   │   │   │   ├── migrations/
│   │   │   │   ├── db.ts
│   │   │   │   └── drizzle.config.ts
│   │   │   └── postgres/
│   │   │       ├── schema/
│   │   │       ├── migrations/
│   │   │       ├── db.ts
│   │   │       └── drizzle.config.ts
│   │   └── package.json
│   │
│   └── test-utils/
│       ├── src/
│       └── package.json
│
├── docker/
├── docs/
│   ├── architecture/
│   ├── adr/
│   └── user-guides/
├── scripts/
├── AGENTS.md
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

---

## 9. Shared common package

The `packages/common` package is the source of truth for shared application contracts.

### 9.1 Common package rules

`packages/common` must not depend on:

- Fastify.
- React.
- Drizzle.
- Node-only APIs.
- Browser-only APIs.
- Database drivers.

It may depend on:

- Zod v4.
- Pure TypeScript utilities.

### 9.2 Common package contents

```text
packages/common/src/enums/
├── account-kind.ts
├── account-subtype.ts
├── ledger-kind.ts
├── transaction-type.ts
├── journal-status.ts
├── posting-role.ts
├── budget-period.ts
├── rule-condition-kind.ts
├── rule-action-kind.ts
├── import-status.ts
├── job-status.ts
├── theme-mode.ts
└── supported-locale.ts

packages/common/src/schemas/
├── account.schema.ts
├── auth.schema.ts
├── budget.schema.ts
├── category.schema.ts
├── currency.schema.ts
├── import.schema.ts
├── ledger.schema.ts
├── money.schema.ts
├── pagination.schema.ts
├── payee.schema.ts
├── recurring.schema.ts
├── report.schema.ts
├── rule.schema.ts
├── settings.schema.ts
├── tag.schema.ts
└── transaction.schema.ts

packages/common/src/money/
├── money.ts
├── parse-money.ts
├── format-money-contract.ts
├── minor-units.ts
└── arithmetic.ts

packages/common/src/ledger/
├── journal.ts
├── posting.ts
├── invariants.ts
├── transaction-inputs.ts
└── balancing.ts

packages/common/src/api/
├── errors.ts
├── response.ts
├── pagination.ts
└── openapi-tags.ts
```

### 9.3 Example enum

```ts
export const ACCOUNT_KINDS = [
  "asset",
  "liability",
  "revenue",
  "expense",
  "equity",
] as const;

export type AccountKind = (typeof ACCOUNT_KINDS)[number];
```

### 9.4 Example money schema

```ts
import * as z from "zod";

export const currencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/);

export const amountMinorStringSchema = z
  .string()
  .regex(/^-?\d+$/);

export const moneyDtoSchema = z.object({
  amountMinor: amountMinorStringSchema,
  currencyCode: currencyCodeSchema,
});

export type MoneyDto = z.infer<typeof moneyDtoSchema>;
```

---

## 10. Database architecture

### 10.1 Database support from v0.1

Support both:

```text
SQLite
PostgreSQL 18
```

The user chooses one database backend.

Do not dual-write to both.

### 10.2 Config

SQLite:

```env
DATABASE_DRIVER=sqlite
DATABASE_URL=/app/data/app.db
```

PostgreSQL:

```env
DATABASE_DRIVER=postgres
DATABASE_URL=postgres://finance:finance@localhost:5432/finance?sslmode=disable
```

### 10.3 Drizzle schema duplication policy

Drizzle schemas are dialect-specific. Therefore, keep separate table declaration files:

```text
packages/db/src/sqlite/schema/
packages/db/src/postgres/schema/
```

But do not duplicate domain logic.

Shared:

- Enums.
- DTO schemas.
- API schemas.
- Money logic.
- Ledger invariants.
- Table names.
- Common index-name constants.
- Business validation.

Dialect-specific:

- `sqliteTable` vs `pgTable`.
- SQLite column types vs PostgreSQL column types.
- Migration SQL.
- Dialect-specific indexes.
- Heavy report queries where needed.
- Full-text search implementation if added later.

Do not build a custom meta-schema generator in v0.1. It will be harder for AI agents and contributors to understand.

### 10.4 Recommended DB package structure

```text
packages/db/src/shared/
├── table-names.ts
├── index-names.ts
├── column-defaults.ts
└── timestamps.ts

packages/db/src/sqlite/schema/
├── accounts.ts
├── audit-log.ts
├── budgets.ts
├── categories.ts
├── currencies.ts
├── exchange-rates.ts
├── import-jobs.ts
├── import-rows.ts
├── job-queue.ts
├── ledgers.ts
├── payees.ts
├── recurring.ts
├── rules.ts
├── sessions.ts
├── tags.ts
├── transaction-journals.ts
├── transaction-postings.ts
├── users.ts
├── workspace-members.ts
├── workspaces.ts
└── index.ts

packages/db/src/postgres/schema/
├── accounts.ts
├── audit-log.ts
├── budgets.ts
├── categories.ts
├── currencies.ts
├── exchange-rates.ts
├── import-jobs.ts
├── import-rows.ts
├── job-queue.ts
├── ledgers.ts
├── payees.ts
├── recurring.ts
├── rules.ts
├── sessions.ts
├── tags.ts
├── transaction-journals.ts
├── transaction-postings.ts
├── users.ts
├── workspace-members.ts
├── workspaces.ts
└── index.ts
```

### 10.5 Migration structure

```text
packages/db/src/sqlite/migrations/
├── 0001_init.sql
├── 0002_indexes.sql
└── ...

packages/db/src/postgres/migrations/
├── 0001_init.sql
├── 0002_indexes.sql
└── ...
```

Migration rules:

1. Every schema change must include both SQLite and PostgreSQL migrations.
2. Every migration must be tested on a clean database.
3. Every migration must be tested on an upgraded database.
4. Migrations must not drop user data without an explicit ADR.
5. All schema changes must include rollback notes even if rollback SQL is not generated automatically.

### 10.6 SQLite settings

On SQLite connection initialization, run:

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
```

Implementation note:

- Use `better-sqlite3`.
- Keep long-running import/report jobs outside HTTP request paths.
- For expensive SQLite work, consider worker threads later, not in v0.1 unless required.

### 10.7 PostgreSQL settings

PostgreSQL expectations:

- Target PostgreSQL 18.x.
- Use connection pooling appropriate to deployment size.
- Use `timestamptz` for time columns.
- Use UUIDv7-compatible text IDs for synced domain objects.
- Use explicit indexes for all workspace/ledger-scoped query paths.

---

## 10.8 ID strategy for synced domain objects

Use client-generated UUIDv7-compatible sortable text IDs for all objects that can be created through normal API writes or approved offline writes.

Applies to:

```text
workspaces
ledgers
accounts
categories
tags
budgets
budget_limits
transaction_groups
transaction_journals
transaction_postings
import_batches
import_rows
recurring_templates
sync_operations
```

Rules:

- IDs are stored as text in SQLite and PostgreSQL.
- Clients may generate IDs only for approved synced domain objects.
- The server validates ID format, ownership, workspace scope, ledger scope, and uniqueness.
- API response IDs are strings.
- Do not use auto-increment IDs for objects that may need offline creation or replay.

---

## 11. Money and currency model

### 11.1 Money storage rule

Never use JavaScript `number` for money calculations.

API payloads should use strings:

```json
{
  "amountMinor": "12550",
  "currencyCode": "INR"
}
```

Internal calculation should use:

```text
bigint
```

Database column:

```text
amount_minor BIGINT / integer
currency_code TEXT / VARCHAR(3)
```

### 11.2 Why minor units

Examples:

```text
₹125.50 -> 12550 INR
$10.99  -> 1099 USD
¥500    -> 500 JPY
```

### 11.3 Currency table

```text
currencies
- code                 text primary key
- name                 text not null
- symbol               text
- minor_units          integer not null
- enabled              boolean/integer not null
- created_at           timestamp not null
- updated_at           timestamp not null
```

### 11.4 Workspace base currency

Every workspace has a base currency:

```text
workspaces.base_currency_code
```

Every ledger may override or inherit reporting currency:

```text
ledgers.base_currency_code
```

### 11.5 Exchange rates

```text
exchange_rates
- id
- workspace_id
- from_currency_code
- to_currency_code
- rate_decimal_string
- source
- effective_at
- created_at
```

Do not store exchange rate as float.

Use string representation such as:

```text
83.12540000
```

### 11.6 Multi-currency transaction rule

Every posting stores:

```text
amount_minor
currency_code
reporting_amount_minor
reporting_currency_code
exchange_rate_snapshot
```

For same-currency transactions:

```text
amount_minor and reporting_amount_minor may be equivalent.
```

For cross-currency transactions:

```text
original amounts are preserved
reporting amounts are used for base-currency reports
exchange snapshot is immutable
```

---

## 12. Ledger architecture

### 12.1 Dual-ledger support meaning

Dual-ledger support means:

1. Simple user-facing transaction flows.
2. Double-entry-compatible internal accounting engine.

Do not create two separate sources of truth.

The only source of truth is:

```text
transaction_journals
transaction_postings
```

### 12.2 Ledgers table

```text
ledgers
- id
- workspace_id
- name
- kind: personal | business | family | investment | imported
- base_currency_code
- locale
- timezone
- archived_at
- created_at
- updated_at
```

### 12.3 Account kinds

```text
asset
liability
revenue
expense
equity
```

### 12.4 Account subtypes

Initial subtypes:

```text
bank
cash
wallet
credit_card
loan
savings
checking
external
category_shadow
opening_balance
revenue_source
expense_sink
```

### 12.5 Accounts table

```text
accounts
- id
- workspace_id
- ledger_id
- name
- kind
- subtype
- currency_code
- opening_balance_minor
- notes
- sort_order
- archived_at
- created_at
- updated_at
```

### 12.6 Transaction journals

```text
transaction_journals
- id
- workspace_id
- ledger_id
- type: expense | income | transfer | opening_balance | adjustment
- occurred_at
- description
- notes
- payee_id
- status: pending | cleared | reconciled
- external_id
- import_job_id
- created_by_user_id
- updated_by_user_id
- created_at
- updated_at
```

### 12.7 Transaction postings

```text
transaction_postings
- id
- workspace_id
- ledger_id
- journal_id
- account_id
- amount_minor
- currency_code
- reporting_amount_minor
- reporting_currency_code
- exchange_rate_snapshot
- category_id
- created_at
```

### 12.8 Signed posting convention

Use signed amounts:

```text
negative = money leaves an account
positive = money enters an account
```

### 12.9 Ledger invariants

Required invariants:

1. Every transaction journal must have at least two postings.
2. Same-currency journals must balance to zero per currency.
3. Cross-currency journals must balance to zero in reporting currency.
4. All postings in a journal must have the same workspace and ledger as the journal.
5. Postings cannot reference archived accounts unless the transaction already existed before archiving.
6. Money must never be calculated using floats.
7. Deleting a journal must delete postings transactionally or mark the journal voided.
8. Import commits must be idempotent.

### 12.10 User-facing transaction types

The UI should expose only:

```text
Expense
Income
Transfer
```

Advanced options should be hidden behind:

```text
More options
Split transaction
Currency conversion
Tags
Rules
Recurring
Notes
```

---

## 13. Core data model

### 13.1 Identity and workspace

```text
users
- id
- email
- name
- password_hash
- email_verified_at
- default_workspace_id
- created_at
- updated_at

sessions
- id
- user_id
- token_hash
- user_agent
- ip_address
- expires_at
- created_at

workspaces
- id
- name
- base_currency_code
- default_locale
- default_timezone
- created_at
- updated_at

workspace_members
- id
- workspace_id
- user_id
- role: owner | admin | member | viewer
- created_at
- updated_at
```

### 13.2 Categories and tags

```text
categories
- id
- workspace_id
- ledger_id
- name
- parent_id
- color
- icon
- archived_at
- created_at
- updated_at

tags
- id
- workspace_id
- ledger_id
- name
- color
- created_at
- updated_at

transaction_tags
- transaction_journal_id
- tag_id
```

### 13.3 Budgets

```text
budgets
- id
- workspace_id
- ledger_id
- name
- currency_code
- period: monthly | weekly | yearly | custom
- starts_at
- ends_at
- archived_at
- created_at
- updated_at

budget_limits
- id
- budget_id
- category_id
- amount_minor
- currency_code
- period_start
- period_end
- created_at
- updated_at
```

### 13.4 Payees

```text
payees
- id
- workspace_id
- ledger_id
- name
- normalized_name
- created_at
- updated_at
```

### 13.5 Imports

```text
import_jobs
- id
- workspace_id
- ledger_id
- source_type: csv | firefly | manual
- status: pending | parsing | preview_ready | committing | completed | failed
- original_filename
- mapping_json
- error_json
- created_by_user_id
- created_at
- updated_at

import_rows
- id
- import_job_id
- row_number
- raw_json
- normalized_json
- status: pending | valid | invalid | duplicate | imported
- error_json
- transaction_journal_id
- created_at
```

### 13.6 Rules

```text
rule_groups
- id
- workspace_id
- ledger_id
- name
- enabled
- sort_order
- created_at
- updated_at

rules
- id
- rule_group_id
- name
- enabled
- trigger: transaction_created | import_row_normalized | manual
- sort_order
- stop_processing
- created_at
- updated_at

rule_conditions
- id
- rule_id
- kind
- operator
- value_json
- created_at

rule_actions
- id
- rule_id
- kind
- value_json
- created_at
```

### 13.7 Recurring transactions

```text
recurring_templates
- id
- workspace_id
- ledger_id
- name
- enabled
- schedule_json
- transaction_template_json
- next_run_at
- last_run_at
- created_at
- updated_at

recurring_occurrences
- id
- recurring_template_id
- scheduled_for
- transaction_journal_id
- status: pending | created | skipped | failed
- created_at
- updated_at
```

### 13.8 DB-backed jobs

```text
job_queue
- id
- workspace_id nullable
- ledger_id nullable
- type
- payload_json
- status: pending | running | completed | failed | cancelled
- priority
- attempts
- max_attempts
- dedupe_key
- available_at
- locked_at
- locked_by
- last_error
- created_at
- updated_at
```

### 13.9 Audit log

```text
audit_log
- id
- workspace_id
- ledger_id nullable
- actor_user_id nullable
- action
- entity_type
- entity_id
- before_json
- after_json
- created_at
```

---

## 14. Backend architecture

### 14.1 Layering rule

Use strict layering:

```text
Fastify routes
  ↓
Services / use-cases
  ↓
Repositories
  ↓
Drizzle database layer
```

Rules:

- Routes validate and authorize.
- Services enforce business rules.
- Repositories perform persistence.
- Drizzle remains inside repositories/db modules.
- Common package defines contracts.

### 14.2 Fastify plugins

```text
apps/api/src/plugins/
├── config.ts
├── logger.ts
├── errors.ts
├── security.ts
├── cookies.ts
├── auth.ts
├── db.ts
├── swagger.ts
├── static.ts
├── i18n.ts
└── jobs.ts
```

### 14.3 Modules

```text
apps/api/src/modules/
├── auth/
├── users/
├── workspaces/
├── ledgers/
├── accounts/
├── transactions/
├── categories/
├── tags/
├── budgets/
├── reports/
├── imports/
├── rules/
├── recurring/
├── devices/
├── sync/
├── settings/
└── health/
```

Each module should contain:

```text
routes.ts
service.ts
repository.ts
types.ts
tests/
```

### 14.4 Validation

Use Zod v4 schemas from `packages/common` wherever possible.

Every route must declare:

- Params schema.
- Query schema.
- Body schema.
- Response schema.

Fastify should still use schema-based validation/serialization at the route level.

### 14.5 Error format

All API errors should follow this shape:

```json
{
  "error": {
    "code": "TRANSACTION_NOT_BALANCED",
    "message": "Transaction postings must balance to zero.",
    "details": {},
    "requestId": "req_abc123"
  }
}
```

### 14.6 Request context

Each request should have:

```text
request_id
user_id nullable
workspace_id nullable
ledger_id nullable
locale
timezone
```

### 14.7 Logging

Use Pino through Fastify.

Log:

- request ID.
- method.
- path.
- response status.
- duration.
- user ID when available.
- workspace ID when available.
- errors with stack traces in development only.

Do not log:

- passwords.
- session tokens.
- raw auth cookies.
- full CSV imports unless explicitly in debug mode.

---

## 14.8 Device and sync modules

v0.1 includes device-scoped limited offline sync.

Required modules:

```text
apps/api/src/modules/devices/
apps/api/src/modules/sync/
packages/common/src/ids/
packages/common/src/sync/
```

Device responsibilities:

- register current browser/PWA install
- track device name/platform
- store optional public key for future encrypted sync envelopes
- track `last_seen_at`
- support device revocation
- block sync push from revoked devices

Sync responsibilities:

- accept push envelopes from a local outbox
- validate `(device_id, local_sequence)` uniqueness
- replay duplicate `operation_id` idempotently
- call normal domain services through a ledger mutation runner
- append accepted/rejected/conflict operation records
- expose pull/status/conflict endpoints

Approved offline command types:

```text
transaction_group.create_expense.v1
transaction_group.create_income.v1
transaction_group.create_transfer.v1
category.create.v1
budget.assign_category_month.v1
```

Blocked offline actions:

```text
reconciled updates
delete or void
import commit
rule changes
recurring generation
workspace/member/permission changes
exchange-rate changes
maintenance/correction commands
backup restore
```

The sync API must accept domain commands, not raw row patches.

---

## 15. API specification

### 15.1 API style

Use REST.

Base path:

```text
/api/v1
```

OpenAPI:

```text
/api/openapi.json
/api/docs
```

### 15.2 Standard response conventions

List responses:

```json
{
  "data": [],
  "pagination": {
    "cursor": null,
    "nextCursor": null,
    "limit": 50
  }
}
```

Single object:

```json
{
  "data": {}
}
```

Mutation:

```json
{
  "data": {},
  "meta": {}
}
```

### 15.3 Auth endpoints

```text
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/auth/session
POST   /api/v1/auth/change-password
```

### 15.4 User/workspace endpoints

```text
GET    /api/v1/me
GET    /api/v1/workspaces
POST   /api/v1/workspaces
GET    /api/v1/workspaces/:workspaceId
PATCH  /api/v1/workspaces/:workspaceId
```

### 15.5 Ledger endpoints

```text
GET    /api/v1/ledgers
POST   /api/v1/ledgers
GET    /api/v1/ledgers/:ledgerId
PATCH  /api/v1/ledgers/:ledgerId
DELETE /api/v1/ledgers/:ledgerId
```

### 15.6 Account endpoints

```text
GET    /api/v1/accounts
POST   /api/v1/accounts
GET    /api/v1/accounts/:accountId
PATCH  /api/v1/accounts/:accountId
DELETE /api/v1/accounts/:accountId
GET    /api/v1/accounts/:accountId/balance
GET    /api/v1/accounts/:accountId/transactions
```

### 15.7 Transaction endpoints

```text
GET    /api/v1/transactions
POST   /api/v1/transactions
GET    /api/v1/transactions/:transactionId
PATCH  /api/v1/transactions/:transactionId
DELETE /api/v1/transactions/:transactionId
POST   /api/v1/transactions/:transactionId/void
```

### 15.8 Category/tag/payee endpoints

```text
GET    /api/v1/categories
POST   /api/v1/categories
PATCH  /api/v1/categories/:categoryId
DELETE /api/v1/categories/:categoryId

GET    /api/v1/tags
POST   /api/v1/tags
PATCH  /api/v1/tags/:tagId
DELETE /api/v1/tags/:tagId

GET    /api/v1/payees
POST   /api/v1/payees
PATCH  /api/v1/payees/:payeeId
DELETE /api/v1/payees/:payeeId
```

### 15.9 Budget endpoints

```text
GET    /api/v1/budgets
POST   /api/v1/budgets
GET    /api/v1/budgets/:budgetId
PATCH  /api/v1/budgets/:budgetId
DELETE /api/v1/budgets/:budgetId
GET    /api/v1/budgets/:budgetId/progress
```

### 15.10 Report endpoints

```text
GET    /api/v1/reports/monthly-summary
GET    /api/v1/reports/cashflow
GET    /api/v1/reports/net-worth
GET    /api/v1/reports/category-breakdown
GET    /api/v1/reports/account-balances
```

### 15.11 Import endpoints

```text
POST   /api/v1/imports/csv
GET    /api/v1/imports
GET    /api/v1/imports/:importId
PATCH  /api/v1/imports/:importId/mapping
POST   /api/v1/imports/:importId/preview
POST   /api/v1/imports/:importId/commit
POST   /api/v1/imports/:importId/undo
```

### 15.12 Rule endpoints

```text
GET    /api/v1/rule-groups
POST   /api/v1/rule-groups
GET    /api/v1/rules
POST   /api/v1/rules
PATCH  /api/v1/rules/:ruleId
DELETE /api/v1/rules/:ruleId
POST   /api/v1/rules/apply
```

### 15.13 Recurring endpoints

```text
GET    /api/v1/recurring
POST   /api/v1/recurring
GET    /api/v1/recurring/:templateId
PATCH  /api/v1/recurring/:templateId
DELETE /api/v1/recurring/:templateId
POST   /api/v1/recurring/:templateId/run-now
```

### 15.14 Settings endpoints

```text
GET    /api/v1/settings
PATCH  /api/v1/settings
GET    /api/v1/currencies
PATCH  /api/v1/currencies/:code
GET    /api/v1/locales
```

---

## 16. Authentication and authorization

### 16.1 Browser auth

Use session-based auth.

Do not use JWT for normal browser sessions.

Session behavior:

- Secure HttpOnly cookie.
- SameSite=Lax by default.
- SameSite=Strict allowed by config.
- Cookie Secure=true in production.
- Session token stored hashed in DB.

### 16.2 Password hashing

Use Argon2id.

Fallback only if needed:

- Node `crypto.scrypt`.

### 16.3 Workspace authorization

Every user request must resolve:

```text
current user
current workspace
current ledger where applicable
```

Rules:

- Users cannot access data outside their workspaces.
- All queries must scope by `workspace_id`.
- Ledger-specific resources must also scope by `ledger_id`.
- Route params must be verified against workspace membership.

### 16.4 Future auth features

Not required in v0.1:

- Passkeys.
- TOTP.
- OAuth.
- API tokens.
- Advanced RBAC.

But schema should not block them.

---

## 17. DB-backed job system

### 17.1 Purpose

Jobs should handle work that should not block HTTP requests:

- CSV parsing.
- CSV commit.
- Rule application.
- Recurring transaction generation.
- Report snapshot recalculation.
- Session cleanup.
- SQLite backup.
- Exchange-rate refresh.

### 17.2 Current decision

Use only a DB-backed queue.

Do not add:

- BullMQ.
- Redis.
- Queue adapter package.
- External workers as mandatory services.

### 17.3 Job runner behavior

The API process starts an in-process job runner by default:

```env
APP_ROLE=all
```

Supported roles:

```text
all       API + job runner
api       API only, future use
worker    job runner only, future use
```

For v0.1, `all` is the default.

### 17.4 Job locking

Job claiming must be safe on both SQLite and PostgreSQL.

SQLite:

- Use transaction-based claiming.
- Keep jobs short.
- Avoid long write locks.

PostgreSQL:

- Use transaction-based claiming.
- Use dialect-specific query improvements later if necessary.

### 17.5 Job idempotency

Every job type must define:

- payload schema.
- idempotency/dedupe strategy.
- retry behavior.
- failure behavior.

Example job types:

```ts
export const JOB_TYPES = [
  "csv.import.parse",
  "csv.import.commit",
  "rules.apply",
  "recurring.generate",
  "reports.recalculate",
  "exchange-rates.refresh",
  "sessions.cleanup",
  "sqlite.backup",
] as const;
```

---

## 18. Frontend architecture

### 18.1 Frontend stack

```text
Vite
React
TypeScript
Tailwind CSS
shadcn/ui
TanStack Router
TanStack Query
TanStack Form
TanStack Table
Zod v4
i18next + react-i18next
Apache ECharts
```

### 18.2 Frontend folder structure

```text
apps/web/src/
├── app/
│   ├── App.tsx
│   ├── providers.tsx
│   └── router.tsx
├── routes/
│   ├── __root.tsx
│   ├── login.tsx
│   ├── register.tsx
│   ├── dashboard.tsx
│   ├── accounts.tsx
│   ├── transactions.tsx
│   ├── budgets.tsx
│   ├── reports.tsx
│   ├── imports.tsx
│   ├── rules.tsx
│   ├── recurring.tsx
│   └── settings.tsx
├── features/
│   ├── auth/
│   ├── accounts/
│   ├── transactions/
│   ├── budgets/
│   ├── reports/
│   ├── imports/
│   ├── rules/
│   ├── recurring/
│   └── settings/
├── components/
│   ├── ui/
│   ├── layout/
│   ├── forms/
│   ├── charts/
│   └── empty-states/
├── i18n/
├── theme/
├── lib/
└── styles/
```

### 18.3 Route list

```text
/login
/register
/dashboard
/accounts
/accounts/:accountId
/transactions
/transactions/new
/transactions/:transactionId
/budgets
/reports
/imports
/imports/:importId
/rules
/recurring
/settings
```

### 18.4 Form strategy

Use TanStack Form with shared Zod schemas.

Pattern:

```text
packages/common Zod schema
        ↓
TanStack Form validation
        ↓
API request
        ↓
Fastify route validation using same schema
```

Rules:

- No React Hook Form.
- Do not define duplicate client-only schemas unless UI-only fields require it.
- Transform UI-only values into API DTOs before submit.
- Keep amount input as a display string until parsed into `amountMinor`.

### 18.5 API client

Use a typed API client generated or manually wrapped from OpenAPI/common schemas.

Initial approach:

```text
apps/web/src/lib/api/client.ts
```

Rules:

- All requests include credentials for cookie sessions.
- Centralized error handling.
- Common response parsing.
- TanStack Query keys defined centrally.

---

## 19. UI and UX requirements

### 19.1 UI philosophy

```text
Simple like a notes app.
Powerful like a serious ledger.
Modern like Linear/Notion/Raycast.
```

### 19.2 Required UI states

Every screen must include:

- Loading state.
- Empty state.
- Error state.
- Success state where applicable.
- Mobile layout.
- Dark mode.

### 19.3 Dashboard

Dashboard cards:

- Net worth.
- Monthly income.
- Monthly expenses.
- Monthly cashflow.
- Account balances.
- Recent transactions.
- Top spending categories.
- Budget progress.

### 19.4 Transaction creation UX

Mobile-first transaction form:

1. Amount.
2. Type: expense/income/transfer.
3. Source account.
4. Destination/category/payee depending on type.
5. Date.
6. Description.
7. Save.

Advanced fields hidden:

- Tags.
- Notes.
- Split transaction.
- Currency conversion.
- Reconciliation status.
- Rule preview.

### 19.5 Mobile layout

Desktop:

```text
sidebar + top bar + content
```

Tablet:

```text
collapsible sidebar + content
```

Mobile:

```text
bottom navigation + sheet drawer + card-first layout
```

Mobile bottom navigation items:

- Dashboard.
- Transactions.
- Add.
- Budgets.
- More.

### 19.6 Accessibility

Minimum requirements:

- Keyboard navigable forms.
- Visible focus states.
- Proper labels.
- Dialogs trap focus.
- Form errors announced correctly.
- Charts include textual summaries.
- Color is not the only indicator of meaning.

---

## 20. Internationalization and localization

### 20.1 i18n stack

Use:

```text
i18next
react-i18next
```

### 20.2 Locale files

```text
apps/web/src/i18n/locales/
├── en/common.json
├── en/auth.json
├── en/accounts.json
├── en/transactions.json
├── en/budgets.json
├── en/reports.json
├── en/settings.json
├── hi/common.json
└── hi/auth.json
```

### 20.3 Initial locales

Required:

```text
en
```

Optional early:

```text
hi
```

### 20.4 User settings

```text
user_settings
- user_id
- locale
- timezone
- date_format
- number_format_locale
- theme
- created_at
- updated_at
```

### 20.5 Localization rules

- No hardcoded visible strings in components.
- Date, time, and currency formatting must use locale-aware utilities.
- Store timestamps in UTC.
- Display using user timezone.
- Store currency code with every money value.

---

## 21. Theme and dark mode

### 21.1 Theme modes

```text
light
dark
system
```

### 21.2 Implementation

Use:

- Tailwind dark mode.
- shadcn/ui CSS variables.
- Theme provider.
- LocalStorage before login.
- User settings after login.

### 21.3 Theme persistence

Before login:

```text
localStorage.theme
```

After login:

```text
user_settings.theme
```

### 21.4 Dark mode requirement

Dark mode must be supported in the first public release.

Do not treat it as a later add-on.

---

## 22. Reports and analytics

### 22.1 Initial reports

v0.1 reports:

- Monthly summary.
- Account balances.
- Cashflow.
- Category breakdown.
- Recent transactions.

### 22.2 Future reports

Later reports:

- Net worth timeline.
- Budget variance.
- Income vs expenses.
- Recurring cost overview.
- Rule impact report.
- Currency exposure.
- Import history analytics.

### 22.3 Query strategy

Initially:

- Use repository methods with Drizzle.
- Add indexes early.

Later:

- Use raw SQL per dialect for heavy reports if needed.
- Do not force one ugly SQL query to work across both SQLite and PostgreSQL.

---

## 23. Import system

### 23.1 CSV import flow

1. Upload CSV.
2. Parse in job.
3. Show preview.
4. User maps columns.
5. Normalize rows.
6. Detect invalid rows.
7. Detect likely duplicates.
8. Commit valid rows.
9. Allow undo for import batch.

### 23.2 CSV mapping fields

Common fields:

- Date.
- Description.
- Amount.
- Debit.
- Credit.
- Currency.
- Account.
- Category.
- Payee.
- External ID.

### 23.3 Duplicate detection

Initial duplicate strategy:

```text
same account
same date or nearby date
same amount
same normalized description
same external id if available
```

### 23.4 Import safety

- Import commit must be transactional.
- Invalid rows must not block valid rows unless user chooses strict mode.
- Every imported transaction links back to import job.
- Undo should void/delete transactions from that import batch.

---

## 24. Rules engine

### 24.1 Rule purpose

Rules automate categorization, tagging, payees, and other actions.

### 24.2 Initial condition kinds

```text
description_contains
description_equals
amount_equals
amount_greater_than
amount_less_than
account_is
payee_contains
currency_is
import_source_is
```

### 24.3 Initial action kinds

```text
set_category
add_tag
set_payee
set_description
mark_cleared
```

### 24.4 Rule execution

Rules can run:

- During import normalization.
- After transaction creation.
- Manually on selected transactions.

### 24.5 Rule safety

- Rules must be deterministic.
- Rule actions must be auditable.
- Rule preview should be supported before bulk apply.
- Rules must not break ledger invariants.

---

## 25. Recurring transactions

### 25.1 Recurring requirements

Support recurring templates for:

- Rent.
- Salary.
- Subscriptions.
- EMIs/loans.
- Bills.

### 25.2 Scheduling

Store schedule as structured JSON:

```json
{
  "frequency": "monthly",
  "interval": 1,
  "dayOfMonth": 5
}
```

### 25.3 Idempotency

Recurring generation must be idempotent.

Same template and same scheduled date must not create duplicates.

---

## 26. Configuration

### 26.1 Environment variables

```env
APP_ENV=development
APP_URL=http://localhost:3000
APP_PORT=3000
APP_ROLE=all

DATABASE_DRIVER=sqlite
DATABASE_URL=./data/app.db

SESSION_SECRET=change-me
COOKIE_SECURE=false

LOG_LEVEL=info
AUTO_MIGRATE=true
DEFAULT_LOCALE=en
DEFAULT_TIMEZONE=Asia/Kolkata
```

PostgreSQL example:

```env
DATABASE_DRIVER=postgres
DATABASE_URL=postgres://finance:finance@localhost:5432/finance?sslmode=disable
```

### 26.2 Config validation

Use Zod v4 for config validation.

Startup should fail fast if required config is invalid.

---

## 27. CLI commands

Add a CLI entry eventually:

```text
finance migrate
finance seed
finance create-user
finance doctor
finance backup
finance restore
finance jobs run-once
```

### 27.1 Doctor command

`finance doctor` should check:

- Database reachable.
- Migrations applied.
- SQLite foreign keys enabled.
- SQLite WAL enabled.
- Data directory writable.
- Session secret configured.
- OpenAPI route available.
- Static frontend available.

---

## 28. Build and serving strategy

### 28.1 Development

Run API and web separately:

```bash
pnpm dev
```

Expected:

```text
API: http://localhost:3000
Web: http://localhost:5173
```

### 28.2 Production

Build web:

```bash
pnpm --filter web build
```

Copy or emit static output into:

```text
apps/api/public
```

Fastify serves:

```text
/api/*
/assets/*
index.html fallback
```

### 28.3 Static frontend rule

No frontend Node server in production.

The production app should be:

```text
Fastify API + static files
```

---

## 29. Docker strategy

### 29.1 SQLite Docker mode

```yaml
services:
  app:
    image: finance-app:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      APP_ENV: production
      DATABASE_DRIVER: sqlite
      DATABASE_URL: /app/data/app.db
      SESSION_SECRET: change-me
```

### 29.2 PostgreSQL Docker mode

```yaml
services:
  app:
    image: finance-app:latest
    ports:
      - "3000:3000"
    environment:
      APP_ENV: production
      DATABASE_DRIVER: postgres
      DATABASE_URL: postgres://finance:finance@db:5432/finance?sslmode=disable
      SESSION_SECRET: change-me
    depends_on:
      - db

  db:
    image: postgres:18
    environment:
      POSTGRES_USER: finance
      POSTGRES_PASSWORD: finance
      POSTGRES_DB: finance
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

### 29.3 No Redis service

Do not include Redis in Docker Compose for v0.1.

---

## 30. Testing strategy

### 30.1 Test types

Use:

- Vitest for unit/integration tests.
- Playwright for E2E tests.
- Testing Library for React components.
- Database integration tests for SQLite and PostgreSQL.

### 30.2 Required test matrix

Run backend integration tests against:

```text
SQLite
PostgreSQL
```

Example commands:

```bash
pnpm test:sqlite
pnpm test:postgres
pnpm test:e2e
```

### 30.3 Required ledger tests

Tests must prove:

1. Expense creates balanced postings.
2. Income creates balanced postings.
3. Transfer creates balanced postings.
4. Split transaction balances correctly.
5. Cross-currency transaction preserves original amounts.
6. Cross-currency transaction balances in reporting currency.
7. Invalid unbalanced journal is rejected.
8. Deleting/voiding a transaction updates balances correctly.
9. Import cannot create invalid journals.
10. Rounding does not lose money.
11. No money calculation uses float.

### 30.4 Required API tests

- Auth required where expected.
- Workspace isolation enforced.
- Ledger isolation enforced.
- Invalid body rejected.
- Invalid response shape caught in tests.
- Pagination works.
- Error format consistent.

### 30.5 Required UI tests

- Login form.
- Account creation form.
- Transaction creation form.
- Mobile navigation.
- Dark mode toggle.
- Locale switch.
- Dashboard empty state.

---

## 31. Security and privacy

### 31.1 Security requirements

- Use secure HttpOnly cookies.
- Hash session tokens before DB storage.
- Hash passwords with Argon2id.
- Use CSRF protection strategy appropriate for cookie-based sessions.
- Rate-limit auth endpoints.
- Validate all inputs.
- Do not expose stack traces in production.
- Enforce workspace and ledger scoping in repositories.
- Avoid raw SQL unless parameterized.

### 31.2 Privacy requirements

- Do not log sensitive financial descriptions at info level.
- Do not log raw import files.
- Support local-only deployment with SQLite.
- Do not require telemetry.
- If telemetry is added later, make it opt-in only.

---

## 32. Performance and resource targets

### 32.1 Startup targets

- App starts quickly on small VPS/home server.
- SQLite mode should not require additional services.
- PostgreSQL mode should run comfortably with a small database and one app process.

### 32.2 Query targets

With 10,000 transactions:

- Dashboard should load under 500 ms locally after warm startup.
- Transaction list first page should load under 300 ms locally.
- Account balance query should be indexed and efficient.

With 100,000 transactions:

- Dashboard may use cached/report snapshot queries.
- Transaction list must remain paginated.
- Reports may use dialect-specific SQL.

### 32.3 Indexing requirements

Index all common query paths:

- `workspace_id`.
- `ledger_id`.
- `account_id`.
- `journal_id`.
- `occurred_at`.
- `category_id`.
- `payee_id`.
- import external IDs.
- transaction description search later.

---

## 33. Development tooling

### 33.1 Required tools

- pnpm.
- TypeScript.
- TSX for local scripts.
- Vitest.
- Playwright.
- ESLint.
- Prettier.
- Drizzle Kit v1 beta/RC.

### 33.2 Code style

- Strict TypeScript.
- No implicit any.
- No unchecked money parsing.
- No database access from route handlers.
- No direct `fetch` spread across components; use API client.
- No duplicated visible text outside i18n files.

### 33.3 Dependency policy

- Pin exact versions in lockfile.
- Avoid adding dependencies without reason.
- Drizzle v1 beta/RC must be pinned exactly.
- Add ADR for any dependency that affects architecture.

---

## 34. AI-agent rules

Create `AGENTS.md` with the following rules.

```text
1. Never store or calculate money using JavaScript floating-point numbers.
2. Money API values must use string amountMinor values.
3. Every route must have Zod request and response schemas.
4. Use shared schemas/enums/types from packages/common wherever possible.
5. Business logic belongs in services, not route handlers.
6. Repositories hide Drizzle and database dialect differences.
7. Every schema change must include SQLite and PostgreSQL migrations.
8. Every database feature must be tested on SQLite and PostgreSQL.
9. All user-owned tables must include workspace_id.
10. All financial tables must include ledger_id where applicable.
11. Every ledger operation must test balancing invariants.
12. Synced domain objects use UUIDv7-compatible text IDs.
13. Offline writes must go through the approved sync command outbox.
14. Sync push must replay normal domain services, not raw row patches.
15. Do not add BullMQ, Redis, external queues, or microservices without an ADR.
16. Do not copy Firefly source, UI assets, docs, or text.
17. Every frontend feature must include loading, empty, error, and mobile states.
18. Do not hardcode visible UI strings; use i18n files.
19. Dark mode must be supported for every screen.
20. Do not leak Drizzle table objects into frontend or common package.
21. Do not create a custom schema generator unless approved through ADR.
22. Prefer explicit, readable code over clever abstractions.
23. Keep SQLite simple install working at all times.
```

---

## 35. Milestones

### Milestone 0: Project scaffold

Deliver:

- pnpm workspace.
- Fastify app.
- Vite React app.
- `packages/common`.
- `packages/db`.
- SQLite connection.
- PostgreSQL connection.
- Health endpoint.
- OpenAPI endpoint.
- Static serving path.
- Docker skeleton.

Acceptance:

- `pnpm dev` runs API and web.
- `/api/health` works.
- `/api/openapi.json` works.
- SQLite migration runs.
- PostgreSQL migration runs.
- CI runs basic checks.

### Milestone 1: Auth, workspace, ledger

Deliver:

- Register.
- Login.
- Logout.
- Sessions.
- Workspaces.
- Ledgers.
- User settings.
- Locale/theme settings.

Acceptance:

- User can register and log in.
- User gets default workspace.
- User gets default ledger.
- Session cookie works.
- Workspace isolation test passes.
- SQLite and PostgreSQL tests pass.

### Milestone 2: Accounts

Deliver:

- Account CRUD.
- Account types/subtypes.
- Account balances.
- Account archive.
- Account UI.

Acceptance:

- User can create bank/cash/wallet/credit-card account.
- Account list works on mobile.
- Account balance query works.
- SQLite and PostgreSQL tests pass.

### Milestone 3: Ledger transactions

Deliver:

- Expense.
- Income.
- Transfer.
- Transaction list.
- Transaction detail.
- Edit transaction.
- Void/delete transaction.
- Basic split support internally.

Acceptance:

- All journals balance.
- Money uses string/bigint only.
- Account balances update correctly.
- Transaction form works on mobile.
- SQLite and PostgreSQL tests pass.

### Milestone 4: Dashboard and reports

Deliver:

- Dashboard.
- Monthly summary.
- Cashflow chart.
- Category breakdown.
- Account cards.
- Recent transactions.
- Dark mode polish.

Acceptance:

- Dashboard works with empty state.
- Dashboard works with seeded data.
- Mobile layout works.
- Dark mode works.
- 10k transaction dashboard target met locally.

### Milestone 5: CSV import

Deliver:

- CSV upload.
- Parse job.
- Mapping UI.
- Preview UI.
- Duplicate detection.
- Commit job.
- Undo import.

Acceptance:

- Bad rows reported clearly.
- Valid rows import transactionally.
- Duplicate rows are flagged.
- Import commit is idempotent.
- SQLite and PostgreSQL tests pass.

### Milestone 6: Budgets, tags, payees

Deliver:

- Categories.
- Tags.
- Payees.
- Budgets.
- Budget progress.

Acceptance:

- Budget progress works monthly.
- Tags attach to transactions.
- Payee suggestions work.
- Mobile UI works.

### Milestone 7: Rules and recurring transactions

Deliver:

- Rule groups.
- Rules.
- Conditions.
- Actions.
- Manual apply.
- Import apply.
- Recurring templates.
- Recurring generation job.

Acceptance:

- Rules are deterministic.
- Rules cannot break ledger invariants.
- Recurring jobs are idempotent.
- SQLite and PostgreSQL tests pass.

### Milestone 8: Public release readiness

Deliver:

- README.
- Screenshots.
- Docker Compose SQLite.
- Docker Compose PostgreSQL.
- Quickstart docs.
- Backup/restore docs.
- API docs.
- AGENTS.md.
- License.

Acceptance:

- New user can run SQLite install from docs.
- New user can run PostgreSQL install from docs.
- Demo screenshots show modern UI.
- CI green.
- No Redis/BullMQ dependency.

---

## 36. First implementation order

Build in this order:

```text
1. pnpm workspace
2. TypeScript base config
3. packages/common with enums and schemas
4. Fastify app bootstrap
5. Config validation
6. Logger and error plugin
7. DB package scaffold
8. SQLite Drizzle schema v1
9. PostgreSQL Drizzle schema v1
10. Migrations for both DBs
11. DB factory
12. Health endpoint
13. OpenAPI/Scalar docs
14. Auth/session service
15. Workspace service
16. Ledger service
17. Accounts service
18. Ledger transaction service
19. Transaction API
20. Vite React app shell
21. Theme provider
22. i18n setup
23. TanStack Router setup
24. TanStack Query setup
25. Login/register UI
26. Accounts UI
27. Transaction UI
28. Dashboard UI
29. DB-backed job runner
30. CSV import
31. Budgets/categories/tags
32. Docker SQLite
33. Docker PostgreSQL
34. README and screenshots
```

---

## 37. ADRs to create immediately

Create these architecture decision records:

```text
docs/adr/0001-use-fastify-typescript.md
docs/adr/0002-support-sqlite-and-postgresql-from-v0-1.md
docs/adr/0003-use-drizzle-with-dialect-specific-schemas.md
docs/adr/0004-no-bullmq-or-redis-in-v0-1.md
docs/adr/0005-use-double-entry-compatible-ledger.md
docs/adr/0006-use-shared-common-contracts.md
docs/adr/0007-use-vite-react-static-frontend.md
docs/adr/0008-use-tanstack-form-not-react-hook-form.md
```

---

## 38. Key risks and mitigations

### 38.1 Drizzle v1 beta/RC instability

Risk:

- APIs may change.
- Migration behavior may change.

Mitigation:

- Pin exact version.
- Keep Drizzle isolated in `packages/db` and repositories.
- Do not leak Drizzle types into common/frontend.
- Add migration tests.
- Record changes in ADRs.

### 38.2 SQLite/PostgreSQL drift

Risk:

- One database backend gets more attention and the other breaks.

Mitigation:

- CI test matrix.
- Dual migrations for every schema change.
- Dialect parity tests.
- Repository tests for both drivers.

### 38.3 Money calculation bugs

Risk:

- Floating-point errors.
- Rounding issues.
- Currency conversion errors.

Mitigation:

- Money as strings in API.
- Money as bigint internally.
- Exchange-rate snapshots.
- Ledger invariant tests.
- Currency minor units table.

### 38.4 UI complexity creep

Risk:

- Product becomes as complex as the apps it tries to simplify.

Mitigation:

- Simple default flows.
- Advanced controls hidden.
- Mobile-first transaction creation.
- Strong empty states.
- User testing.

### 38.5 Queue complexity

Risk:

- Background tasks become unreliable.

Mitigation:

- DB-backed queue with retry/idempotency.
- Keep jobs small.
- Avoid external queue until proven necessary.

---

## 39. Launch README requirements

README must include:

- Short product headline.
- Screenshots/GIFs.
- SQLite quickstart.
- PostgreSQL quickstart.
- Feature list.
- Roadmap.
- Architecture diagram.
- Resource-friendly positioning.
- Mobile screenshots.
- Dark mode screenshot.
- API docs mention.
- “No Redis required” note.

Suggested headline:

```text
Modern self-hosted personal finance.
SQLite by default. PostgreSQL when you need it.
Simple UI. Serious ledger engine.
```

---

## 40. Reference links

These links were used for current technical assumptions and official documentation checks:

- Node.js releases: https://nodejs.org/en/about/previous-releases
- Node.js 24 LTS announcement: https://nodejs.org/en/blog/release/v24.11.0
- PostgreSQL 18 release: https://www.postgresql.org/about/news/postgresql-18-released-3142/
- PostgreSQL 18.3 release notes: https://www.postgresql.org/docs/release/18.3/
- PostgreSQL current docs: https://www.postgresql.org/docs/current/index.html
- SQLite homepage/current release: https://sqlite.org/
- SQLite 3.53.1 release: https://sqlite.org/releaselog/3_53_1.html
- SQLite change history: https://www.sqlite.org/changes.html
- Fastify validation and serialization: https://fastify.io/docs/latest/Reference/Validation-and-Serialization/
- Drizzle schema declaration: https://orm.drizzle.team/docs/sql-schema-declaration
- Drizzle v1 beta release notes: https://orm.drizzle.team/docs/latest-releases/drizzle-orm-v1beta2
- Zod v4 release notes: https://zod.dev/v4
- TanStack Form validation docs: https://tanstack.com/form/v1/docs/framework/react/guides/validation
- shadcn/ui TanStack Form guide: https://ui.shadcn.com/docs/forms/tanstack-form
- Vite docs: https://vite.dev/
- Tailwind CSS docs: https://tailwindcss.com/
- shadcn/ui theming: https://ui.shadcn.com/docs/theming
- react-i18next docs: https://react.i18next.com/
- better-sqlite3 README: https://github.com/WiseLibs/better-sqlite3

---

## 41. Final decision summary

Use this stack:

```text
Fastify + TypeScript
Zod v4
Drizzle ORM v1 beta/RC
SQLite + PostgreSQL 18
better-sqlite3
Vite + React
TanStack Router
TanStack Query
TanStack Form
Tailwind + shadcn/ui
i18next + react-i18next
DB-backed jobs only
```

Do not use:

```text
BullMQ
Redis
React Hook Form
Next.js server mode
Nuxt server mode
GraphQL initially
Microservices initially
One custom generated Drizzle schema abstraction
```

Architectural rule:

```text
Share contracts, schemas, enums, money logic, and ledger logic in packages/common.
Keep Drizzle table declarations dialect-specific but thin.
Keep SQLite and PostgreSQL first-class from v0.1.
Keep the UI simple while the ledger engine is serious.
```
