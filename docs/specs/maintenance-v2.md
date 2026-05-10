# Maintenance, Integrity, and Correction Commands

This document describes Fastifly's maintenance philosophy and planned operational commands.

Fastifly handles financial data. Migrations alone are not enough. The app needs explicit tools for integrity checks, semantic upgrades, corrections, and recalculations.

---

## Goals

Maintenance tools should help operators and users:

- detect data integrity problems
- repair known issues safely
- rebuild derived caches
- run production migrations manually
- verify environment health
- back up and restore data
- inspect job state
- recover accounts without email

---

## Core principle

Fastifly distinguishes between:

```text
schema migration
semantic upgrade
correction
integrity report
maintenance recalculation
```

These must not be treated as the same thing.

---

## Schema migration

Schema migrations change database structure.

Examples:

```text
create table
add column
create index
drop obsolete index
change nullable behavior
```

Commands:

```bash
DATABASE_URL=/path/to/fastifly.db pnpm db:migrate:sqlite
DATABASE_URL=postgres://fastifly:...@host:5432/fastifly pnpm db:migrate:postgres
```

The future first-class `fastifly migrate status/up` CLI is tracked in
`docs/issues/first-class-maintenance-cli.md`.

Production migrations are manual.

Production startup must not silently modify schema.

---

## Semantic upgrade

A semantic upgrade transforms old valid data into a new meaning.

Examples:

```text
convert old transaction type values
derive new metadata rows from previous columns
split old account role into kind/subtype
populate reporting amounts after new currency model
```

Semantic upgrades should be explicit and documented.

Possible command pattern:

```bash
fastifly upgrade semantic <name>
```

Not required in v0.1, but the category must exist conceptually.

---

## Correction

A correction repairs invalid or inconsistent live data safely.

Examples:

```text
fix invalid amounts
repair missing currency codes
repair orphaned metadata
repair transfer budget links
repair recurring occurrence counters
```

Correction commands mutate data and must be careful.

They should:

- print summary before mutating
- support dry-run where practical
- be idempotent where possible
- create audit/maintenance logs
- recommend backup first
- work on SQLite and PostgreSQL

---

## Integrity report

An integrity report detects issues without mutating data.

Examples:

```text
unbalanced journals
missing currencies
orphaned records
invalid account pairings
missing reporting amounts
incorrect balance snapshots
jobs stuck running
```

Integrity report commands should be safe to run anytime.

---

## Maintenance recalculation

Maintenance recalculation rebuilds derived data from source-of-truth records.

Examples:

```text
account balance snapshots
reporting amounts
period statistics
report caches
dirty balance queues
```

Source of truth remains:

```text
transaction_postings
```

Snapshots and report caches must be rebuildable.

---

## Required command categories

Initial planned commands:

```bash
fastifly integrity report
fastifly integrity sums
fastifly integrity env

fastifly correction amounts
fastifly correction currencies
fastifly correction balances
fastifly correction orphaned-records
fastifly correction transfer-budgets
fastifly correction recurring

fastifly maintenance recalculate-balances
fastifly maintenance recalculate-reporting-amounts

DATABASE_URL=/path/to/fastifly.db pnpm db:migrate:sqlite
DATABASE_URL=postgres://fastifly:...@host:5432/fastifly pnpm db:migrate:postgres

fastifly backup create
fastifly backup restore

fastifly user list
fastifly user reset-password <username>
fastifly user create-recovery-codes <username>
```

---

## CLI requirements

The first-class CLI should be available in Docker and non-Docker deployments once
`docs/issues/first-class-maintenance-cli.md` is resolved.

Docker examples:

```bash
docker compose -f docker-compose.sqlite.yml run --rm fastifly-migrate
docker compose -f docker-compose.postgres.yml run --rm fastifly-migrate
docker compose exec fastifly fastifly integrity report
docker compose exec fastifly fastifly backup create
```

Local examples:

```bash
DATABASE_URL=/path/to/fastifly.db pnpm db:migrate:sqlite
fastifly integrity report
```

---

## Environment integrity

Command:

```bash
fastifly integrity env
```

Checks:

- app version
- database driver
- database connection
- migration status
- data directory writable
- SESSION_SECRET configured
- COOKIE_SECURE appropriate for production
- APP_URL configured
- SQLite pragmas enabled
- PostgreSQL version supported
- PWA assets present in production build

---

## Sum integrity

Command:

```bash
fastifly integrity sums
```

Checks:

- same-currency journals sum to zero
- reporting amounts balance where required
- cross-currency journals have exchange snapshots
- account balances match postings
- balance snapshots match recalculated values
- money values are integer minor units

Output should include:

```text
workspace
ledger
journal/group id
account id
currency
difference
recommended correction
```

---

## General integrity report

Command:

```bash
fastifly integrity report
```

Checks:

- unbalanced journals
- orphaned postings
- orphaned metadata
- missing accounts
- missing currencies
- invalid account pairings
- invalid budget links
- invalid category/tag links
- recurring templates with missing accounts
- import rows referencing missing groups
- attachments without files
- files without attachment rows
- stuck jobs
- pending migrations

This command must not mutate data.

---

## Correction commands

### Amount correction

```bash
fastifly correction amounts
```

Purpose:

- detect invalid amount formats
- detect missing reporting amounts
- repair derived reporting amounts where possible

### Currency correction

```bash
fastifly correction currencies
```

Purpose:

- detect invalid currency codes
- fill missing reporting currency where derivable
- flag unsupported currencies

### Balance correction

```bash
fastifly correction balances
```

Purpose:

- clear invalid snapshots
- queue recalculation
- repair dirty markers

### Orphaned records

```bash
fastifly correction orphaned-records
```

Purpose:

- detect and optionally remove/repair orphaned metadata, notes, attachments, job rows, import rows

### Transfer budgets

```bash
fastifly correction transfer-budgets
```

Purpose:

- detect transfers incorrectly linked to budgets
- remove or report links based on product rules

### Recurring

```bash
fastifly correction recurring
```

Purpose:

- detect recurring templates referencing archived/missing accounts
- detect duplicate occurrences
- fix next_run_at where safe

---

## Recalculation commands

### Account balances

```bash
fastifly maintenance recalculate-balances
```

Options:

```text
--workspace <id>
--ledger <id>
--account <id>
--from <date>
--dry-run
```

Rules:

- source of truth is postings
- recalculate from earliest affected date
- snapshots are rebuildable
- command should be idempotent

### Reporting amounts

```bash
fastifly maintenance recalculate-reporting-amounts
```

Options:

```text
--workspace <id>
--ledger <id>
--from <date>
--currency <code>
--dry-run
```

Rules:

- preserve original amounts
- use stored exchange-rate snapshots where available
- do not silently invent missing historical rates
- report rows that cannot be recalculated

---

## Migration commands

This section defines the planned first-class CLI behavior. Until that CLI exists, use the
package scripts and Docker migration services from `docs/specs/deployment.md`.

### Status

```bash
fastifly migrate status
```

Shows:

- current app version
- database driver
- applied migrations
- pending migrations
- schema compatibility

### Up

```bash
fastifly migrate up
```

Rules:

- warn to back up first
- require confirmation in production
- run correct dialect migrations
- record applied migrations
- fail clearly on error

Optional future:

```bash
fastifly migrate down
```

Only if safely supported.

---

## Backup commands

### Create backup

```bash
fastifly backup create
```

SQLite:

- creates safe backup file
- includes metadata
- warns if DB is busy

PostgreSQL:

- may delegate to documented `pg_dump`
- CLI support can be added later

### Restore backup

```bash
fastifly backup restore <file>
```

Rules:

- require confirmation
- check app/schema compatibility
- create emergency backup first if possible
- run integrity check after restore
- audit restore action

---

## User recovery commands

No email support means CLI recovery is required.

### List users

```bash
fastifly user list
```

### Reset password

```bash
fastifly user reset-password <username>
```

Requirements:

- secure prompt or generated temporary password
- invalidate existing sessions if requested
- audit event

### Create recovery codes

```bash
fastifly user create-recovery-codes <username>
```

Requirements:

- codes shown once
- stored hashed
- previous codes invalidated or revocation clearly offered
- audit event

---

## Job maintenance

Future commands:

```bash
fastifly jobs list
fastifly jobs retry <jobId>
fastifly jobs cancel <jobId>
fastifly jobs prune
```

Useful for:

- stuck imports
- recurring failures
- report recalculation failures
- backup failures

---

## Safety rules

Maintenance commands that mutate data must:

- recommend backup
- support dry-run where practical
- show summary
- require confirmation in production
- be idempotent where possible
- create audit or maintenance log
- work on SQLite and PostgreSQL
- not bypass ledger invariants

---

## Maintenance logs

Possible table:

```text
maintenance_runs
- id
- command
- status
- options_json
- summary_json
- started_by
- started_at
- finished_at
- error_message
```

This can wait, but command output should be structured so it can be logged later.

---

## Testing

Required tests:

- migration status detects pending migrations
- production auto-migrate disabled
- integrity sums detects unbalanced journal
- integrity report detects orphaned posting
- recalculation command rebuilds balance snapshot
- correction command dry-run does not mutate data
- import idempotency remains valid after correction
- recurring correction is idempotent
- SQLite and PostgreSQL parity
- backup restore flow verifies schema compatibility

---

## Public beta requirements

Before public beta:

- migration status works
- migration up works
- SQLite backup works
- SQLite restore works
- PostgreSQL backup/restore docs exist
- user reset-password command works
- recovery-code command works
- integrity report exists
- integrity sums exists
- balance recalculation command exists or is explicitly deferred with no balance cache
