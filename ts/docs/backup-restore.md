# Backup and Restore

This document explains Fastifly backup, restore, and export strategy.

Backups are required before public beta.

Fastifly stores sensitive financial data. Users must be able to back up, restore, and export their data safely.

---

## Backup principles

Fastifly backup support should be:

- simple
- documented
- testable
- safe during upgrades
- clear about database mode
- usable without third-party services

Supported database modes:

```text
SQLite
PostgreSQL 18
```

Required before beta:

```text
SQLite backup
SQLite restore
PostgreSQL backup documentation
PostgreSQL restore documentation
full JSON export
CSV export for core finance data
```

---

## What must be backed up

Core data:

- users
- sessions, where appropriate
- workspaces
- workspace members
- invitations, where appropriate
- ledgers
- accounts
- transaction journals
- transaction postings
- categories
- tags
- budgets
- currencies
- exchange-rate snapshots
- imports
- rules
- recurring transactions
- audit logs
- settings

For SQLite, the database file usually contains all app data.

For PostgreSQL, the full database must be dumped.

---

## SQLite backup

SQLite is the default self-hosting mode.

Database path example:

```text
/app/data/fastifly.db
```

### Recommended CLI

Fastifly should provide:

```bash
fastifly backup create
fastifly backup restore <backup-file>
```

Optional:

```bash
fastifly backup list
fastifly backup verify <backup-file>
```

### Backup file naming

Recommended format:

```text
fastifly-backup-YYYYMMDD-HHMMSS.sqlite
```

Example:

```text
fastifly-backup-20260506-180000.sqlite
```

### Backup metadata

Backup should include or be accompanied by metadata:

```json
{
  "app": "fastifly",
  "appVersion": "0.1.0",
  "schemaVersion": "20260506180000",
  "databaseDriver": "sqlite",
  "createdAt": "2026-05-06T18:00:00Z",
  "backupFormatVersion": "1",
  "workspaceCount": 1,
  "ledgerCount": 1,
  "includesAttachments": false,
  "includesAuditLog": true,
  "includesSyncState": false,
  "includesSessions": false
}
```

Operational backups must define what product state is included. Default v0.1 policy:

- include financial source-of-truth records
- include audit logs
- include settings needed to restore behavior
- exclude active sessions and recovery tokens
- exclude local outbox data
- exclude rebuildable caches and report snapshots
- exclude transient job locks
- strip or reset sync/device identity unless restoring over the same instance intentionally

This prevents restored historical backups from accidentally reusing stale sync, cache, or session state.

### Docker SQLite backup

Example:

```bash
docker compose -f docker-compose.sqlite.yml exec fastifly   fastifly backup create
```

Copy backup from volume or configured backup directory.

### Manual SQLite backup

If using direct file backup, stop the app first or use a safe SQLite backup command.

Safer approach:

```bash
sqlite3 ./data/fastifly.db ".backup './backups/fastifly-backup.sqlite'"
```

Do not copy a live SQLite database file blindly unless you understand WAL files and locking.

---

## SQLite restore

### Restore requirements

Restore should:

- stop or lock writes
- enter maintenance mode
- verify backup file exists
- verify backup metadata
- verify app/schema compatibility
- warn before overwriting current data
- require explicit confirmation
- restore database
- run integrity checks
- reset or rebuild caches
- reset sync/device/idempotency state when restoring into a new instance
- restart or re-open database safely

### Recommended restore command

```bash
fastifly backup restore ./backups/fastifly-backup.sqlite
```

With Docker:

```bash
docker compose -f docker-compose.sqlite.yml exec fastifly   fastifly backup restore /app/backups/fastifly-backup.sqlite
```

### SQLite restore checklist

- [ ] Stop app or enter maintenance mode
- [ ] Create emergency backup of current database
- [ ] Restore selected backup
- [ ] Run integrity check
- [ ] Start app
- [ ] Check `/ready`
- [ ] Verify login
- [ ] Verify dashboard
- [ ] Verify latest transactions

---

## PostgreSQL backup

For PostgreSQL deployments, use PostgreSQL native tools.

Recommended:

```bash
pg_dump
pg_restore
```

### Plain SQL dump

```bash
pg_dump   --host localhost   --username fastifly   --dbname fastifly   --file fastifly-backup.sql
```

### Custom-format dump

Recommended for larger databases:

```bash
pg_dump   --host localhost   --username fastifly   --dbname fastifly   --format custom   --file fastifly-backup.dump
```

### Docker Compose backup

```bash
docker compose -f docker-compose.postgres.yml exec postgres   pg_dump -U fastifly -d fastifly -F c -f /tmp/fastifly-backup.dump
```

Copy it out:

```bash
docker cp fastifly-postgres:/tmp/fastifly-backup.dump ./fastifly-backup.dump
```

---

## PostgreSQL restore

### Restore custom-format dump

```bash
pg_restore   --host localhost   --username fastifly   --dbname fastifly   --clean   --if-exists   fastifly-backup.dump
```

### Docker Compose restore

Copy backup into container:

```bash
docker cp ./fastifly-backup.dump fastifly-postgres:/tmp/fastifly-backup.dump
```

Restore:

```bash
docker compose -f docker-compose.postgres.yml exec postgres   pg_restore -U fastifly -d fastifly --clean --if-exists /tmp/fastifly-backup.dump
```

### PostgreSQL restore checklist

- [ ] Stop app or enter maintenance mode
- [ ] Create emergency dump of current database
- [ ] Restore selected backup
- [ ] Run migration status
- [ ] Start app
- [ ] Check `/ready`
- [ ] Verify login
- [ ] Verify dashboard
- [ ] Verify latest transactions

---

## Backup before migration

Before every production migration:

```bash
fastifly backup create
fastifly migrate status
fastifly migrate up
```

For PostgreSQL:

```bash
pg_dump -F c -f fastifly-before-upgrade.dump
fastifly migrate up
```

Upgrade docs must always remind users to back up first.

---

## Full JSON export

Fastifly should provide a full structured export.

Recommended command:

```bash
fastifly export json --output fastifly-export.json
```

The JSON export should include:

- workspace metadata
- ledgers
- accounts
- transactions
- postings
- categories
- tags
- budgets
- currencies
- exchange rates
- recurring templates
- rules
- settings
- audit metadata where appropriate

JSON export is for portability, inspection, and future import tools.

It is not necessarily a full binary backup replacement.

Exports are not backups:

- exports may be partial
- exports should not include active sessions, recovery codes, passkeys, or job locks
- exports should not include local outbox state
- exports may omit audit logs unless explicitly requested
- exports are user-facing and may be unencrypted even if a future backup archive format is encrypted

---

## CSV export

Fastifly should provide CSV export for common user-facing data.

Required exports:

```text
accounts.csv
transactions.csv
categories.csv
tags.csv
budgets.csv
```

Recommended command:

```bash
fastifly export csv --output ./exports
```

CSV export should be available from the UI later.

---

## Encryption

Initial version may not encrypt backups itself.

Recommended guidance:

- store backups in a secure location
- encrypt backups externally
- restrict file permissions
- do not commit backups to Git
- do not upload backups to untrusted storage

Future feature:

```text
encrypted app-generated backup archives
```

---

## Backup storage recommendations

Recommended:

- local encrypted disk
- external drive
- private backup server
- encrypted cloud storage
- multiple backup generations

Avoid:

- public buckets
- Git repositories
- shared drives without encryption
- unprotected email attachments
- screenshots of financial data

---

## Retention policy

Suggested personal retention:

```text
daily backups for 7 days
weekly backups for 4 weeks
monthly backups for 12 months
```

Fastifly may later provide automated backup schedules.

For v0.1/beta, document manual backups first.

---

## Testing restore

A backup is only useful if restore works.

Users should periodically test restore on a separate instance.

Restore test checklist:

- [ ] Create backup
- [ ] Start test instance
- [ ] Restore backup
- [ ] Log in
- [ ] Check account balances
- [ ] Check recent transactions
- [ ] Check reports
- [ ] Check workspace members

---

## Data deletion and export-before-delete

Before deleting or archiving a workspace, Fastifly should recommend export.

Minimum behavior:

- workspace archive instead of immediate permanent deletion
- export option before destructive actions
- audit log entry for destructive actions

---

## Acceptance criteria

Before public beta:

- [ ] SQLite backup command exists
- [ ] SQLite restore command exists
- [ ] PostgreSQL backup docs exist
- [ ] PostgreSQL restore docs exist
- [ ] JSON export exists
- [ ] CSV transaction export exists
- [ ] Backup-before-migration docs exist
- [ ] Restore process is tested
- [ ] Backup docs explain sensitive-data handling
