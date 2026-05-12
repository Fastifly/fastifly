import {
  createUuidV7,
  encodeFinanceCursor,
  IDEMPOTENCY_REPLAYED_HEADER,
  type SyncedId,
} from "@fastifly/common";
import type {
  AccountRepository,
  BudgetQueryService,
  CategoryRepository,
  IdentityRepository,
  LedgerFinanceMutationService,
  LedgerMutationRunResult,
  SessionRecord,
  TransactionQueryService,
  UserRecord,
  UserWorkspaceContextRecord,
} from "@fastifly/db";
import { TransactionWriteError } from "@fastifly/db";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApiApp } from "../app.js";
import { hashSessionToken } from "../auth/sessions.js";
import { injectWithCsrf } from "./helpers/csrf.js";

const apps: Awaited<ReturnType<typeof buildApiApp>>[] = [];
const SESSION_TOKEN = "finance-route-session";

function createDeterministicIdGenerator(): () => SyncedId {
  let counter = 1;

  return () => {
    const value = counter;
    counter += 1;

    return createUuidV7({
      nowMs: Date.UTC(2026, 4, 9),
      randomBytes: (byteLength) => {
        const bytes = new Uint8Array(byteLength);
        bytes[byteLength - 1] = value;
        return bytes;
      },
    });
  };
}

const createId = createDeterministicIdGenerator();

function createUserWorkspaceContext(role: UserWorkspaceContextRecord["activeWorkspace"]["role"]): {
  readonly context: UserWorkspaceContextRecord;
  readonly user: UserRecord;
} {
  const userId = createId();
  const workspaceId = createId();
  const ledgerId = createId();
  const now = "2026-05-09T00:00:00.000Z";

  return {
    context: {
      activeLedger: {
        archivedAt: null,
        baseCurrencyCode: "INR",
        createdAt: now,
        firstDayOfWeek: 1,
        id: ledgerId,
        name: "Primary",
        status: "active",
        updatedAt: now,
        workspaceId,
      },
      activeWorkspace: {
        archivedAt: null,
        createdAt: now,
        id: workspaceId,
        name: "Personal",
        ownerUserId: userId,
        role,
        status: "active",
        updatedAt: now,
      },
    },
    user: {
      createdAt: now,
      disabledAt: null,
      displayName: "Owner",
      id: userId,
      passwordHash: "$argon2id$fixture",
      updatedAt: now,
      username: "owner",
      usernameNormalized: "owner",
    },
  };
}

function makeIdentityRepository(input: {
  readonly context: UserWorkspaceContextRecord;
  readonly user: UserRecord;
}): IdentityRepository {
  const session: SessionRecord = {
    createdAt: "2026-05-09T00:00:00.000Z",
    expiresAt: "2026-06-09T00:00:00.000Z",
    id: createId(),
    ipAddress: null,
    revokedAt: null,
    tokenHash: hashSessionToken(SESSION_TOKEN),
    userAgent: null,
    userId: input.user.id,
  };

  return {
    findActiveSessionByTokenHash: async (tokenHash) =>
      tokenHash === session.tokenHash ? session : null,
    findDefaultWorkspaceContextForUser: async (userId) =>
      userId === input.user.id ? input.context : null,
    findUserById: async (userId) => (userId === input.user.id ? input.user : null),
  } as IdentityRepository;
}

function makeFinanceMutationService(): LedgerFinanceMutationService {
  return {
    archiveAccount: vi.fn(async () => ({
      body: {
        data: {
          account: {
            archivedAt: "2026-05-09T01:00:00.000Z",
            createdAt: "2026-05-09T00:00:00.000Z",
            currencyCode: "INR",
            id: createId(),
            isActive: false,
            kind: "asset",
            ledgerId: createId(),
            name: "Bank",
            openingBalanceDate: null,
            openingBalanceMinor: null,
            subtype: "bank",
            updatedAt: "2026-05-09T01:00:00.000Z",
            workspaceId: createId(),
          },
        },
      },
      idempotencyReplayed: false,
      status: 200,
    })),
    createAccount: vi.fn(async () => ({
      body: {
        data: {
          account: {
            archivedAt: null,
            createdAt: "2026-05-09T00:00:00.000Z",
            currencyCode: "INR",
            id: createId(),
            isActive: true,
            kind: "asset",
            ledgerId: createId(),
            name: "Bank",
            openingBalanceDate: null,
            openingBalanceMinor: null,
            subtype: "bank",
            updatedAt: "2026-05-09T00:00:00.000Z",
            workspaceId: createId(),
          },
          openingBalanceGroupId: null,
          openingBalanceJournalId: null,
        },
      },
      idempotencyReplayed: true,
      status: 201,
    })),
    createCategory: vi.fn(async () => ({
      body: {
        data: {
          category: {
            archivedAt: null,
            color: null,
            counterpartyAccountId: createId(),
            createdAt: "2026-05-09T00:00:00.000Z",
            icon: null,
            id: createId(),
            ledgerId: createId(),
            name: "Utilities",
            parentId: null,
            updatedAt: "2026-05-09T00:00:00.000Z",
            workspaceId: createId(),
          },
        },
      },
      idempotencyReplayed: false,
      status: 201,
    })),
    archiveTransactionGroups: vi.fn(async () => ({
      body: {
        data: {
          archivedGroupIds: [createId()],
        },
      },
      idempotencyReplayed: false,
      status: 200,
    })),
    createExpense: vi.fn(makeTransactionResult),
    createIncome: vi.fn(makeTransactionResult),
    createTransaction: vi.fn(makeTransactionResult),
    createTransfer: vi.fn(makeTransactionResult),
    archiveCategory: vi.fn(async () => ({
      body: {
        data: {
          category: {
            archivedAt: "2026-05-09T01:00:00.000Z",
            color: null,
            counterpartyAccountId: createId(),
            createdAt: "2026-05-09T00:00:00.000Z",
            icon: null,
            id: createId(),
            ledgerId: createId(),
            name: "Utilities",
            parentId: null,
            updatedAt: "2026-05-09T01:00:00.000Z",
            workspaceId: createId(),
          },
        },
      },
      idempotencyReplayed: false,
      status: 200,
    })),
    setTransactionGroupStatus: vi.fn(async () => ({
      body: {
        data: {
          status: "cleared",
          updatedGroupIds: [createId()],
        },
      },
      idempotencyReplayed: false,
      status: 200,
    })),
  };
}

async function makeTransactionResult(): Promise<LedgerMutationRunResult> {
  return {
    body: {
      data: {
        transactionGroup: {
          id: createId(),
          journals: [
            {
              description: "Groceries",
              id: createId(),
              occurredAt: "2026-05-09T08:00:00.000Z",
              postings: [
                {
                  accountId: createId(),
                  amountMinor: "-12000",
                  currencyCode: "INR",
                  id: createId(),
                  reportingAmountMinor: "-12000",
                  reportingCurrencyCode: "INR",
                },
                {
                  accountId: createId(),
                  amountMinor: "12000",
                  currencyCode: "INR",
                  id: createId(),
                  reportingAmountMinor: "12000",
                  reportingCurrencyCode: "INR",
                },
              ],
              status: "pending",
              type: "expense",
            },
          ],
          ledgerId: createId(),
          title: "Groceries",
          type: "expense",
          workspaceId: createId(),
        },
      },
    },
    idempotencyReplayed: false,
    status: 201,
  };
}

type MakeAppServices = {
  readonly accountRepository?: AccountRepository;
  readonly budgetQueryService?: BudgetQueryService;
  readonly categoryRepository?: CategoryRepository;
  readonly financeMutationService?: LedgerFinanceMutationService;
  readonly transactionQueryService?: TransactionQueryService;
};

async function makeApp(
  role: UserWorkspaceContextRecord["activeWorkspace"]["role"] = "editor",
  createServices?: (state: ReturnType<typeof createUserWorkspaceContext>) => MakeAppServices,
) {
  const state = createUserWorkspaceContext(role);
  const services = createServices?.(state);
  const financeMutationService = services?.financeMutationService ?? makeFinanceMutationService();
  const app = await buildApiApp({
    ...(services?.accountRepository ? { accountRepository: services.accountRepository } : {}),
    ...(services?.budgetQueryService ? { budgetQueryService: services.budgetQueryService } : {}),
    ...(services?.categoryRepository ? { categoryRepository: services.categoryRepository } : {}),
    config: { logLevel: "silent", nodeEnv: "test" },
    financeMutationService,
    identityRepository: makeIdentityRepository(state),
    readiness: { migrations: "ok" },
    ...(services?.transactionQueryService
      ? { transactionQueryService: services.transactionQueryService }
      : {}),
  });
  apps.push(app);

  return {
    accountRepository: services?.accountRepository,
    app,
    budgetQueryService: services?.budgetQueryService,
    categoryRepository: services?.categoryRepository,
    financeMutationService,
    state,
    transactionQueryService: services?.transactionQueryService,
  };
}

function sessionCookie(): string {
  return `fastifly_session=${SESSION_TOKEN}`;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("finance routes", () => {
  it("lists accounts with derived balances for viewers", async () => {
    const accountId = createId();
    const nextCursor = encodeFinanceCursor({
      id: accountId,
      kind: "account.name.asc",
      sortKey: "Bank",
      v: 1,
    });
    const { accountRepository, app, state } = await makeApp("viewer", ({ context }) => {
      const account = {
        archivedAt: null,
        createdAt: "2026-05-09T00:00:00.000Z",
        currencyCode: "INR",
        id: accountId,
        isActive: true,
        kind: "asset" as const,
        ledgerId: context.activeLedger.id,
        name: "Bank",
        openingBalanceDate: null,
        openingBalanceMinor: null,
        subtype: "bank" as const,
        updatedAt: "2026-05-09T00:00:00.000Z",
        workspaceId: context.activeWorkspace.id,
      };

      return {
        accountRepository: {
          archiveAccount: vi.fn(),
          createAccount: vi.fn(),
          findAccount: vi.fn(async () => account),
          getAccountBalance: vi.fn(async () => ({
            accountId,
            balanceMinor: 25_000n,
            currencyCode: "INR",
            reportingBalanceMinor: 25_000n,
            reportingCurrencyCode: "INR",
          })),
          listAccounts: vi.fn(async () => ({
            hasNextPage: true,
            items: [account],
            nextCursor,
          })),
        } as AccountRepository,
      };
    });

    const response = await app.inject({
      headers: { cookie: sessionCookie() },
      method: "GET",
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/accounts`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [
        {
          balance: { amountMinor: "25000", currencyCode: "INR" },
          id: accountId,
          reportingBalance: { amountMinor: "25000", currencyCode: "INR" },
        },
      ],
      pageInfo: {
        hasNextPage: true,
        hasPreviousPage: false,
        nextCursor,
        previousCursor: null,
      },
    });
    expect(accountRepository?.listAccounts).toHaveBeenCalledWith({
      cursor: null,
      ledgerId: state.context.activeLedger.id,
      limit: 50,
      workspaceId: state.context.activeWorkspace.id,
    });
  });

  it("rejects account list cursors from another finance list", async () => {
    const accountRepository = {
      archiveAccount: vi.fn(),
      createAccount: vi.fn(),
      findAccount: vi.fn(),
      getAccountBalance: vi.fn(),
      listAccounts: vi.fn(),
    } as AccountRepository;
    const { app, state } = await makeApp("viewer", () => ({ accountRepository }));
    const wrongCursor = encodeFinanceCursor({
      id: createId(),
      kind: "transaction.lastOccurredAt.desc",
      sortKey: "2026-05-09T08:00:00.000Z",
      v: 1,
    });

    const response = await app.inject({
      headers: { cookie: sessionCookie() },
      method: "GET",
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/accounts?cursor=${encodeURIComponent(wrongCursor)}`,
    });

    expect(response.statusCode).toBe(400);
    expect(accountRepository.listAccounts).not.toHaveBeenCalled();
  });

  it("lists categories for viewers", async () => {
    const categoryId = createId();
    const nextCursor = encodeFinanceCursor({
      id: categoryId,
      kind: "category.name.asc",
      sortKey: "Utilities",
      v: 1,
    });
    const categoryRepository = {
      archiveCategory: vi.fn(),
      createCategory: vi.fn(),
      findCategory: vi.fn(),
      listCategories: vi.fn(async () => ({
        hasNextPage: true,
        items: [
          {
            archivedAt: null,
            color: null,
            counterpartyAccountId: createId(),
            createdAt: "2026-05-09T00:00:00.000Z",
            icon: null,
            id: categoryId,
            ledgerId: createId(),
            name: "Utilities",
            parentId: null,
            updatedAt: "2026-05-09T00:00:00.000Z",
            workspaceId: createId(),
          },
        ],
        nextCursor,
      })),
    } as CategoryRepository;
    const { app, state } = await makeApp("viewer", () => ({ categoryRepository }));

    const response = await app.inject({
      headers: { cookie: sessionCookie() },
      method: "GET",
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/categories`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [{ id: categoryId, name: "Utilities" }],
      pageInfo: {
        hasNextPage: true,
        hasPreviousPage: false,
        nextCursor,
        previousCursor: null,
      },
    });
    expect(categoryRepository.listCategories).toHaveBeenCalledWith({
      cursor: null,
      ledgerId: state.context.activeLedger.id,
      limit: 50,
      workspaceId: state.context.activeWorkspace.id,
    });
  });

  it("rejects category list cursors from another finance list", async () => {
    const categoryRepository = {
      archiveCategory: vi.fn(),
      createCategory: vi.fn(),
      findCategory: vi.fn(),
      listCategories: vi.fn(),
    } as CategoryRepository;
    const { app, state } = await makeApp("viewer", () => ({ categoryRepository }));
    const wrongCursor = encodeFinanceCursor({
      id: createId(),
      kind: "account.name.asc",
      sortKey: "Checking",
      v: 1,
    });

    const response = await app.inject({
      headers: { cookie: sessionCookie() },
      method: "GET",
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/categories?cursor=${encodeURIComponent(wrongCursor)}`,
    });

    expect(response.statusCode).toBe(400);
    expect(categoryRepository.listCategories).not.toHaveBeenCalled();
  });

  it("returns account detail with a derived balance", async () => {
    const accountId = createId();
    const { app, state } = await makeApp("viewer", ({ context }) => {
      const account = {
        archivedAt: null,
        createdAt: "2026-05-09T00:00:00.000Z",
        currencyCode: "INR",
        id: accountId,
        isActive: true,
        kind: "asset" as const,
        ledgerId: context.activeLedger.id,
        name: "Bank",
        openingBalanceDate: null,
        openingBalanceMinor: null,
        subtype: "bank" as const,
        updatedAt: "2026-05-09T00:00:00.000Z",
        workspaceId: context.activeWorkspace.id,
      };

      return {
        accountRepository: {
          archiveAccount: vi.fn(),
          createAccount: vi.fn(),
          findAccount: vi.fn(async () => account),
          getAccountBalance: vi.fn(async () => ({
            accountId,
            balanceMinor: 99_000n,
            currencyCode: "INR",
            reportingBalanceMinor: 99_000n,
            reportingCurrencyCode: "INR",
          })),
          listAccounts: vi.fn(),
        } as AccountRepository,
      };
    });

    const response = await app.inject({
      headers: { cookie: sessionCookie() },
      method: "GET",
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/accounts/${accountId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        account: {
          balance: { amountMinor: "99000", currencyCode: "INR" },
          id: accountId,
        },
      },
    });
  });

  it("lists budgets with period totals for viewers", async () => {
    const budgetId = createId();
    const nextCursor = encodeFinanceCursor({
      id: budgetId,
      kind: "budget.name.asc",
      sortKey: "Monthly food",
      v: 1,
    });
    const { app, budgetQueryService, state } = await makeApp("viewer", ({ context }) => ({
      budgetQueryService: {
        listBudgets: vi.fn(async () => ({
          hasNextPage: true,
          items: [
            {
              archivedAt: null,
              createdAt: "2026-05-09T00:00:00.000Z",
              currencyCode: "INR",
              id: budgetId,
              ledgerId: context.activeLedger.id,
              limitMinor: 25_000n,
              name: "Monthly food",
              period: "monthly",
              remainingMinor: 7_000n,
              rolloverEnabled: false,
              spentMinor: 18_000n,
              updatedAt: "2026-05-09T00:00:00.000Z",
              workspaceId: context.activeWorkspace.id,
            },
          ],
          nextCursor,
        })),
      } as BudgetQueryService,
    }));

    const response = await app.inject({
      headers: { cookie: sessionCookie() },
      method: "GET",
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/budgets?limit=25&asOfDate=2026-05-09`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [
        {
          id: budgetId,
          limit: { amountMinor: "25000", currencyCode: "INR" },
          remaining: { amountMinor: "7000", currencyCode: "INR" },
          spent: { amountMinor: "18000", currencyCode: "INR" },
        },
      ],
      pageInfo: {
        hasNextPage: true,
        hasPreviousPage: false,
        nextCursor,
        previousCursor: null,
      },
    });
    expect(budgetQueryService?.listBudgets).toHaveBeenCalledWith({
      asOfDate: "2026-05-09",
      cursor: null,
      ledgerId: state.context.activeLedger.id,
      limit: 25,
      workspaceId: state.context.activeWorkspace.id,
    });
  });

  it("rejects budget list cursors from another finance list", async () => {
    const budgetQueryService = {
      listBudgets: vi.fn(),
    } as BudgetQueryService;
    const { app, state } = await makeApp("viewer", () => ({ budgetQueryService }));
    const wrongCursor = encodeFinanceCursor({
      id: createId(),
      kind: "transaction.lastOccurredAt.desc",
      sortKey: "2026-05-09T08:00:00.000Z",
      v: 1,
    });

    const response = await app.inject({
      headers: { cookie: sessionCookie() },
      method: "GET",
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/budgets?cursor=${encodeURIComponent(wrongCursor)}`,
    });

    expect(response.statusCode).toBe(400);
    expect(budgetQueryService.listBudgets).not.toHaveBeenCalled();
  });

  it("creates accounts through the finance mutation service with idempotency", async () => {
    const { app, financeMutationService, state } = await makeApp("editor");

    const response = await injectWithCsrf(app, {
      headers: {
        cookie: sessionCookie(),
        "idempotency-key": "create-account-1",
      },
      method: "POST",
      payload: {
        currencyCode: "INR",
        kind: "asset",
        name: "Bank",
        openingBalanceMinor: "12500",
        subtype: "bank",
      },
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/accounts`,
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers[IDEMPOTENCY_REPLAYED_HEADER]).toBe("true");
    expect(financeMutationService.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        account: expect.objectContaining({
          name: "Bank",
          openingBalanceMinor: 12_500n,
        }),
        envelope: expect.objectContaining({
          actorUserId: state.user.id,
          idempotencyKey: "create-account-1",
          ledgerId: state.context.activeLedger.id,
          workspaceId: state.context.activeWorkspace.id,
        }),
      }),
    );
  });

  it("creates transactions with string money parsed at the API boundary", async () => {
    const { app, financeMutationService, state } = await makeApp("editor");
    const sourceAccountId = createId();
    const destinationAccountId = createId();

    const response = await injectWithCsrf(app, {
      headers: {
        cookie: sessionCookie(),
        "idempotency-key": "create-expense-1",
      },
      method: "POST",
      payload: {
        currencyCode: "INR",
        description: "Groceries",
        occurredAt: "2026-05-09T08:00:00.000Z",
        options: { applyRules: true },
        sourceAccountId,
        transactions: [{ amountMinor: "12000", destinationAccountId }],
        type: "expense",
      },
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/transactions`,
    });

    expect(response.statusCode).toBe(201);
    expect(financeMutationService.createExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        envelope: expect.objectContaining({
          idempotencyKey: "create-expense-1",
          sideEffectFlags: expect.objectContaining({
            applyRules: true,
            recalculateBalances: true,
          }),
        }),
        transaction: expect.objectContaining({
          lines: [expect.objectContaining({ amountMinor: 12_000n, destinationAccountId })],
          source: "api",
          sourceAccountId,
        }),
      }),
    );
  });

  it("archives accounts through the finance mutation service", async () => {
    const { app, financeMutationService, state } = await makeApp("editor");
    const accountId = createId();

    const response = await injectWithCsrf(app, {
      headers: {
        cookie: sessionCookie(),
        "idempotency-key": "archive-account-1",
      },
      method: "DELETE",
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/accounts/${accountId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(financeMutationService.archiveAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        account: { accountId },
        envelope: expect.objectContaining({
          idempotencyKey: "archive-account-1",
          ledgerId: state.context.activeLedger.id,
          workspaceId: state.context.activeWorkspace.id,
        }),
      }),
    );
  });

  it("rejects invalid money before calling the mutation service", async () => {
    const { app, financeMutationService, state } = await makeApp("editor");

    const response = await injectWithCsrf(app, {
      headers: { cookie: sessionCookie() },
      method: "POST",
      payload: {
        currencyCode: "INR",
        description: "Groceries",
        occurredAt: "2026-05-09T08:00:00.000Z",
        sourceAccountId: createId(),
        transactions: [{ amountMinor: 12_000, destinationAccountId: createId() }],
        type: "expense",
      },
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/transactions`,
    });

    expect(response.statusCode).toBe(400);
    expect(financeMutationService.createExpense).not.toHaveBeenCalled();
  });

  it("lists transactions through the transaction query service", async () => {
    const accountId = createId();
    const budgetId = createId();
    const categoryId = createId();
    const importJobId = createId();
    const tagId = createId();
    const transactionGroupId = createId();
    const nextCursor = encodeFinanceCursor({
      id: transactionGroupId,
      kind: "transaction.lastOccurredAt.desc",
      sortKey: "2026-05-09T08:00:00.000Z",
      v: 1,
    });
    const { app, state, transactionQueryService } = await makeApp("viewer", ({ context }) => ({
      transactionQueryService: {
        getTransactionGroup: vi.fn(),
        listTransactionGroups: vi.fn(async () => ({
          hasNextPage: true,
          items: [
            {
              id: transactionGroupId,
              journals: [
                {
                  description: "Groceries",
                  id: createId(),
                  occurredAt: "2026-05-09T08:00:00.000Z",
                  postings: [
                    {
                      accountId,
                      amountMinor: -12_000n,
                      currencyCode: "INR",
                      id: createId(),
                      reportingAmountMinor: -12_000n,
                      reportingCurrencyCode: "INR",
                    },
                    {
                      accountId: createId(),
                      amountMinor: 12_000n,
                      currencyCode: "INR",
                      id: createId(),
                      reportingAmountMinor: 12_000n,
                      reportingCurrencyCode: "INR",
                    },
                  ],
                  status: "pending",
                  type: "expense",
                },
              ],
              ledgerId: context.activeLedger.id,
              title: "Groceries",
              type: "expense",
              workspaceId: context.activeWorkspace.id,
            },
          ],
          nextCursor,
        })),
      } as TransactionQueryService,
    }));

    const response = await app.inject({
      headers: { cookie: sessionCookie() },
      method: "GET",
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/transactions?accountId=${accountId}&amountMin=1000&amountMax=20000&budgetId=${budgetId}&categoryId=${categoryId}&currencyCode=INR&importJobId=${importJobId}&reconciled=true&tagId=${tagId}&type=expense&limit=25`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [
        {
          id: transactionGroupId,
          journals: [
            {
              postings: [
                { amountMinor: "-12000", currencyCode: "INR" },
                { amountMinor: "12000", currencyCode: "INR" },
              ],
            },
          ],
        },
      ],
      pageInfo: {
        hasNextPage: true,
        hasPreviousPage: false,
        nextCursor,
        previousCursor: null,
      },
    });
    expect(transactionQueryService?.listTransactionGroups).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        amountMaxMinor: 20_000n,
        amountMinMinor: 1_000n,
        budgetId,
        categoryId,
        cursor: null,
        currencyCode: "INR",
        importJobId,
        ledgerId: state.context.activeLedger.id,
        limit: 25,
        reconciled: true,
        tagId,
        type: "expense",
        workspaceId: state.context.activeWorkspace.id,
      }),
    );
  });

  it("rejects reconciled and status filters used together before querying", async () => {
    const transactionQueryService = {
      getTransactionGroup: vi.fn(),
      listTransactionGroups: vi.fn(),
    } as TransactionQueryService;
    const { app, state } = await makeApp("viewer", () => ({ transactionQueryService }));

    const response = await app.inject({
      headers: { cookie: sessionCookie() },
      method: "GET",
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/transactions?reconciled=true&status=cleared`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        details: {
          fields: {
            reconciled: ["The reconciled filter cannot be combined with status."],
          },
        },
      },
    });
    expect(transactionQueryService.listTransactionGroups).not.toHaveBeenCalled();
  });

  it("rejects malformed transaction list cursors before querying", async () => {
    const transactionQueryService = {
      getTransactionGroup: vi.fn(),
      listTransactionGroups: vi.fn(),
    } as TransactionQueryService;
    const { app, state } = await makeApp("viewer", () => ({ transactionQueryService }));

    const response = await app.inject({
      headers: { cookie: sessionCookie() },
      method: "GET",
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/transactions?cursor=not-a-cursor`,
    });

    expect(response.statusCode).toBe(400);
    expect(transactionQueryService.listTransactionGroups).not.toHaveBeenCalled();

    const invalidSortKeyCursor = encodeFinanceCursor({
      id: createId(),
      kind: "transaction.lastOccurredAt.desc",
      sortKey: "not-a-date",
      v: 1,
    });
    const invalidSortKeyResponse = await app.inject({
      headers: { cookie: sessionCookie() },
      method: "GET",
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/transactions?cursor=${encodeURIComponent(invalidSortKeyCursor)}`,
    });

    expect(invalidSortKeyResponse.statusCode).toBe(400);
    expect(transactionQueryService.listTransactionGroups).not.toHaveBeenCalled();
  });

  it("returns transaction group detail through the transaction query service", async () => {
    const transactionGroupId = createId();
    const { app, state, transactionQueryService } = await makeApp("viewer", ({ context }) => ({
      transactionQueryService: {
        getTransactionGroup: vi.fn(async () => ({
          id: transactionGroupId,
          journals: [
            {
              description: "Salary",
              id: createId(),
              occurredAt: "2026-05-09T08:00:00.000Z",
              postings: [
                {
                  accountId: createId(),
                  amountMinor: -100_000n,
                  currencyCode: "INR",
                  id: createId(),
                  reportingAmountMinor: -100_000n,
                  reportingCurrencyCode: "INR",
                },
                {
                  accountId: createId(),
                  amountMinor: 100_000n,
                  currencyCode: "INR",
                  id: createId(),
                  reportingAmountMinor: 100_000n,
                  reportingCurrencyCode: "INR",
                },
              ],
              status: "pending",
              type: "income",
            },
          ],
          ledgerId: context.activeLedger.id,
          title: "Salary",
          type: "income",
          workspaceId: context.activeWorkspace.id,
        })),
        listTransactionGroups: vi.fn(),
      } as TransactionQueryService,
    }));

    const response = await app.inject({
      headers: { cookie: sessionCookie() },
      method: "GET",
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/transactions/${transactionGroupId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        transactionGroup: {
          id: transactionGroupId,
          journals: [{ postings: [{ amountMinor: "-100000" }, { amountMinor: "100000" }] }],
        },
      },
    });
    expect(transactionQueryService?.getTransactionGroup).toHaveBeenCalledWith({
      ledgerId: state.context.activeLedger.id,
      transactionGroupId,
      workspaceId: state.context.activeWorkspace.id,
    });
  });

  it("rejects finance writes for viewers before calling the service", async () => {
    const { app, financeMutationService, state } = await makeApp("viewer");

    const response = await injectWithCsrf(app, {
      headers: { cookie: sessionCookie() },
      method: "POST",
      payload: {
        currencyCode: "INR",
        kind: "asset",
        name: "Bank",
        subtype: "bank",
      },
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/accounts`,
    });

    expect(response.statusCode).toBe(403);
    expect(financeMutationService.createAccount).not.toHaveBeenCalled();
  });

  it("maps transaction write domain errors to stable API errors", async () => {
    const financeMutationService: LedgerFinanceMutationService = {
      ...makeFinanceMutationService(),
      createExpense: vi.fn(async () => {
        throw new TransactionWriteError(
          "Transaction account was not found or active.",
          "ACCOUNT_NOT_FOUND_OR_INACTIVE",
        );
      }),
    };
    const { app, state } = await makeApp("editor", () => ({ financeMutationService }));

    const response = await injectWithCsrf(app, {
      headers: { cookie: sessionCookie() },
      method: "POST",
      payload: {
        currencyCode: "INR",
        description: "Groceries",
        occurredAt: "2026-05-09T08:00:00.000Z",
        sourceAccountId: createId(),
        transactions: [{ amountMinor: "12000", destinationAccountId: createId() }],
        type: "expense",
      },
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/transactions`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: {
        code: "NOT_FOUND",
        message: "The account was not found or is inactive.",
      },
    });
  });
});
