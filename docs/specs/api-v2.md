# API Design

This document describes Fastifly's API conventions and planned API contracts.

Fastifly uses a REST API with OpenAPI documentation.

Base path:

```text
/api/v1
```

Documentation endpoints:

```text
/api/openapi.json
/api/docs
```

OpenAPI contract rules:

- the generated document must be OpenAPI `3.1.0`
- Fastify route schemas are the source of truth
- Zod v4 schemas are transformed through `fastify-type-provider-zod`
- the frontend imports generated OpenAPI path types from `apps/web/src/api/generated/openapi.ts`
- run `pnpm api:generate` after public API route/schema changes
- run `pnpm api:check` before merging API contract changes to catch stale generated types

---

## Goals

The API should be:

- consistent
- typed
- mobile-friendly
- PWA-friendly
- OpenAPI documented
- stable enough for future native apps
- strict about money and IDs
- safe for workspace/ledger sharing
- compatible with SQLite and PostgreSQL behavior
- easy for AI agents and contributors to understand

---

## Non-goals

The initial API is not:

- GraphQL
- RPC-only
- public banking API
- full collaborative CRDT API
- webhook delivery API
- enterprise SCIM/SSO API

These may be considered later if needed.

---

## API principles

### Versioned paths

All public app API routes must use:

```text
/api/v1
```

### JSON by default

Request and response bodies use JSON unless explicitly documented.

### Stable error shape

All API errors use the same high-level shape.

### Shared contracts

Shared request/response schemas belong in:

```text
packages/common/src/api
packages/common/src/schemas
```

### Backend validation

Frontend validation is never enough. Backend routes must validate input.

### Response enrichment

API responses should expose product-friendly shapes, not raw DB rows.

---

## Common scalar rules

### IDs

IDs are strings.

```json
{
  "id": "txn_grp_123"
}
```

Synced domain objects use client-generated UUIDv7-compatible text IDs unless an ADR chooses a different sortable text ID format.

This applies to:

- workspaces
- ledgers
- accounts
- categories
- transaction groups
- journals
- postings
- import batches/rows
- recurring templates
- sync operations

Server-generated IDs are still allowed for purely server-owned internal rows such as log entries when they are never synced to clients.

### Money

Money values are strings to avoid JavaScript precision problems.

```json
{
  "amountMinor": "12550",
  "currencyCode": "INR"
}
```

### Timestamps

Timestamps are ISO 8601 strings with timezone.

```json
{
  "createdAt": "2026-05-06T18:00:00.000Z"
}
```

### Nullable relationships

Use `null`, not empty string.

```json
{
  "payee": null
}
```

---

## Standard response shapes

### Success object

```json
{
  "data": {}
}
```

### Success list

```json
{
  "data": [],
  "pagination": {
    "limit": 50,
    "nextCursor": null,
    "previousCursor": null
  }
}
```

### Error

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action.",
    "details": {},
    "requestId": "req_..."
  }
}
```

### Validation error

Validation errors must map cleanly to frontend forms.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid fields.",
    "details": {
      "fields": {
        "transactions.0.amountMinor": ["Amount is required."],
        "transactions.0.accountId": ["Account is not valid for this transaction type."]
      }
    },
    "requestId": "req_..."
  }
}
```

Nested paths should use dotted notation.

---

## Pagination

Use cursor pagination for high-volume resources.

Required list response:

```json
{
  "data": [],
  "pageInfo": {
    "nextCursor": "cursor_abc",
    "previousCursor": null,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

Default limit:

```text
50
```

Maximum limit:

```text
100 or 200 depending on endpoint
```

Rules:

- stable sort required
- finance list cursors use the shared `ffcur_v1:` format
- cursor payloads must include API cursor version, list kind, stable sort key, and row id
- account lists sort by `name ASC, id ASC` and cursor on `(name, id)`
- transaction lists sort by latest journal occurred time `DESC, transaction_group.id DESC`
- mobile clients should be able to request small pages
- exports can use streaming or job-based export later
- repository/query services must fetch `limit + 1` rows and derive `hasNextPage` plus `nextCursor`
- `previousCursor` is `null` until reverse pagination is explicitly specified

---

## Sorting and filtering

Transaction filters must go through the TransactionQueryService.

Do not implement separate filter logic in each endpoint.

Common filters:

```text
workspaceId
ledgerId
accountId
dateFrom
dateTo
type
status
reconciled
amountMin
amountMax
currencyCode
categoryId
tagId
budgetId
payeeId
importJobId
search
savedFilterId
```

Common sorts:

```text
occurredAt desc
occurredAt asc
createdAt desc
amount desc
amount asc
```

Saved filter endpoints:

```text
GET    /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/saved-filters
POST   /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/saved-filters
GET    /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/saved-filters/:filterId
PATCH  /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/saved-filters/:filterId
DELETE /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/saved-filters/:filterId
```

Saved filters store strict condition JSON, not raw SQL or ad hoc query strings. Lists, reports, exports, import review, and rules should consume the same condition compiler.

---

## Idempotency

Use idempotency keys for write operations that may be retried.

Header:

```text
Idempotency-Key: <uuid>
```

Use idempotency for:

- transaction create
- import commit
- invite accept
- recurring generation
- sync push operation replay
- backup restore commands if exposed through API

Idempotency replay response must be fixture-tested.

---

## Sync API

Fastifly v0.1 includes limited offline-write sync for approved domain commands.

This is not raw SQL/table replication. The client pushes versioned domain operations, and the server applies them through the same services used by normal REST writes.

### Register device

```text
POST /api/v1/devices
GET  /api/v1/devices
POST /api/v1/devices/:deviceId/revoke
```

Each PWA install receives a stable `deviceId`. Revoked devices cannot push operations.

### Push operations

```text
POST /api/v1/sync/push
```

Request:

```json
{
  "workspaceId": "ws_123",
  "ledgerId": "ledger_123",
  "deviceId": "dev_123",
  "lastKnownServerRevision": "42",
  "operations": [
    {
      "operationId": "op_123",
      "localSequence": "12",
      "operationType": "transaction_group.create_expense.v1",
      "operationVersion": 1,
      "baseRevision": "42",
      "idempotencyKey": "idem_123",
      "payloadEncoding": "plaintext.v1",
      "createdAt": "2026-05-09T12:00:00.000Z",
      "payload": {}
    }
  ]
}
```

Response:

```json
{
  "data": {
    "accepted": [
      {
        "operationId": "op_123",
        "serverRevision": "43"
      }
    ],
    "rejected": [],
    "conflicts": [],
    "serverRevision": "43"
  }
}
```

Rules:

- `operationId` is globally unique
- `(deviceId, localSequence)` is unique
- duplicate `operationId` returns the previous accepted/rejected/conflict result
- operations include `workspaceId` and `ledgerId`
- server validates membership and ledger access before applying
- server rejects operations for archived/read-only/maintenance ledgers
- server applies accepted operations through `LedgerMutationRunner`
- operation payloads must use API money strings

### Pull operations

```text
GET /api/v1/sync/pull?workspaceId=ws_123&ledgerId=ledger_123&sinceRevision=42
```

Response:

```json
{
  "data": {
    "workspaceId": "ws_123",
    "ledgerId": "ledger_123",
    "fromRevision": "42",
    "toRevision": "47",
    "operations": [],
    "hasMore": false,
    "nextSinceRevision": null
  }
}
```

Pull responses are paginated. Clients skip operations they already applied from the same device.

### Sync status

```text
GET /api/v1/sync/status?workspaceId=ws_123&ledgerId=ledger_123
```

Response:

```json
{
  "data": {
    "workspaceId": "ws_123",
    "ledgerId": "ledger_123",
    "serverRevision": "47",
    "openConflicts": 0,
    "lastOperationAt": "2026-05-09T12:00:00.000Z"
  }
}
```

### Conflicts

```text
GET  /api/v1/sync/conflicts?workspaceId=ws_123&ledgerId=ledger_123
POST /api/v1/sync/conflicts/:conflictId/resolve
```

v0.1 conflict types:

```text
stale_update
update_after_delete
delete_after_update
duplicate_unique_value
invalid_operation
reconciled_record_blocked
```

Conflicts are not silently merged for finance data. The user must choose a resolution or apply a new explicit command.

### Allowed offline operation types

```text
transaction_group.create_expense.v1
transaction_group.create_income.v1
transaction_group.create_transfer.v1
category.create.v1
budget.assign_category_month.v1
```

All other operations are online-only until a later ADR expands the safe offline surface.

---

## Auth endpoints

No email support in v0.1.

### Register

```text
POST /api/v1/auth/register
```

Request:

```json
{
  "username": "priyanshu",
  "password": "strong-password"
}
```

Response:

```json
{
  "data": {
    "user": {
      "id": "user_123",
      "username": "priyanshu",
      "displayName": "priyanshu"
    }
  }
}
```

### Login

```text
POST /api/v1/auth/login
```

Request:

```json
{
  "username": "priyanshu",
  "password": "strong-password"
}
```

### Logout

```text
POST /api/v1/auth/logout
```

### Current user context

```text
GET /api/v1/me/context
```

Response:

```json
{
  "data": {
    "user": {
      "id": "user_123",
      "username": "priyanshu"
    },
    "activeWorkspace": {
      "id": "ws_123",
      "name": "Household",
      "role": "editor"
    },
    "activeLedger": {
      "id": "ledger_123",
      "name": "Household Ledger",
      "baseCurrencyCode": "INR"
    }
  }
}
```

---

## Passkey endpoints

### Start registration

```text
POST /api/v1/auth/passkeys/registration/start
```

### Finish registration

```text
POST /api/v1/auth/passkeys/registration/finish
```

### Start login

```text
POST /api/v1/auth/passkeys/login/start
```

### Finish login

```text
POST /api/v1/auth/passkeys/login/finish
```

### List passkeys

```text
GET /api/v1/me/passkeys
```

### Rename passkey

```text
PATCH /api/v1/me/passkeys/:passkeyId
```

### Remove passkey

```text
DELETE /api/v1/me/passkeys/:passkeyId
```

Rule:

```text
User cannot remove the last usable auth method.
```

---

## Recovery endpoints

No email reset.

Recovery support:

- CLI password reset
- recovery codes

Optional API endpoints for authenticated recovery-code management:

```text
POST /api/v1/me/recovery-codes
DELETE /api/v1/me/recovery-codes
```

Recovery codes are shown once and stored hashed.

---

## Workspace endpoints

```text
GET    /api/v1/workspaces
POST   /api/v1/workspaces
GET    /api/v1/workspaces/:workspaceId
PATCH  /api/v1/workspaces/:workspaceId
```

All workspace routes require membership unless creating a new workspace.

---

## Member and invitation endpoints

Invites use copyable links/tokens. No email delivery.

### Members

```text
GET    /api/v1/workspaces/:workspaceId/members
PATCH  /api/v1/workspaces/:workspaceId/members/:memberId
DELETE /api/v1/workspaces/:workspaceId/members/:memberId
```

### Invitations

```text
POST   /api/v1/workspaces/:workspaceId/invitations
GET    /api/v1/invitations/:token
POST   /api/v1/invitations/:token/accept
POST   /api/v1/invitations/:token/decline
DELETE /api/v1/workspaces/:workspaceId/invitations/:invitationId
```

Rules:

- token is stored hashed
- token expires
- token is single-use
- revoked token cannot be accepted
- accepted token cannot be reused

---

## Ledger endpoints

```text
GET    /api/v1/workspaces/:workspaceId/ledgers
POST   /api/v1/workspaces/:workspaceId/ledgers
GET    /api/v1/workspaces/:workspaceId/ledgers/:ledgerId
PATCH  /api/v1/workspaces/:workspaceId/ledgers/:ledgerId
DELETE /api/v1/workspaces/:workspaceId/ledgers/:ledgerId
```

Ledger delete should usually mean archive.

---

## Account endpoints

```text
GET    /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/accounts
POST   /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/accounts
GET    /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/accounts/:accountId
PATCH  /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/accounts/:accountId
DELETE /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/accounts/:accountId
```

Account delete rules:

- accounts with postings should be archived or require move/reassignment
- opening-balance journals must be updated consistently
- recurring templates referencing archived accounts must be disabled or repaired

Account response should include derived balances where requested, not raw balance fields as source of truth.

---

## Transaction endpoints

Transactions are exposed as transaction groups.

### List groups

```text
GET /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/transactions
```

### Create group

```text
POST /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/transactions
```

### Detail

```text
GET /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/transactions/:transactionGroupId
```

### Update

```text
PATCH /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/transactions/:transactionGroupId
```

### Delete/void

```text
DELETE /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/transactions/:transactionGroupId
```

### Reconcile

```text
POST /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/transactions/:transactionGroupId/reconcile
```

### Unreconcile

```text
POST /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/transactions/:transactionGroupId/unreconcile
```

---

## Transaction create contract

Create supports simple and split transactions.

Example:

```json
{
  "type": "expense",
  "title": "Groceries",
  "occurredAt": "2026-05-06T10:30:00.000Z",
  "description": "Grocery shopping",
  "sourceAccountId": "acct_bank",
  "currencyCode": "INR",
  "transactions": [
    {
      "amountMinor": "80000",
      "destinationAccountId": "acct_groceries",
      "categoryId": "cat_food",
      "budgetId": "budget_monthly_food"
    },
    {
      "amountMinor": "40000",
      "destinationAccountId": "acct_household",
      "categoryId": "cat_household"
    }
  ],
  "tags": ["tag_weekend"],
  "options": {
    "applyRules": false,
    "recalculateBalances": true
  }
}
```

Backend decides valid postings and enforces the account compatibility matrix.

---

## Transaction detail response

Response should be enriched and UI-friendly.

```json
{
  "data": {
    "id": "txn_grp_123",
    "type": "split",
    "title": "Groceries",
    "occurredAt": "2026-05-06T10:30:00.000Z",
    "displayAmount": {
      "amountMinor": "120000",
      "currencyCode": "INR"
    },
    "status": "cleared",
    "journals": [
      {
        "id": "jrnl_1",
        "description": "Grocery portion",
        "postings": [
          {
            "id": "post_1",
            "accountId": "acct_bank",
            "amountMinor": "-80000",
            "currencyCode": "INR"
          },
          {
            "id": "post_2",
            "accountId": "acct_groceries",
            "amountMinor": "80000",
            "currencyCode": "INR"
          }
        ]
      }
    ],
    "createdAt": "2026-05-06T10:31:00.000Z",
    "updatedAt": "2026-05-06T10:31:00.000Z"
  }
}
```

---

## Categories, tags, budgets

### Categories

```text
GET    /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/categories
POST   /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/categories
PATCH  /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/categories/:categoryId
DELETE /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/categories/:categoryId
```

### Tags

```text
GET    /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/tags
POST   /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/tags
PATCH  /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/tags/:tagId
DELETE /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/tags/:tagId
```

### Budgets

```text
GET    /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/budgets
POST   /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/budgets
PATCH  /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/budgets/:budgetId
DELETE /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/budgets/:budgetId
```

---

## Import endpoints

```text
POST   /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/imports/csv
GET    /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/imports
GET    /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/imports/:importJobId
POST   /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/imports/:importJobId/commit
POST   /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/imports/:importJobId/undo
```

Rules:

- upload validates file size/type
- parse runs as DB-backed job
- preview before commit
- commit is idempotent
- undo uses normal transaction void/delete services

---

## Rule endpoints

```text
GET    /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/rules
POST   /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/rules
GET    /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/rules/:ruleId
PATCH  /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/rules/:ruleId
DELETE /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/rules/:ruleId
POST   /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/rules/:ruleId/test
POST   /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/rules/:ruleId/apply
```

Rules and search must share one operator language.

---

## Recurring endpoints

```text
GET    /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/recurring
POST   /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/recurring
PATCH  /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/recurring/:templateId
DELETE /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/recurring/:templateId
POST   /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/recurring/:templateId/generate
```

Recurring generation uses normal transaction creation pipeline.

---

## Report endpoints

```text
GET /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/reports/monthly-summary
GET /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/reports/cashflow
GET /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/reports/net-worth
GET /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/reports/category-breakdown
GET /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/reports/budget-progress
```

Reports use shared period service and TransactionQueryService.

Report responses must define:

- date range
- currency behavior
- included/excluded accounts
- drill-down query link or query object

---

## Export endpoints

```text
GET  /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/exports/transactions.csv
POST /api/v1/workspaces/:workspaceId/exports/json
```

Exports use same query services as list/report endpoints.

CSV export must protect against spreadsheet formula injection.

---

## Autocomplete endpoints

Autocomplete must be workspace/ledger scoped.

```text
GET /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/autocomplete/accounts
GET /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/autocomplete/categories
GET /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/autocomplete/tags
GET /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/autocomplete/payees
```

---

## Settings endpoints

```text
GET   /api/v1/settings
PATCH /api/v1/settings

GET   /api/v1/workspaces/:workspaceId/settings
PATCH /api/v1/workspaces/:workspaceId/settings

GET   /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/settings
PATCH /api/v1/workspaces/:workspaceId/ledgers/:ledgerId/settings
```

---

## PWA/mobile API behavior

Mobile/PWA readiness requirements:

- small responses
- pagination
- idempotency keys
- stable error codes
- limited offline write contracts through sync operations
- explicit blocking for unsafe offline operations
- device registration
- conflict status and resolution endpoints
- no reliance on desktop-only workflows

---

## Permission behavior

Permission-sensitive endpoints must enforce:

```text
CASL ability
custom service policy
workspace/ledger-scoped query
```

Permission error:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action.",
    "details": {},
    "requestId": "req_..."
  }
}
```

---

## Contract fixtures

Create fixtures for:

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
sync pull response
device revoked response
```

Rules:

- IDs are strings
- money values are strings
- null relationships return `null`
- timestamps include timezone
- response schemas include computed/enriched fields
- raw DB columns must not leak directly into API contracts
- nested form errors map to dotted paths

---

## API testing

Required tests:

- auth register/login/logout
- passkey registration/login
- workspace member permissions
- invitation accept/revoke/expire
- transaction create/update/delete
- split validation errors
- account compatibility matrix
- idempotency replay
- sync push duplicate replay
- sync stale update conflict
- device revoke blocks push
- pagination stability
- workspace/ledger isolation
- SQLite and PostgreSQL behavior parity
- OpenAPI schema generation
