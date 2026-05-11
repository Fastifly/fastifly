import { z } from "zod";

import { SyncedIdSchema } from "../ids.js";
import { AmountMinorStringSchema, CurrencyCodeSchema, MoneyAmountSchema } from "../money.js";
import { AccountKindSchema, AccountSubtypeSchema } from "../product-rules/accounts.js";
import { IsoDateSchema, IsoDateTimeSchema, NullableIsoDateTimeSchema } from "../schemas/scalars.js";
import { CursorPaginationQuerySchema, paginatedResponseSchema } from "./pagination.js";

export const AccountResponseSchema = z.strictObject({
  archivedAt: NullableIsoDateTimeSchema,
  createdAt: IsoDateTimeSchema,
  currencyCode: CurrencyCodeSchema,
  id: SyncedIdSchema,
  isActive: z.boolean(),
  kind: AccountKindSchema,
  ledgerId: SyncedIdSchema,
  name: z.string().min(1),
  openingBalanceDate: IsoDateSchema.nullable(),
  openingBalanceMinor: AmountMinorStringSchema.nullable(),
  subtype: AccountSubtypeSchema,
  updatedAt: IsoDateTimeSchema,
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
  openingBalanceDate: IsoDateSchema.nullable().optional(),
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

export const BudgetPeriodSchema = z.enum([
  "weekly",
  "bi_weekly",
  "semi_monthly",
  "monthly",
  "quarterly",
  "yearly",
  "custom",
]);

export const BudgetSummaryResponseSchema = z.strictObject({
  archivedAt: NullableIsoDateTimeSchema,
  createdAt: IsoDateTimeSchema,
  currencyCode: CurrencyCodeSchema,
  id: SyncedIdSchema,
  ledgerId: SyncedIdSchema,
  limit: MoneyAmountSchema,
  name: z.string().min(1),
  period: BudgetPeriodSchema,
  remaining: MoneyAmountSchema,
  rolloverEnabled: z.boolean(),
  spent: MoneyAmountSchema,
  updatedAt: IsoDateTimeSchema,
  workspaceId: SyncedIdSchema,
});

export const ListBudgetsQuerySchema = CursorPaginationQuerySchema.extend({
  asOfDate: z.iso.date().optional(),
});

export const ListBudgetsResponseSchema = paginatedResponseSchema(BudgetSummaryResponseSchema);

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
  occurredAt: IsoDateTimeSchema,
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
  occurredAt: IsoDateTimeSchema,
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

const QueryBooleanSchema = z
  .union([z.boolean(), z.literal("true"), z.literal("false")])
  .transform((value) => value === true || value === "true");

export const ListTransactionsQuerySchema = CursorPaginationQuerySchema.extend({
  accountId: SyncedIdSchema.optional(),
  amountMax: AmountMinorStringSchema.optional(),
  amountMin: AmountMinorStringSchema.optional(),
  budgetId: SyncedIdSchema.optional(),
  categoryId: SyncedIdSchema.optional(),
  currencyCode: CurrencyCodeSchema.optional(),
  fromOccurredAt: IsoDateTimeSchema.optional(),
  importJobId: SyncedIdSchema.optional(),
  reconciled: QueryBooleanSchema.optional(),
  status: z.enum(["pending", "cleared", "reconciled", "void"]).optional(),
  tagId: SyncedIdSchema.optional(),
  toOccurredAt: IsoDateTimeSchema.optional(),
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

export const ImportPreviewRowSchema = z.strictObject({
  amountMinor: AmountMinorStringSchema,
  currencyCode: CurrencyCodeSchema,
  description: z.string().trim().min(1).max(500),
  destinationAccountId: SyncedIdSchema,
  occurredAt: IsoDateTimeSchema,
  rowNumber: z.int().min(1),
  sourceAccountId: SyncedIdSchema,
  type: z.enum(["expense", "income", "transfer"]),
});

export const ImportJobStatusSchema = z.enum(["preview_ready", "committed", "undone", "failed"]);

export const ImportJobResponseSchema = z.strictObject({
  committedAt: NullableIsoDateTimeSchema,
  committedGroupIds: z.array(SyncedIdSchema),
  createdAt: IsoDateTimeSchema,
  createdBy: SyncedIdSchema,
  fileName: z.string().nullable(),
  id: SyncedIdSchema,
  ledgerId: SyncedIdSchema,
  previewRows: z.array(ImportPreviewRowSchema),
  status: ImportJobStatusSchema,
  undoneAt: NullableIsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  workspaceId: SyncedIdSchema,
});

export const CreateImportCsvRequestSchema = z.strictObject({
  csvText: z.string().trim().min(1),
  fileName: z.string().trim().min(1).max(255).nullable().optional(),
});

export const CreateImportCsvResponseSchema = z.strictObject({
  data: z.strictObject({
    importJob: ImportJobResponseSchema,
  }),
});

export const ListImportJobsResponseSchema = z.strictObject({
  data: z.array(ImportJobResponseSchema),
});

export const GetImportJobResponseSchema = z.strictObject({
  data: z.strictObject({
    importJob: ImportJobResponseSchema,
  }),
});

export const CommitImportJobRequestSchema = z.strictObject({
  applyRules: z.boolean().optional(),
});

export const CommitImportJobResponseSchema = z.strictObject({
  data: z.strictObject({
    importJob: ImportJobResponseSchema,
  }),
});

export const UndoImportJobResponseSchema = z.strictObject({
  data: z.strictObject({
    archivedGroupIds: z.array(SyncedIdSchema),
    importJob: ImportJobResponseSchema,
  }),
});

export const RuleConditionSchema = z
  .strictObject({
    amountMaxMinor: AmountMinorStringSchema.optional(),
    amountMinMinor: AmountMinorStringSchema.optional(),
    descriptionContains: z.string().trim().min(1).max(500).optional(),
    type: z.enum(["expense", "income", "transfer"]).optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one rule condition is required.",
  );

export const RuleActionSchema = z.strictObject({
  status: z.enum(["pending", "cleared", "reconciled", "void"]),
  type: z.literal("set_transaction_status"),
});

export const RuleResponseSchema = z.strictObject({
  action: RuleActionSchema,
  archivedAt: NullableIsoDateTimeSchema,
  condition: RuleConditionSchema,
  createdAt: IsoDateTimeSchema,
  createdBy: SyncedIdSchema,
  enabled: z.boolean(),
  id: SyncedIdSchema,
  ledgerId: SyncedIdSchema,
  name: z.string().trim().min(1).max(200),
  updatedAt: IsoDateTimeSchema,
  updatedBy: SyncedIdSchema,
  workspaceId: SyncedIdSchema,
});

export const CreateRuleRequestSchema = z.strictObject({
  action: RuleActionSchema,
  condition: RuleConditionSchema,
  enabled: z.boolean().default(true),
  name: z.string().trim().min(1).max(200),
});

export const UpdateRuleRequestSchema = z.strictObject({
  action: RuleActionSchema,
  condition: RuleConditionSchema,
  enabled: z.boolean(),
  name: z.string().trim().min(1).max(200),
});

export const CreateRuleResponseSchema = z.strictObject({
  data: z.strictObject({
    rule: RuleResponseSchema,
  }),
});

export const ListRulesResponseSchema = z.strictObject({
  data: z.array(RuleResponseSchema),
});

export const GetRuleResponseSchema = z.strictObject({
  data: z.strictObject({
    rule: RuleResponseSchema,
  }),
});

export const RuleTestRequestSchema = z.strictObject({
  limit: z.int().min(1).max(200).optional(),
});

export const RuleTestResponseSchema = z.strictObject({
  data: z.strictObject({
    matchedTransactionGroups: z.array(TransactionGroupResponseSchema),
  }),
});

export const RuleApplyRequestSchema = z.strictObject({
  limit: z.int().min(1).max(500).optional(),
});

export const RuleApplyResponseSchema = z.strictObject({
  data: z.strictObject({
    matchedTransactionGroupIds: z.array(SyncedIdSchema),
    rule: RuleResponseSchema,
    status: RuleActionSchema.shape.status,
    updatedTransactionGroupIds: z.array(SyncedIdSchema),
  }),
});

export const RecurringCadenceSchema = z.enum(["daily", "weekly", "monthly"]);
export const RecurringTemplateStatusSchema = z.enum(["active", "paused", "archived"]);

export const RecurringTemplateLineSchema = z.strictObject({
  amountMinor: AmountMinorStringSchema,
  budgetId: SyncedIdSchema.nullable().default(null),
  categoryId: SyncedIdSchema.nullable().default(null),
  description: z.string().trim().min(1).max(500).nullable().default(null),
  destinationAccountId: SyncedIdSchema,
  reportingAmountMinor: AmountMinorStringSchema.nullable().default(null),
  reportingCurrencyCode: CurrencyCodeSchema.nullable().default(null),
});

export const RecurringTemplatePayloadSchema = z.strictObject({
  currencyCode: CurrencyCodeSchema,
  description: z.string().trim().min(1).max(500),
  lines: z.array(RecurringTemplateLineSchema).min(1),
  sourceAccountId: SyncedIdSchema,
  title: z.string().trim().min(1).max(500).nullable().default(null),
  type: z.enum(["expense", "income", "transfer"]),
});

export const RecurringTemplateResponseSchema = z.strictObject({
  archivedAt: NullableIsoDateTimeSchema,
  cadence: RecurringCadenceSchema,
  createdAt: IsoDateTimeSchema,
  createdBy: SyncedIdSchema,
  id: SyncedIdSchema,
  intervalCount: z.int().min(1),
  lastGeneratedAt: NullableIsoDateTimeSchema,
  ledgerId: SyncedIdSchema,
  nextRunAt: IsoDateTimeSchema,
  payload: RecurringTemplatePayloadSchema,
  status: RecurringTemplateStatusSchema,
  updatedAt: IsoDateTimeSchema,
  updatedBy: SyncedIdSchema,
  workspaceId: SyncedIdSchema,
});

export const CreateRecurringTemplateRequestSchema = z.strictObject({
  cadence: RecurringCadenceSchema,
  intervalCount: z.int().min(1),
  nextRunAt: IsoDateTimeSchema,
  payload: RecurringTemplatePayloadSchema,
  status: RecurringTemplateStatusSchema.default("active"),
});

export const UpdateRecurringTemplateRequestSchema = z.strictObject({
  cadence: RecurringCadenceSchema,
  intervalCount: z.int().min(1),
  nextRunAt: IsoDateTimeSchema,
  payload: RecurringTemplatePayloadSchema,
  status: RecurringTemplateStatusSchema,
});

export const CreateRecurringTemplateResponseSchema = z.strictObject({
  data: z.strictObject({
    recurringTemplate: RecurringTemplateResponseSchema,
  }),
});

export const ListRecurringTemplatesResponseSchema = z.strictObject({
  data: z.array(RecurringTemplateResponseSchema),
});

export const GetRecurringTemplateResponseSchema = z.strictObject({
  data: z.strictObject({
    recurringTemplate: RecurringTemplateResponseSchema,
  }),
});

export const GenerateRecurringTemplateRequestSchema = z.strictObject({
  occurredAt: IsoDateTimeSchema.optional(),
});

export const GenerateRecurringTemplateResponseSchema = z.strictObject({
  data: z.strictObject({
    recurringTemplate: RecurringTemplateResponseSchema,
    transactionGroup: TransactionGroupResponseSchema,
  }),
});

export type BudgetSummaryResponse = z.infer<typeof BudgetSummaryResponseSchema>;
export type CreateAccountRequest = z.infer<typeof CreateAccountRequestSchema>;
export type CreateTransactionRequest = z.infer<typeof CreateTransactionRequestSchema>;
export type AccountWithBalanceResponse = z.infer<typeof AccountWithBalanceResponseSchema>;
export type ListAccountsResponse = z.infer<typeof ListAccountsResponseSchema>;
export type ListBudgetsQuery = z.infer<typeof ListBudgetsQuerySchema>;
export type ListBudgetsResponse = z.infer<typeof ListBudgetsResponseSchema>;
export type ListTransactionsQuery = z.infer<typeof ListTransactionsQuerySchema>;
export type ListTransactionsResponse = z.infer<typeof ListTransactionsResponseSchema>;
export type TransactionGroupResponse = z.infer<typeof TransactionGroupResponseSchema>;
export type ImportJobResponse = z.infer<typeof ImportJobResponseSchema>;
export type RuleResponse = z.infer<typeof RuleResponseSchema>;
export type RecurringTemplateResponse = z.infer<typeof RecurringTemplateResponseSchema>;
