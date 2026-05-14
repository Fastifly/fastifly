import {
  type CreateAccountRequest,
  CreateAccountRequestSchema,
  type CreateTransactionRequest,
  CreateTransactionRequestSchema,
  type CurrencyCode,
  formatAmountMinor,
  parseAmountMinor,
  type SyncedId,
} from "@fastifly/common";
import { eq } from "drizzle-orm";

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
  type CreateAccountInput,
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

type SeedFoundationContext = {
  readonly ownerUserId: SyncedId;
  readonly partnerUserId: SyncedId;
};

type SeedAccount = {
  readonly id: SyncedId;
  readonly sequenceBase: number;
} & Omit<CreateAccountInput, "workspaceId" | "ledgerId" | "createdBy">;

type SeedTransaction = {
  readonly id: SyncedId;
  readonly sequenceBase: number;
} & Omit<CreateTransactionInput, "workspaceId" | "ledgerId" | "createdBy" | "source">;

type SeedCurrency = {
  readonly code: CurrencyCode;
  readonly decimalPlaces: number;
  readonly name: string;
  readonly symbol: string;
};

type SeedBudgetLimit = {
  readonly amountMinor: bigint;
  readonly budgetId: SyncedId;
  readonly categoryId: SyncedId;
  readonly currencyCode: CurrencyCode;
  readonly endDate: string;
  readonly id: SyncedId;
  readonly startDate: string;
};

const seedCurrencies: readonly SeedCurrency[] = [
  { code: "INR", decimalPlaces: 2, name: "Indian Rupee", symbol: "₹" },
  { code: "USD", decimalPlaces: 2, name: "US Dollar", symbol: "$" },
  { code: "EUR", decimalPlaces: 2, name: "Euro", symbol: "€" },
] as const;

const seedBudgetLimits: readonly SeedBudgetLimit[] = [
  {
    amountMinor: 36_000_00n,
    budgetId: SEED_IDS.BUDGET_MONTHLY_FOOD,
    categoryId: SEED_IDS.CATEGORY_FOOD,
    currencyCode: "INR",
    endDate: "2026-03-31",
    id: SEED_IDS.BUDGET_LIMIT_MONTHLY_FOOD_MAR_2026,
    startDate: "2026-03-01",
  },
  {
    amountMinor: 70_000_00n,
    budgetId: SEED_IDS.BUDGET_MONTHLY_LIVING,
    categoryId: SEED_IDS.CATEGORY_HOUSING,
    currencyCode: "INR",
    endDate: "2026-03-31",
    id: SEED_IDS.BUDGET_LIMIT_MONTHLY_LIVING_MAR_2026,
    startDate: "2026-03-01",
  },
  {
    amountMinor: 10_000_00n,
    budgetId: SEED_IDS.BUDGET_MONTHLY_TRANSPORT,
    categoryId: SEED_IDS.CATEGORY_TRANSPORT,
    currencyCode: "INR",
    endDate: "2026-03-31",
    id: SEED_IDS.BUDGET_LIMIT_MONTHLY_TRANSPORT_MAR_2026,
    startDate: "2026-03-01",
  },
  {
    amountMinor: 38_000_00n,
    budgetId: SEED_IDS.BUDGET_MONTHLY_FOOD,
    categoryId: SEED_IDS.CATEGORY_FOOD,
    currencyCode: "INR",
    endDate: "2026-04-30",
    id: SEED_IDS.BUDGET_LIMIT_MONTHLY_FOOD_APR_2026,
    startDate: "2026-04-01",
  },
  {
    amountMinor: 82_000_00n,
    budgetId: SEED_IDS.BUDGET_MONTHLY_LIVING,
    categoryId: SEED_IDS.CATEGORY_HOUSING,
    currencyCode: "INR",
    endDate: "2026-04-30",
    id: SEED_IDS.BUDGET_LIMIT_MONTHLY_LIVING_APR_2026,
    startDate: "2026-04-01",
  },
  {
    amountMinor: 12_000_00n,
    budgetId: SEED_IDS.BUDGET_MONTHLY_TRANSPORT,
    categoryId: SEED_IDS.CATEGORY_TRANSPORT,
    currencyCode: "INR",
    endDate: "2026-04-30",
    id: SEED_IDS.BUDGET_LIMIT_MONTHLY_TRANSPORT_APR_2026,
    startDate: "2026-04-01",
  },
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

const seedAccounts: readonly SeedAccount[] = [
  {
    id: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    kind: "asset",
    name: "HDFC Checking",
    sequenceBase: 21_000,
    subtype: "bank",
  },
  {
    id: SEED_IDS.ACCOUNT_CASH,
    currencyCode: "INR",
    kind: "asset",
    name: "Cash Wallet",
    sequenceBase: 22_000,
    subtype: "cash",
  },
  {
    id: SEED_IDS.ACCOUNT_SAVINGS,
    currencyCode: "INR",
    kind: "asset",
    name: "Emergency Savings",
    sequenceBase: 23_000,
    subtype: "bank",
  },
  {
    id: SEED_IDS.ACCOUNT_CREDIT_CARD,
    currencyCode: "INR",
    kind: "liability",
    name: "Credit Card",
    sequenceBase: 24_000,
    subtype: "credit_card",
  },
  {
    id: SEED_IDS.ACCOUNT_SALARY,
    currencyCode: "INR",
    kind: "revenue",
    name: "Salary",
    sequenceBase: 25_000,
    subtype: "external",
  },
  {
    id: SEED_IDS.ACCOUNT_INTEREST,
    currencyCode: "INR",
    kind: "revenue",
    name: "Interest",
    sequenceBase: 26_000,
    subtype: "external",
  },
  {
    id: SEED_IDS.ACCOUNT_REFUNDS,
    currencyCode: "INR",
    kind: "revenue",
    name: "Refunds & Cashback",
    sequenceBase: 26_500,
    subtype: "external",
  },
  {
    id: SEED_IDS.ACCOUNT_GROCERIES,
    currencyCode: "INR",
    kind: "expense",
    name: "Groceries",
    sequenceBase: 27_000,
    subtype: "external",
  },
  {
    id: SEED_IDS.ACCOUNT_DINING,
    currencyCode: "INR",
    kind: "expense",
    name: "Dining Out",
    sequenceBase: 28_000,
    subtype: "external",
  },
  {
    id: SEED_IDS.ACCOUNT_RENT,
    currencyCode: "INR",
    kind: "expense",
    name: "Rent",
    sequenceBase: 29_000,
    subtype: "external",
  },
  {
    id: SEED_IDS.ACCOUNT_UTILITIES,
    currencyCode: "INR",
    kind: "expense",
    name: "Utilities",
    sequenceBase: 30_000,
    subtype: "external",
  },
  {
    id: SEED_IDS.ACCOUNT_TRANSPORT,
    currencyCode: "INR",
    kind: "expense",
    name: "Transport",
    sequenceBase: 31_000,
    subtype: "external",
  },
  {
    id: SEED_IDS.ACCOUNT_HEALTH,
    currencyCode: "INR",
    kind: "expense",
    name: "Healthcare",
    sequenceBase: 32_000,
    subtype: "external",
  },
  {
    id: SEED_IDS.ACCOUNT_SHOPPING,
    currencyCode: "INR",
    kind: "expense",
    name: "Shopping",
    sequenceBase: 33_000,
    subtype: "external",
  },
  {
    id: SEED_IDS.ACCOUNT_ENTERTAINMENT,
    currencyCode: "INR",
    kind: "expense",
    name: "Entertainment",
    sequenceBase: 34_000,
    subtype: "external",
  },
] as const;

const demoTransactions: readonly SeedTransaction[] = [
  {
    id: SEED_IDS.TX_NOV_SALARY,
    sequenceBase: 53_000,
    type: "income",
    title: "November salary",
    description: "November salary",
    occurredAt: "2025-11-01T09:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_SALARY,
    currencyCode: "INR",
    lines: [{ amountMinor: 200_000_00n, destinationAccountId: SEED_IDS.ACCOUNT_CHECKING }],
  },
  {
    id: SEED_IDS.TX_NOV_RENT,
    sequenceBase: 54_000,
    type: "expense",
    title: "November rent",
    description: "November rent",
    occurredAt: "2025-11-02T10:00:00.000Z",
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
    id: SEED_IDS.TX_DEC_SALARY,
    sequenceBase: 55_000,
    type: "income",
    title: "December salary",
    description: "December salary",
    occurredAt: "2025-12-01T09:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_SALARY,
    currencyCode: "INR",
    lines: [{ amountMinor: 200_000_00n, destinationAccountId: SEED_IDS.ACCOUNT_CHECKING }],
  },
  {
    id: SEED_IDS.TX_DEC_SHOPPING,
    sequenceBase: 56_000,
    type: "expense",
    title: "Year-end shopping",
    description: "Year-end shopping",
    occurredAt: "2025-12-21T16:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 95_000_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_LIVING,
        destinationAccountId: SEED_IDS.ACCOUNT_SHOPPING,
      },
    ],
  },
  {
    id: SEED_IDS.TX_JAN_SALARY,
    sequenceBase: 57_000,
    type: "income",
    title: "January salary",
    description: "January salary",
    occurredAt: "2026-01-01T09:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_SALARY,
    currencyCode: "INR",
    lines: [{ amountMinor: 210_000_00n, destinationAccountId: SEED_IDS.ACCOUNT_CHECKING }],
  },
  {
    id: SEED_IDS.TX_JAN_TRANSFER_SAVINGS,
    sequenceBase: 58_000,
    type: "transfer",
    title: "January savings transfer",
    description: "January savings transfer",
    occurredAt: "2026-01-22T08:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [{ amountMinor: 35_000_00n, destinationAccountId: SEED_IDS.ACCOUNT_SAVINGS }],
  },
  {
    id: SEED_IDS.TX_JAN_MEDICAL_ADVANCE,
    sequenceBase: 58_500,
    type: "expense",
    title: "Family medical advance",
    description: "Family medical advance",
    occurredAt: "2026-01-25T11:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 750_000_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_LIVING,
        destinationAccountId: SEED_IDS.ACCOUNT_HEALTH,
      },
    ],
  },
  {
    id: SEED_IDS.TX_FEB_SALARY,
    sequenceBase: 59_000,
    type: "income",
    title: "February salary",
    description: "February salary",
    occurredAt: "2026-02-01T09:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_SALARY,
    currencyCode: "INR",
    lines: [{ amountMinor: 210_000_00n, destinationAccountId: SEED_IDS.ACCOUNT_CHECKING }],
  },
  {
    id: SEED_IDS.TX_FEB_UTILITIES,
    sequenceBase: 60_000,
    type: "expense",
    title: "February utilities",
    description: "February utilities",
    occurredAt: "2026-02-19T09:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 3_200_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_LIVING,
        destinationAccountId: SEED_IDS.ACCOUNT_UTILITIES,
      },
    ],
  },
  {
    id: SEED_IDS.TX_MAR_SALARY,
    sequenceBase: 61_000,
    type: "income",
    title: "March salary",
    description: "March salary",
    occurredAt: "2026-03-01T09:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_SALARY,
    currencyCode: "INR",
    lines: [{ amountMinor: 220_000_00n, destinationAccountId: SEED_IDS.ACCOUNT_CHECKING }],
  },
  {
    id: SEED_IDS.TX_MAR_RENT,
    sequenceBase: 62_000,
    type: "expense",
    title: "March rent",
    description: "March rent",
    occurredAt: "2026-03-02T10:00:00.000Z",
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
    id: SEED_IDS.TX_MAR_GROCERIES_WEEK1,
    sequenceBase: 63_000,
    type: "expense",
    title: "Groceries week 1",
    description: "Groceries week 1",
    occurredAt: "2026-03-06T18:30:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 4_200_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_FOOD,
        destinationAccountId: SEED_IDS.ACCOUNT_GROCERIES,
      },
    ],
  },
  {
    id: SEED_IDS.TX_MAR_GROCERIES_WEEK3,
    sequenceBase: 64_000,
    type: "expense",
    title: "Groceries week 3",
    description: "Groceries week 3",
    occurredAt: "2026-03-18T19:20:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 5_100_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_FOOD,
        destinationAccountId: SEED_IDS.ACCOUNT_GROCERIES,
      },
    ],
  },
  {
    id: SEED_IDS.TX_MAR_UTILITIES,
    sequenceBase: 65_000,
    type: "expense",
    title: "March electricity",
    description: "March electricity",
    occurredAt: "2026-03-20T08:40:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 2_600_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_LIVING,
        destinationAccountId: SEED_IDS.ACCOUNT_UTILITIES,
      },
    ],
  },
  {
    id: SEED_IDS.TX_MAR_TRANSFER_SAVINGS,
    sequenceBase: 66_000,
    type: "transfer",
    title: "March savings transfer",
    description: "March savings transfer",
    occurredAt: "2026-03-22T08:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [{ amountMinor: 30_000_00n, destinationAccountId: SEED_IDS.ACCOUNT_SAVINGS }],
  },
  {
    id: SEED_IDS.TX_MAR_SPLIT_MARKET,
    sequenceBase: 67_000,
    type: "expense",
    title: "March market run",
    description: "March market run",
    occurredAt: "2026-03-24T18:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 3_800_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_FOOD,
        description: "Food staples",
        destinationAccountId: SEED_IDS.ACCOUNT_GROCERIES,
      },
      {
        amountMinor: 1_200_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_LIVING,
        description: "Home supplies",
        destinationAccountId: SEED_IDS.ACCOUNT_SHOPPING,
      },
    ],
  },
  {
    id: SEED_IDS.TX_MAR_DINING,
    sequenceBase: 68_000,
    type: "expense",
    title: "Dinner with friends",
    description: "Dinner with friends",
    occurredAt: "2026-03-27T20:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CREDIT_CARD,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 1_800_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_FOOD,
        destinationAccountId: SEED_IDS.ACCOUNT_DINING,
      },
    ],
  },
  {
    id: SEED_IDS.TX_MAR_INTEREST,
    sequenceBase: 69_000,
    type: "income",
    title: "March interest",
    description: "March interest",
    occurredAt: "2026-03-31T08:50:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_INTEREST,
    currencyCode: "INR",
    lines: [{ amountMinor: 450_00n, destinationAccountId: SEED_IDS.ACCOUNT_SAVINGS }],
  },
  {
    id: SEED_IDS.TX_APR_SALARY,
    sequenceBase: 70_000,
    type: "income",
    title: "April salary",
    description: "April salary",
    occurredAt: "2026-04-01T09:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_SALARY,
    currencyCode: "INR",
    lines: [{ amountMinor: 220_000_00n, destinationAccountId: SEED_IDS.ACCOUNT_CHECKING }],
  },
  {
    id: SEED_IDS.TX_APR_RENT,
    sequenceBase: 71_000,
    type: "expense",
    title: "April rent",
    description: "April rent",
    occurredAt: "2026-04-02T10:00:00.000Z",
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
    id: SEED_IDS.TX_APR_MEDICAL,
    sequenceBase: 72_000,
    type: "expense",
    title: "Emergency medical expense",
    description: "Emergency medical expense",
    occurredAt: "2026-04-08T12:10:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 92_000_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_LIVING,
        destinationAccountId: SEED_IDS.ACCOUNT_HEALTH,
      },
    ],
  },
  {
    id: SEED_IDS.TX_APR_TRAVEL_BOOKING,
    sequenceBase: 73_000,
    type: "expense",
    title: "Travel booking",
    description: "Family travel booking",
    occurredAt: "2026-04-11T14:30:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 68_000_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_TRANSPORT,
        destinationAccountId: SEED_IDS.ACCOUNT_TRANSPORT,
      },
    ],
  },
  {
    id: SEED_IDS.TX_APR_UTILITIES,
    sequenceBase: 74_000,
    type: "expense",
    title: "April utilities",
    description: "April utilities",
    occurredAt: "2026-04-16T09:05:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 3_400_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_LIVING,
        destinationAccountId: SEED_IDS.ACCOUNT_UTILITIES,
      },
    ],
  },
  {
    id: SEED_IDS.TX_APR_GROCERIES,
    sequenceBase: 75_000,
    type: "expense",
    title: "April groceries",
    description: "April groceries",
    occurredAt: "2026-04-19T18:20:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 7_600_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_FOOD,
        destinationAccountId: SEED_IDS.ACCOUNT_GROCERIES,
      },
    ],
  },
  {
    id: SEED_IDS.TX_APR_CARD_SHOPPING,
    sequenceBase: 76_000,
    type: "expense",
    title: "Appliance shopping",
    description: "Appliance shopping",
    occurredAt: "2026-04-22T15:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CREDIT_CARD,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 17_000_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_LIVING,
        destinationAccountId: SEED_IDS.ACCOUNT_SHOPPING,
      },
    ],
  },
  {
    id: SEED_IDS.TX_APR_CASH_WITHDRAWAL,
    sequenceBase: 77_000,
    type: "transfer",
    title: "ATM withdrawal",
    description: "ATM withdrawal",
    occurredAt: "2026-04-25T11:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [{ amountMinor: 6_000_00n, destinationAccountId: SEED_IDS.ACCOUNT_CASH }],
  },
  {
    id: SEED_IDS.TX_APR_METRO_PASS,
    sequenceBase: 78_000,
    type: "expense",
    title: "Metro pass",
    description: "Metro pass",
    occurredAt: "2026-04-25T18:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CASH,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 1_800_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_TRANSPORT,
        destinationAccountId: SEED_IDS.ACCOUNT_TRANSPORT,
      },
    ],
  },
  {
    id: SEED_IDS.TX_MAY_SALARY,
    sequenceBase: 79_000,
    type: "income",
    title: "May salary",
    description: "May salary",
    occurredAt: "2026-05-01T09:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_SALARY,
    currencyCode: "INR",
    lines: [{ amountMinor: 250_000_00n, destinationAccountId: SEED_IDS.ACCOUNT_CHECKING }],
  },
  {
    id: SEED_IDS.TX_MAY_BONUS,
    sequenceBase: 80_000,
    type: "income",
    title: "Performance bonus",
    description: "Performance bonus",
    occurredAt: "2026-05-03T10:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_REFUNDS,
    currencyCode: "INR",
    lines: [{ amountMinor: 110_000_00n, destinationAccountId: SEED_IDS.ACCOUNT_CHECKING }],
  },
  {
    id: SEED_IDS.TX_MAY_RENT,
    sequenceBase: 81_000,
    type: "expense",
    title: "May rent",
    description: "May rent",
    occurredAt: "2026-05-03T12:00:00.000Z",
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
    id: SEED_IDS.TX_MAY_SPLIT_MARKET,
    sequenceBase: 82_000,
    type: "expense",
    title: "May market run",
    description: "May market run",
    occurredAt: "2026-05-04T18:00:00.000Z",
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
        amountMinor: 1_800_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_LIVING,
        description: "Home supplies",
        destinationAccountId: SEED_IDS.ACCOUNT_SHOPPING,
      },
    ],
  },
  {
    id: SEED_IDS.TX_MAY_TRANSFER_SAVINGS,
    sequenceBase: 83_000,
    type: "transfer",
    title: "May savings transfer",
    description: "May savings transfer",
    occurredAt: "2026-05-06T08:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [{ amountMinor: 55_000_00n, destinationAccountId: SEED_IDS.ACCOUNT_SAVINGS }],
  },
  {
    id: SEED_IDS.TX_MAY_DINING,
    sequenceBase: 84_000,
    type: "expense",
    title: "Team dinner",
    description: "Team dinner",
    occurredAt: "2026-05-07T20:00:00.000Z",
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
    id: SEED_IDS.TX_MAY_INTEREST,
    sequenceBase: 85_000,
    type: "income",
    title: "May interest",
    description: "May interest",
    occurredAt: "2026-05-09T09:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_INTEREST,
    currencyCode: "INR",
    lines: [{ amountMinor: 620_00n, destinationAccountId: SEED_IDS.ACCOUNT_SAVINGS }],
  },
] as const;

const e2eTransactions: readonly SeedTransaction[] = [
  {
    id: SEED_IDS.TX_MAY_PENDING_BILL,
    sequenceBase: 86_000,
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
    id: SEED_IDS.TX_MAY_PHARMACY,
    sequenceBase: 87_000,
    type: "expense",
    title: "Pharmacy",
    description: "Pharmacy",
    occurredAt: "2026-05-12T19:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CASH,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 1_200_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_LIVING,
        destinationAccountId: SEED_IDS.ACCOUNT_HEALTH,
      },
    ],
  },
  {
    id: SEED_IDS.TX_MAY_REFUND,
    sequenceBase: 88_000,
    type: "income",
    title: "Merchant refund",
    description: "Merchant refund",
    occurredAt: "2026-05-13T10:10:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_REFUNDS,
    currencyCode: "INR",
    lines: [{ amountMinor: 9_500_00n, destinationAccountId: SEED_IDS.ACCOUNT_CHECKING }],
  },
  {
    id: SEED_IDS.TX_MAY_COFFEE,
    sequenceBase: 89_000,
    type: "expense",
    title: "Coffee",
    description: "Coffee",
    occurredAt: "2026-05-13T17:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CASH,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 260_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_FOOD,
        destinationAccountId: SEED_IDS.ACCOUNT_DINING,
      },
    ],
  },
  {
    id: SEED_IDS.TX_MAY_RIDE_SHARE,
    sequenceBase: 90_000,
    type: "expense",
    title: "Ride share",
    description: "Ride share",
    occurredAt: "2026-05-13T21:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 620_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_TRANSPORT,
        destinationAccountId: SEED_IDS.ACCOUNT_TRANSPORT,
      },
    ],
  },
  {
    id: SEED_IDS.TX_MAY_ENTERTAINMENT,
    sequenceBase: 91_000,
    type: "expense",
    title: "Weekend movie",
    description: "Weekend movie",
    occurredAt: "2026-05-14T13:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CREDIT_CARD,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 2_200_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_FOOD,
        destinationAccountId: SEED_IDS.ACCOUNT_ENTERTAINMENT,
      },
    ],
  },
  {
    id: SEED_IDS.TX_MAY_SPLIT_HOME_REPAIR,
    sequenceBase: 92_000,
    type: "expense",
    title: "Home repair",
    description: "Home repair",
    occurredAt: "2026-05-14T18:00:00.000Z",
    sourceAccountId: SEED_IDS.ACCOUNT_CHECKING,
    currencyCode: "INR",
    lines: [
      {
        amountMinor: 2_600_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_LIVING,
        destinationAccountId: SEED_IDS.ACCOUNT_UTILITIES,
      },
      {
        amountMinor: 1_400_00n,
        budgetId: SEED_IDS.BUDGET_MONTHLY_LIVING,
        destinationAccountId: SEED_IDS.ACCOUNT_HEALTH,
      },
    ],
  },
] as const;

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

  const foundation = await runSeedStage("sqlite:demo", () => seedDemoSqlite(client, db));
  if (level === "e2e") {
    await runSeedStage("sqlite:e2e", () => seedE2eSqlite(client, foundation.ownerUserId));
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

  const foundation = await runSeedStage("postgres:demo", () => seedDemoPostgres(db));
  if (level === "e2e") {
    await runSeedStage("postgres:e2e", () => seedE2ePostgres(db, foundation.ownerUserId));
  }
}

async function runSeedStage<T>(label: string, task: () => Promise<T>): Promise<T> {
  try {
    return await task();
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

async function seedDemoSqlite(
  client: SqliteClient,
  db: SqliteDatabase,
): Promise<SeedFoundationContext> {
  const foundation = await runSeedStage("sqlite:demo:foundation", () => seedFoundationSqlite(db));
  await runSeedStage("sqlite:demo:accounts", () => seedAccountsSqlite(client));
  await runSeedStage("sqlite:demo:reference-data", () => seedReferenceDataSqlite(db));
  await runSeedStage("sqlite:demo:budget-limits", () => seedBudgetLimitsSqlite(db));
  await runSeedStage("sqlite:demo:transactions", () =>
    seedTransactionsSqlite(client, demoTransactions, foundation.ownerUserId),
  );
  return foundation;
}

async function seedDemoPostgres(db: PostgresDatabase): Promise<SeedFoundationContext> {
  const foundation = await runSeedStage("postgres:demo:foundation", () =>
    seedFoundationPostgres(db),
  );
  await runSeedStage("postgres:demo:accounts", () => seedAccountsPostgres(db));
  await runSeedStage("postgres:demo:reference-data", () => seedReferenceDataPostgres(db));
  await runSeedStage("postgres:demo:budget-limits", () => seedBudgetLimitsPostgres(db));
  await runSeedStage("postgres:demo:transactions", () =>
    seedTransactionsPostgres(db, demoTransactions, foundation.ownerUserId),
  );
  return foundation;
}

async function seedE2eSqlite(client: SqliteClient, ownerUserId: SyncedId): Promise<void> {
  await seedTransactionsSqlite(client, e2eTransactions, ownerUserId);
}

async function seedE2ePostgres(db: PostgresDatabase, ownerUserId: SyncedId): Promise<void> {
  await seedTransactionsPostgres(db, e2eTransactions, ownerUserId);
}

async function seedFoundationSqlite(db: SqliteDatabase): Promise<SeedFoundationContext> {
  const ownerPasswordHash = await createSeedPasswordHash(SEED_CREDENTIALS.owner.password);
  const partnerPasswordHash = await createSeedPasswordHash(SEED_CREDENTIALS.partner.password);
  const ownerUserId = await upsertSeedSqliteUser(
    db,
    SEED_IDS.USER_OWNER,
    SEED_CREDENTIALS.owner.username,
    "Demo Owner",
    ownerPasswordHash,
  );
  const partnerUserId = await upsertSeedSqliteUser(
    db,
    SEED_IDS.USER_PARTNER,
    SEED_CREDENTIALS.partner.username,
    "Demo Partner",
    partnerPasswordHash,
  );

  await db
    .insert(sqliteWorkspaces)
    .values({
      id: SEED_IDS.WORKSPACE_HOUSEHOLD,
      name: "Demo household",
      ownerUserId,
      status: "active",
      createdAt: SEED_NOW,
      updatedAt: SEED_NOW,
    })
    .onConflictDoUpdate({
      target: sqliteWorkspaces.id,
      set: { name: "Demo household", ownerUserId, status: "active", updatedAt: SEED_NOW },
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
        userId: ownerUserId,
        role: "owner",
        createdAt: SEED_NOW,
        updatedAt: SEED_NOW,
      },
      {
        id: SEED_IDS.MEMBER_PARTNER,
        workspaceId: SEED_IDS.WORKSPACE_HOUSEHOLD,
        userId: partnerUserId,
        role: "editor",
        createdAt: SEED_NOW,
        updatedAt: SEED_NOW,
      },
    ])
    .onConflictDoUpdate({
      target: sqliteWorkspaceMembers.id,
      set: { removedAt: null, updatedAt: SEED_NOW },
    });

  await db
    .update(sqliteWorkspaceMembers)
    .set({
      role: "owner",
      removedAt: null,
      updatedAt: SEED_NOW,
      userId: ownerUserId,
    })
    .where(eq(sqliteWorkspaceMembers.id, SEED_IDS.MEMBER_OWNER));

  await db
    .update(sqliteWorkspaceMembers)
    .set({
      role: "editor",
      removedAt: null,
      updatedAt: SEED_NOW,
      userId: partnerUserId,
    })
    .where(eq(sqliteWorkspaceMembers.id, SEED_IDS.MEMBER_PARTNER));

  return { ownerUserId, partnerUserId };
}

async function seedFoundationPostgres(db: PostgresDatabase): Promise<SeedFoundationContext> {
  const now = new Date(SEED_NOW);
  const ownerPasswordHash = await createSeedPasswordHash(SEED_CREDENTIALS.owner.password);
  const partnerPasswordHash = await createSeedPasswordHash(SEED_CREDENTIALS.partner.password);
  const ownerUserId = await upsertSeedPostgresUser(
    db,
    now,
    SEED_IDS.USER_OWNER,
    SEED_CREDENTIALS.owner.username,
    "Demo Owner",
    ownerPasswordHash,
  );
  const partnerUserId = await upsertSeedPostgresUser(
    db,
    now,
    SEED_IDS.USER_PARTNER,
    SEED_CREDENTIALS.partner.username,
    "Demo Partner",
    partnerPasswordHash,
  );

  await db
    .insert(pgWorkspaces)
    .values({
      id: SEED_IDS.WORKSPACE_HOUSEHOLD,
      name: "Demo household",
      ownerUserId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pgWorkspaces.id,
      set: { name: "Demo household", ownerUserId, status: "active", updatedAt: now },
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
        userId: ownerUserId,
        role: "owner",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: SEED_IDS.MEMBER_PARTNER,
        workspaceId: SEED_IDS.WORKSPACE_HOUSEHOLD,
        userId: partnerUserId,
        role: "editor",
        createdAt: now,
        updatedAt: now,
      },
    ])
    .onConflictDoUpdate({
      target: pgWorkspaceMembers.id,
      set: { removedAt: null, updatedAt: now },
    });

  await db
    .update(pgWorkspaceMembers)
    .set({
      role: "owner",
      removedAt: null,
      updatedAt: now,
      userId: ownerUserId,
    })
    .where(eq(pgWorkspaceMembers.id, SEED_IDS.MEMBER_OWNER));

  await db
    .update(pgWorkspaceMembers)
    .set({
      role: "editor",
      removedAt: null,
      updatedAt: now,
      userId: partnerUserId,
    })
    .where(eq(pgWorkspaceMembers.id, SEED_IDS.MEMBER_PARTNER));

  return { ownerUserId, partnerUserId };
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
    const request = toCreateAccountRequest(account);
    await repository.createAccount({
      currencyCode: request.currencyCode,
      kind: request.kind,
      ledgerId: SEED_IDS.LEDGER_HOUSEHOLD,
      name: request.name,
      openingBalanceDate: request.openingBalanceDate ?? null,
      openingBalanceMinor: request.openingBalanceMinor
        ? parseAmountMinor(request.openingBalanceMinor)
        : null,
      subtype: request.subtype,
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
    const request = toCreateAccountRequest(account);
    await repository.createAccount({
      currencyCode: request.currencyCode,
      kind: request.kind,
      ledgerId: SEED_IDS.LEDGER_HOUSEHOLD,
      name: request.name,
      openingBalanceDate: request.openingBalanceDate ?? null,
      openingBalanceMinor: request.openingBalanceMinor
        ? parseAmountMinor(request.openingBalanceMinor)
        : null,
      subtype: request.subtype,
      workspaceId: SEED_IDS.WORKSPACE_HOUSEHOLD,
    });
  }
}

async function seedTransactionsSqlite(
  client: SqliteClient,
  transactions: readonly SeedTransaction[],
  ownerUserId: SyncedId,
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
    const request = toCreateTransactionRequest(transaction);
    await repository.createTransaction(toRepositoryCreateTransactionInput(request, ownerUserId));
  }
}

async function seedTransactionsPostgres(
  db: PostgresDatabase,
  transactions: readonly SeedTransaction[],
  ownerUserId: SyncedId,
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
    const request = toCreateTransactionRequest(transaction);
    await repository.createTransaction(toRepositoryCreateTransactionInput(request, ownerUserId));
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

function toCreateAccountRequest(account: SeedAccount): CreateAccountRequest {
  const request: CreateAccountRequest = {
    currencyCode: account.currencyCode,
    kind: account.kind,
    name: account.name,
    openingBalanceDate:
      typeof account.openingBalanceDate === "string" ? account.openingBalanceDate : null,
    openingBalanceMinor:
      typeof account.openingBalanceMinor === "bigint"
        ? formatAmountMinor(account.openingBalanceMinor)
        : null,
    subtype: account.subtype,
  };
  return CreateAccountRequestSchema.parse(request);
}

function toCreateTransactionRequest(transaction: SeedTransaction): CreateTransactionRequest {
  const requestBase = {
    currencyCode: transaction.currencyCode,
    description: transaction.description,
    occurredAt: transaction.occurredAt,
    source: "manual",
    sourceAccountId: transaction.sourceAccountId,
    title: transaction.title ?? null,
    transactions: transaction.lines.map((line) => ({
      amountMinor: formatAmountMinor(line.amountMinor),
      budgetId: line.budgetId ?? null,
      categoryId: line.categoryId ?? null,
      description: line.description ?? null,
      destinationAccountId: line.destinationAccountId,
      reportingAmountMinor:
        typeof line.reportingAmountMinor === "bigint"
          ? formatAmountMinor(line.reportingAmountMinor)
          : null,
      reportingCurrencyCode: line.reportingCurrencyCode ?? null,
    })),
    type: transaction.type,
  } satisfies Omit<CreateTransactionRequest, "status">;
  const request: CreateTransactionRequest = transaction.status
    ? { ...requestBase, status: transaction.status }
    : requestBase;
  return CreateTransactionRequestSchema.parse(request);
}

function toRepositoryCreateTransactionInput(
  request: CreateTransactionRequest,
  ownerUserId: SyncedId,
): CreateTransactionInput {
  const baseInput = {
    currencyCode: request.currencyCode,
    createdBy: ownerUserId,
    description: request.description,
    ledgerId: SEED_IDS.LEDGER_HOUSEHOLD,
    lines: request.transactions.map((line) => ({
      amountMinor: parseAmountMinor(line.amountMinor),
      budgetId: line.budgetId ?? null,
      categoryId: line.categoryId ?? null,
      description: line.description ?? null,
      destinationAccountId: line.destinationAccountId,
      reportingAmountMinor: line.reportingAmountMinor
        ? parseAmountMinor(line.reportingAmountMinor)
        : null,
      reportingCurrencyCode: line.reportingCurrencyCode ?? null,
    })),
    occurredAt: request.occurredAt,
    source: request.source ?? "manual",
    sourceAccountId: request.sourceAccountId,
    title: request.title ?? null,
    type: request.type,
    workspaceId: SEED_IDS.WORKSPACE_HOUSEHOLD,
  } satisfies Omit<CreateTransactionInput, "status">;
  return request.status ? { ...baseInput, status: request.status } : baseInput;
}

async function upsertSeedSqliteUser(
  db: SqliteDatabase,
  fallbackId: SyncedId,
  username: string,
  displayName: string,
  passwordHash: string,
): Promise<SyncedId> {
  const usernameNormalized = normalizeUsername(username);
  const existingByUsername = await db
    .select({ id: sqliteUsers.id })
    .from(sqliteUsers)
    .where(eq(sqliteUsers.usernameNormalized, usernameNormalized))
    .limit(1);
  const resolvedId = existingByUsername[0]?.id ?? fallbackId;

  await db
    .insert(sqliteUsers)
    .values({
      id: resolvedId,
      username,
      usernameNormalized,
      displayName,
      passwordHash,
      createdAt: SEED_NOW,
      updatedAt: SEED_NOW,
    })
    .onConflictDoUpdate({
      target: sqliteUsers.id,
      set: { displayName, passwordHash, updatedAt: SEED_NOW, username, usernameNormalized },
    });

  return resolvedId;
}

async function upsertSeedPostgresUser(
  db: PostgresDatabase,
  now: Date,
  fallbackId: SyncedId,
  username: string,
  displayName: string,
  passwordHash: string,
): Promise<SyncedId> {
  const usernameNormalized = normalizeUsername(username);
  const existingByUsername = await db
    .select({ id: pgUsers.id })
    .from(pgUsers)
    .where(eq(pgUsers.usernameNormalized, usernameNormalized))
    .limit(1);
  const resolvedId = existingByUsername[0]?.id ?? fallbackId;

  await db
    .insert(pgUsers)
    .values({
      id: resolvedId,
      username,
      usernameNormalized,
      displayName,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pgUsers.id,
      set: { displayName, passwordHash, updatedAt: now, username, usernameNormalized },
    });

  return resolvedId;
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
