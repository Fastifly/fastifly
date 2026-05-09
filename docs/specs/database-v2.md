# Database Design

This document describes Fastifly's database design.

Fastifly supports SQLite and PostgreSQL as first-class database targets.

```text
SQLite      → default, easy self-hosting
PostgreSQL  → larger installs and serious deployments
```

The app does not dual-write to both databases. Each installation chooses one database driver.

---

## Goals

The database design must support:

- fast daily personal finance tracking
- family/partner workspace sharing
- multi-ledger architecture
- multi-currency from day one
- double-entry-ready ledger behavior
- split transactions
- imports and import undo
- rules and recurring transactions
- budgets and reports
- device-scoped offline outbox sync
- operation replay/idempotency
- explicit sync conflicts
- audit history
- semantic maintenance and correction commands
- SQLite and PostgreSQL parity

---

## Non-goals

The initial database design does not require:

- Redis
- BullMQ
- Kafka
- event sourcing
- CQRS
- microservices
- Elasticsearch/OpenSearch
- bank-sync provider storage
- receipt OCR pipeline

---

## Database strategy

Fastifly uses Drizzle ORM with dialect-specific schema definitions.

```text
packages/db/src/sqlite/
  SQLite schema and migrations

packages/db/src/postgres/
  PostgreSQL schema and migrations

packages/common/
  shared enums, types, Zod schemas, money helpers, ledger helpers, product rules
```

SQLite and PostgreSQL have different type systems. Schema files may be dialect-specific, but business logic must not be duplicated.

Allowed duplication:

```text
SQLite table declarations
PostgreSQL table declarations
SQLite migrations
PostgreSQL migrations
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

## Database configuration

SQLite:

```env
DATABASE_DRIVER=sqlite
DATABASE_URL=./data/fastifly.db
```

PostgreSQL:

```env
DATABASE_DRIVER=postgres
DATABASE_URL=postgres://fastifly:fastifly@localhost:5432/fastifly?sslmode=disable
```

Supported drivers:

```text
sqlite
postgres
```

Package drivers:

```text
sqlite: better-sqlite3
postgres: @electric-sql/pglite for tests; production driver selected before hosted Postgres wiring
```

---

## SQLite runtime settings

SQLite must be configured explicitly.

Required startup pragmas:

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
```

Reasons:

- foreign keys must be enforced
- WAL improves practical read/write behavior
- busy timeout reduces lock errors
- normal synchronous mode is a practical default for web-app usage

---

## Date and time handling

Store timestamps consistently.

API timestamp format:

```text
ISO 8601 string with timezone
```

Database storage:

- PostgreSQL uses `timestamptz` for timestamps.
- SQLite stores normalized ISO 8601 UTC strings for timestamps.
- Date-only financial fields stay date-only and must not be shifted by server timezone.

Store user timezone in settings.

Financial occurrence dates must be explicit and must not depend only on server timezone.

Important fields:

```text
occurred_at
created_at
updated_at
rate_date
start_date
end_date
scheduled_for
from_occurred_at
last_seen_at
expires_at
```

Rules:

- `created_at` and `updated_at` are system timestamps.
- `occurred_at` is the user/business transaction time.
- `rate_date`, `start_date`, `end_date`, and `scheduled_for` are product dates and must be timezone-aware at the service boundary.
- Period bucketing uses the ledger/user timezone from shared period utilities.

---

## Core ownership model

Fastifly is multi-user and sharing-ready from day one.

Most user-owned data must be scoped by:

```text
workspace_id
ledger_id
```

### workspaces

```text
workspaces
- id
- name
- slug
- status
- created_by
- created_at
- updated_at
- archived_at
```

### workspace_members

```text
workspace_members
- id
- workspace_id
- user_id
- role
- status
- joined_at
- created_at
- updated_at
```

Roles:

```text
owner
admin
editor
viewer
```

Statuses:

```text
active
removed
suspended
```

### workspace_invitations

```text
workspace_invitations
- id
- workspace_id
- role
- token_hash
- status
- invited_by
- expires_at
- accepted_by
- accepted_at
- declined_at
- revoked_at
- created_at
- updated_at
```

Invitations use copyable links. Fastifly does not require email support.

### ledgers

A ledger is a financial book inside a workspace.

```text
ledgers
- id
- workspace_id
- name
- kind
- status
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

Workspace and ledger statuses:

```text
active
read_only
maintenance
pending_restore
restore_preview
archived
broken
```

Writes are allowed only in `active` state unless a maintenance command explicitly enters `maintenance`. Sync push, import commit, recurring generation, rule application, and normal API mutations must reject read-only, archived, restore-preview, pending-restore, or broken workspaces/ledgers.

---

## ID strategy

All synced domain objects use text IDs generated before persistence.

Default ID format:

```text
UUIDv7-compatible sortable text IDs
```

Rules:

- do not use auto-increment IDs for synced domain objects
- IDs are stored as text in SQLite and PostgreSQL for v0.1 portability
- clients may generate IDs for allowed offline operations
- server must validate ID format and ownership scope
- internal-only operational rows may use server-generated text IDs
- API responses always expose IDs as strings

Synced domain objects include:

```text
workspace
ledger
account
category
tag
payee/counterparty
transaction group
transaction journal
transaction posting
budget
import batch/row
recurring template
sync operation
```

This keeps PWA offline writes, imports, backups, and future native sync from depending on server round trips for object identity.

---

## Users and authentication tables

Fastifly v0.1 supports username/password and passkeys.

### users

```text
users
- id
- username
- username_normalized
- display_name
- password_hash
- created_at
- updated_at
- disabled_at
```

### sessions

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

### passkeys

```text
passkeys
- id
- user_id
- credential_id
- public_key
- counter
- transports_json
- name
- created_at
- last_used_at
```

### recovery_codes

```text
recovery_codes
- id
- user_id
- code_hash
- used_at
- created_at
- expires_at
```

### devices

Each installed PWA/browser profile can register a stable device.

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
```

Device rules:

- revoked devices cannot push sync operations
- device IDs are included in sync operations and audit logs
- device keys are optional in v0.1 but the schema leaves room for encrypted sync/backup later
- logout does not necessarily revoke a device; explicit revoke does

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

Use strings in API payloads where needed to avoid JavaScript precision issues.

Database concept:

```text
amount_minor   integer / bigint
currency_code  text / varchar(3)
```

---

## Multi-currency model

Multi-currency support is required from day one.

Principles:

- every ledger has a base/reporting currency
- every account has a currency
- every posting has an original currency
- cross-currency transactions store exchange-rate snapshots
- original transaction amounts are preserved
- reports can show original currency and reporting/base currency

### currencies

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

### exchange_rates

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

Exchange rates are snapshots, not mutable historical truth.

---

## Amount semantics

Fastifly uses explicit amount semantics.

### Original posting amount

```text
amount_minor
currency_code
```

Original posting amount in the posting account/transaction currency.

### Foreign amount

```text
foreign_amount_minor
foreign_currency_code
```

Optional counter amount for cross-currency UX.

This is not the same as reporting amount.

### Reporting amount

```text
reporting_amount_minor
reporting_currency_code
```

Amount converted into the ledger base/reporting currency.

### Exchange-rate snapshot

```text
exchange_rate_snapshot_json
```

Immutable conversion data used for conversion and rounding.

Should include:

```text
rate
base currency
quote currency
source
rate date
rounding mode
created at
```

---

## Transaction model

Fastifly uses:

```text
transaction_groups
  └── transaction_journals
        └── transaction_postings
```

A transaction group is the user-visible transaction container.

A journal is an accounting event inside that group.

A posting is a signed movement of money.

---

## transaction_groups

```text
transaction_groups
- id
- workspace_id
- ledger_id
- title
- type
- source
- external_id
- import_job_id
- created_by
- updated_by
- created_at
- updated_at
- deleted_at
```

Possible group types:

```text
expense
income
transfer
split
opening_balance
reconciliation
adjustment
exchange
```

Group source values:

```text
manual
import
recurring
rule
api
system
```

---

## transaction_journals

```text
transaction_journals
- id
- workspace_id
- ledger_id
- group_id
- type
- occurred_at
- description
- notes
- payee_id
- status
- source
- external_id
- import_job_id
- recurrence_template_id
- created_by
- updated_by
- created_at
- updated_at
- deleted_at
```

Statuses:

```text
pending
cleared
reconciled
void
```

---

## transaction_postings

```text
transaction_postings
- id
- workspace_id
- ledger_id
- journal_id
- account_id
- amount_minor
- currency_code
- foreign_amount_minor
- foreign_currency_code
- reporting_amount_minor
- reporting_currency_code
- exchange_rate_snapshot_json
- category_id
- budget_id
- created_at
```

Signed convention:

```text
negative = money leaves account
positive = money enters account
```

---

## Transaction examples

### Simple expense

```text
transaction_group
  └── transaction_journal
        ├── posting: bank account -500 INR
        └── posting: food expense +500 INR
```

### Split transaction

```text
transaction_group: Grocery + household shopping
  ├── journal: Grocery portion
  │     ├── bank account -800 INR
  │     └── groceries +800 INR
  │
  └── journal: Household portion
        ├── bank account -400 INR
        └── household +400 INR
```

### Transfer

```text
transaction_group
  └── transaction_journal
        ├── source asset/liability -1000 INR
        └── destination asset/liability +1000 INR
```

### Opening balance

Opening balances are real journals/postings.

```text
transaction_group
  └── transaction_journal
        ├── equity/opening helper -10000 INR
        └── asset account +10000 INR
```

---

## Ledger invariants

### Same-currency journal

```text
sum(transaction_postings.amount_minor) = 0
```

### Cross-currency journal

```text
original posting amounts are preserved
reporting amounts balance in ledger reporting currency
exchange-rate snapshot is stored
```

### Source of truth

The source of truth is:

```text
transaction_postings
```

Balance snapshots and report snapshots are rebuildable caches.

---

## Account model

### accounts

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
opening_helper
reconciliation_helper
```

The UI can show simple account types while the backend stores accounting-ready kinds.

---

## Account compatibility matrix

Fastifly must enforce valid source/destination account pairs.

This must live in:

```text
packages/common/src/product-rules/account-compatibility.ts
```

Minimum matrix:

| Source kind/subtype | Destination kind/subtype | User-facing type |
|---|---|---|
| asset/liability | expense/external | expense |
| revenue/external | asset/liability | income |
| asset/liability | asset/liability | transfer |
| equity/opening helper | asset/liability | opening balance |
| reconciliation helper | asset/liability | reconciliation |

Rules:

- expense accounts should not be sources
- revenue accounts should not be destinations
- transfers should clear budget links unless transfer budgeting is explicitly supported
- opening balances must create journals/postings
- account currency preferences can override submitted/default currency
- dynamic account creation must be allowed only for configured account types
- compatibility validation runs on backend services, not only frontend forms

---

## Categories, tags, and payees

### categories

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

### tags

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

### transaction_tags

```text
transaction_tags
- transaction_journal_id
- tag_id
- created_at
```

### payees

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

### payee_aliases

```text
payee_aliases
- id
- workspace_id
- ledger_id
- payee_id
- alias
- normalized_alias
- source
- created_at
```

### payee_mappings

```text
payee_mappings
- id
- workspace_id
- ledger_id
- from_payee_id
- to_payee_id
- reason
- created_by
- created_at
```

Payee mappings preserve rules, reports, imports, and historical transactions after payee cleanup or merge. Do not rewrite historical import evidence just because a display payee was merged.

---

## Budgets

### budgets

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

### budget_limits

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

## Imports

### import_jobs

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

### import_rows

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
- external_id
- raw_payee
- normalized_payee_id
- match_confidence
- duplicate_of_group_id
- tombstoned_reimport_blocked
- created_group_id
- created_at
- updated_at
```

### import_profiles

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

Import commit must be idempotent.

Import undo should use the same transaction void/delete services as manual deletion.

Import behavior rules:

- keep raw row payloads for traceability
- keep parser/profile options per source/account
- distinguish duplicate, matched, skipped, failed, and tombstone-blocked rows
- do not silently reimport rows the user previously deleted unless a policy allows it
- stage created categories/payees before commit
- import commit uses the same transaction batch pipeline as manual creates
- import undo records audit/maintenance evidence

### saved_filters

```text
saved_filters
- id
- workspace_id
- ledger_id
- name
- kind
- condition_json
- sort_json
- created_by
- created_at
- updated_at
```

Saved filters are shared by transaction lists, reports, exports, rules, and import review. Enforce uniqueness by `(workspace_id, ledger_id, kind, name)` and reject duplicate condition sets where practical.

---

## Rules

### rule_groups

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

### rules

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

Condition modes:

```text
all
any
custom
```

### rule_conditions

```text
rule_conditions
- id
- rule_id
- field
- operator
- value_json
- created_at
```

### rule_actions

```text
rule_actions
- id
- rule_id
- action_type
- value_json
- created_at
```

Rules, search, and bulk edit must share one operator language.

---

## Recurring transactions

Recurring templates are not transaction journals.

They materialize normal transaction groups/journals/postings through the normal transaction creation pipeline.

### recurring_templates

```text
recurring_templates
- id
- workspace_id
- ledger_id
- name
- type
- schedule_json
- template_json
- next_run_at
- last_run_at
- is_active
- created_at
- updated_at
```

### recurring_occurrences

```text
recurring_occurrences
- id
- recurring_template_id
- scheduled_for
- transaction_group_id
- status
- error_message
- created_at
- updated_at
```

Generation must be idempotent by template/date.

Recommended uniqueness:

```text
unique(recurring_template_id, scheduled_for)
```

---

## Sync and offline operations

Fastifly v0.1 includes a limited offline-write sync model.

The server stores accepted operations as domain commands, not raw row replication. Applying an operation must call the normal service/use-case layer and produce transaction groups, journals, postings, domain events, audit rows, and recalculation jobs as needed.

### workspace_ledger_revisions

```text
workspace_ledger_revisions
- workspace_id
- ledger_id
- current_revision
- updated_at
```

The pair `(workspace_id, ledger_id)` is unique.

Every accepted ledger-scoped sync operation increments `current_revision`.

### sync_operations

```text
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
```

Required uniqueness:

```text
unique(id)
unique(device_id, local_sequence)
unique(workspace_id, ledger_id, server_revision)
```

Statuses:

```text
accepted
rejected
conflict
superseded
```

Allowed v0.1 offline operation types:

```text
transaction_group.create_expense.v1
transaction_group.create_income.v1
transaction_group.create_transfer.v1
category.create.v1
budget.assign_category_month.v1
```

Unsafe operations remain online-only in v0.1:

```text
transaction update/delete/void
reconciled transaction edit
import commit
recurring generation
backup restore
workspace/member changes
permission changes
maintenance/correction commands
exchange-rate changes
```

### sync_conflicts

```text
sync_conflicts
- id
- workspace_id
- ledger_id
- object_type
- object_id
- incoming_operation_id
- conflict_type
- local_revision
- incoming_base_revision
- local_snapshot_json
- incoming_payload_json
- status
- resolution_operation_id
- created_at
- resolved_at
```

Conflict types:

```text
stale_update
update_after_delete
delete_after_update
duplicate_unique_value
invalid_operation
reconciled_record_blocked
```

Statuses:

```text
open
resolved
dismissed
```

Finance conflicts must not be silently merged in v0.1.

### idempotency_receipts

```text
idempotency_receipts
- id
- workspace_id
- ledger_id
- actor_user_id
- device_id
- idempotency_key
- request_hash
- response_json
- status
- created_at
- expires_at
```

Use receipts for:

- transaction create
- sync push operation replay
- import commit
- invite accept
- recurring generation
- backup restore commands if exposed through API

Idempotency receipts are separate from `sync_operations` because normal online REST writes also need replay safety.

### client outbox schema

The browser local database should include:

```text
outbox_operations
- id
- workspace_id
- ledger_id
- device_id
- local_sequence
- operation_type
- operation_version
- base_revision
- payload_json
- payload_encoding
- created_at
- synced_at
- failed_at
- failure_reason
```

Client outbox data is local-only and is not part of the server database schema, but the shape must be documented so API contracts and frontend storage stay aligned.

### E2EE-ready payload envelope

Payload columns support plaintext now and encrypted payloads later.

```text
payload_encoding:
- plaintext.v1
- encrypted.v1
```

When encrypted payloads are introduced, the product must still define how server-side ledger validation, search, reports, sharing, recovery, and conflict resolution work. Until then, v0.1 sync payloads are plaintext domain commands.

---

## Metadata, notes, attachments, locations

### journal_meta

```text
journal_meta
- id
- workspace_id
- ledger_id
- journal_id
- key
- value_json
- created_at
- updated_at
```

Possible keys:

```text
import_hash
external_id
bank_reference
original_description
business_date
recurrence_counter
previous_date
```

### account_meta

```text
account_meta
- id
- workspace_id
- ledger_id
- account_id
- key
- value_json
- created_at
- updated_at
```

Possible keys:

```text
include_in_net_worth
account_number_masked
liability_interest_rate
credit_limit
opening_balance_journal_id
```

### notes

```text
notes
- id
- workspace_id
- ledger_id
- noteable_type
- noteable_id
- body
- created_by
- created_at
- updated_at
```

### attachments

```text
attachments
- id
- workspace_id
- ledger_id
- attachable_type
- attachable_id
- filename
- title
- description
- mime
- size
- checksum
- storage_key
- uploaded_by
- created_at
- updated_at
```

Rules:

- upload limits enforced
- MIME allowlist
- no path traversal
- backup/export behavior documented
- integrity command later checks orphaned files

### locations

Locations are optional and may wait.

```text
locations
- id
- workspace_id
- ledger_id
- locatable_type
- locatable_id
- latitude
- longitude
- zoom_level
- created_at
```

---

## Balance dirtying and recalculation

Balances are derived. If caches/snapshots are used, they must be rebuildable.

### balance_recalculation_queue

```text
balance_recalculation_queue
- id
- workspace_id
- ledger_id
- account_id
- currency_code
- from_occurred_at
- reason
- status
- created_at
- updated_at
```

### account_balance_snapshots

```text
account_balance_snapshots
- id
- workspace_id
- ledger_id
- account_id
- currency_code
- balance_minor
- reporting_balance_minor
- as_of
- source
- verified_at
- created_at
```

Dirtying triggers:

- amount changed
- account changed
- date/order changed
- currency/reporting amount changed
- transaction deleted/voided
- transaction reconciled/unreconciled
- exchange rate changed
- import committed/undone

Recalculation starts from earliest affected occurred date.

---

## Background jobs

Fastifly uses DB-backed jobs only.

### job_queue

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
maintenance.recalculate-balances
maintenance.recalculate-reporting-amounts
```

---

## Audit log

### audit_log

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
login
logout
password change
passkey add
passkey remove
recovery code generation
member invite
workspace role change
member removal
transaction create
transaction update
transaction delete
transaction reconcile
import commit
import undo
backup restore
settings update
```

Do not store secrets in audit logs.

---

## User settings and preferences

Preferences must be scoped deliberately. Do not place unrelated UI, cache, workspace, and system state into one generic JSON blob.

Preference scopes:

| Scope | Examples | Storage |
|---|---|---|
| Global user | language, theme, date format, number format, privacy mode | `user_settings` |
| Device-local | sidebar width, last open route, mobile table state, local outbox state | browser storage or future device table |
| Workspace | active ledger, feature flags, member defaults | `workspace_settings` |
| Ledger | base/reporting currency, first day of week, account display settings, budget mode | `ledger_settings` |
| Metadata/system | backup state, schema version, maintenance state, restore marker | dedicated system/maintenance tables |
| Rebuildable cache | dashboard cache markers, report invalidation markers | cache tables, never durable preferences |

### user_settings

```text
user_settings
- user_id
- active_workspace_id
- active_ledger_id
- locale
- timezone
- date_format
- number_format_locale
- theme
- privacy_mode_enabled
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

### ledger_settings

```text
ledger_settings
- ledger_id
- base_currency_code
- default_account_id
- default_budget_period
- first_day_of_week
- budget_mode
- account_display_mode
- created_at
- updated_at
```

Separate durable settings from rebuildable cache markers.

---

## Indexing strategy

Important indexes:

```text
users.username_normalized unique
sessions.token_hash unique
passkeys.credential_id unique
devices.user_id
devices.revoked_at

workspace_members.workspace_id
workspace_members.user_id
workspace_members.workspace_id + user_id unique

ledgers.workspace_id

accounts.workspace_id
accounts.ledger_id
accounts.currency_code
accounts.archived_at

transaction_groups.workspace_id
transaction_groups.ledger_id
transaction_groups.type
transaction_groups.import_job_id
transaction_groups.external_id

transaction_journals.workspace_id
transaction_journals.ledger_id
transaction_journals.group_id
transaction_journals.occurred_at
transaction_journals.type
transaction_journals.status
transaction_journals.import_job_id
transaction_journals.external_id

transaction_postings.workspace_id
transaction_postings.ledger_id
transaction_postings.journal_id
transaction_postings.account_id
transaction_postings.category_id
transaction_postings.budget_id
transaction_postings.currency_code

categories.workspace_id
categories.ledger_id
tags.workspace_id
tags.ledger_id

import_rows.import_job_id
sync_operations.workspace_id + ledger_id + server_revision unique
sync_operations.device_id + local_sequence unique
sync_operations.status
sync_conflicts.workspace_id
sync_conflicts.ledger_id
sync_conflicts.status
idempotency_receipts.workspace_id
idempotency_receipts.ledger_id
idempotency_receipts.actor_user_id + idempotency_key unique
job_queue.status
job_queue.available_at
job_queue.dedupe_key
balance_recalculation_queue.status
balance_recalculation_queue.account_id
```

Add report-specific indexes after measuring query plans.

---

## Delete, archive, void, and move semantics

Financial deletion must be service-driven.

Rules:

- accounts with postings should be archived, not hard-deleted
- deleting an account with postings requires move/reassignment or archive
- opening-balance journals must be updated/deleted with account changes
- recurring templates referencing deleted accounts must be disabled or repaired
- deleting one split row may delete one journal
- deleting a group deletes/voids all journals in the group
- reconciled data should prefer void/soft delete
- imported data should support undo batch
- import undo must use same transaction destroy/void services as manual deletion
- do not rely on DB cascades alone for financial behavior

---

## Migrations

Maintain separate migrations:

```text
packages/db/src/sqlite/migrations/
packages/db/src/postgres/migrations/
```

Rules:

- every DB change needs SQLite and PostgreSQL migrations
- production migrations are manual
- migration status command must exist
- production startup should fail clearly if migrations are pending
- destructive migrations require release notes and backup warning
- migrations are not semantic corrections

---

## Testing database behavior

Every database-sensitive feature should test both drivers.

Required test areas:

```text
create account
opening balance journal
create expense
create income
create transfer
create split transaction
create cross-currency transaction
account compatibility matrix
calculate account balance
import CSV preview
commit import
undo import
register device
push offline operation
pull sync operations
sync conflict creation
apply rule
generate recurring transaction
balance dirtying
maintenance recalculation
workspace isolation
ledger isolation
```

Required invariants:

```text
same-currency postings balance to zero
cross-currency transactions store exchange snapshot
money values are integer minor units
workspace isolation is enforced
ledger isolation is enforced
account balances equal postings
job dedupe works
import commit is idempotent
recurring generation is idempotent
sync operation replay is idempotent
stale sync update creates conflict
