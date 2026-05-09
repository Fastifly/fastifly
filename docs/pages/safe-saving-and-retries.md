# Safe Saving And Retries

Fastifly is designed to make saving financial changes safer.

Real life is messy. People double-click. Networks fail. Browsers retry requests. Phones go offline and come back later.

A finance app should handle that without creating duplicate records.

## If You Retry, Fastifly Can Recognize It

When a save operation has a retry key, Fastifly can remember the first successful result.

If the same request comes in again, the app can return that original result instead of doing the work twice.

That helps prevent duplicate transactions from accidental retries.

## If The Request Changed, Fastifly Rejects It

A retry key should not be reused for a different change.

If the same key is used with different content, Fastifly rejects it. This protects users from confusing mixed-up saves.

## Failed Saves Do Not Trigger Extra Work

Some saves cause follow-up work, such as audit history, balance updates, sync events, or future notifications.

Fastifly is designed so those follow-up actions happen only after the database confirms the save.

If the save fails, the follow-up work does not run.

## Read-Only Means Read-Only

If a ledger is read-only, archived, restoring, or broken, normal saves are rejected.

That protects old or unsafe data states from accidental changes.

## Why This Matters

Users should not need to understand technical retry behavior.

They should simply know that Fastifly is built to avoid duplicate saves, reject unsafe changes, and keep side effects tied to successful writes.
