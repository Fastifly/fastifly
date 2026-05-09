# Cross-Currency Transaction Write Service

Status: deferred
Phase: post-v0.1
Severity: not blocking current implementation

## Problem

The current transaction write repository creates same-currency expense, income, transfer, and split transactions. It rejects account currencies that do not match the submitted transaction currency.

This is the intended v0.1 behavior. Fastifly keeps multi-currency foundations in the schema, but simultaneous cross-currency transaction writes are deferred until the product has a dedicated exchange-rate UX and contract.

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
