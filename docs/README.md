# Fastifly Docs

This folder contains the canonical TypeScript implementation documentation.

`ts/raw-docs/` contains research notes, comparisons, and older gap analyses. Raw docs are useful evidence, but they are not the product spec. When raw docs and this folder disagree, this folder wins.

## Layout

| Folder | Purpose |
|---|---|
| `specs/` | Canonical technical and implementation specs. |
| `prd/` | Accepted product requirement documents. |
| `pages/` | Customer-facing website/page copy. |
| `issues/` | Deferred implementation concerns that should not block the current phase. |

## Canonical Specs

| Area | File |
|---|---|
| Architecture | `specs/architecture-v2.md` |
| Database | `specs/database-v2.md` |
| API | `specs/api-v2.md` |
| Frontend | `specs/frontend-v2.md` |
| Implementation start | `specs/implementation-start.md` |
| Ledger mutation runner | `specs/ledger-mutation-runner.md` |
| PWA/mobile/offline | `specs/pwa-mobile.md` |
| Sync | `specs/sync-v1.md` |
| Maintenance | `specs/maintenance-v2.md` |
| Backup/restore/export | `specs/backup-restore.md` |
| Deployment | `specs/deployment.md` |
| PRDs | `prd/` |
| Customer-facing pages | `pages/` |
| Consistency review | `specs/consistency-review.md` |

Legacy `architecture.md` and `database.md` were reviewed, useful content was promoted, and the files were removed. New implementation decisions should update latest-version docs only.

## Current Baseline

- v0.1 is server-first with a limited offline command outbox.
- Synced domain objects use UUIDv7-compatible text IDs.
- Money uses integer minor units, `bigint` internally, and string values at API boundaries.
- SQLite and PostgreSQL are both first-class targets.
- Ledger-affecting writes go through a shared mutation runner.
- Raw row patch sync, full CRDT collaboration, and broad offline editing are not v0.1 scope.
