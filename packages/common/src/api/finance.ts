import { z } from "zod";

import { SyncedIdSchema } from "../ids.js";
import { AmountMinorStringSchema, CurrencyCodeSchema, MoneyAmountSchema } from "../money.js";
import { AccountKindSchema, AccountSubtypeSchema } from "../product-rules/accounts.js";
import { paginatedResponseSchema } from "./pagination.js";

export const AccountResponseSchema = z.strictObject({
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  currencyCode: CurrencyCodeSchema,
  id: SyncedIdSchema,
  isActive: z.boolean(),
  kind: AccountKindSchema,
  ledgerId: SyncedIdSchema,
  name: z.string().min(1),
  openingBalanceDate: z.string().nullable(),
  openingBalanceMinor: AmountMinorStringSchema.nullable(),
  subtype: AccountSubtypeSchema,
  updatedAt: z.string(),
  workspaceId: SyncedIdSchema,
});

export const AccountWithBalanceResponseSchema = AccountResponseSchema.extend({
  balance: MoneyAmountSchema,
  reportingBalance: MoneyAmountSchema,
});

export const CreateAccountRequestSchema = z.strictObject({
  currencyCode: CurrencyCodeSchema,
  kind: AccountKindSchema,
  name: z.string().trim().min(1).max(200),
  openingBalanceDate: z.string().min(1).nullable().optional(),
  openingBalanceMinor: AmountMinorStringSchema.nullable().optional(),
  subtype: AccountSubtypeSchema,
});

export const CreateAccountResponseSchema = z.strictObject({
  data: z.strictObject({
    account: AccountResponseSchema,
    openingBalanceGroupId: SyncedIdSchema.nullable(),
    openingBalanceJournalId: SyncedIdSchema.nullable(),
  }),
});

export const ArchiveAccountResponseSchema = z.strictObject({
  data: z.strictObject({
    account: AccountResponseSchema,
  }),
});

export const ListAccountsResponseSchema = paginatedResponseSchema(AccountWithBalanceResponseSchema);

export const GetAccountResponseSchema = z.strictObject({
  data: z.strictObject({
    account: AccountWithBalanceResponseSchema,
  }),
});

export const TransactionLineRequestSchema = z.strictObject({
  amountMinor: AmountMinorStringSchema,
  budgetId: SyncedIdSchema.nullable().optional(),
  categoryId: SyncedIdSchema.nullable().optional(),
  description: z.string().trim().min(1).max(500).nullable().optional(),
  destinationAccountId: SyncedIdSchema,
  reportingAmountMinor: AmountMinorStringSchema.nullable().optional(),
  reportingCurrencyCode: CurrencyCodeSchema.nullable().optional(),
});

export const CreateTransactionRequestSchema = z.strictObject({
  currencyCode: CurrencyCodeSchema,
  description: z.string().trim().min(1).max(500),
  occurredAt: z.string().min(1),
  options: z
    .strictObject({
      applyRules: z.boolean().optional(),
      batchSubmission: z.boolean().optional(),
      fireWebhooks: z.boolean().optional(),
      recalculateBalances: z.boolean().optional(),
      skipNotifications: z.boolean().optional(),
    })
    .optional(),
  source: z.enum(["manual", "import", "recurring", "rule", "api"]).optional(),
  sourceAccountId: SyncedIdSchema,
  status: z.enum(["pending", "cleared"]).optional(),
  title: z.string().trim().min(1).max(500).nullable().optional(),
  transactions: z.array(TransactionLineRequestSchema).min(1),
  type: z.enum(["expense", "income", "transfer"]),
});

export const TransactionPostingResponseSchema = z.strictObject({
  accountId: SyncedIdSchema,
  amountMinor: AmountMinorStringSchema,
  currencyCode: CurrencyCodeSchema,
  id: SyncedIdSchema,
  reportingAmountMinor: AmountMinorStringSchema,
  reportingCurrencyCode: CurrencyCodeSchema,
});

export const TransactionJournalResponseSchema = z.strictObject({
  description: z.string().min(1),
  id: SyncedIdSchema,
  occurredAt: z.string().min(1),
  postings: z.array(TransactionPostingResponseSchema).min(2),
  type: z.enum(["expense", "income", "transfer"]),
});

export const TransactionGroupResponseSchema = z.strictObject({
  id: SyncedIdSchema,
  journals: z.array(TransactionJournalResponseSchema).min(1),
  ledgerId: SyncedIdSchema,
  title: z.string().min(1),
  type: z.enum(["expense", "income", "transfer", "split"]),
  workspaceId: SyncedIdSchema,
});

export const CreateTransactionResponseSchema = z.strictObject({
  data: z.strictObject({
    transactionGroup: TransactionGroupResponseSchema,
  }),
});

export const ListTransactionsQuerySchema = z.strictObject({
  accountId: SyncedIdSchema.optional(),
  fromOccurredAt: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(["pending", "cleared", "reconciled", "void"]).optional(),
  toOccurredAt: z.string().min(1).optional(),
  type: z.enum(["expense", "income", "transfer"]).optional(),
});

export const ListTransactionsResponseSchema = paginatedResponseSchema(
  TransactionGroupResponseSchema,
);

export const GetTransactionResponseSchema = z.strictObject({
  data: z.strictObject({
    transactionGroup: TransactionGroupResponseSchema,
  }),
});

export type CreateAccountRequest = z.infer<typeof CreateAccountRequestSchema>;
export type CreateTransactionRequest = z.infer<typeof CreateTransactionRequestSchema>;
