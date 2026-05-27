# Import From Actual Budget File — Design

Date: 2026-05-27

Status: accepted (autonomous build per user direction)

## Goal

Let a user import an **Actual Budget export file** into a Fastifly ledger,
producing a correct double-entry ledger with no balance drift, reusing the
existing `import_jobs` preview → commit → undo lifecycle.

## Source format (researched from `~/WebstormProjects/actual`)

The export is a **ZIP** containing `db.sqlite` (the budget SQLite DB) and
`metadata.json` (`{ budgetName, id, ... }`). Relevant `db.sqlite` tables:

- `transactions(id, isParent, isChild, parent_id, acct, category, amount,
  description→payeeId, notes, date, transferred_id, starting_balance_flag,
  cleared, reconciled, tombstone, sort_order, error)`
- `accounts(id, name, offbudget, closed, type, tombstone)`
- `categories(id, name, is_income, cat_group, tombstone)` /
  `category_groups(id, name, is_income, tombstone)`
- `payees(id, name, transfer_acct, tombstone)` / `payee_mapping(id, targetId)`

Conventions: `amount` is an **integer in 2-dp minor units**; **negative =
outflow/expense, positive = inflow/income**. `date` is integer **YYYYMMDD**.
`tombstone = 1` means deleted (skip). Actual is **currency-agnostic** (no
per-row currency). Transfers = **two rows** linked by `transferred_id`, each
with a transfer payee (`payees.transfer_acct` → other account), amounts
negated, `category` null. Splits = a **parent** (`isParent=1`, `category`
null, `amount` = sum of children) with **child** rows (`isChild=1`,
`parent_id` set). Opening balance = a row with `starting_balance_flag=1`.

## Fastifly target model (verified from code)

- Ledger is double-entry: `transaction_groups → journals → postings`,
  postings sum to zero, single-currency only (cross-currency rejected).
- `createTransaction` takes **one `sourceAccountId` + N `lines`** (each line →
  one journal; N>1 ⇒ group type auto-becomes `split`). `inferTransactionType(source,dest)`
  must equal the requested `type`. Line amounts must be **> 0**.
- Account compatibility: `asset/liability → expense/external = expense`;
  `revenue/external → asset/liability = income`; `asset/liability →
  asset/liability = transfer`.
- `createCategory` always creates an `expense/external` **counterparty
  account**; there is **no income category** concept. Income flows from a
  `revenue/external` account.
- Creating an `asset`/`liability` account auto-provisions one
  `Income Source <CCY>` (`revenue/external`) account.
- Opening balances are created natively by `createAccount(openingBalanceMinor,
  openingBalanceDate)` via an `equity/opening_helper` journal.
- **No payee entity exists** — Actual payee names are preserved in the
  journal `description`.
- All writes go through `LedgerMutationRunner` (idempotency, audit, lifecycle).

## Mapping (Actual → Fastifly)

Target currency = **ledger base currency**; amounts scaled from 2-dp to the
target currency minor units (passthrough for 2-dp currencies; exact-division
guard otherwise). All `tombstone=1` rows skipped.

1. **Accounts** → Fastifly accounts. `type` credit/credit card → `liability/credit_card`;
   loan/mortgage/debt → `liability/loan`; investment → `asset/investment`;
   else `asset/bank`. `closed` accounts are created then archived after commit.
2. **Opening balance**: per account, the `starting_balance_flag=1` row sets the
   account's `openingBalanceMinor`/`openingBalanceDate`; that row is consumed
   (not re-imported).
3. **Expense categories** (`is_income=0`) → Fastifly categories (each gets an
   `expense/external` counterparty). **Income categories** (`is_income=1`) →
   a `revenue/external` account named after the category. A fallback
   `Imported Uncategorized` expense category and `Imported Income`
   revenue account cover uncategorized rows.
4. **Transfers** (`transferred_id` pair, both alive, both accounts mapped) →
   **one** Fastifly `transfer`: source = negative-amount leg's account,
   destination = positive leg's account, amount = `abs`. Each pair emitted
   once. If the counterpart is missing/tombstoned, the leg degrades to a
   standalone income/expense by sign.
5. **Splits**: an **expense-only** split (all children outflow) → one
   `createTransaction` with one source (parent account) and one line per child
   (dest = child category counterparty, `categoryId` set) ⇒ `split` group.
   Income/mixed/transfer-containing splits → each child imported as a
   standalone transaction (balances identical, grouping not preserved).
6. **Standalone** rows: `amount<0` → expense (source=account, dest=category
   counterparty or `Imported Uncategorized`); `amount>0` → income
   (source=income-category revenue account or `Imported Income`, dest=account).
   `amount==0` rows are skipped (engine requires line amount > 0) with a warning.
   `description` = resolved payee name, else notes, else `Imported transaction`.
   `cleared`/`reconciled` → status `cleared`; else `pending`.

Edge cases produce structured **warnings** captured in the plan; they never
silently corrupt the ledger.

## Architecture

- **`packages/common/src/actual-import/`** (pure, no Node) — Actual raw row
  types, amount/date conversions, and `buildActualImportPlan(input) →
  ActualImportPlan`. This is the correctness core and is unit-tested (TDD).
  The plan lists accounts/categories/income-sources to create and
  transactions with **symbolic refs** (by Actual id) resolved at commit.
- **`packages/common/src/api/`** — Zod schemas: `CreateActualImportRequest`
  (`{ fileName?, fileBase64 }`), responses, and `kind`/`summary` on the import
  job response.
- **`apps/api/src/services/actual-import-parser.ts`** (Node) — base64 →
  `fflate.unzipSync` → `better-sqlite3` opens `db.sqlite` from a Buffer
  (read-only) → plain rows → `buildActualImportPlan`. New dep: `fflate`.
- **`finance-workflows.ts`** — `createImportJobFromActualBudget` (parse+store
  plan, status `preview_ready`) and `commitImportJob` branches on `kind`:
  create accounts → categories/income-sources → transactions, collecting
  **all** created group ids (incl. opening-balance groups) for undo. Undo is
  unchanged (archives committed groups).
- **`packages/db`** — `import_jobs` gains additive columns `kind` (NOT NULL
  DEFAULT `'csv'`) and `plan_json` (nullable). `csv_text` stays NOT NULL
  (stored `''` for Actual imports). Migrations generated via `drizzle-kit`.
- **Upload transport**: base64 zip in JSON body on
  `POST .../imports/actual-budget` with a raised route-level `bodyLimit`
  (keeps the existing JSON+Zod+OpenAPI pattern; no multipart plugin).
- **Frontend** — Imports page gains an Actual Budget file picker (reads file →
  base64 → new client method); preview/commit/undo reuse existing UI.

## Out of scope (v1, documented)

Rules, schedules, budgets, notes-by-month, tags, payee entities, multi-currency
scaling beyond exact conversion, and grouping of income/mixed splits. Reconciled
status maps to `cleared`. These do not affect ledger balance correctness.

## Testing

- Unit (TDD): mapper — expense/income/transfer/split/opening-balance signs,
  transfer dedup + direction, tombstone skip, uncategorized fallback, zero-amount
  skip, amount/date conversion, missing-counterpart degrade.
- Unit: parser builds rows from a synthetic zip (built in-test via
  `better-sqlite3` + `fflate.zipSync`).
- E2E: upload synthetic Actual zip → preview → commit → assert accounts,
  categories, transactions, and account balances → undo restores. SQLite, with
  Postgres parity where the harness runs it.
