# PRD: PWA and Future Mobile App Support

## Feature name

PWA and Mobile App Readiness

## Status

Planned for day-one architecture.

## Summary

Fastifly should be installable as a Progressive Web App from early releases and should be designed so Android and iOS apps can be built later without rewriting the product.

The recommended path is:

```text
Vite React Web App
        ↓
Installable PWA
        ↓
Capacitor Android/iOS wrapper later
```

The web app remains the primary product. Native mobile apps should reuse the same frontend, shared contracts, API, authentication model, and design system as much as possible.

---

## Goals

- Make Fastifly installable as a PWA.
- Support app shell caching for fast startup.
- Support mobile-first responsive layouts from day one.
- Support limited offline-safe command sync from v0.1.
- Prepare for Android/iOS apps later using the same web codebase.
- Avoid architecture that blocks native mobile later.
- Keep API contracts stable and mobile-friendly.
- Avoid storing sensitive financial data carelessly in browser storage.
- Avoid forcing a full React Native rewrite too early.

---

## Non-goals for v0.1

The first PWA release does not need:

- full offline-first sync
- conflict-free collaborative editing
- broad offline editing of existing ledger data
- native push notifications
- receipt OCR
- biometric login
- native widgets
- app store releases
- background bank sync
- full encrypted local vault

These can be added later.

---

## Recommended approach

Use:

```text
vite-plugin-pwa
Workbox
Web App Manifest
Service Worker
IndexedDB for local outbox and read models
Capacitor later for Android/iOS
```

Do not switch to React Native/Expo now.

Reason:

- the current app is a Vite React web app
- PWA support can be added directly
- Capacitor can wrap the existing web app later
- React Native/Expo would require a separate UI implementation or a large architecture shift

---

## Architecture

```text
apps/
├── web/
│   ├── Vite React app
│   ├── PWA manifest
│   ├── service worker config
│   ├── offline storage
│   └── mobile-responsive UI
│
├── api/
│   └── Fastify backend
│
└── mobile/            # future
    ├── capacitor.config.ts
    ├── android/
    └── ios/
```

Shared packages:

```text
packages/common
  shared schemas, DTOs, enums, money helpers

packages/authz
  CASL abilities and policies

packages/ui
  optional shared UI primitives later
```

---

## PWA requirements

### Web App Manifest

Fastifly must include a manifest with:

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
screenshots later
shortcuts later
```

Recommended display mode:

```text
standalone
```

Recommended start URL:

```text
/
```

App icons:

```text
192x192
512x512
maskable icon
apple touch icon
favicon
```

---

## Service worker requirements

Use `vite-plugin-pwa` with Workbox.

Cache:

- app shell
- compiled JS/CSS assets
- fonts if self-hosted
- icons
- static fallback page

Do not blindly cache:

- authenticated financial API responses
- session endpoints
- password/auth endpoints
- import files
- export files
- sensitive reports

Recommended strategy:

```text
App shell/static assets: precache
Navigation fallback: index.html
API requests: network-first or no-cache
Financial offline data: IndexedDB, not Cache API
```

---

## Offline support strategy

Do not attempt full offline-first finance sync in v0.1.

Do implement a limited domain-command outbox in v0.1. The goal is safe daily use while offline, not collaborative CRDT editing or raw table replication.

### v0.1: Installable PWA

- app installs
- app shell loads quickly
- app shows offline state
- user sees helpful offline message
- no sensitive API response caching

### v0.1: Read-only offline cache

- last selected workspace summary can be viewed offline
- recent transactions can be viewed offline
- cached data is clearly marked as stale
- user can clear local offline data

### v0.1: Offline command outbox

Allow users to create a narrow set of offline commands.

Allowed offline commands:

```text
transaction_group.create_expense.v1
transaction_group.create_income.v1
transaction_group.create_transfer.v1
category.create.v1
budget.assign_category_month.v1
```

Blocked offline actions:

```text
edit reconciled transaction
delete or void transaction
import commit
rule changes
recurring generation
workspace/member/permission changes
exchange-rate changes
maintenance/correction commands
backup restore
```

Each outbox command stores:

```text
operation_id
device_id
local_sequence
workspace_id
ledger_id
operation_type
operation_version
base_revision
payload
idempotency_key
created_locally_at
status
last_error
server_revision
```

Outbox statuses:

```text
queued
syncing
synced
failed
conflict
```

### v0.1: Safe sync

When online, app syncs queued commands to the API.

Requirements:

- every offline-created record has client-generated UUIDv7-compatible IDs
- every command has an idempotency key
- every device has a stable `device_id`
- every device sequence number is unique per device
- API must treat repeated sync as safe
- conflicts must be shown to the user
- reconciled/locked records should not be edited offline
- workspace membership must be revalidated during sync
- the server applies commands through normal transaction/budget/category services
- the client never pushes raw row patches

---

## Local storage

Use IndexedDB for structured offline data.

Recommended wrapper:

```text
Dexie
```

Store only what is needed.

Allowed local data:

```text
PWA settings
theme
language
active workspace id
recent non-sensitive display cache
local read models
offline command outbox
sync status and conflict metadata
```

Avoid storing:

```text
passwords
session tokens
API tokens
raw bank credentials
unbounded financial history by default
large exports
sensitive attachments
```

Session auth should remain server-controlled with HttpOnly cookies for web.

For future native apps, use OS secure storage for sensitive mobile-only secrets.

---

## Mobile-first UI requirements

Every screen must be usable on phone, tablet, and desktop.

Required mobile patterns:

```text
bottom navigation
large transaction add button
sheet/drawer forms
card lists instead of wide tables
sticky save actions
thumb-friendly controls
responsive charts
dark mode
offline status indicator
sync status indicator
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
offline outbox
sync issues
```

---

## API requirements for mobile readiness

The API must be mobile-friendly.

Requirements:

- stable REST endpoints
- OpenAPI documentation
- cursor or stable pagination
- idempotency keys for write operations
- device registration endpoints
- sync push/pull/status endpoints
- explicit conflict endpoints
- clear error codes
- consistent money format
- workspace/ledger scoping
- bounded sync payloads
- small response payloads for mobile
- compression support
- session refresh behavior documented

Recommended write header:

```text
Idempotency-Key: <uuid>
```

Use idempotency for:

```text
transaction create
sync operation push
import commit
recurring generation
member invitation
```

---

## Authentication requirements

### Web/PWA

Use:

```text
server-side sessions
HttpOnly cookies
SameSite=Lax or Strict
Secure=true in production
```

PWA should not store session tokens in localStorage.

### Future Android/iOS

Options to evaluate later:

```text
Capacitor HTTP/cookie session support
short-lived access token + refresh token in secure storage
biometric unlock for local app access
```

For first native wrapper, keep the auth model as close to web as possible unless platform limitations require tokens.

---

## Future native mobile path

Use Capacitor when ready.

Potential app structure:

```text
apps/mobile/
├── capacitor.config.ts
├── android/
├── ios/
└── README.md
```

Build flow:

```text
pnpm --filter web build
pnpm --filter mobile sync
open Android Studio / Xcode
```

Native features to add later:

```text
biometric app lock
push notifications
camera receipt upload
file picker for CSV import
share sheet
native secure storage
deep links
app icon/splash screen
local notifications
```

Do not add native-only features before the PWA experience is solid.

---

## PWA update behavior

Users should be notified when a new app version is available.

Requirements:

- service worker detects update
- UI shows "Update available"
- user can refresh to update
- avoid silently breaking active forms
- avoid updating during import commit or transaction save

---

## Privacy and security

PWA/mobile storage must be treated carefully because finance data is sensitive.

Requirements:

- do not store secrets in localStorage
- allow users to clear offline data
- show whether offline data exists
- do not cache financial API responses in Cache API by default
- mark stale offline data clearly
- ensure logout clears local workspace caches and outbox data unless user explicitly keeps unsynced commands
- protect native apps with biometric/app lock later

---

## UX requirements

Add global indicators:

```text
online/offline status
sync pending status
sync failed status
update available status
pending outbox count
```

Offline message:

```text
You are offline. Supported changes will be saved locally and synced when you are back online.
```

Conflict message:

```text
This change could not be synced because related data changed. Review it before saving.
```

---

## Testing requirements

PWA tests:

- manifest exists
- service worker registers in production build
- app shell loads offline
- update prompt works
- offline status appears
- logout clears local offline data
- app does not cache sensitive API responses by default

Offline outbox tests:

- create allowed expense/income/transfer offline
- queue command
- sync command online
- idempotency prevents duplicate transaction
- duplicate operation replay returns previous result
- sync failure shows error
- conflict state is handled

Mobile readiness tests:

- main screens work at mobile widths
- bottom navigation works
- transaction form is usable on small screens
- dark mode works
- touch targets are large enough

---

## Acceptance criteria

### PWA

- App has a valid web manifest.
- App can be installed from supported browsers.
- App shell loads without network after first visit.
- App shows offline state clearly.
- App does not blindly cache sensitive API responses.
- App shows update prompt when a new version is available.
- Supported offline writes are queued in the outbox.
- Unsafe offline writes are blocked with clear UI state.

### Mobile readiness

- Dashboard, transactions, account list, budget list, settings, and sharing screens work on mobile.
- Transaction creation is thumb-friendly.
- Layout does not require desktop table width.
- API supports idempotency keys for mobile/offline writes.
- API supports device registration and sync push/pull/status contracts.

### Future native path

- Web app build can be reused by a future Capacitor shell.
- No architecture decision blocks Android/iOS apps later.
- Sensitive platform features are isolated behind future adapters.

---

## MVP scope

Must-have for first PWA implementation:

- `vite-plugin-pwa`
- manifest
- icons
- service worker
- app shell precache
- offline status UI
- sync status UI
- pending outbox count
- conflict review entry point
- IndexedDB command outbox
- update prompt
- mobile-first layout checks
- no sensitive API response caching
- documentation

Can wait:

- push notifications
- Capacitor app
- app store packaging
- biometric lock
- native secure storage
- receipt camera integration
