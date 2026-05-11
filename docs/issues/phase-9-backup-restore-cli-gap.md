# Phase 9 Backup/Restore CLI Gap

Status: closed
Phase: 9
Severity: blocking before public beta
Resolved: 2026-05-11

## Why It Matters

Phase 9 and production-readiness specs require backup/restore operational workflows, not only
migration status/up commands.

This gap was resolved by extending the maintenance CLI with backup/restore and integrity commands.

## Affected Docs/Code

- `docs/specs/implementation-start.md` (Phase 9 deliverables)
- `docs/specs/backup-restore.md`
- `docs/specs/maintenance-v2.md`
- `docs/prd/production_readiness_prd.md`
- `packages/db/src/cli.ts`
- `packages/db/src/migrations/maintenance-cli.ts`

## Applied Fix

Extended the `fastifly` CLI surface with operational commands:

- `fastifly backup create`
- `fastifly backup restore <file> --yes`
- `fastifly integrity env`
- `fastifly integrity report`
- `fastifly integrity sums`

Included hardening:

- command-level schema validation
- clear non-destructive defaults
- required confirmation semantics for destructive restore paths
- emergency pre-restore SQLite snapshot when destination DB exists
- postgres.js migration/integrity clients constrained to `max=1` for migrator-safe behavior
- operator docs for SQLite and PostgreSQL modes updated
- test coverage for command parsing and failure modes

## Verification

- `packages/db/src/__tests__/maintenance-cli.test.ts` now covers backup create/restore safety and integrity command behavior.

## Remaining Follow-up

- `fastifly maintenance recalculate-balances`
- `fastifly maintenance recalculate-reporting-amounts`

These remain tracked under broader Phase 9 maintenance follow-up and do not block this issue.
