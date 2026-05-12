import type { AccountKind, AccountSubtype, SyncedId } from "@fastifly/common";

import {
  closePostgresClient,
  createPostgresClient,
  createPostgresDatabaseFromClient,
  type PostgresClient,
  type PostgresDatabase,
} from "../postgres/client.js";
import {
  pgBudgetLimits,
  pgBudgets,
  pgCategories,
  pgCurrencies,
  pgLedgers,
  pgPayees,
  pgTags,
  pgUsers,
  pgWorkspaceMembers,
  pgWorkspaces,
} from "../postgres/schema.js";
import {
  createPostgresAccountRepository,
  createSqliteAccountRepository,
} from "../repositories/accounts.js";
import { normalizeUsername } from "../repositories/identity.js";
import {
  type CreateTransactionInput,
  createPostgresTransactionQueryService,
  createPostgresTransactionWriteRepository,
  createSqliteTransactionQueryService,
  createSqliteTransactionWriteRepository,
} from "../repositories/transactions.js";
import {
  createConfiguredSqliteClient,
  createSqliteDatabaseFromClient,
  type SqliteClient,
  type SqliteDatabase,
} from "../sqlite/client.js";
import {
  sqliteBudgetLimits,
  sqliteBudgets,
  sqliteCategories,
  sqliteCurrencies,
  sqliteLedgers,
  sqlitePayees,
  sqliteTags,
  sqliteUsers,
  sqliteWorkspaceMembers,
  sqliteWorkspaces,
} from "../sqlite/schema.js";
import { createSeedPasswordHash, SEED_CREDENTIALS, SEED_NOW } from "./fixtures.js";
import { SEED_IDS, seedId } from "./ids.js";

export type SeedLevel = "essential" | "demo" | "e2e";
export type SeedDriver = "sqlite" | "postgres";

export type SeedDatabaseInput = {
  readonly databaseUrl: string;
  readonly driver: SeedDriver;
  readonly level: SeedLevel;
};

type SeedAccount = {
  readonly id: SyncedId;
  readonly sequenceBase: number;
  readonly name: string;
  readonly kind: AccountKind;
  readonly subtype: AccountSubtype;
};

type SeedTransaction = Pick<
  CreateTransactionInput,
  | "currencyCode"
  | "description"
  | "lines"
  | "occurredAt"
  | "sourceAccountId"
  | "status"
  | "title"
  | "type"
> & {
  readonly id: SyncedId;
  readonly sequenceBase: number;
};

const seedCurrencies = [
  { code: "INR", decimalPlaces: 2, name: "Indian Rupee", symbol: "₹" },
  { code: "USD", decimalPlaces: 2, name: "US Dollar", symbol: "$" },
  { code: "EUR", decimalPlaces: 2, name: "Euro", symbol: "€" },
] as const;

const seedBudgetLimits = [
  {
    amountMinor: 40_000_00n,
    budgetId: SEED_IDS.BUDGET_MONTHLY_FOOD,
    categoryId: SEED_IDS.CATEGORY_FOOD,
    currencyCode: "INR",
    endDate: "2026-05-31",
    id: SEED_IDS.BUDGET_LIMIT_MONTHLY_FOOD_MAY_2026,
    startDate: "2026-05-01",
  },
  {
    amountMinor: 75_000_00n,
    budgetId: SEED_IDS.BUDGET_MONTHLY_LIVING,
    categoryId: SEED_IDS.CATEGORY_HOUSING,
    currencyCode: "INR",
    endDate: "2026-05-31",
    id: SEED_IDS.BUDGET_LIMIT_MONTHLY_LIVING_MAY_2026,
    startDate: "2026-05-01",
  },
  {
    amountMinor: 12_000_00n,
    budgetId: SEED_IDS.BUDGET_MONTHLY_TRANSPORT,
    categoryId: SEED_IDS.CATEGORY_TRANSPORT,
    currencyCode: "INR",
    endDate: "2026-05-31",
    id: SEED_IDS.BUDGET_LIMIT_MONTHLY_TRANSPORT_MAY_2026,
    startDate: "2026-05-01",
  },
] as const;

const seedAccounts = [
  {
    id: SEED_IDS.ACCOUNT_CHECKING,
    kind: "asset",
    name: "HDFC Checking",
    sequenceBase: 21_000,
    subtype: "bank",
  },
  {
    id: SEED_IDS.ACCOUNT_CASH,
    kind: "asset",
    name: "Cash Wallet",
    sequenceBase: 22_000,
    subtype: "cash",
  },
  {
    id: SEED_IDS.ACCOUNT_SAVINGS,
    kind: "asset",
    name: "Emergency Savings",
    sequenceBase: 23_000,
    subtype: "bank",
  },
  {
    id: SEED_IDS.ACCOUNT_CREDIT_CARD,
    kind: "liability",
    name: "Credit Card",
    sequenceBase: 24_000,
    subtype: "credit_card",
  },
  {
    id: SEED_IDS.ACCOUNT_SALARY,
    kind: "revenue",
    name: "Salary",
    sequenceBase: 25_000,
    subtype: "external",
  },
  {
    id: SEED_IDS.ACCOUNT_INTEREST,
    kind: "revenue",
    name: "Interest",
    sequenceBase: 26_000,
    subtype: "external",
  },
  {
    id: SEED_IDS.ACCOUNT_GROCERIES,
    kind: "expense",
    name: "Groceries",
    sequenceBase: 27_000,
    subtype: "external",
  },
  {
    id: SEED_IDS.ACCOUNT_DINING,
    kind: "expense",
    name: "Dining Out",
    sequenceBase: 28_000,
    subtype: "external",
  },
  {
    id: SEED_IDS.ACCOUNT_RENT,
    kind: "expense",
    name: "Rent",
    sequenceBase: 29_000,
    subtype: "external",
  },
  {
    id: SEED_IDS.ACCOUNT_UTILITIES,
    kind: "expense",
    name: "Utilities",
    sequenceBase: 30_000,
    subtype: "external",
  },
  {
    id: SEED_IDS.ACCOUNT_TRANSPORT,
    kind: "expense",
    name: "Transport",
    sequenceBase: 31_000,
    subtype: "external",
  },
  {
    id: SEED_IDS.ACCOUNT_HEALTH,
    kind: "expense",
    name: "Healthcare",
    sequenceBase: 32_000,
    subtype: "external",
  },
  {
    id: SEED_IDS.ACCOUNT_SHOPPING,
    kind: "expense",
    name: "Shopping",
    sequenceBase: 33_000,
    subtype: "external",
  },
  {
    id: SEED_IDS.ACCOUNT_ENTERTAINMENT,
    kind: "expense",
    name: "Entertainment",
    sequenceBase: 34_000,
    subtype: "external",
  },
] as const satisfies readonly SeedAccount[];

const demoTransactions = [
  {
    id: SEED_IDS.TX_SALARY,
    sequenceBase: 61_000,
    type: "income",
    title: "May salary",
    description: "May salary",
    occurredAt: "2026-05-01T09:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_SALARY,
    currencyCode: "INR",
    lines: [{ amountMinor: 250_000_00n, destinationAccountId: SEED_IDS.ACCOUNT_CHECKING }],
  },
  {
    id: SEED_IDS.TX_RENT,
    sequenceBase: 62_000,
    type: "expense",
    title: "Monthly rent",
    description: "Monthly rent",
    occurredAt: "2026-05-02T10:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 45_000_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_LIVING,
        destinationAccountId: SEED_IDS.ACCOUNT_RENT,
      },
    ],
  },
  {
    id: SEED_IDS.TX_GROCERIES,
    sequenceBase: 63_000,
    type: "expense",
    title: "Weekly groceries",
    description: "Weekly groceries",
    occurredAt: "2026-05-04T18:30:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 6_850_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_FOOD,
        destinationAccountId: SEED_IDS.ACCOUNT_GROCERIES,
      },
    ],
  },
  {
    id: SEED_IDS.TX_DINING,
    sequenceBase: 64_000,
    type: "expense",
    title: "Dinner with friends",
    description: "Dinner with friends",
    occurredAt: "2026-05-05T20:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CREDIT_CARD,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 2_400_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_FOOD,
        destinationAccountId: SEED_IDS.ACCOUNT_DINING,
      },
    ],
  },
  {
    id: SEED_IDS.TX_TRANSFER_SAVINGS,
    sequenceBase: 65_000,
    type: "transfer",
    title: "Move to savings",
    description: "Move to savings",
    occurredAt: "2026-05-06T08:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [{ amountMinor: 50_000_00n, destinationAccountId: SEED_IDS.ACCOUNT_SAVINGS }],
  },
] as const satisfies readonly SeedTransaction[];

const e2eTransactions = [
  {
    id: SEED_IDS.TX_UTILITIES,
    sequenceBase: 66_000,
    type: "expense",
    title: "Electricity bill",
    description: "Electricity bill",
    occurredAt: "2026-05-07T12:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 3_250_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_LIVING,
        destinationAccountId: SEED_IDS.ACCOUNT_UTILITIES,
      },
    ],
  },
  {
    id: SEED_IDS.TX_CASH_WITHDRAWAL,
    sequenceBase: 67_000,
    type: "transfer",
    title: "ATM withdrawal",
    description: "ATM withdrawal",
    occurredAt: "2026-05-08T11:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [{ amountMinor: 5_000_00n, destinationAccountId: SEED_IDS.ACCOUNT_CASH }],
  },
  {
    id: SEED_IDS.TX_PHARMACY,
    sequenceBase: 68_000,
    type: "expense",
    title: "Pharmacy",
    description: "Pharmacy",
    occurredAt: "2026-05-08T19:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CASH,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 850_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_LIVING,
        destinationAccountId: SEED_IDS.ACCOUNT_HEALTH,
      },
    ],
  },
  {
    id: SEED_IDS.TX_INTEREST,
    sequenceBase: 69_000,
    type: "income",
    title: "Savings interest",
    description: "Savings interest",
    occurredAt: "2026-05-09T09:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_INTEREST,
    currencyCode: "INR",
    lines: [{ amountMinor: 625_00n, destinationAccountId: SEED_IDS.ACCOUNT_SAVINGS }],
  },
  {
    id: SEED_IDS.TX_SPLIT_MARKET,
    sequenceBase: 70_000,
    type: "expense",
    title: "Market run",
    description: "Market run",
    occurredAt: "2026-05-09T18:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 4_200_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_FOOD,
        description: "Food staples",
        destinationAccountId: SEED_IDS.ACCOUNT_GROCERIES,
      },
      {
        amountMinor: 1_300_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_LIVING,
        description: "Home supplies",
        destinationAccountId: SEED_IDS.ACCOUNT_SHOPPING,
      },
    ],
  },
  {
    id: SEED_IDS.TX_CARD_SHOPPING,
    sequenceBase: 71_000,
    type: "expense",
    title: "Clothes",
    description: "Clothes",
    occurredAt: "2026-05-10T15:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CREDIT_CARD,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 3_750_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_LIVING,
        destinationAccountId: SEED_IDS.ACCOUNT_SHOPPING,
      },
    ],
  },
  {
    id: SEED_IDS.TX_BUS_PASS,
    sequenceBase: 72_000,
    type: "expense",
    title: "Metro pass",
    description: "Metro pass",
    occurredAt: "2026-05-11T08:30:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 1_500_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_TRANSPORT,
        destinationAccountId: SEED_IDS.ACCOUNT_TRANSPORT,
      },
    ],
  },
  {
    id: SEED_IDS.TX_COFFEE,
    sequenceBase: 73_000,
    type: "expense",
    title: "Coffee",
    description: "Coffee",
    occurredAt: "2026-05-11T17:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CASH,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 240_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_FOOD,
        destinationAccountId: SEED_IDS.ACCOUNT_DINING,
      },
    ],
  },
  {
    id: SEED_IDS.TX_PENDING_BILL,
    sequenceBase: 74_000,
    type: "expense",
    status: "pending",
    title: "Pending internet bill",
    description: "Pending internet bill",
    occurredAt: "2026-05-12T09:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 1_199_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_LIVING,
        destinationAccountId: SEED_IDS.ACCOUNT_UTILITIES,
      },
    ],
  },
  {
    id: SEED_IDS.TX_QA_GROCERIES_2,
    sequenceBase: 75_000,
    type: "expense",
    title: "Fruit and vegetables",
    description: "Fruit and vegetables",
    occurredAt: "2026-05-12T19:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 1_120_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_FOOD,
        destinationAccountId: SEED_IDS.ACCOUNT_GROCERIES,
      },
    ],
  },
  {
    id: SEED_IDS.TX_QA_DINING_2,
    sequenceBase: 76_000,
    type: "expense",
    title: "Lunch",
    description: "Lunch",
    occurredAt: "2026-05-13T13:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CREDIT_CARD,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 680_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_FOOD,
        destinationAccountId: SEED_IDS.ACCOUNT_DINING,
      },
    ],
  },
  {
    id: SEED_IDS.TX_QA_TRANSPORT_2,
    sequenceBase: 77_000,
    type: "expense",
    title: "Ride share",
    description: "Ride share",
    occurredAt: "2026-05-13T21:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 520_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_TRANSPORT,
        destinationAccountId: SEED_IDS.ACCOUNT_TRANSPORT,
      },
    ],
  },
  {
    id: SEED_IDS.TX_QA_HEALTH_2,
    sequenceBase: 78_000,
    type: "expense",
    title: "Doctor visit",
    description: "Doctor visit",
    occurredAt: "2026-05-14T10:30:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 2_000_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_LIVING,
        destinationAccountId: SEED_IDS.ACCOUNT_HEALTH,
      },
    ],
  },
] as const satisfies readonly SeedTransaction[];

export async function seedDatabase(input: SeedDatabaseInput): Promise<void> {
  if (input.driver === "sqlite") {
    const client = createConfiguredSqliteClient({ source: input.databaseUrl });
    try {
      await seedSqlite(client, input.level);
    } finally {
      client.close();
    }
    return;
  }

  const client = createPostgresClient({ url: input.databaseUrl });
  try {
    await seedPostgres(client, input.level);
  } finally {
    await closePostgresClient(client);
  }
}

export async function seedSqlite(client: SqliteClient, level: SeedLevel): Promise<void> {
  const db = createSqliteDatabaseFromClient(client);
  await runSeedStage("sqlite:essential-currencies", () => seedEssentialSqlite(db));
  if (level === "essential") {
    await runSeedStage("sqlite:foundation", () => seedFoundationSqlite(db));
    await runSeedStage("sqlite:accounts", () => seedAccountsSqlite(client));
    await runSeedStage("sqlite:reference-data", () => seedReferenceDataSqlite(db));
    return;
  }

  await runSeedStage("sqlite:demo", () => seedDemoSqlite(client, db));
  if (level === "e2e") {
    await runSeedStage("sqlite:e2e", () => seedE2eSqlite(client, db));
  }
}

export async function seedPostgres(client: PostgresClient, level: SeedLevel): Promise<void> {
  const db = createPostgresDatabaseFromClient(client);
  await seedPostgresDatabase(db, level);
}

export async function seedPostgresDatabase(db: PostgresDatabase, level: SeedLevel): Promise<void> {
  await runSeedStage("postgres:essential-currencies", () => seedEssentialPostgres(db));
  if (level === "essential") {
    await runSeedStage("postgres:foundation", () => seedFoundationPostgres(db));
    await runSeedStage("postgres:accounts", () => seedAccountsPostgres(db));
    await runSeedStage("postgres:reference-data", () => seedReferenceDataPostgres(db));
    return;
  }

  await runSeedStage("postgres:demo", () => seedDemoPostgres(db));
  if (level === "e2e") {
    await runSeedStage("postgres:e2e", () => seedE2ePostgres(db));
  }
}

async function runSeedStage(label: string, task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    throw new Error(`Seed stage failed: ${label}`, { cause: error });
  }
}

async function seedEssentialSqlite(db: SqliteDatabase): Promise<void> {
  for (const currency of seedCurrencies) {
    await db
      .insert(sqliteCurrencies)
      .values({ ...currency, createdAt: SEED_NOW, updatedAt: SEED_NOW })
      .onConflictDoUpdate({
        target: sqliteCurrencies.code,
        set: { ...currency, updatedAt: SEED_NOW },
      });
  }
}

async function seedEssentialPostgres(db: PostgresDatabase): Promise<void> {
  for (const currency of seedCurrencies) {
    await db
      .insert(pgCurrencies)
      .values({ ...currency, createdAt: new Date(SEED_NOW), updatedAt: new Date(SEED_NOW) })
      .onConflictDoUpdate({
        target: pgCurrencies.code,
        set: { ...currency, updatedAt: new Date(SEED_NOW) },
      });
  }
}

async function seedDemoSqlite(client: SqliteClient, db: SqliteDatabase): Promise<void> {
  await runSeedStage("sqlite:demo:foundation", () => seedFoundationSqlite(db));
  await runSeedStage("sqlite:demo:accounts", () => seedAccountsSqlite(client));
  await runSeedStage("sqlite:demo:reference-data", () => seedReferenceDataSqlite(db));
  await runSeedStage("sqlite:demo:budget-limits", () => seedBudgetLimitsSqlite(db));
  await runSeedStage("sqlite:demo:transactions", () =>
    seedTransactionsSqlite(client, demoTransactions),
  );
}

async function seedDemoPostgres(db: PostgresDatabase): Promise<void> {
  await runSeedStage("postgres:demo:foundation", () => seedFoundationPostgres(db));
  await runSeedStage("postgres:demo:accounts", () => seedAccountsPostgres(db));
  await runSeedStage("postgres:demo:reference-data", () => seedReferenceDataPostgres(db));
  await runSeedStage("postgres:demo:budget-limits", () => seedBudgetLimitsPostgres(db));
  await runSeedStage("postgres:demo:transactions", () =>
    seedTransactionsPostgres(db, demoTransactions),
  );
}

async function seedE2eSqlite(client: SqliteClient, db: SqliteDatabase): Promise<void> {
  void db;
  await seedTransactionsSqlite(client, e2eTransactions);
}

async function seedE2ePostgres(db: PostgresDatabase): Promise<void> {
  await seedTransactionsPostgres(db, e2eTransactions);
}

async function seedFoundationSqlite(db: SqliteDatabase): Promise<void> {
  const ownerPasswordHash = await createSeedPasswordHash(SEED_CREDENTIALS.owner.password);
  const partnerPasswordHash = await createSeedPasswordHash(SEED_CREDENTIALS.partner.password);

  await db
    .insert(sqliteUsers)
    .values({
      id: SEED_IDS.USER_OWNER,
      username: SEED_CREDENTIALS.owner.username,
      usernameNormalized: normalizeUsername(SEED_CREDENTIALS.owner.username),
      displayName: "Demo Owner",
      passwordHash: ownerPasswordHash,
      createdAt: SEED_NOW,
      updatedAt: SEED_NOW,
    })
    .onConflictDoUpdate({
      target: sqliteUsers.id,
      set: { passwordHash: ownerPasswordHash, updatedAt: SEED_NOW },
    });

  await db
    .insert(sqliteUsers)
    .values({
      id: SEED_IDS.USER_PARTNER,
      username: SEED_CREDENTIALS.partner.username,
      usernameNormalized: normalizeUsername(SEED_CREDENTIALS.partner.username),
      displayName: "Demo Partner",
      passwordHash: partnerPasswordHash,
      createdAt: SEED_NOW,
      updatedAt: SEED_NOW,
    })
    .onConflictDoUpdate({
      target: sqliteUsers.id,
      set: { passwordHash: partnerPasswordHash, updatedAt: SEED_NOW },
    });

  await db
    .insert(sqliteWorkspaces)
    .values({
      id: SEED_IDS.WORKSPACE_HOUSEHOLD,
      name: "Demo household",
      ownerUserId: SEED_IDS.USER_OWNER,
      status: "active",
      createdAt: SEED_NOW,
      updatedAt: SEED_NOW,
    })
    .onConflictDoUpdate({
      target: sqliteWorkspaces.id,
      set: { name: "Demo household", status: "active", updatedAt: SEED_NOW },
    });

  await db
    .insert(sqliteLedgers)
    .values({
      id: SEED_IDS.LEDGER_HOUSEHOLD,
      workspaceId: SEED_IDS.WORKSPACE_HOUSEHOLD,
      name: "Household INR",
      baseCurrencyCode: "INR",
      firstDayOfWeek: 1,
      status: "active",
      createdAt: SEED_NOW,
      updatedAt: SEED_NOW,
    })
    .onConflictDoUpdate({
      target: sqliteLedgers.id,
      set: {
        baseCurrencyCode: "INR",
        name: "Household INR",
        status: "active",
        updatedAt: SEED_NOW,
      },
    });

  await db
    .insert(sqliteWorkspaceMembers)
    .values([
      {
        id: SEED_IDS.MEMBER_OWNER,
        workspaceId: SEED_IDS.WORKSPACE_HOUSEHOLD,
        userId: SEED_IDS.USER_OWNER,
        role: "owner",
        createdAt: SEED_NOW,
        updatedAt: SEED_NOW,
      },
      {
        id: SEED_IDS.MEMBER_PARTNER,
        workspaceId: SEED_IDS.WORKSPACE_HOUSEHOLD,
        userId: SEED_IDS.USER_PARTNER,
        role: "editor",
        createdAt: SEED_NOW,
        updatedAt: SEED_NOW,
      },
    ])
    .onConflictDoUpdate({
      target: sqliteWorkspaceMembers.id,
      set: { removedAt: null, updatedAt: SEED_NOW },
    });
}

async function seedFoundationPostgres(db: PostgresDatabase): Promise<void> {
  const now = new Date(SEED_NOW);
  const ownerPasswordHash = await createSeedPasswordHash(SEED_CREDENTIALS.owner.password);
  const partnerPasswordHash = await createSeedPasswordHash(SEED_CREDENTIALS.partner.password);

  await db
    .insert(pgUsers)
    .values({
      id: SEED_IDS.USER_OWNER,
      username: SEED_CREDENTIALS.owner.username,
      usernameNormalized: normalizeUsername(SEED_CREDENTIALS.owner.username),
      displayName: "Demo Owner",
      passwordHash: ownerPasswordHash,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pgUsers.id,
      set: { passwordHash: ownerPasswordHash, updatedAt: now },
    });

  await db
    .insert(pgUsers)
    .values({
      id: SEED_IDS.USER_PARTNER,
      username: SEED_CREDENTIALS.partner.username,
      usernameNormalized: normalizeUsername(SEED_CREDENTIALS.partner.username),
      displayName: "Demo Partner",
      passwordHash: partnerPasswordHash,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pgUsers.id,
      set: { passwordHash: partnerPasswordHash, updatedAt: now },
    });

  await db
    .insert(pgWorkspaces)
    .values({
      id: SEED_IDS.WORKSPACE_HOUSEHOLD,
      name: "Demo household",
      ownerUserId: SEED_IDS.USER_OWNER,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pgWorkspaces.id,
      set: { name: "Demo household", status: "active", updatedAt: now },
    });

  await db
    .insert(pgLedgers)
    .values({
      id: SEED_IDS.LEDGER_HOUSEHOLD,
      workspaceId: SEED_IDS.WORKSPACE_HOUSEHOLD,
      name: "Household INR",
      baseCurrencyCode: "INR",
      firstDayOfWeek: 1,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pgLedgers.id,
      set: { baseCurrencyCode: "INR", name: "Household INR", status: "active", updatedAt: now },
    });

  await db
    .insert(pgWorkspaceMembers)
    .values([
      {
        id: SEED_IDS.MEMBER_OWNER,
        workspaceId: SEED_IDS.WORKSPACE_HOUSEHOLD,
        userId: SEED_IDS.USER_OWNER,
        role: "owner",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: SEED_IDS.MEMBER_PARTNER,
        workspaceId: SEED_IDS.WORKSPACE_HOUSEHOLD,
        userId: SEED_IDS.USER_PARTNER,
        role: "editor",
        createdAt: now,
        updatedAt: now,
      },
    ])
    .onConflictDoUpdate({
      target: pgWorkspaceMembers.id,
      set: { removedAt: null, updatedAt: now },
    });
}

async function seedReferenceDataSqlite(db: SqliteDatabase): Promise<void> {
  await db
    .insert(sqliteCategories)
    .values([
      categoryRowWithCounterparty(
        SEED_IDS.CATEGORY_FOOD,
        "Food",
        null,
        SEED_IDS.ACCOUNT_GROCERIES,
        "#10b981",
        "utensils",
      ),
      categoryRowWithCounterparty(
        SEED_IDS.CATEGORY_GROCERIES,
        "Groceries",
        SEED_IDS.CATEGORY_FOOD,
        SEED_IDS.ACCOUNT_GROCERIES,
        "#22c55e",
        "shopping-basket",
      ),
      categoryRowWithCounterparty(
        SEED_IDS.CATEGORY_DINING,
        "Dining Out",
        SEED_IDS.CATEGORY_FOOD,
        SEED_IDS.ACCOUNT_DINING,
        "#34d399",
        "utensils-crossed",
      ),
      categoryRowWithCounterparty(
        SEED_IDS.CATEGORY_HOUSING,
        "Housing",
        null,
        SEED_IDS.ACCOUNT_RENT,
        "#64748b",
        "house",
      ),
      categoryRowWithCounterparty(
        SEED_IDS.CATEGORY_TRANSPORT,
        "Transport",
        null,
        SEED_IDS.ACCOUNT_TRANSPORT,
        "#0ea5e9",
        "train",
      ),
      categoryRowWithCounterparty(
        SEED_IDS.CATEGORY_HEALTH,
        "Healthcare",
        null,
        SEED_IDS.ACCOUNT_HEALTH,
        "#ef4444",
        "heart-pulse",
      ),
      categoryRowWithCounterparty(
        SEED_IDS.CATEGORY_SHOPPING,
        "Shopping",
        null,
        SEED_IDS.ACCOUNT_SHOPPING,
        "#a855f7",
        "shopping-bag",
      ),
      categoryRowWithCounterparty(
        SEED_IDS.CATEGORY_ENTERTAINMENT,
        "Entertainment",
        null,
        SEED_IDS.ACCOUNT_ENTERTAINMENT,
        "#f59e0b",
        "clapperboard",
      ),
    ])
    .onConflictDoUpdate({ target: sqliteCategories.id, set: { updatedAt: SEED_NOW } });

  await db
    .insert(sqliteTags)
    .values([
      tagRow(SEED_IDS.TAG_IMPORTANT, "Important", "#ef4444"),
      tagRow(SEED_IDS.TAG_RECURRING, "Recurring", "#6366f1"),
      tagRow(SEED_IDS.TAG_MANUAL_QA, "Manual QA", "#10b981"),
    ])
    .onConflictDoUpdate({ target: sqliteTags.id, set: { updatedAt: SEED_NOW } });

  await db
    .insert(sqlitePayees)
    .values([
      payeeRow(SEED_IDS.PAYEE_EMPLOYER, "Acme Pvt Ltd"),
      payeeRow(SEED_IDS.PAYEE_RENT, "Landlord"),
      payeeRow(SEED_IDS.PAYEE_GROCERY, "Reliance Fresh"),
      payeeRow(SEED_IDS.PAYEE_METRO, "Delhi Metro"),
      payeeRow(SEED_IDS.PAYEE_PHARMACY, "Apollo Pharmacy"),
    ])
    .onConflictDoUpdate({ target: sqlitePayees.id, set: { updatedAt: SEED_NOW } });

  await db
    .insert(sqliteBudgets)
    .values([
      budgetRow(SEED_IDS.BUDGET_MONTHLY_FOOD, "Monthly food", "INR"),
      budgetRow(SEED_IDS.BUDGET_MONTHLY_LIVING, "Monthly living", "INR"),
      budgetRow(SEED_IDS.BUDGET_MONTHLY_TRANSPORT, "Monthly transport", "INR"),
    ])
    .onConflictDoUpdate({ target: sqliteBudgets.id, set: { updatedAt: SEED_NOW } });
}

async function seedReferenceDataPostgres(db: PostgresDatabase): Promise<void> {
  const now = new Date(SEED_NOW);
  await db
    .insert(pgCategories)
    .values([
      categoryRowWithCounterparty(
        SEED_IDS.CATEGORY_FOOD,
        "Food",
        null,
        SEED_IDS.ACCOUNT_GROCERIES,
        "#10b981",
        "utensils",
        now,
      ),
      categoryRowWithCounterparty(
        SEED_IDS.CATEGORY_GROCERIES,
        "Groceries",
        SEED_IDS.CATEGORY_FOOD,
        SEED_IDS.ACCOUNT_GROCERIES,
        "#22c55e",
        "shopping-basket",
        now,
      ),
      categoryRowWithCounterparty(
        SEED_IDS.CATEGORY_DINING,
        "Dining Out",
        SEED_IDS.CATEGORY_FOOD,
        SEED_IDS.ACCOUNT_DINING,
        "#34d399",
        "utensils-crossed",
        now,
      ),
      categoryRowWithCounterparty(
        SEED_IDS.CATEGORY_HOUSING,
        "Housing",
        null,
        SEED_IDS.ACCOUNT_RENT,
        "#64748b",
        "house",
        now,
      ),
      categoryRowWithCounterparty(
        SEED_IDS.CATEGORY_TRANSPORT,
        "Transport",
        null,
        SEED_IDS.ACCOUNT_TRANSPORT,
        "#0ea5e9",
        "train",
        now,
      ),
      categoryRowWithCounterparty(
        SEED_IDS.CATEGORY_HEALTH,
        "Healthcare",
        null,
        SEED_IDS.ACCOUNT_HEALTH,
        "#ef4444",
        "heart-pulse",
        now,
      ),
      categoryRowWithCounterparty(
        SEED_IDS.CATEGORY_SHOPPING,
        "Shopping",
        null,
        SEED_IDS.ACCOUNT_SHOPPING,
        "#a855f7",
        "shopping-bag",
        now,
      ),
      categoryRowWithCounterparty(
        SEED_IDS.CATEGORY_ENTERTAINMENT,
        "Entertainment",
        null,
        SEED_IDS.ACCOUNT_ENTERTAINMENT,
        "#f59e0b",
        "clapperboard",
        now,
      ),
    ])
    .onConflictDoUpdate({ target: pgCategories.id, set: { updatedAt: now } });

  await db
    .insert(pgTags)
    .values([
      tagRow(SEED_IDS.TAG_IMPORTANT, "Important", "#ef4444", now),
      tagRow(SEED_IDS.TAG_RECURRING, "Recurring", "#6366f1", now),
      tagRow(SEED_IDS.TAG_MANUAL_QA, "Manual QA", "#10b981", now),
    ])
    .onConflictDoUpdate({ target: pgTags.id, set: { updatedAt: now } });

  await db
    .insert(pgPayees)
    .values([
      payeeRow(SEED_IDS.PAYEE_EMPLOYER, "Acme Pvt Ltd", now),
      payeeRow(SEED_IDS.PAYEE_RENT, "Landlord", now),
      payeeRow(SEED_IDS.PAYEE_GROCERY, "Reliance Fresh", now),
      payeeRow(SEED_IDS.PAYEE_METRO, "Delhi Metro", now),
      payeeRow(SEED_IDS.PAYEE_PHARMACY, "Apollo Pharmacy", now),
    ])
    .onConflictDoUpdate({ target: pgPayees.id, set: { updatedAt: now } });

  await db
    .insert(pgBudgets)
    .values([
      budgetRow(SEED_IDS.BUDGET_MONTHLY_FOOD, "Monthly food", "INR", now),
      budgetRow(SEED_IDS.BUDGET_MONTHLY_LIVING, "Monthly living", "INR", now),
      budgetRow(SEED_IDS.BUDGET_MONTHLY_TRANSPORT, "Monthly transport", "INR", now),
    ])
    .onConflictDoUpdate({ target: pgBudgets.id, set: { updatedAt: now } });
}

async function seedBudgetLimitsSqlite(db: SqliteDatabase): Promise<void> {
  for (const budgetLimit of seedBudgetLimits) {
    const amountMinor = toSqliteIntegerMoneyMinor(budgetLimit.amountMinor);
    await db
      .insert(sqliteBudgetLimits)
      .values({
        amountMinor,
        budgetId: budgetLimit.budgetId,
        categoryId: budgetLimit.categoryId,
        createdAt: SEED_NOW,
        currencyCode: budgetLimit.currencyCode,
        endDate: budgetLimit.endDate,
        id: budgetLimit.id,
        startDate: budgetLimit.startDate,
        updatedAt: SEED_NOW,
      })
      .onConflictDoUpdate({
        target: sqliteBudgetLimits.id,
        set: {
          amountMinor,
          budgetId: budgetLimit.budgetId,
          categoryId: budgetLimit.categoryId,
          currencyCode: budgetLimit.currencyCode,
          endDate: budgetLimit.endDate,
          startDate: budgetLimit.startDate,
          updatedAt: SEED_NOW,
        },
      });
  }
}

async function seedBudgetLimitsPostgres(db: PostgresDatabase): Promise<void> {
  const now = new Date(SEED_NOW);

  for (const budgetLimit of seedBudgetLimits) {
    await db
      .insert(pgBudgetLimits)
      .values(budgetLimitRow(budgetLimit.id, budgetLimit, now))
      .onConflictDoUpdate({
        target: pgBudgetLimits.id,
        set: {
          amountMinor: budgetLimit.amountMinor,
          budgetId: budgetLimit.budgetId,
          categoryId: budgetLimit.categoryId,
          currencyCode: budgetLimit.currencyCode,
          endDate: budgetLimit.endDate,
          startDate: budgetLimit.startDate,
          updatedAt: now,
        },
      });
  }
}

async function seedAccountsSqlite(client: SqliteClient): Promise<void> {
  const lookupRepository = createSqliteAccountRepository(client);

  for (const account of seedAccounts) {
    const existing = await lookupRepository.findAccount({
      accountId: account.id,
      ledgerId: SEED_IDS.LEDGER_HOUSEHOLD,
      workspaceId: SEED_IDS.WORKSPACE_HOUSEHOLD,
    });

    if (existing) {
      continue;
    }

    const repository = createSqliteAccountRepository(client, {
      createId: createSeedIdGenerator(account.id, account.sequenceBase),
    });
    await repository.createAccount({
      currencyCode: "INR",
      kind: account.kind,
      ledgerId: SEED_IDS.LEDGER_HOUSEHOLD,
      name: account.name,
      subtype: account.subtype,
      workspaceId: SEED_IDS.WORKSPACE_HOUSEHOLD,
    });
  }
}

async function seedAccountsPostgres(db: PostgresDatabase): Promise<void> {
  const lookupRepository = createPostgresAccountRepository(db);

  for (const account of seedAccounts) {
    const existing = await lookupRepository.findAccount({
      accountId: account.id,
      ledgerId: SEED_IDS.LEDGER_HOUSEHOLD,
      workspaceId: SEED_IDS.WORKSPACE_HOUSEHOLD,
    });

    if (existing) {
      continue;
    }

    const repository = createPostgresAccountRepository(db, {
      createId: createSeedIdGenerator(account.id, account.sequenceBase),
    });
    await repository.createAccount({
      currencyCode: "INR",
      kind: account.kind,
      ledgerId: SEED_IDS.LEDGER_HOUSEHOLD,
      name: account.name,
      subtype: account.subtype,
      workspaceId: SEED_IDS.WORKSPACE_HOUSEHOLD,
    });
  }
}

async function seedTransactionsSqlite(
  client: SqliteClient,
  transactions: readonly SeedTransaction[],
): Promise<void> {
  const query = createSqliteTransactionQueryService(client);

  for (const transaction of transactions) {
    const existing = await query.getTransactionGroup({
      ledgerId: SEED_IDS.LEDGER_HOUSEHOLD,
      transactionGroupId: transaction.id,
      workspaceId: SEED_IDS.WORKSPACE_HOUSEHOLD,
    });

    if (existing) {
      continue;
    }

    const repository = createSqliteTransactionWriteRepository(client, {
      createId: createSeedIdGenerator(transaction.id, transaction.sequenceBase),
    });
    await repository.createTransaction({
      ...transaction,
      createdBy: SEED_IDS.USER_OWNER,
      ledgerId: SEED_IDS.LEDGER_HOUSEHOLD,
      source: "manual",
      workspaceId: SEED_IDS.WORKSPACE_HOUSEHOLD,
    });
  }
}

async function seedTransactionsPostgres(
  db: PostgresDatabase,
  transactions: readonly SeedTransaction[],
): Promise<void> {
  const query = createPostgresTransactionQueryService(db);

  for (const transaction of transactions) {
    const existing = await query.getTransactionGroup({
      ledgerId: SEED_IDS.LEDGER_HOUSEHOLD,
      transactionGroupId: transaction.id,
      workspaceId: SEED_IDS.WORKSPACE_HOUSEHOLD,
    });

    if (existing) {
      continue;
    }

    const repository = createPostgresTransactionWriteRepository(db, {
      createId: createSeedIdGenerator(transaction.id, transaction.sequenceBase),
    });
    await repository.createTransaction({
      ...transaction,
      createdBy: SEED_IDS.USER_OWNER,
      ledgerId: SEED_IDS.LEDGER_HOUSEHOLD,
      source: "manual",
      workspaceId: SEED_IDS.WORKSPACE_HOUSEHOLD,
    });
  }
}

function createSeedIdGenerator(first: SyncedId, sequenceBase: number): () => SyncedId {
  let next = sequenceBase;
  let firstAvailable = true;

  return () => {
    if (firstAvailable) {
      firstAvailable = false;
      return first;
    }

    next += 1;
    return seedId(next);
  };
}

function categoryRowWithCounterparty<TNow extends Date | string = string>(
  id: SyncedId,
  name: string,
  parentId: SyncedId | null,
  counterpartyAccountId: SyncedId,
  color: string,
  icon: string,
  now: TNow = SEED_NOW as TNow,
) {
  return {
    id,
    workspaceId: SEED_IDS.WORKSPACE_HOUSEHOLD,
    ledgerId: SEED_IDS.LEDGER_HOUSEHOLD,
    parentId,
    counterpartyAccountId,
    name,
    color,
    icon,
    createdAt: now,
    updatedAt: now,
  };
}

function tagRow<TNow extends Date | string = string>(
  id: SyncedId,
  name: string,
  color: string,
  now: TNow = SEED_NOW as TNow,
) {
  return {
    id,
    workspaceId: SEED_IDS.WORKSPACE_HOUSEHOLD,
    ledgerId: SEED_IDS.LEDGER_HOUSEHOLD,
    name,
    color,
    createdAt: now,
    updatedAt: now,
  };
}

function payeeRow<TNow extends Date | string = string>(
  id: SyncedId,
  name: string,
  now: TNow = SEED_NOW as TNow,
) {
  return {
    id,
    workspaceId: SEED_IDS.WORKSPACE_HOUSEHOLD,
    ledgerId: SEED_IDS.LEDGER_HOUSEHOLD,
    name,
    normalizedName: name.trim().toLocaleLowerCase("en-US"),
    createdAt: now,
    updatedAt: now,
  };
}

function budgetRow<TNow extends Date | string = string>(
  id: SyncedId,
  name: string,
  currencyCode: string,
  now: TNow = SEED_NOW as TNow,
) {
  return {
    id,
    workspaceId: SEED_IDS.WORKSPACE_HOUSEHOLD,
    ledgerId: SEED_IDS.LEDGER_HOUSEHOLD,
    name,
    currencyCode,
    period: "monthly" as const,
    rolloverEnabled: false,
    createdAt: now,
    updatedAt: now,
  };
}

function budgetLimitRow<TNow extends Date | string = string>(
  id: SyncedId,
  input: {
    readonly budgetId: SyncedId;
    readonly categoryId: SyncedId;
    readonly amountMinor: bigint;
    readonly currencyCode: string;
    readonly startDate: string;
    readonly endDate: string;
  },
  now: TNow,
) {
  return {
    id,
    budgetId: input.budgetId,
    categoryId: input.categoryId,
    amountMinor: input.amountMinor,
    currencyCode: input.currencyCode,
    startDate: input.startDate,
    endDate: input.endDate,
    createdAt: now,
    updatedAt: now,
  };
}

function toSqliteIntegerMoneyMinor(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`SQLite seed amount ${value} exceeds Number safe integer range.`);
  }
  return Number(value);
}
