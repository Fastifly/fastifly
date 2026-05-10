# First-Class Maintenance CLI

Status: open
Phase: 6
Severity: blocking before production upgrade docs are final

## Why It Matters

The latest specs describe operator commands such as migration status, migration up, backup,
restore, and integrity checks. The current implementation only exposes package scripts for
Drizzle migrations.

Package scripts are acceptable for the current implementation slice, but they are not enough for
clear production operations because they do not provide one stable `fastifly` command surface for
Docker, package installs, backups, restores, and integrity reports.

## Affected Docs/Code

- `docs/specs/deployment.md`
- `docs/specs/maintenance-v2.md`
- `docs/specs/backup-restore.md`
- `packages/db/src/migrations/commands.ts`
- future CLI package or `apps/api` maintenance entrypoint

## Suggested Fix

- Add a first-class `fastifly` CLI entrypoint.
- Implement `fastifly migrate status` and `fastifly migrate up` for SQLite and PostgreSQL.
- Keep production auto-migration disabled.
- Add backup, restore, integrity, and correction commands as those features are implemented.
- Update Docker migration services to use the CLI once it exists.

## Blocking Milestone

Required before production upgrade, backup, and restore docs are advertised as final.
