# Frontend Design

This document describes Fastifly's frontend architecture and UX principles.

Fastifly should feel simple for daily use while exposing advanced finance controls only when needed.

---

## Stack

Frontend stack:

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
i18n
vite-plugin-pwa
```

### UI component foundation

Use shadcn/ui as the reusable primitive layer from the start.

Project defaults:

```text
style: radix-nova
physical path: apps/web/src/components/ui
import alias: @ui/*
utility alias: @/*
CSS file: apps/web/src/styles.css
```

Rules:

- generated shadcn/ui primitives live only in `apps/web/src/components/ui`
- product-specific composed components live in `apps/web/src/ui`
- application code may import primitives through `@ui/button`, `@ui/card`, and similar aliases
- do not put Fastifly business logic inside generated primitive components
- use shadcn/Tailwind theme tokens for reusable UI, then layer Fastifly product tokens only where the product shell needs a distinct surface
- style presets such as `nova`, `vega`, and `luma` are developer-time source presets, not runtime user theme options
- runtime user theme options are light/dark/system, and later may include accent color and density

Do not use:

```text
Next.js server mode
Nuxt server mode
React Native
```

Native mobile will be handled later with Capacitor.

---

## Goals

The frontend should be:

- fast
- modern
- mobile-first
- installable as PWA
- dark-theme ready
- multi-language ready
- simple by default
- advanced when needed
- accessible
- permission-aware
- API-contract-driven
- safe for finance workflows

---

## UX principle

Fastifly uses one finance engine with multiple UI depths.

```text
Simple view
  → daily tracking and common workflows

Advanced view
  → ledger, imports, rules, reconciliation, deep reports
```

Do not build two separate apps.

Use progressive disclosure:

```text
basic form
  -> advanced options
  -> full ledger/accounting details
```

---

## App layout

### Desktop

```text
sidebar navigation
main content
optional right panel
```

### Tablet

```text
collapsible sidebar
main content
sheet panels
```

### Mobile

```text
bottom navigation
floating/primary add action
sheet forms
card lists
```

Mobile bottom nav:

```text
Home
Transactions
Accounts
Budgets
More
```

Rules:

- render at most four primary destinations in the fixed phone tab bar
- put every other destination in a More drawer
- account for `env(safe-area-inset-bottom)` on phones
- active state must use longest-prefix matching so nested routes highlight the correct tab
- never hide a route completely just because it is not in the primary tab bar

---

## Navigation

### Simple navigation

```text
Dashboard
Transactions
Accounts
Budgets
Reports
Settings
```

### Advanced navigation

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

Advanced areas should be discoverable but not noisy.

---

## Simple and advanced preferences

User settings should support:

```text
default UI mode: simple | advanced | remember
show advanced navigation
compact tables
transaction form mode: simple | advanced | remember
account view mode: cards | table | ledger
report complexity: basic | advanced
```

Remember per-screen mode where useful.

---

## Required global UI states

Every major screen must handle:

```text
loading
empty
error
success
offline
permission denied
```

All states must work on mobile and dark theme.

---

## Permission-aware UI

Frontend uses CASL for UX gating.

Examples:

```tsx
<Can I="create" a="Transaction" ability={ability}>
  <Button>Add transaction</Button>
</Can>
```

Rules:

- hide actions the user cannot perform
- show clear permission-denied messages
- do not rely on frontend permissions for security
- backend remains source of enforcement

Viewer should not see create/edit/delete controls.

Editor should not see member-management controls.

---

## Mobile-first screens

The following screens must be mobile-friendly from first implementation:

```text
login
passkey setup/login
dashboard
transactions
add transaction
transaction detail
accounts
budgets
reports
imports
settings
member sharing
PWA offline/update prompts
```

Avoid desktop-only wide tables. Use card lists on mobile.

---

## Theme

Use Tailwind CSS and shadcn/ui CSS variables.

Supported theme modes:

```text
light
dark
system
```

Rules:

- no hardcoded colors that break dark mode
- charts must support light/dark
- empty/error states must support dark theme
- PWA theme color should match current theme where practical

---

## Internationalization

Frontend must be multi-language ready.

Use i18n keys for user-facing strings.

Do not hardcode UI labels in components.

Suggested structure:

```text
apps/web/src/i18n/
├── index.ts
├── locales/
│   ├── en/common.json
│   ├── en/accounts.json
│   ├── en/transactions.json
│   ├── en/settings.json
│   └── hi/common.json
└── format.ts
```

Format dates, numbers, and money through shared helpers.

---

## Money formatting

All money formatting should go through shared helpers.

Requirements:

- integer minor units
- currency-aware formatting
- locale-aware formatting
- reporting/base currency display
- privacy mode support from the shared formatter
- no ad-hoc formatting in components

Privacy mode:

```text
mask amounts globally
preserve layout
never change stored values
quick toggle
export/API unaffected
```

---

## Shared workflow primitives

Finance screens must use shared workflow primitives instead of inventing local patterns per feature.

Required primitives:

```text
modal/dialog
confirm destructive action
sheet/drawer form
autocomplete picker
saved filter picker
date/period picker
currency/money input
toast/notification
inline mutation result
permission denied state
sync conflict state
import review table
virtualized table/list
command palette
return-to navigation state
```

Rules:

- destructive confirmations use consistent copy, severity, and focus behavior
- mutation success/failure is visible and accessible
- return-to state survives edit/delete flows
- PWA update prompts never interrupt active saves, import commits, or sync conflict review
- command palette actions respect permissions and current workspace/ledger scope
- virtualized transaction tables preserve keyboard navigation and row selection

---

## Forms

Use TanStack Form.

Use shared Zod schemas from:

```text
packages/common/src/schemas
```

Form rules:

- map backend validation errors to fields
- support dotted nested field paths
- support mobile layout
- preserve unsaved state where appropriate
- prevent PWA update from interrupting active mutation/form
- show inline and summary errors for complex forms

---

## Transaction form

### Simple transaction form

Fields:

```text
type: expense | income | transfer
amount
account
category/destination
date
description
save
```

### Advanced options

Fields:

```text
tags
payee
notes
status
budget
exchange rate
foreign amount
attachments
metadata
```

### Ledger details

Advanced users can inspect:

```text
transaction group
journals
postings
source/destination accounts
reporting amounts
exchange-rate snapshot
audit information
```

---

## Split transaction UI

Split transactions must support row-level errors.

Example paths:

```text
transactions.0.amountMinor
transactions.0.destinationAccountId
transactions.1.categoryId
```

Mobile split UI:

- one row as a card
- clear add/remove split line
- sticky total
- difference indicator
- row-level validation messages

Desktop split UI:

- table-like layout
- keyboard-friendly controls
- totals summary

---

## Transaction list

User-facing list displays transaction groups.

Simple row/card:

```text
description
date
account
category
amount
status
```

Advanced row/table:

```text
group id
journal count
source
destination
category
tags
currency
reporting amount
status
import source
rule matched
created by
```

Rows can expand to show journals and postings.

---

## Return-to and workflow state

Fastifly should preserve workflow state.

Examples:

- return to previous filtered transaction list after edit
- return to report drill-down after transaction detail
- preserve search/filter state
- preserve page/cursor where practical
- save-and-add-another after transaction create
- show mutation success/failure clearly

Do not lose user context after create/edit/delete.

---

## Dashboard

Simple dashboard:

```text
net worth
monthly income
monthly expenses
cashflow
budget progress
recent transactions
account balances
```

Advanced dashboard:

```text
net worth by ledger
multi-currency exposure
unreconciled transactions
import pending items
rule automation status
exchange-rate impact
liability/asset breakdown
audit warnings
```

Dashboard respects:

- selected period
- selected ledger
- selected accounts
- reporting currency preference
- excluded/inactive accounts
- privacy mode

---

## Accounts UI

Simple account types:

```text
Bank
Cash
Wallet
Credit Card
Loan
Investment
```

Advanced/accounting types:

```text
Asset
Liability
Revenue
Expense
Equity
External
Opening helper
Reconciliation helper
```

Account selector must understand transaction type and account compatibility matrix.

Do not let users select invalid account pairs.

Backend still validates.

---

## Budgets UI

Simple:

```text
monthly budget
category limit
spent
remaining
```

Advanced:

```text
weekly
bi-weekly
semi-monthly
monthly
quarterly
yearly
custom range
rollover
multi-currency budget
linked accounts
```

Use shared period service.

---

## Imports UI

Simple import flow:

```text
upload CSV
choose profile
preview
commit
```

Advanced import flow:

```text
column mapping
date format
amount sign rules
duplicate detection
transfer matching
rule preview
dry run
undo import batch
save import profile
```

Import commit must not be interrupted by PWA update prompt.

---

## Rules UI

Simple rule:

```text
When description contains "Uber", set category to Travel.
```

Advanced rule builder:

```text
(description contains "Uber" OR description contains "Ola")
AND amount < 3000
THEN set category = Travel
```

Rules and search share the same operator language.

Rule test view should show matched transactions before applying.

---

## Recurring UI

Recurring templates should feel like transaction templates with schedule.

Fields:

```text
name
schedule
start date
end date optional
transaction template
next occurrence
active/inactive
```

Generated transactions are normal transaction groups.

---

## Reconciliation UI

Reconciliation should be a guided flow, not a generic transaction edit.

Required:

- select account
- select statement date
- enter statement balance
- list unreconciled transactions
- mark cleared/reconciled
- show difference
- finish only when balanced or explicitly allowed

Mobile variant required.

---

## Reports UI

Reports provide drill-down links back to filtered transaction lists.

Examples:

- click category total → transaction list filtered by category/date
- click budget overspend → transaction list filtered by budget/date
- click account balance → account transaction list

Reports use shared period service and TransactionQueryService.

---

## Member sharing UI

Location:

```text
Settings → Members
```

Must support mobile.

Screens:

- member list
- invite member
- role selector
- pending invites
- revoke invite
- change role
- remove member
- invitation accept page

No email support. Invites are copyable links.

---

## PWA UI

Required UI:

- install prompt where appropriate
- offline status indicator
- sync status indicator
- pending outbox count
- conflict review entry point
- update available prompt
- allowed offline write forms continue to work
- unsafe write actions disabled while offline
- clear offline message

v0.1 supports a limited offline write set through the local outbox:

```text
transaction_group.create_expense.v1
transaction_group.create_income.v1
transaction_group.create_transfer.v1
category.create.v1
budget.assign_category_month.v1
```

All other writes are online-only unless a later ADR expands the safe offline surface.

---

## Frontend API usage

Use TanStack Query for server state.

Do not duplicate server state into custom stores.

Use centralized API client.

API client should handle:

- generated OpenAPI path typing
- base URL
- JSON parsing
- standard errors
- validation errors
- auth/session errors
- request ID display where useful
- idempotency key injection for supported mutations
- device ID attachment for sync operations
- outbox operation submission
- sync conflict errors

Runtime configuration:

```text
VITE_FASTIFLY_API_BASE_URL
FASTIFLY_API_PROXY_TARGET
```

Rules:

- do not hand-type route URLs, path params, query params, or response payloads when the route is present in `apps/web/src/api/generated/openapi.ts`
- use `openapi-fetch` for typed request construction
- keep shared Zod schemas for runtime response validation at the app boundary
- regenerate with `pnpm api:generate` whenever API route schemas change
- verify generated-contract drift with `pnpm api:check`

- empty value means same-origin API calls
- non-empty value must not end with a slash after normalization
- local Vite development should prefer same-origin API calls through the Vite
  proxy, using `FASTIFLY_API_PROXY_TARGET` to point at the API server
- never hardcode localhost API URLs in components
- authenticated requests use `credentials: include`
- request and response contracts come from `packages/common`

Auth forms must use the shared auth credential schema. Login and registration call:

```text
GET /api/v1/auth/csrf
POST /api/v1/auth/login
POST /api/v1/auth/register
GET /api/v1/me/context
```

The frontend must fetch a CSRF token before cookie-auth unsafe requests, send it
as `x-csrf-token`, keep `credentials: include`, and retry once with a fresh
token only when the server returns a CSRF-specific forbidden error.

The login screen may display seeded demo credentials for local development, but
the demo username/password must come from `packages/common`, not duplicated
inside React components, DB seeds, or tests.

When a request returns `UNAUTHENTICATED` after the app has already established a
valid user context, the frontend must keep the current screen visible and show a
blocking re-authentication dialog. First-time unauthenticated visits still
redirect to `/login`. The expired-session dialog must:

- be non-dismissible except by successful login or switching accounts
- use the existing username when known
- refresh `/api/v1/me/context` after successful login
- clear local query state and navigate to `/login` when switching accounts
- work on mobile and dark theme

The service worker registers only in production builds. Development builds must avoid service worker registration so stale app-shell caches do not hide frontend changes.

---

## Testing

Required frontend tests:

- permission-gated UI
- transaction form validation
- split row validation
- mobile transaction form
- dark theme rendering
- offline state
- offline create expense/income/transfer
- outbox pending/syncing/failed/conflict states
- update prompt
- member invitation screens
- account compatibility selector behavior
- report drill-down navigation
- return-to state after edit

E2E tests:

- register/login
- passkey setup if practical
- create account
- create expense
- create split transaction
- invite member
- viewer cannot edit
- import preview
- PWA shell loads
