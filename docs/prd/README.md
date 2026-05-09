# Fastifly PRDs

This folder contains the current product requirement documents for the TypeScript implementation.

Raw research, comparison notes, and architecture gap matrices stay in `ts/raw-docs/`. PRDs that describe accepted product or implementation direction live here.

## Current PRDs

| PRD | Scope |
|---|---|
| `fastify_finance_app_implementation_prd.md` | Main TypeScript implementation plan: stack, package layout, DB, API, jobs, frontend, sync, testing, and milestones. |
| `transaction-ledger-architecture-prd.md` | Transaction group/journal/posting model, ledger invariants, money semantics, query contracts, and sync replay compatibility. |
| `production_readiness_prd.md` | Production baseline: licensing, auth, deployment, migrations, PWA/offline policy, backups, and release gates. |
| `pwa_mobile_support_prd.md` | PWA, mobile readiness, safe caching, device registration, offline outbox, sync status, and future Capacitor path. |
| `family_partner_access_prd.md` | Shared workspaces, members, invitations, role changes, auditability, mobile UX, and sync membership revalidation. |
| `permission_management_prd.md` | CASL-based authorization, service policies, workspace/ledger scoping, API enforcement, and sync replay permissions. |

## Sync Baseline

All PRDs should assume v0.1 includes limited offline command sync:

```text
device registration
client-generated UUIDv7-compatible IDs
local command outbox
sync push/pull/status APIs
explicit conflict states
server replay through normal domain services
```

Approved offline commands are intentionally narrow:

```text
transaction_group.create_expense.v1
transaction_group.create_income.v1
transaction_group.create_transfer.v1
category.create.v1
budget.assign_category_month.v1
```

Broad offline editing, CRDT collaboration, import commit, recurring generation, workspace/member changes, and maintenance commands remain out of v0.1 offline scope.
