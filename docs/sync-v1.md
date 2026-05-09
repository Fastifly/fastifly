# Sync and Offline Writes

This document describes Fastifly's v0.1 sync and offline-write model.

Fastifly remains a ledger-safe finance app. Offline support must not create a separate business logic path.

---

## Goals

Sync v0.1 should provide:

- limited offline writes for common daily actions
- immediate local UI updates for allowed commands
- durable local outbox
- client-generated UUIDv7 IDs
- device registration
- idempotent operation replay
- push/pull sync
- explicit conflict records
- same server-side validation as normal REST writes
- SQLite and PostgreSQL compatibility

---

## Non-goals

Sync v0.1 is not:

- full collaborative CRDT sync
- raw SQL/table replication
- zero-knowledge encrypted finance sync
- bank sync
- offline import commit
- offline member/permission management
- offline reconciled transaction editing
- offline backup restore

---

## Core Principles

### 1. Commands, Not Row Replication

The client pushes domain commands:

```text
transaction_group.create_expense.v1
transaction_group.create_income.v1
transaction_group.create_transfer.v1
category.create.v1
budget.assign_category_month.v1
```

The server applies commands through normal services:

```text
sync operation
  -> LedgerMutationRunner
  -> service/use-case
  -> repositories
  -> transaction_groups/journals/postings
  -> domain events/jobs/audit
```

Do not add a sync path that writes tables directly.

### 2. Ledger Invariants Always Run On Server

The frontend may validate with shared schemas/helpers, but server validation is authoritative.

Every accepted operation must still enforce:

- workspace/ledger membership
- permissions and service policies
- account compatibility matrix
- money/currency rules
- balanced postings
- reconciled guards
- idempotency
- import/recurring constraints where relevant

### 3. Client-Generated IDs

Allowed offline commands generate IDs before the server round trip.

Use UUIDv7-compatible text IDs for synced domain objects.

Rules:

- no auto-increment IDs for synced objects
- IDs are strings in APIs
- DB stores IDs as text in both SQLite and PostgreSQL for v0.1
- server validates ID format and ownership scope

### 4. Devices Are First-Class

Each PWA install/browser profile registers a device.

Device IDs are used for:

- local outbox sequencing
- sync idempotency
- conflict diagnostics
- audit logs
- device revocation
- future encrypted key management

### 5. Conflicts Are Explicit

Finance conflicts are not silently merged in v0.1.

If an operation cannot be safely applied, it becomes rejected or conflict status with a user-visible reason.

---

## Allowed Offline Commands

v0.1 allows only:

```text
transaction_group.create_expense.v1
transaction_group.create_income.v1
transaction_group.create_transfer.v1
category.create.v1
budget.assign_category_month.v1
```

These are allowed because they mostly create new state and can be validated independently.

---

## Blocked Offline Commands

These are online-only in v0.1:

```text
transaction_group.update.v1
transaction_group.void.v1
transaction_group.reconcile.v1
transaction_group.unreconcile.v1
import_batch.commit.v1
import_batch.undo.v1
recurring.generate_due.v1
backup.restore.v1
workspace.member_change.v1
permission.change.v1
exchange_rate.update.v1
maintenance.correction.v1
```

Reasons:

- updates and deletes can conflict with existing financial truth
- reconciled data needs explicit current-state checks
- imports and recurring generation are batch/idempotency-sensitive
- backup/restore and maintenance require write locks
- member/permission changes must be online and current

---

## Operation Envelope

Client outbox operation:

```json
{
  "operationId": "op_123",
  "workspaceId": "ws_123",
  "ledgerId": "ledger_123",
  "deviceId": "dev_123",
  "localSequence": "12",
  "operationType": "transaction_group.create_expense.v1",
  "operationVersion": 1,
  "baseRevision": "42",
  "idempotencyKey": "idem_123",
  "payloadEncoding": "plaintext.v1",
  "payload": {},
  "createdAt": "2026-05-09T12:00:00.000Z"
}
```

Required fields:

```text
operationId
workspaceId
ledgerId
deviceId
localSequence
operationType
operationVersion
idempotencyKey
payloadEncoding
payload
createdAt
```

`baseRevision` is required for commands that depend on current object state. Create commands may use the last known ledger revision.

---

## Payload Encoding

v0.1 uses plaintext payloads:

```text
plaintext.v1
```

The envelope leaves room for:

```text
encrypted.v1
```

Do not enable encrypted sync payloads until the product defines how server-side ledger validation, search, reports, conflict resolution, recovery, and sharing work when the server cannot read payload contents.

---

## Device API

```text
POST /api/v1/devices
GET  /api/v1/devices
POST /api/v1/devices/:deviceId/revoke
```

Device fields:

```text
id
userId
name
platform
lastSeenAt
createdAt
revokedAt
```

Rules:

- a revoked device cannot push operations
- the server updates `lastSeenAt` on successful sync
- device list is user-scoped
- device revoke creates an audit event

---

## Push API

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
  "operations": []
}
```

Response:

```json
{
  "data": {
    "accepted": [],
    "rejected": [],
    "conflicts": [],
    "serverRevision": "42"
  }
}
```

Rules:

- max push batch size starts at 100 operations
- payload size limit starts at 256 KB per operation
- operations are processed in `localSequence` order
- `operationId` replay returns prior result
- duplicate `(deviceId, localSequence)` is rejected or replayed consistently
- accepted operations get increasing server revisions
- one invalid operation does not require rejecting the whole batch unless the batch ordering depends on it

---

## Pull API

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

Rules:

- pull is scoped by workspace and ledger
- pull returns operations after `sinceRevision`
- clients skip operations already applied from their own device
- pull is paginated
- default pull batch size starts at 500 operations

---

## Sync Status API

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

---

## Conflict API

```text
GET  /api/v1/sync/conflicts?workspaceId=ws_123&ledgerId=ledger_123
POST /api/v1/sync/conflicts/:conflictId/resolve
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

Conflict statuses:

```text
open
resolved
dismissed
```

Resolution must create a new explicit command or mark the conflict dismissed with audit metadata. Do not mutate financial rows silently from a conflict resolver.

---

## Server Apply Flow

Push operation apply:

```text
validate envelope
  -> authenticate user/session
  -> validate device not revoked
  -> authorize workspace/ledger access
  -> check idempotency
  -> check base revision
  -> call LedgerMutationRunner
  -> run domain service
  -> validate ledger invariants
  -> persist rows
  -> append sync operation
  -> increment ledger revision
  -> emit domain events
  -> return accepted/rejected/conflict
```

No sync handler may call Drizzle table objects directly.

---

## Local Client Flow

Offline create expense:

```text
user submits form
  -> shared validation
  -> generate UUIDv7 IDs
  -> write local read model
  -> write outbox operation
  -> show "Saved locally"
```

Online resumes:

```text
push queued operations
  -> mark accepted operations synced
  -> show conflicts when returned
  -> pull remote operations
  -> update local read model
```

---

## Local Storage

Use local storage only for non-sensitive small state:

```text
theme
language
active workspace id
active ledger id
install prompt state
```

Use IndexedDB or SQLite WASM/OPFS for:

```text
local read models
outbox_operations
sync_state
sync_conflicts
device_state
```

Never use the Cache API for financial data.

---

## UI States

Sync status UI should show:

```text
Offline
Online
Syncing
Synced
3 pending changes
Conflict needs review
Sync failed
```

Blocked offline actions should explain why they require a current server state.

Example:

```text
This action needs the latest ledger state. Reconnect before continuing.
```

---

## Observability

Every sync request log should include:

```text
request_id
workspace_id
ledger_id
device_id
operation_count
accepted_count
rejected_count
conflict_count
from_revision
to_revision
duration_ms
```

Do not log operation payloads by default because they may contain financial details.

---

## Testing

Required sync tests:

- device registration creates stable device row
- revoked device cannot push
- offline expense operation creates balanced postings on server
- offline income operation creates balanced postings on server
- offline transfer operation creates balanced postings on server
- duplicate `operationId` replays prior result
- duplicate `(deviceId, localSequence)` is handled consistently
- stale update creates conflict
- reconciled record edit is blocked
- pull from second device receives accepted operation
- client skips own already-applied operation
- push is workspace/ledger scoped
- unauthorized workspace/ledger push is forbidden
- sync status reports current revision and open conflicts
- conflict resolution creates explicit operation or audit row
- SQLite and PostgreSQL behave the same

Required E2E tests:

- app shell loads offline
- create expense offline
- pending outbox count increases
- reconnect pushes operation
- second browser pulls operation
- duplicate replay does not duplicate data
- conflict state is visible

---

## Resolved v0.1 Decisions

1. Local read models mirror API response shapes, not server DB tables.
2. Pull returns accepted command operations plus enough projected response data for clients to update read models without requerying everything.
3. Idempotency receipts are retained for at least 30 days by default and may be pruned after backup-safe retention windows.
4. Category creation remains offline-safe only for simple top-level categories. Category group or merge operations are online-only until separately designed.
5. Mobile conflict UX uses a dedicated conflict review screen linked from sync status, with retry, discard local change, and open detail actions.
6. If encrypted sync is added later, routing metadata remains server-readable: workspace ID, ledger ID, device ID, operation ID, operation type, revision, status, and timestamps.
