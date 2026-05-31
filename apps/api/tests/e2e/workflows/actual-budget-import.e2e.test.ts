import { describe, expect, it } from "vitest";

import { buildActualBudgetBase64 } from "../helpers/actual-budget-fixture.js";
import {
  createPostgresE2eSystem,
  E2E_POSTGRES_URL_ENV,
  getPostgresE2eUrlFromEnv,
} from "../helpers/postgres-system.js";
import {
  createAccount,
  createSqliteE2eSystem,
  getAccountBalanceMinor,
  registerAndResolveScope,
  requestWithCsrf,
} from "../helpers/system.js";

type ImportJobBody = {
  readonly data: {
    readonly importJob: {
      readonly id: string;
      readonly kind: string;
      readonly status: string;
      readonly committedGroupIds: readonly string[];
      readonly actualImport: {
        readonly summary: {
          readonly accountCount: number;
          readonly expenseCategoryCount: number;
          readonly incomeSourceCount: number;
          readonly transactionCount: number;
          readonly transferCount: number;
          readonly splitCount: number;
          readonly skippedCount: number;
        };
      } | null;
    };
  };
};

type AccountListBody = {
  readonly data: readonly { readonly id: string; readonly name: string }[];
};

type TransactionListBody = {
  readonly data: readonly { readonly id: string }[];
};

function buildBudgetBase64(): string {
  return buildActualBudgetBase64({
    accounts: [
      { id: "acc-checking", name: "Checking", type: "checking" },
      { id: "acc-savings", name: "Savings", type: "savings" },
    ],
    budgetName: "Household",
    categories: [
      { id: "cat-food", name: "Food" },
      { id: "cat-rent", name: "Rent" },
      { id: "cat-salary", is_income: 1, name: "Salary" },
    ],
    categoryGroups: [
      { id: "grp-expense", name: "Everyday" },
      { id: "grp-income", is_income: 1, name: "Income" },
    ],
    payees: [
      { id: "payee-grocer", name: "Grocer" },
      { id: "payee-employer", name: "Employer" },
      { id: "payee-to-savings", name: "Savings", transfer_acct: "acc-savings" },
      { id: "payee-to-checking", name: "Checking", transfer_acct: "acc-checking" },
    ],
    transactions: [
      // Opening balance for Checking ($5000) -> becomes the account opening balance.
      {
        acct: "acc-checking",
        amount: 500000,
        date: 20260101,
        id: "txn-open",
        starting_balance_flag: 1,
      },
      // Categorized expense ($42).
      {
        acct: "acc-checking",
        amount: -4200,
        category: "cat-food",
        date: 20260110,
        description: "payee-grocer",
        id: "txn-food",
      },
      // Categorized income ($3000).
      {
        acct: "acc-checking",
        amount: 300000,
        category: "cat-salary",
        date: 20260105,
        description: "payee-employer",
        id: "txn-salary",
      },
      // Transfer Checking -> Savings ($1000), stored as two linked rows.
      {
        acct: "acc-checking",
        amount: -100000,
        date: 20260112,
        description: "payee-to-savings",
        id: "txn-transfer-out",
        transferred_id: "txn-transfer-in",
      },
      {
        acct: "acc-savings",
        amount: 100000,
        date: 20260112,
        description: "payee-to-checking",
        id: "txn-transfer-in",
        transferred_id: "txn-transfer-out",
      },
      // Split expense ($90 = Food $50 + Rent $40).
      { acct: "acc-checking", amount: -9000, date: 20260115, id: "txn-split", isParent: 1 },
      {
        acct: "acc-checking",
        amount: -5000,
        category: "cat-food",
        id: "txn-split/1",
        isChild: 1,
        parent_id: "txn-split",
      },
      {
        acct: "acc-checking",
        amount: -4000,
        category: "cat-rent",
        id: "txn-split/2",
        isChild: 1,
        parent_id: "txn-split",
      },
      // Deleted row must be ignored entirely.
      { acct: "acc-checking", amount: -99999, id: "txn-dead", tombstone: 1 },
      // Zero-amount row is skipped (engine requires positive line amounts).
      { acct: "acc-checking", amount: 0, id: "txn-zero" },
    ],
  });
}

async function findAccountIdByName(
  app: Awaited<ReturnType<typeof createSqliteE2eSystem>>["app"],
  session: Awaited<ReturnType<typeof registerAndResolveScope>>,
  name: string,
): Promise<string> {
  const response = await app.inject({
    headers: { cookie: session.cookie },
    method: "GET",
    url: `/api/v1/workspaces/${session.workspaceId}/ledgers/${session.ledgerId}/accounts?limit=100`,
  });
  expect(response.statusCode).toBe(200);
  const account = response.json<AccountListBody>().data.find((row) => row.name === name);
  if (!account) {
    throw new Error(`Expected an imported account named "${name}".`);
  }
  return account.id;
}

describe("e2e/api/workflow/actual-budget-import", () => {
  it("imports an Actual Budget export into a balanced ledger and undoes cleanly", async () => {
    const system = await createSqliteE2eSystem();

    try {
      const { app } = system;
      const owner = await registerAndResolveScope(app, {
        password: "password123",
        username: "actual-import-owner",
      });

      const createResponse = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: { fileBase64: buildBudgetBase64(), fileName: "household.zip" },
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/imports/actual-budget`,
      });
      expect(createResponse.statusCode).toBe(201);
      const importJob = createResponse.json<ImportJobBody>().data.importJob;
      expect(importJob.kind).toBe("actual_budget");
      expect(importJob.status).toBe("preview_ready");
      expect(importJob.actualImport).not.toBeNull();
      expect(importJob.actualImport?.summary).toMatchObject({
        accountCount: 2,
        expenseCategoryCount: 2,
        incomeSourceCount: 1,
        skippedCount: 1,
        splitCount: 1,
        transactionCount: 4,
        transferCount: 1,
      });

      const commitResponse = await requestWithCsrf(app, owner.cookie, {
        headers: { "idempotency-key": "actual-import-commit-1" },
        method: "POST",
        payload: {},
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/imports/${importJob.id}/commit`,
      });
      expect(commitResponse.statusCode).toBe(200);
      const committed = commitResponse.json<ImportJobBody>().data.importJob;
      expect(committed.status).toBe("committed");
      // 1 opening-balance group + 4 transaction groups.
      expect(committed.committedGroupIds).toHaveLength(5);

      const accountsAfterCommit = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/accounts?limit=100`,
      });
      const accountCountAfterCommit = accountsAfterCommit.json<AccountListBody>().data.length;

      // Re-committing an already-committed job is a no-op (no duplicate accounts/transactions).
      const recommit = await requestWithCsrf(app, owner.cookie, {
        headers: { "idempotency-key": "actual-import-commit-1" },
        method: "POST",
        payload: {},
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/imports/${importJob.id}/commit`,
      });
      expect(recommit.statusCode).toBe(200);
      expect(recommit.json<ImportJobBody>().data.importJob.committedGroupIds).toHaveLength(5);
      const accountsAfterRecommit = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/accounts?limit=100`,
      });
      expect(accountsAfterRecommit.json<AccountListBody>().data).toHaveLength(
        accountCountAfterCommit,
      );

      const duplicateCreate = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: { fileBase64: buildBudgetBase64(), fileName: "household-again.zip" },
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/imports/actual-budget`,
      });
      expect(duplicateCreate.statusCode).toBe(409);
      const duplicateError = duplicateCreate.json<{
        readonly error: {
          readonly details: {
            readonly accountNames: readonly string[];
            readonly categoryNames: readonly string[];
            readonly kind: string;
            readonly source: string;
          };
          readonly message: string;
        };
      }>().error;
      expect(duplicateError.message).toContain("already exist in this ledger");
      expect(duplicateError.message).toContain("Rename the conflicting accounts/categories");
      expect(duplicateError.details).toMatchObject({
        kind: "actual_import_name_conflict",
        source: "ledger",
      });
      expect(duplicateError.details.accountNames).toEqual(["Checking", "Salary", "Savings"]);
      expect(duplicateError.details.categoryNames).toEqual(["Food", "Rent"]);
      const accountsAfterDuplicateUpload = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/accounts?limit=100`,
      });
      expect(accountsAfterDuplicateUpload.json<AccountListBody>().data).toHaveLength(
        accountCountAfterCommit,
      );

      const checkingId = await findAccountIdByName(app, owner, "Checking");
      const savingsId = await findAccountIdByName(app, owner, "Savings");

      // 500000 opening - 4200 food + 300000 salary - 100000 transfer - 9000 split.
      expect(await getAccountBalanceMinor(app, owner, checkingId)).toBe("686800");
      expect(await getAccountBalanceMinor(app, owner, savingsId)).toBe("100000");

      const listResponse = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/transactions?limit=100`,
      });
      expect(listResponse.statusCode).toBe(200);
      // food + salary + transfer + split (opening balance is not listed as a transaction).
      expect(listResponse.json<TransactionListBody>().data).toHaveLength(4);

      const undoResponse = await requestWithCsrf(app, owner.cookie, {
        headers: { "idempotency-key": "actual-import-undo-1" },
        method: "POST",
        payload: {},
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/imports/${importJob.id}/undo`,
      });
      expect(undoResponse.statusCode).toBe(200);
      expect(undoResponse.json<ImportJobBody>().data.importJob.status).toBe("undone");

      // Undo archives every committed group (including the opening balance), so balances reset.
      expect(await getAccountBalanceMinor(app, owner, checkingId)).toBe("0");
      expect(await getAccountBalanceMinor(app, owner, savingsId)).toBe("0");
    } finally {
      await system.cleanup();
    }
  });

  it("rejects an upload that is not an Actual Budget export", async () => {
    const system = await createSqliteE2eSystem();

    try {
      const { app } = system;
      const owner = await registerAndResolveScope(app, {
        password: "password123",
        username: "actual-import-bad-upload",
      });

      const response = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: {
          fileBase64: Buffer.from("this is not a zip").toString("base64"),
          fileName: "broken.zip",
        },
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/imports/actual-budget`,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json<{ error: { code: string; message: string } }>().error).toMatchObject({
        code: "BAD_REQUEST",
        message: "The uploaded file is not a valid ZIP archive.",
      });
    } finally {
      await system.cleanup();
    }
  });

  it("rejects imports that conflict with archived account names", async () => {
    const system = await createSqliteE2eSystem();

    try {
      const { app } = system;
      const owner = await registerAndResolveScope(app, {
        password: "password123",
        username: "actual-import-archived-conflict",
      });
      const archivedAccountId = await createAccount(app, owner, {
        currencyCode: "USD",
        kind: "asset",
        name: "Checking",
        subtype: "bank",
      });
      const archiveResponse = await requestWithCsrf(app, owner.cookie, {
        headers: { "idempotency-key": "actual-import-archive-conflict-account" },
        method: "DELETE",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/accounts/${archivedAccountId}`,
      });
      expect(archiveResponse.statusCode).toBe(200);

      const response = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: { fileBase64: buildBudgetBase64(), fileName: "household.zip" },
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/imports/actual-budget`,
      });
      expect(response.statusCode).toBe(409);
      expect(
        response.json<{ error: { details: { source: string }; message: string } }>().error,
      ).toMatchObject({
        details: { source: "ledger" },
        message: expect.stringContaining("already exist in this ledger"),
      });
    } finally {
      await system.cleanup();
    }
  });

  it("marks a stale preview as failed when commit conflicts with current ledger names", async () => {
    const system = await createSqliteE2eSystem();

    try {
      const { app } = system;
      const owner = await registerAndResolveScope(app, {
        password: "password123",
        username: "actual-import-stale-preview",
      });

      const createResponse = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: { fileBase64: buildBudgetBase64(), fileName: "household.zip" },
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/imports/actual-budget`,
      });
      expect(createResponse.statusCode).toBe(201);
      const importJob = createResponse.json<ImportJobBody>().data.importJob;
      await createAccount(app, owner, {
        currencyCode: "USD",
        kind: "asset",
        name: "Checking",
        subtype: "bank",
      });

      const commitResponse = await requestWithCsrf(app, owner.cookie, {
        headers: { "idempotency-key": "actual-import-stale-preview-commit" },
        method: "POST",
        payload: {},
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/imports/${importJob.id}/commit`,
      });
      expect(commitResponse.statusCode).toBe(409);
      expect(
        commitResponse.json<{ error: { details: { kind: string; source: string } } }>().error
          .details,
      ).toMatchObject({ kind: "actual_import_name_conflict", source: "ledger" });

      const lookupResponse = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/imports/${importJob.id}`,
      });
      expect(lookupResponse.statusCode).toBe(200);
      expect(lookupResponse.json<ImportJobBody>().data.importJob.status).toBe("failed");
    } finally {
      await system.cleanup();
    }
  });

  it("returns 404 when the target ledger does not exist", async () => {
    const system = await createSqliteE2eSystem();

    try {
      const { app } = system;
      const owner = await registerAndResolveScope(app, {
        password: "password123",
        username: "actual-import-missing-ledger",
      });

      const response = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: {
          fileBase64: buildActualBudgetBase64({ accounts: [{ id: "a", name: "Checking" }] }),
          fileName: "household.zip",
        },
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/01999999-9999-7999-8999-999999999999/imports/actual-budget`,
      });
      expect(response.statusCode).toBe(404);
      expect(response.json<{ error: { code: string } }>().error.code).toBe("NOT_FOUND");
    } finally {
      await system.cleanup();
    }
  });

  it("imports into a balanced ledger and undoes cleanly on the Postgres runtime", async (context) => {
    const databaseUrl = getPostgresE2eUrlFromEnv();
    if (!databaseUrl) {
      context.skip(`${E2E_POSTGRES_URL_ENV} is not set.`);
      return;
    }

    const system = await createPostgresE2eSystem({ databaseUrl, seedLevel: "essential" });

    try {
      const { app } = system;
      const owner = await registerAndResolveScope(app, {
        password: "password123",
        username: "actual-import-pg-owner",
      });

      const createResponse = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: { fileBase64: buildBudgetBase64(), fileName: "household.zip" },
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/imports/actual-budget`,
      });
      expect(createResponse.statusCode).toBe(201);
      const importJob = createResponse.json<ImportJobBody>().data.importJob;
      expect(importJob.kind).toBe("actual_budget");
      expect(importJob.actualImport?.summary).toMatchObject({
        accountCount: 2,
        expenseCategoryCount: 2,
        incomeSourceCount: 1,
        splitCount: 1,
        transactionCount: 4,
        transferCount: 1,
      });

      const commitResponse = await requestWithCsrf(app, owner.cookie, {
        headers: { "idempotency-key": "actual-import-pg-commit-1" },
        method: "POST",
        payload: {},
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/imports/${importJob.id}/commit`,
      });
      expect(commitResponse.statusCode).toBe(200);
      expect(commitResponse.json<ImportJobBody>().data.importJob.committedGroupIds).toHaveLength(5);

      const checkingId = await findAccountIdByName(app, owner, "Checking");
      const savingsId = await findAccountIdByName(app, owner, "Savings");
      expect(await getAccountBalanceMinor(app, owner, checkingId)).toBe("686800");
      expect(await getAccountBalanceMinor(app, owner, savingsId)).toBe("100000");

      const undoResponse = await requestWithCsrf(app, owner.cookie, {
        headers: { "idempotency-key": "actual-import-pg-undo-1" },
        method: "POST",
        payload: {},
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/imports/${importJob.id}/undo`,
      });
      expect(undoResponse.statusCode).toBe(200);
      expect(await getAccountBalanceMinor(app, owner, checkingId)).toBe("0");
      expect(await getAccountBalanceMinor(app, owner, savingsId)).toBe("0");
    } finally {
      await system.cleanup();
    }
  });
});
