# Transaction Quick Add Prerequisites And Highlight Gap

Status: open
Phase: 9
Severity: medium

## Why It Matters

First-run expense creation has two UX clarity gaps:

1. Users can create one account and still see disabled transaction actions (income/transfer), but
the UI copy implies only "accounts" are needed, not a valid source-destination pair per transaction
type.
2. On the dashboard quick-action panel, enabled `Expense` is not visually emphasized, so the primary
next step is easy to miss after setup.

This causes onboarding friction even when backend behavior is correct.

## Affected Docs/Code

- `apps/web/src/ui/transaction-create-panel.tsx`
  - `canCreateTransactionType` gating logic
  - `QuickTransactionButton` styling (`colored` flag only used for `vertical-actions`)
- `apps/web/src/ui/app-shell/pages-finance.tsx`
  - dashboard panel placement and copy surface
- `apps/web/src/i18n/en.ts`
  - transaction quick-create guidance text
- `docs/specs/frontend-v2.md`
  - expected first-run transaction creation guidance

## Suggested Fix

1. Clarify prerequisites in UI copy:
   - Expense requires at least one spendable source account and one expense destination account.
   - Income/transfer should similarly explain their required account pairing.
2. Improve dashboard affordance:
   - visually highlight the first available quick action (`Expense` in common first-run path), or
   - enable colored quick-action styling in the default dashboard variant when a type is actionable.
3. Keep disabled states explicit:
   - add a tooltip/helper text for why each disabled action is unavailable.

## Blocking Milestone

- Should be resolved before broader public beta onboarding QA, because it affects first successful
  transaction creation after initial setup.

