import { createUuidV7, IDEMPOTENCY_REPLAYED_HEADER, type SyncedId } from "@fastifly/common";
import type {
  AccountRepository,
  IdentityRepository,
  LedgerFinanceMutationService,
  LedgerMutationRunResult,
  SessionRecord,
  TransactionQueryService,
  UserRecord,
  UserWorkspaceContextRecord,
} from "@fastifly/db";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApiApp } from "../app.js";
import { hashSessionToken } from "../auth/sessions.js";

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
    createExpense: vi.fn(makeTransactionResult),
    createIncome: vi.fn(makeTransactionResult),
    createTransaction: vi.fn(makeTransactionResult),
    createTransfer: vi.fn(makeTransactionResult),
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
          listAccounts: vi.fn(async () => [account]),
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
        hasNextPage: false,
        hasPreviousPage: false,
        nextCursor: null,
        previousCursor: null,
      },
    });
    expect(accountRepository?.listAccounts).toHaveBeenCalledWith({
      ledgerId: state.context.activeLedger.id,
      workspaceId: state.context.activeWorkspace.id,
    });
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

  it("creates accounts through the finance mutation service with idempotency", async () => {
    const { app, financeMutationService, state } = await makeApp("editor");

    const response = await app.inject({
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

    const response = await app.inject({
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

    const response = await app.inject({
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

    const response = await app.inject({
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
    const transactionGroupId = createId();
    const { app, state, transactionQueryService } = await makeApp("viewer", ({ context }) => ({
      transactionQueryService: {
        getTransactionGroup: vi.fn(),
        listTransactionGroups: vi.fn(async () => [
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
                type: "expense",
              },
            ],
            ledgerId: context.activeLedger.id,
            title: "Groceries",
            type: "expense",
            workspaceId: context.activeWorkspace.id,
          },
        ]),
      } as TransactionQueryService,
    }));

    const response = await app.inject({
      headers: { cookie: sessionCookie() },
      method: "GET",
      url: `/api/v1/workspaces/${state.context.activeWorkspace.id}/ledgers/${state.context.activeLedger.id}/transactions?accountId=${accountId}&type=expense&limit=25`,
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
    });
    expect(transactionQueryService?.listTransactionGroups).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        ledgerId: state.context.activeLedger.id,
        limit: 25,
        type: "expense",
        workspaceId: state.context.activeWorkspace.id,
      }),
    );
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

    const response = await app.inject({
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
});
