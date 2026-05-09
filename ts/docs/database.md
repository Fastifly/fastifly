# Database Design

This document describes the planned database design for Fastifly.

Fastifly supports SQLite and PostgreSQL as first-class database targets.

```text
SQLite      → default, easy self-hosting
PostgreSQL  → larger installs and serious deployments
```

The app does not dual-write to both databases. Each installation chooses one database driver.

---

## Goals

The database design should support:

- fast daily transaction tracking
- multi-currency accounts
- ledger-ready transaction storage
- SQLite and PostgreSQL from day one
- simple UI and advanced accounting views
- imports
- budgets
- rules
- recurring transactions
- reports
- device-scoped offline outbox sync
- operation replay and explicit conflicts
- audit history
- future multi-ledger and shared workspace support

---

## Non-goals

The initial database design should not require:

- Redis
- BullMQ
- Kafka
- event sourcing
- CQRS
- distributed transactions
- microservices
- Elasticsearch/OpenSearch

---

## Database strategy

Fastifly uses Drizzle ORM with dialect-specific schema definitions.

This is intentional.

```text
packages/db/src/sqlite/
  SQLite schema and migrations

packages/db/src/postgres/
  PostgreSQL schema and migrations

packages/common/
  shared enums, types, Zod schemas, money helpers, ledger helpers
```

SQLite and PostgreSQL have different type systems. Schema files may be dialect-specific, but business logic should not be duplicated.

Allowed duplication:

```text
sqlite table declarations
postgres table declarations
sqlite migrations
postgres migrations
dialect-specific indexes
dialect-specific optimized report queries
```

Not allowed duplication:

```text
SQLite transaction service
PostgreSQL transaction service
duplicated ledger logic
duplicated validation logic
duplicated API logic
```

---

## Supported database drivers

Configuration:

```env
DATABASE_DRIVER=sqlite
DATABASE_URL=./data/fastifly.db
```

or:

```env
DATABASE_DRIVER=postgres
DATABASE_URL=postgres://fastifly:fastifly@localhost:5432/fastifly?sslmode=disable
```

Supported values:

```text
sqlite
postgres
```

---

## SQLite settings

SQLite should be configured explicitly.

Required startup pragmas:

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
```

Reasons:

- foreign keys must be enforced
- WAL improves read/write behavior
- busy timeout reduces lock errors
- normal synchronous mode is a practical default for web-app usage

---

## Money storage

Never use floating point numbers for money.

Use integer minor units:

```text
₹125.50  -> 12550
$10.99   -> 1099
¥500     -> 500
```

Core representation:

```ts
type MoneyAmount = {
  amountMinor: string;
  currencyCode: string;
};
```

Use strings in API payloads when needed to avoid JavaScript precision issues.

Database column concept:

```text
amount_minor   integer / bigint
currency_code  text / varchar(3)
```

---

## ID strategy

Synced domain objects should use UUIDv7-compatible sortable text IDs.

This applies to:

```text
workspaces
ledgers
accounts
categories
transaction_groups
transaction_journals
transaction_postings
budgets
budget_limits
import_batches
import_rows
recurring_templates
sync_operations
```

Do not rely on auto-increment IDs for objects that may be created by the client while offline. The server must validate ID format, scope, uniqueness, and ownership.

---

## Sync and offline operation storage

v0.1 includes a limited offline outbox model.

Server-side tables to plan:

```text
devices
- id
- user_id
- name
- platform
- public_key
- last_seen_at
- created_at
- revoked_at

workspace_ledger_revisions
- workspace_id
- ledger_id
- current_revision
- updated_at

sync_operations
- id
- workspace_id
- ledger_id
- device_id
- local_sequence
- operation_type
- operation_version
- base_revision
- server_revision
- idempotency_key
- payload_json
- payload_encoding
- encrypted_payload
- key_version
- status
- result_json
- created_by
- created_at
- received_at

sync_conflicts
- id
- workspace_id
- ledger_id
- operation_id
- conflict_type
- client_payload_json
- server_state_json
- resolution_status
- resolved_by
- resolved_at
- created_at
```

Required uniqueness:

```text
unique(sync_operations.id)
unique(sync_operations.device_id, sync_operations.local_sequence)
unique(sync_operations.workspace_id, sync_operations.ledger_id, sync_operations.server_revision)
```

Client outbox storage is local-only, but the documented shape must stay aligned with API contracts. It should store operation ID, device ID, local sequence, operation type/version, base revision, payload, idempotency key, and status.

The server applies sync operations through normal domain services. Do not accept raw row patches from clients.

---

## Multi-currency model

Multi-currency support is required from day one.

Principles:

- every account has a currency
- every posting has a currency
- every ledger has a base/reporting currency
- exchange-rate snapshots are stored for cross-currency transactions
- original transaction amounts are preserved
- reports can show original currency and reporting currency

### Currency table

```text
currencies
- code
- name
- symbol
- minor_units
- enabled
- created_at
- updated_at
```

Examples:

```text
INR, Indian Rupee, ₹, 2
USD, US Dollar, $, 2
JPY, Japanese Yen, ¥, 0
```

### Exchange rate table

```text
exchange_rates
- id
- base_currency_code
- quote_currency_code
- rate
- source
- rate_date
- created_at
```

Exchange rates should be snapshots, not mutable historical truth.

---

## Ledger model

Fastifly should expose simple transaction screens while storing data in a ledger-ready model.

Simple user-facing transaction types:

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

### Journal

A journal represents one financial event.

```text
transaction_journals
- id
- workspace_id
- ledger_id
- type
- occurred_at
- description
- notes
- payee_id
- status
- source
- external_id
- import_job_id
- created_by
- updated_by
- created_at
- updated_at
- deleted_at
```

Possible journal types:

```text
expense
income
transfer
opening_balance
adjustment
exchange
```

Possible statuses:

```text
pending
cleared
reconciled
void
```

### Posting

A posting represents one side/line of a journal.

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
- exchange_rate_snapshot_json
- category_id
- created_at
```

Signed amount convention:

```text
negative = money leaves account
positive = money enters account
```

### Same-currency invariant

For a same-currency journal:

```text
sum(transaction_postings.amount_minor) = 0
```

### Cross-currency invariant

For a cross-currency journal:

```text
original posting amounts are preserved
reporting amounts balance in ledger base currency
exchange-rate snapshot is stored
```

---

## Workspace and ledger structure

### Workspaces

A workspace groups users and financial data.

```text
workspaces
- id
- name
- slug
- created_at
- updated_at
```

### Workspace members

```text
workspace_members
- id
- workspace_id
- user_id
- role
- created_at
- updated_at
```

Roles may include:

```text
owner
admin
member
viewer
```

### Ledgers

A ledger is a book of financial records within a workspace.

```text
ledgers
- id
- workspace_id
- name
- kind
- base_currency_code
- default_locale
- created_at
- updated_at
- archived_at
```

Ledger kinds:

```text
personal
family
business
investment
other
```

Most user-owned financial tables should include:

```text
workspace_id
ledger_id
```

---

## Account model

Accounts represent where money comes from, goes to, or is categorized.

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
- opening_balance_date
- is_active
- archived_at
- created_at
- updated_at
```

Account kinds:

```text
asset
liability
revenue
expense
equity
```

User-friendly subtypes:

```text
bank
cash
wallet
credit_card
loan
investment
income_source
expense_category
external
```

The UI can show simple account types while the backend stores accounting-ready kinds.

---

## Categories and tags

### Categories

```text
categories
- id
- workspace_id
- ledger_id
- parent_id
- name
- color
- icon
- archived_at
- created_at
- updated_at
```

Categories can be hierarchical later.

### Tags

```text
tags
- id
- workspace_id
- ledger_id
- name
- color
- created_at
- updated_at
```

### Transaction tags

```text
transaction_tags
- transaction_journal_id
- tag_id
- created_at
```

---

## Budgets

Budgets should support simple monthly budgeting first while allowing flexible periods later.

```text
budgets
- id
- workspace_id
- ledger_id
- name
- currency_code
- period
- rollover_enabled
- archived_at
- created_at
- updated_at
```

Budget periods:

```text
weekly
bi_weekly
semi_monthly
monthly
quarterly
yearly
custom
```

Budget limits:

```text
budget_limits
- id
- budget_id
- category_id
- amount_minor
- currency_code
- start_date
- end_date
- created_at
- updated_at
```

---

## Payees

Payees are optional but useful for imports, reports, and rules.

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

---

## Imports

The import system should be built in, not external-only.

### Import jobs

```text
import_jobs
- id
- workspace_id
- ledger_id
- filename
- source
- status
- profile_id
- total_rows
- parsed_rows
- imported_rows
- skipped_rows
- error_rows
- created_by
- created_at
- updated_at
```

Statuses:

```text
uploaded
parsing
preview_ready
committing
completed
failed
cancelled
undone
```

### Import rows

```text
import_rows
- id
- import_job_id
- row_number
- raw_json
- parsed_json
- normalized_json
- status
- error_message
- duplicate_of_journal_id
- created_journal_id
- created_at
- updated_at
```

### Import profiles

```text
import_profiles
- id
- workspace_id
- ledger_id
- name
- source
- mapping_json
- options_json
- created_at
- updated_at
```

Import commit should be idempotent.

Undo should remove or reverse journals created by one import batch, depending on reconciliation/audit rules.

---

## Rules

Rules automate transaction classification and cleanup.

### Rule groups

```text
rule_groups
- id
- workspace_id
- ledger_id
- name
- is_active
- priority
- created_at
- updated_at
```

### Rules

```text
rules
- id
- rule_group_id
- name
- is_active
- priority
- condition_mode
- stop_processing
- created_at
- updated_at
```

Condition mode:

```text
all
any
custom
```

### Rule conditions

```text
rule_conditions
- id
- rule_id
- field
- operator
- value_json
- created_at
```

### Rule actions

```text
rule_actions
- id
- rule_id
- action_type
- value_json
- created_at
```

Future rule builder should support grouped AND/OR logic.

---

## Recurring transactions

Recurring templates define scheduled transactions.

```text
recurring_templates
- id
- workspace_id
- ledger_id
- name
- type
- schedule_json
- next_run_at
- last_run_at
- is_active
- created_at
- updated_at
```

Generated occurrences:

```text
recurring_occurrences
- id
- recurring_template_id
- scheduled_for
- transaction_journal_id
- status
- error_message
- created_at
- updated_at
```

Generation must be idempotent.

---

## Background jobs

Fastifly uses DB-backed jobs.

```text
job_queue
- id
- type
- payload_json
- status
- attempts
- max_attempts
- priority
- dedupe_key
- available_at
- locked_at
- locked_by
- last_error
- created_at
- updated_at
```

Statuses:

```text
pending
running
completed
failed
cancelled
```

Job types:

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

No Redis or BullMQ is required.

---

## Settings

### User settings

```text
user_settings
- user_id
- locale
- timezone
- date_format
- number_format_locale
- theme
- default_ui_mode
- created_at
- updated_at
```

Theme values:

```text
light
dark
system
```

UI modes:

```text
simple
advanced
remember
```

### Ledger settings

```text
ledger_settings
- ledger_id
- base_currency_code
- default_account_id
- default_budget_period
- created_at
- updated_at
```

---

## Audit log

Audit logging is important for finance data.

```text
audit_log
- id
- workspace_id
- ledger_id
- actor_user_id
- action
- entity_type
- entity_id
- before_json
- after_json
- ip_address
- user_agent
- created_at
```

Audit-sensitive actions:

```text
transaction.create
transaction.update
transaction.delete
transaction.reconcile
import.commit
import.undo
account.create
account.update
budget.update
rule.update
settings.update
```

---

## Sessions and auth tables

### Users

```text
users
- id
- email
- name
- password_hash
- email_verified_at
- created_at
- updated_at
```

### Sessions

```text
sessions
- id
- user_id
- token_hash
- user_agent
- ip_address
- expires_at
- created_at
- revoked_at
```

Use server-side sessions and HttpOnly cookies for browser login.

---

## Indexing strategy

Important indexes:

```text
users.email unique
sessions.token_hash unique
workspace_members.workspace_id
workspace_members.user_id

ledgers.workspace_id

accounts.workspace_id
accounts.ledger_id
accounts.currency_code
accounts.archived_at

transaction_journals.workspace_id
transaction_journals.ledger_id
transaction_journals.occurred_at
transaction_journals.type
transaction_journals.status
transaction_journals.import_job_id
transaction_journals.external_id

transaction_postings.journal_id
transaction_postings.account_id
transaction_postings.category_id
transaction_postings.currency_code

categories.workspace_id
categories.ledger_id
tags.workspace_id
tags.ledger_id

import_rows.import_job_id
job_queue.status
job_queue.available_at
job_queue.dedupe_key
```

Additional report-specific indexes can be added after measuring query plans.

---

## Soft delete and archival

Prefer archival for user-facing finance entities:

```text
archived_at
```

Use soft delete or audit-preserving deletes for sensitive financial records.

Transactions should not be hard-deleted casually after reconciliation or import commit.

---

## Date and time handling

Store timestamps consistently.

Preferred API format:

```text
ISO 8601 string
```

Store user timezone in settings.

Financial occurrence dates should be explicit and not depend only on server timezone.

Important fields:

```text
occurred_at
created_at
updated_at
rate_date
start_date
end_date
scheduled_for
```

---

## Migrations

Maintain separate migrations:

```text
packages/db/src/sqlite/migrations/
packages/db/src/postgres/migrations/
```

Rules:

- every database change needs both SQLite and PostgreSQL migrations
- migration names should be clear
- migrations should be tested in CI
- avoid SQLite-only features for core data
- avoid PostgreSQL-only features for core data unless abstracted

---

## Testing database behavior

Every database-sensitive feature should test both drivers.

Required tests:

```text
create account
create expense
create income
create transfer
create split transaction
create cross-currency transaction
calculate account balance
import CSV preview
commit import
undo import
apply rule
generate recurring transaction
```

Required invariants:

```text
same-currency postings balance to zero
cross-currency transactions store exchange snapshot
money values are integer minor units
workspace isolation is enforced
account balances equal postings
job dedupe works
import commit is idempotent
```

---

## Future considerations

Possible future improvements:

- report snapshots
- materialized balance cache
- API tokens
- attachment metadata
- bank sync adapters
- investment accounts
- advanced reconciliation
- import from other apps
- encrypted secrets storage
- backup/restore UI

These should be added without breaking the core ledger model.
