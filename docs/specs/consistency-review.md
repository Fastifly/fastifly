# Docs Consistency Review

Date: 2026-05-09

Scope: latest canonical TypeScript docs only.

Included:

- `docs/specs/architecture-v2.md`
- `docs/specs/database-v2.md`
- `docs/specs/api-v2.md`
- `docs/specs/frontend-v2.md`
- `docs/specs/sync-v1.md`
- `docs/specs/pwa-mobile.md`
- `docs/specs/maintenance-v2.md`
- `docs/specs/backup-restore.md`
- `docs/specs/deployment.md`
- `docs/prd/`

Legacy docs reviewed for removal:

- `docs/architecture.md`
- `docs/database.md`

Useful content was promoted into latest-version docs before deletion.

## Canonical Decisions

- v0.1 is server-first with limited offline command sync.
- Full CRDT/local-first collaboration is not v0.1 scope.
- Broad offline editing is blocked.
- Approved offline commands are only simple transaction creates.
- Synced domain objects use UUIDv7-compatible text IDs.
- Money uses integer minor units, `bigint` internally, and string API amounts.
- Ledger-affecting writes use one mutation envelope and runner.
- Sync replay uses normal domain services and permission checks.
- Workspaces and ledgers have explicit lifecycle states.
- Backups strip or reset transient sync/cache/session state.
- Privacy mode is supported by shared money formatting from the first formatter implementation.

## Raw-Doc Lessons Promoted

From Actual and Firefly lesson files:

- ledger mutation envelope and per-ledger write boundary
- workspace/ledger lifecycle states for maintenance, restore, read-only, and broken data
- payee aliases/mappings for import and cleanup safety
- import row raw payloads, duplicate/match states, and tombstone blocked reimport state
- saved filters shared by lists, reports, exports, rules, and import review
- preference scopes instead of one generic settings blob
- backup manifest rules and restore sync/idempotency reset
- frontend shared workflow primitives: modals, pickers, command palette, virtualized lists, return-to state, conflict states

## Checks Performed

Searched latest docs for stale/conflicting patterns:

```text
no offline writes
offline drafts
future sync
old docs/api.md style references
old docs/frontend.md style references
old docs/maintenance.md style references
Use text IDs unless later ADR
privacy mode later
Open questions
Open Decisions
```

No remaining matches were found in latest canonical docs, except intentional mentions that `ts/raw-docs/` is research evidence and not the spec.

## Legacy Removal Pass

Reviewed `docs/architecture.md` and `docs/database.md` against `architecture-v2.md` and `database-v2.md`.

Outcome:

- `architecture-v2.md` already superseded the legacy architecture content.
- `database-v2.md` already superseded the legacy database content except for the explicit date/time handling section.
- Date/time handling was promoted into `database-v2.md`.
- Legacy files were then deleted.
