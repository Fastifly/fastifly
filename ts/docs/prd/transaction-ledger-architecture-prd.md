# PRD: Transaction and Ledger Architecture

## Feature name

Transaction and Ledger Architecture

## Status

Required before first account/transaction implementation.

## Summary

Fastifly must not implement transactions as simple CRUD rows. It needs a mature transaction and ledger architecture from day one so that simple daily-use screens can later support advanced finance behavior without painful rewrites.

The core model will use:

```text
transaction_groups
  └── transaction_journals
        └── transaction_postings
```

This gives Fastifly a user-friendly visible transaction layer while preserving ledger-safe accounting details underneath.

---

## Purpose

This PRD locks the day-one transaction architecture for Fastifly.

It covers:

- transaction groups
- journals and postings
- split transactions
- account compatibility matrix
- multi-currency amount semantics
- domain events
- balance dirtying and recalculation
- transaction query collector
- sync operation replay
- strict API contracts
- product-rule config
- semantic maintenance commands
- delete/archive/void behavior
- search/rules/bulk-edit shared language
- testing requirements

---

## Background

Fastifly is designed to start simple but grow into a serious self-hosted personal finance app.

A simple model like this is not enough:

```text
transactions
- id
- type
- amount
- account_id
- category_id
```

That model becomes painful when supporting:

- split transactions
- transfers
- reconciliation
- account compatibility rules
- multi-currency transactions
- cross-currency reporting
- imports
- undo import batch
- recurring templates
- rules
- bulk edit
- grouped display
- audit history
- account balance recalculation
- correction commands
- export/import parity
- advanced reports

Therefore, Fastifly should use a ledger-safe model from the first implementation.

---

## Goals

- Support simple transaction UI.
- Support advanced ledger/accounting views.
- Support split transactions.
- Support grouped visible transaction rows.
- Support multi-currency transactions.
- Support strict account-pair compatibility validation.
- Support domain events and side-effect ownership.
- Support balance dirtying and recalculation.
- Support centralized transaction querying.
- Support import, rules, reports, export, and search through shared query contracts.
- Support strict API fixtures before clients depend on responses.
- Support semantic maintenance and correction commands.
- Avoid scattering product rules as magic strings.
- Keep SQLite and PostgreSQL support first-class.

---

## Non-goals for v0.1

v0.1 does not need:

- full webhook implementation
- report snapshot cache
- bank sync
- bills/subscriptions
- savings goals
- investment accounting
- full native mobile offline sync
- broad offline editing of existing transaction data
- encrypted attachment storage
- advanced tax/accounting exports
- full event sourcing
- CQRS

However, the architecture should not block these later.

---

## Core decision

Fastifly will use:

```text
transaction_groups
transaction_journals
transaction_postings
```

### Why

A transaction group is the user-visible container.

A journal is an accounting event inside that group.

A posting is an individual signed movement of money.

This supports:

- one simple expense
- one income
- one transfer
- split transaction shown as one visible transaction
- import batch linking
- clone/copy
- bulk edit
- delete/void group
- grouped list display
- advanced journal/posting detail view
- future transaction links
- recurring-generated groups
- audit and side effects

---

## Core data model

### transaction_groups

Visible user-facing transaction container.

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

### transaction_journals

Accounting event inside a group.

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

Possible statuses:

```text
pending
cleared
reconciled
void
```

### transaction_postings

Signed money movements.

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

Signed amount convention:

```text
negative = money leaves account
positive = money enters account
```

---

## Transaction group semantics

### Simple transaction

A simple expense may be represented as:

```text
transaction_group
  └── transaction_journal
        ├── posting: bank account -500 INR
        └── posting: food expense +500 INR
```

### Split transaction

A split transaction may be represented as one group with multiple journals:

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

This allows the UI to show one visible transaction while preserving each split as a valid journal.

### Transfer

```text
transaction_group
  └── transaction_journal
        ├── source asset/liability -1000 INR
        └── destination asset/liability +1000 INR
```

### Opening balance

Opening balances must be represented as real journals/postings, not only as account fields.

```text
transaction_group
  └── transaction_journal
        ├── equity/opening helper -10000 INR
        └── asset account +10000 INR
```

---

## Ledger invariants

### Same-currency journals

For a same-currency journal:

```text
sum(transaction_postings.amount_minor) = 0
```

### Cross-currency journals

For cross-currency journals:

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
- account-pair validation must run on backend services, not only frontend forms

---

## Amount semantics

Fastifly must define amount terms clearly.

### Posting amount

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

Immutable data used for conversion and rounding.

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

### Display rules

- transaction detail may show original amount
- account view should prefer account currency
- reports should prefer reporting/base currency
- users may enable "convert to reporting currency"
- foreign amount is only shown where useful
- anonymous/privacy mode must be handled in shared money formatting later

---

## TransactionQueryService

Fastifly must add a central transaction query collector.

Suggested location:

```text
apps/api/src/modules/transactions/transaction-query.service.ts
```

or package-level if reused broadly:

```text
packages/transactions-query
```

### Responsibilities

```text
list transaction groups
list journals
filter by workspace/ledger
filter by account
filter by date range
filter by type/status/reconciled
filter by amount/currency
filter by category/tag/budget/payee/import
filter by metadata/external id
sort and paginate
project API/list/report/export shapes
```

### Consumers

```text
transaction list
dashboard recent transactions
search
reports
rules
export
import duplicate review
audit drill-down
autocomplete
charts
```

### Rule

Do not implement separate transaction filters in each module.

---

## Domain events

Fastifly should add a domain event boundary before services become CRUD-only.

Suggested package:

```text
packages/common/src/events
```

or backend module:

```text
apps/api/src/events
```

### Event examples

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
member.invited
member.role_changed
exchange_rate.updated
```

### Listener responsibilities

Listeners should own:

- audit log creation
- balance dirtying/recalculation scheduling
- report/cache invalidation
- rule execution when requested
- notification creation later
- webhook message creation later
- job enqueueing

### Mutation flags

Transaction mutations should support side-effect flags:

```text
applyRules
fireWebhooks
batchSubmission
skipNotifications
recalculateBalances
```

Some may be no-ops in v0.1, but the service boundary should support them.

---

## Balance dirtying and recalculation

Balances are derived, but Fastifly may later use snapshots/caches.

If balance caches are introduced, they must be rebuildable.

### Dirtying rules

Mark balances dirty when:

- amount changes
- account changes
- date/order changes
- currency/reporting amount changes
- transaction is deleted/voided
- transaction is reconciled/unreconciled
- exchange rate changes
- import batch is committed/undone

Recalculation should start from earliest affected occurred date.

### Suggested tables

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

### Required commands

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

Supported ranges:

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

Responsibilities:

- timezone-aware start/end
- previous/current period helpers
- chart bucket generation
- budget period generation
- recurring schedule support
- dashboard date navigation
- report ranges

Consumers:

```text
dashboard
reports
budgets
recurring jobs
charts
imports
future bills/subscriptions
```

---

## Strict API contract fixtures

Create fixtures for high-risk contracts before clients depend on them.

Suggested location:

```text
packages/common/src/fixtures
```

or:

```text
apps/api/test/fixtures/contracts
```

Required fixtures:

```text
transaction group create request
transaction group update request
transaction group detail response
transaction list response
split transaction validation error
paginated list response
account response with derived balances
recurring template response
rule response
permission denied response
idempotency replay response
sync push accepted response
sync push conflict response
```

Rules:

- IDs are strings
- money values are strings
- null relationships return `null`
- timestamps include timezone
- response schemas include computed/enriched fields
- raw DB columns must not leak directly into API contracts
- nested form errors must map to dotted paths like `transactions.0.amount`

---

## Sync command compatibility

Transaction writes must be callable through both normal REST routes and sync operation replay.

For v0.1, offline transaction support is limited to creation commands:

```text
transaction_group.create_expense.v1
transaction_group.create_income.v1
transaction_group.create_transfer.v1
```

Rules:

- sync payloads use client-generated UUIDv7-compatible IDs for groups, journals, and postings
- sync payloads use string money amounts
- sync replay uses the same account compatibility matrix as online creates
- sync replay uses the same ledger balancing checks as online creates
- duplicate `operation_id` returns the previous result
- stale `base_revision` creates an explicit conflict when needed
- reconciled updates, delete/void, imports, rules, and recurring generation are not accepted offline in v0.1

This keeps the ledger implementation single-sourced and prevents offline paths from bypassing domain invariants.

---

## Semantic maintenance commands

Fastifly must distinguish:

```text
schema migration
semantic upgrade
correction
integrity report
maintenance recalculation
```

### Required command categories

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

fastifly migrate status
fastifly migrate up

fastifly backup create
fastifly backup restore
```

### Definitions

Schema migration:

```text
table, column, and index changes
```

Semantic upgrade:

```text
valid old data transformed into new meaning
```

Correction:

```text
repair invalid live data safely
```

Integrity report:

```text
report issues without mutating data
```

Maintenance recalculation:

```text
rebuild caches/snapshots from source-of-truth records
```

---

## Product-rule config package

Create:

```text
packages/common/src/product-rules
```

It should centralize:

```text
account kinds and subtypes
valid account roles
source/destination compatibility matrix
transaction type inference
dynamic account creation rules
valid journal metadata keys
optional transaction fields
search operators
rule actions
bulk edit actions
date range aliases
allowed attachment MIME types
max upload sizes
future webhook modes
```

Do not scatter magic strings across forms, services, routes, and repositories.

---

## Metadata, notes, locations, attachments

Fastifly should design generic supporting records early.

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

Locations are optional and can wait, but reserve pattern:

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

## Delete, archive, void, and move semantics

Financial deletion must be service-driven.

Rules:

- accounts with postings should be archived, not hard deleted
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

## Search, rules, and bulk edit shared language

Create shared search/rule language.

Suggested package:

```text
packages/common/src/search
packages/common/src/rules
```

Features:

```text
search operator parser
query compiler
rule trigger mapping to search operators
negative/prohibited operators
bounded rule-test range
strict vs non-strict rule mode
stop-processing behavior
bulk edit actions
```

Consumers:

```text
transaction search
rule engine
bulk edit
reports
exports
import duplicate review
```

Goal:

```text
"description contains X and amount > Y"
```

must mean the same thing in search, rules, and bulk edit.

---

## Recurring templates

Recurring templates must reuse the normal transaction creation pipeline.

Rules:

- recurring templates are not transaction journals
- generated transactions are normal transaction groups/journals/postings
- generated transactions include recurrence metadata
- generation is idempotent by template/date
- generated transactions trigger normal side effects
- forced/manual generation is distinct from scheduled generation
- rules may apply to generated transactions if configured

---

## Export, autocomplete, chart, and destructive APIs

Fastifly should plan these as product features.

Rules:

- export APIs use same TransactionQueryService as UI lists
- autocomplete endpoints are workspace/ledger scoped
- chart endpoints have strict date/currency behavior
- destructive/purge endpoints are admin-only and audited
- bulk update delegates to normal update services
- API response fixtures exist for chart and export contracts when implemented

---

## Event boundary for future webhooks

Webhooks are not v0.1, but domain events should enable them later.

Future webhook behavior:

- domain events create webhook messages
- separate jobs deliver webhook messages
- delivery attempts logged
- URL validation prevents unsafe targets
- redirects disabled by default
- payloads signed with exact JSON sent
- retries and max attempts explicit

Day-one requirement:

```text
domain events exist, webhook implementation does not
```

---

## Preferences as product state

Fastifly should separate durable settings from cache/UI markers.

Preferences to model:

```text
date range preference
reporting currency display preference
dashboard account selection
optional transaction fields
compact table preference
last activity markers
convert-to-reporting-currency toggle
balance/cache invalidation markers
```

Use naming convention:

```text
settings = durable user choice
cache markers = derived/rebuildable app state
```

---

## Anonymous/privacy mode

Add shared money formatting support for anonymous/privacy mode from the first formatter implementation.

Required behavior:

- hide/mask amounts globally
- preserve layout
- never change stored values
- quick toggle
- user preference
- exports and API responses are unaffected

Reason:

```text
shared screens, demos, screenshots, support requests
```

Build this into money formatting early so every component does not format money independently.

---

## UI workflow requirements

The SPA must preserve mature finance workflows.

Required:

- split-row forms with row-level errors
- optional transaction fields stored as user preferences
- account selectors understand transaction type and compatibility rules
- save-and-add-another flow
- return-to/previous-page state
- group-level transaction list rows
- expandable journal/posting details
- bulk edit using same service validation
- guided reconciliation flow
- report drill-down links to filtered transaction list
- dashboard respects period/account/currency preferences
- mobile variants for splits, imports, reconciliation, member settings, rules, recurring
- PWA update/offline prompts must not interrupt transaction save/import commit

---

## Testing requirements

### Ledger tests

Required:

```text
expense creates balanced postings
income creates balanced postings
transfer creates balanced postings
split creates valid group/journals/postings
opening balance creates proper journal/postings
reconciliation transaction is valid
cross-currency transaction stores reporting values and exchange snapshot
```

### Account compatibility tests

Required:

```text
valid expense source/destination
invalid expense source
valid income source/destination
invalid income destination
valid transfer
invalid transfer account
valid opening balance
valid reconciliation helper
```

### Mutation side-effect tests

Required:

```text
transaction create emits event
transaction update emits event
transaction delete/void emits event
balance dirtying is scheduled
audit event is created once
report invalidation is scheduled
recurring generation is idempotent
import commit is idempotent
```

### Query collector tests

Required:

```text
filter by account
filter by date range
filter by category
filter by tag
filter by budget
filter by status
filter by currency
sort and paginate
same filters serve export/report/list
```

### API contract tests

Required:

```text
transaction create request fixture
transaction detail response fixture
split validation error fixture
pagination response fixture
permission denied fixture
idempotency replay fixture
sync operation accepted fixture
sync operation conflict fixture
```

### Database parity tests

Every transaction/account feature must pass on:

```text
SQLite
PostgreSQL
```

---

## Required docs updates

After accepting this PRD, update:

```text
docs/database-v2.md
docs/architecture-v2.md
docs/api-v2.md
docs/frontend-v2.md
docs/maintenance-v2.md
```

Minimum updates:

### docs/database-v2.md

Add:

- transaction groups
- journal metadata
- account metadata
- balance recalculation queue
- notes/attachments
- compatibility matrix
- delete/archive/void semantics

### docs/architecture-v2.md

Add:

- domain event/listener model
- TransactionQueryService
- product-rule config package
- semantic maintenance command categories
- side-effect ownership

### docs/api-v2.md

Add:

- strict fixtures
- nested validation errors
- pagination
- idempotency
- enriched response contracts

### docs/frontend-v2.md

Add:

- split-row errors
- optional field preferences
- transaction group UI
- guided reconciliation
- return-to state
- drill-down report flows

### docs/maintenance-v2.md

Add:

- integrity commands
- correction commands
- recalculation commands
- migration vs semantic upgrade distinction

---

## MVP acceptance criteria

Before implementing transaction/account modules:

- [ ] `transaction_groups` decision accepted and added to database docs
- [ ] account compatibility matrix defined in `packages/common`
- [ ] amount/reporting/foreign amount semantics documented
- [ ] TransactionQueryService contract documented
- [ ] domain event names documented
- [ ] balance dirtying strategy documented
- [ ] strict transaction/account API fixtures planned
- [ ] semantic maintenance command categories documented
- [ ] product-rule package planned
- [ ] delete/archive/void behavior documented
- [ ] search/rules/bulk-edit shared language planned
- [ ] recurring templates defined to use normal transaction pipeline
- [ ] tests listed for SQLite and PostgreSQL parity

---

## Resolved ledger decisions

1. A visible transaction is a `transaction_group`; splits are represented as multiple journals inside the group.
2. Group type is stored for query/display speed and validated against journal/posting/account compatibility.
3. The account compatibility matrix is not user-configurable in v0.1.
4. Foreign amount is not allowed on same-currency transactions unless a later explicit feature needs it.
5. Reporting amount is stored at creation/update time; same-currency reporting amount equals original amount.
6. v0.1 requires balance dirtying and recalculation commands; balance snapshots can be introduced when report performance requires them.
7. Journal metadata uses an allowlisted generic metadata table from day one.
8. Attachments are schema-ready in v0.1; full attachment UX can wait.
9. Reconciled transactions use void/soft-delete semantics, not hard delete.
10. Bulk edit can wait, but its future actions must reuse the normal transaction update service.
