# PWA and Mobile

This document describes Fastifly's Progressive Web App and future mobile strategy.

Fastifly will be a PWA from early releases and will later support Android/iOS using Capacitor.

Recommended path:

```text
Vite React Web App
        ↓
Installable PWA
        ↓
Capacitor Android/iOS wrapper later
```

React Native is not part of the current plan.

---

## Goals

- make the web app installable
- provide mobile-first UX
- cache the app shell safely
- show offline/update states clearly
- support a limited, ledger-safe offline write path in v0.1
- prepare for Capacitor later
- keep one primary UI codebase
- keep the API mobile-friendly

---

## Non-goals for v0.1

v0.1 does not include:

- offline transaction editing
- offline import commit
- full collaborative CRDT sync
- native Android/iOS builds
- app store release
- push notifications
- receipt camera integration
- biometric app lock
- native widgets

---

## PWA stack

Use:

```text
Vite
React
vite-plugin-pwa
Workbox
Web App Manifest
Service Worker
```

The PWA must be implemented in:

```text
apps/web
```

---

## Web App Manifest

Required manifest fields:

```text
name
short_name
description
start_url
scope
display
theme_color
background_color
icons
```

Recommended display:

```text
standalone
```

Required icons:

```text
192x192
512x512
maskable icon
apple touch icon
favicon
```

Future manifest features:

```text
screenshots
shortcuts
protocol handlers
share target
```

---

## Service worker strategy

Use Workbox through `vite-plugin-pwa`.

### Precache

Safe to precache:

- app shell
- compiled JS/CSS assets
- icons
- manifest
- static offline page
- self-hosted fonts, if any

### Do not blindly cache

Do not blindly cache:

- authenticated financial API responses
- session endpoints
- auth endpoints
- import files
- export files
- backup files
- sensitive reports

### Recommended strategy

```text
Static assets: precache
Navigation: app shell fallback
API reads: network-first or no-cache
API writes: network-only
Financial offline data: IndexedDB later, not Cache API
```

---

## Offline behavior

### v0.1 decision

```text
Installable PWA
Limited offline writes through local outbox
```

### v0.1 offline behavior

When offline:

- app shell can load
- offline indicator is visible
- read data may be unavailable unless already safely cached later
- approved offline write forms remain available
- unsafe write actions are disabled or blocked
- approved writes are saved locally and queued in the outbox
- user gets clear explanation

Suggested message:

```text
You are offline. Supported changes will be saved locally and synced when your connection is restored.
```

### Allowed offline actions

Allow in v0.1:

- create transaction
- create simple income
- create simple expense
- create transfer
- create simple category
- assign monthly category budget

Every offline write creates:

```text
client-generated UUIDv7 IDs
outbox operation
idempotency key
device ID
local sequence
base revision where known
```

### Disabled offline actions

Disable/block:

- edit reconciled transaction
- delete/void transaction
- import commit
- rule changes
- recurring generation
- backup restore
- workspace/member changes
- settings changes
- exchange-rate changes
- maintenance/correction commands

---

## Offline outbox

Offline writes are part of v0.1 only for the allowed command set.

Local outbox storage:

```text
IndexedDB
SQLite WASM + OPFS if adopted later
idempotency keys
device ID
local sequence
conflict states
```

Outbox statuses:

```text
queued
syncing
synced
failed
conflict
```

Required safeguards:

- idempotency key for every offline-created record
- workspace membership revalidation before sync
- account/category existence validation before sync
- clear conflict resolution UI
- no offline edits to reconciled transactions
- no raw SQL/table replication
- sync operations must be domain commands

Allowed operation names:

```text
transaction_group.create_expense.v1
transaction_group.create_income.v1
transaction_group.create_transfer.v1
```

The server applies pushed operations through normal service/use-case logic, not a special offline bypass.

---

## Local storage rules

Allowed:

```text
theme
language
active workspace id
UI preferences
PWA install prompt state
```

Avoid:

```text
passwords
session tokens
recovery codes
API tokens
raw invite tokens
bank credentials
large financial history
```

Use IndexedDB or SQLite WASM/OPFS for local read models and outbox data. Do not use the Cache API for financial data.

Logout should clear sensitive local state.

---

## Mobile-first UX

Fastifly should be usable on phone, tablet, and desktop.

Required mobile patterns:

```text
bottom navigation
large add button
sheet/drawer forms
card lists instead of wide tables
sticky primary actions
touch-friendly controls
responsive charts
dark mode
offline status indicator
sync status indicator
outbox pending count
conflict review entry point
update prompt
```

Important mobile screens:

```text
dashboard
transactions
add transaction
accounts
budgets
reports
imports
settings
members/sharing
auth/passkey
```

Minimum touch target:

```text
large enough for comfortable thumb usage
```

Avoid desktop-only interactions.

---

## Update behavior

PWA updates must be understandable.

Requirements:

- detect new service worker/app version
- show update available prompt
- avoid silently refreshing while form has unsaved changes
- allow user to refresh/update
- do not interrupt transaction save/import commit

Suggested message:

```text
A new version of Fastifly is available. Refresh when you are ready.
```

---

## Authentication and PWA

Fastifly uses:

```text
username/password
passkey
HttpOnly cookie sessions
```

PWA requirements:

- do not store session tokens in localStorage
- support passkey login in compatible browsers
- handle expired session clearly
- logout clears local state
- offline state should not look like logged-out state

---

## API requirements for mobile readiness

The API should be mobile-friendly from day one.

Requirements:

- REST API
- OpenAPI docs
- stable error shape
- pagination
- small response payloads
- idempotency keys for writes
- workspace/ledger scoping
- clear auth/session errors
- compression support where deployed

Recommended write header:

```text
Idempotency-Key: <uuid>
```

Use idempotency for mobile-sensitive writes:

- transaction create
- import commit
- invitation accept
- recurring generation
- sync push operation replay

Sync endpoints:

```text
POST /api/v1/devices
POST /api/v1/sync/push
GET  /api/v1/sync/pull
GET  /api/v1/sync/status
GET  /api/v1/sync/conflicts
POST /api/v1/sync/conflicts/:conflictId/resolve
```

Sync status values shown in the UI:

```text
Offline
Online
Syncing
Synced
3 pending changes
Conflict needs review
Sync failed
```

---

## Future Capacitor support

When ready, add:

```text
apps/mobile/
├── capacitor.config.ts
├── android/
└── ios/
```

Build flow concept:

```bash
pnpm --filter web build
pnpm --filter mobile sync
```

Future native capabilities:

```text
biometric app lock
secure storage
camera receipt upload
file picker
share sheet
deep links
push notifications
local notifications
native splash screen
native app icon
```

Do not add native-only workflows until the PWA is solid.

---

## Capacitor compatibility rules

Avoid web architecture that blocks Capacitor.

Do:

- use responsive layouts
- keep API calls centralized
- avoid direct dependence on window-only APIs without adapters
- keep storage access behind small helpers
- keep auth behavior documented
- use feature detection for PWA/native behavior

Avoid:

- desktop-only modals/tables
- assumptions about large screens
- hardcoded localhost API URLs
- unsafe localStorage for secrets
- hidden dependency on browser extensions
- unsupported service worker assumptions inside native wrapper

---

## Testing

### PWA tests

- manifest exists
- icons exist
- service worker registers in production build
- app shell loads offline after first visit
- offline indicator appears
- update prompt appears
- allowed offline write creates outbox operation
- unsafe offline write is blocked
- outbox sync pushes operation when online
- duplicate sync replay does not duplicate data
- stale update conflict is visible
- logout clears local app state
- sensitive API responses are not precached

### Mobile layout tests

Test core screens at:

```text
360px width
390px width
768px width
desktop width
```

Required screens:

- dashboard
- transaction list
- add transaction
- account list
- budget list
- reports
- settings
- member sharing
- login/passkey

### Future mobile tests

When Capacitor is added:

- app opens on Android
- app opens on iOS
- login works
- passkey behavior is verified
- deep links work
- safe storage works
- camera/file picker works when enabled

---

## Acceptance criteria for v0.1

- [ ] PWA manifest exists
- [ ] icons exist
- [ ] app is installable in supported browsers
- [ ] service worker registers in production
- [ ] app shell loads offline
- [ ] offline state is visible
- [ ] allowed offline writes are queued in the outbox
- [ ] unsafe offline writes are disabled
- [ ] sync status UI exists
- [ ] conflict review entry point exists
- [ ] update prompt exists
- [ ] mobile navigation works
- [ ] transaction form is mobile-friendly
- [ ] dark mode works
- [ ] no sensitive API responses are blindly cached
- [ ] docs explain future Capacitor path
