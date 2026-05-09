# Fastifly Docs

This folder contains the canonical TypeScript implementation documentation.

`ts/raw-docs/` contains research notes, comparisons, and older gap analyses. Raw docs are useful evidence, but they are not the product spec. When raw docs and this folder disagree, this folder wins.

## Canonical Docs

| Area | File |
|---|---|
| Architecture | `architecture-v2.md` |
| Database | `database-v2.md` |
| API | `api-v2.md` |
| Frontend | `frontend-v2.md` |
| Implementation start | `implementation-start.md` |
| PWA/mobile/offline | `pwa-mobile.md` |
| Sync | `sync-v1.md` |
| Maintenance | `maintenance-v2.md` |
| Backup/restore/export | `backup-restore.md` |
| Deployment | `deployment.md` |
| PRDs | `prd/` |
| Consistency review | `consistency-review.md` |

Legacy `architecture.md` and `database.md` were reviewed, useful content was promoted, and the files were removed. New implementation decisions should update latest-version docs only.

## Current Baseline

- v0.1 is server-first with a limited offline command outbox.
- Synced domain objects use UUIDv7-compatible text IDs.
- Money uses integer minor units, `bigint` internally, and string values at API boundaries.
- SQLite and PostgreSQL are both first-class targets.
- Ledger-affecting writes go through a shared mutation runner.
- Raw row patch sync, full CRDT collaboration, and broad offline editing are not v0.1 scope.
