# Cross-Currency Transaction Write Service

Status: open
Phase: 6
Severity: blocking before multi-currency transaction release

## Problem

The current transaction write repository creates same-currency expense, income, transfer, and split transactions. It rejects account currencies that do not match the submitted transaction currency.

This is correct for the first safe write path, but the Phase 6/database specs also require cross-currency transactions with preserved original amounts, reporting amounts, and immutable exchange-rate snapshots.

## Required Fix

- allow source and destination accounts with different currencies only through an explicit cross-currency input shape
- store original posting amounts in each account currency
- store balanced reporting amounts in the ledger reporting currency
- require `exchange_rate_snapshot_json` for every converted posting
- validate that reporting postings balance to zero
- add SQLite and PostgreSQL tests for cross-currency income, expense, and transfer cases

## Acceptance

- same-currency behavior remains unchanged
- cross-currency writes cannot silently fall back to a single currency
- every cross-currency journal has balanced reporting amounts
- every converted posting has an immutable exchange-rate snapshot
