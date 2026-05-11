import {
  type BudgetSummaryResponseSchema,
  type CreateTransactionRequestSchema,
  formatAmountMinor,
  type GetAccountResponseSchema,
  type ImportJobResponseSchema as importJobResponse,
  makeMoneyAmount,
  type PageInfo,
  parseAmountMinor,
  parseSyncedId,
  type RecurringTemplateResponseSchema,
  type RuleResponseSchema,
  type TransactionGroupResponseSchema,
  type TransactionJournalResponseSchema,
  type TransactionPostingResponseSchema,
} from "@fastifly/common";
import type {
  AccountBalanceRecord,
  AccountRecord,
  BudgetSummaryRecord,
  CreateTransactionLineInput,
  ImportJobRecord,
  RecurringTemplateRecord,
  RuleRecord,
  TransactionGroupRecord,
  TransactionJournalRecord,
  TransactionPostingRecord,
} from "@fastifly/db";
import type { z } from "zod/v4";

export const toPageInfo = (page: {
  readonly hasNextPage: boolean;
  readonly nextCursor: string | null;
}): PageInfo => ({
  hasNextPage: page.hasNextPage,
  hasPreviousPage: false,
  nextCursor: page.nextCursor,
  previousCursor: null,
});

export function toTransactionLineInput(
  input: z.infer<typeof CreateTransactionRequestSchema>["transactions"][number],
): CreateTransactionLineInput {
  return {
    amountMinor: parseAmountMinor(input.amountMinor),
    budgetId: input.budgetId ? parseSyncedId(input.budgetId) : null,
    categoryId: input.categoryId ? parseSyncedId(input.categoryId) : null,
    description: input.description ?? null,
    destinationAccountId: parseSyncedId(input.destinationAccountId),
    reportingAmountMinor: input.reportingAmountMinor
      ? parseAmountMinor(input.reportingAmountMinor)
      : null,
    reportingCurrencyCode: input.reportingCurrencyCode ?? null,
  };
}

export function toAccountWithBalanceResponse(
  account: AccountRecord,
  balance: AccountBalanceRecord | null,
): z.infer<typeof GetAccountResponseSchema>["data"]["account"] {
  const effectiveBalance = balance ?? {
    accountId: account.id,
    balanceMinor: 0n,
    currencyCode: account.currencyCode,
    reportingBalanceMinor: 0n,
    reportingCurrencyCode: account.currencyCode,
  };

  return {
    archivedAt: account.archivedAt,
    balance: makeMoneyAmount(effectiveBalance.balanceMinor, effectiveBalance.currencyCode),
    createdAt: account.createdAt,
    currencyCode: account.currencyCode,
    id: account.id,
    isActive: account.isActive,
    kind: account.kind,
    ledgerId: account.ledgerId,
    name: account.name,
    openingBalanceDate: account.openingBalanceDate,
    openingBalanceMinor: account.openingBalanceMinor?.toString() ?? null,
    reportingBalance: makeMoneyAmount(
      effectiveBalance.reportingBalanceMinor,
      effectiveBalance.reportingCurrencyCode,
    ),
    subtype: account.subtype,
    updatedAt: account.updatedAt,
    workspaceId: account.workspaceId,
  };
}

export function toTransactionGroupResponse(
  group: TransactionGroupRecord,
): z.infer<typeof TransactionGroupResponseSchema> {
  return {
    id: group.id,
    journals: group.journals.map(toTransactionJournalResponse),
    ledgerId: group.ledgerId,
    title: group.title,
    type: group.type,
    workspaceId: group.workspaceId,
  };
}

export function toTransactionJournalResponse(
  journal: TransactionJournalRecord,
): z.infer<typeof TransactionJournalResponseSchema> {
  return {
    description: journal.description,
    id: journal.id,
    occurredAt: journal.occurredAt,
    postings: journal.postings.map(toTransactionPostingResponse),
    status: journal.status,
    type: journal.type,
  };
}

export function toTransactionPostingResponse(
  posting: TransactionPostingRecord,
): z.infer<typeof TransactionPostingResponseSchema> {
  return {
    accountId: posting.accountId,
    amountMinor: formatAmountMinor(posting.amountMinor),
    currencyCode: posting.currencyCode,
    id: posting.id,
    reportingAmountMinor: formatAmountMinor(posting.reportingAmountMinor),
    reportingCurrencyCode: posting.reportingCurrencyCode,
  };
}

export function toBudgetSummaryResponse(
  budget: BudgetSummaryRecord,
): z.infer<typeof BudgetSummaryResponseSchema> {
  return {
    archivedAt: budget.archivedAt,
    createdAt: budget.createdAt,
    currencyCode: budget.currencyCode,
    id: budget.id,
    ledgerId: budget.ledgerId,
    limit: makeMoneyAmount(budget.limitMinor, budget.currencyCode),
    name: budget.name,
    period: budget.period,
    remaining: makeMoneyAmount(budget.remainingMinor, budget.currencyCode),
    rolloverEnabled: budget.rolloverEnabled,
    spent: makeMoneyAmount(budget.spentMinor, budget.currencyCode),
    updatedAt: budget.updatedAt,
    workspaceId: budget.workspaceId,
  };
}

export function toRuleConditionInput(
  condition: z.infer<typeof RuleResponseSchema>["condition"],
): RuleRecord["condition"] {
  return {
    ...(condition.amountMaxMinor ? { amountMaxMinor: condition.amountMaxMinor } : {}),
    ...(condition.amountMinMinor ? { amountMinMinor: condition.amountMinMinor } : {}),
    ...(condition.descriptionContains
      ? { descriptionContains: condition.descriptionContains }
      : {}),
    ...(condition.type ? { type: condition.type } : {}),
  };
}

export function toRecurringTemplatePayloadInput(
  payload: z.infer<typeof RecurringTemplateResponseSchema>["payload"],
): RecurringTemplateRecord["payload"] {
  return {
    currencyCode: payload.currencyCode,
    description: payload.description,
    lines: payload.lines.map((line) => ({
      amountMinor: line.amountMinor,
      budgetId: line.budgetId ?? null,
      categoryId: line.categoryId ?? null,
      description: line.description ?? null,
      destinationAccountId: line.destinationAccountId,
      reportingAmountMinor: line.reportingAmountMinor ?? null,
      reportingCurrencyCode: line.reportingCurrencyCode ?? null,
    })),
    sourceAccountId: payload.sourceAccountId,
    title: payload.title ?? null,
    type: payload.type,
  };
}

export function toImportJobResponse(importJob: ImportJobRecord): z.infer<typeof importJobResponse> {
  return {
    committedAt: importJob.committedAt,
    committedGroupIds: [...importJob.committedGroupIds],
    createdAt: importJob.createdAt,
    createdBy: importJob.createdBy,
    fileName: importJob.fileName,
    id: importJob.id,
    ledgerId: importJob.ledgerId,
    previewRows: importJob.previewRows.map((row) => ({
      amountMinor: row.amountMinor,
      currencyCode: row.currencyCode,
      description: row.description,
      destinationAccountId: row.destinationAccountId,
      occurredAt: row.occurredAt,
      rowNumber: row.rowNumber,
      sourceAccountId: row.sourceAccountId,
      type: row.type,
    })),
    status: importJob.status,
    undoneAt: importJob.undoneAt,
    updatedAt: importJob.updatedAt,
    workspaceId: importJob.workspaceId,
  };
}

export function toRuleResponse(rule: RuleRecord): z.infer<typeof RuleResponseSchema> {
  return {
    action: rule.action,
    archivedAt: rule.archivedAt,
    condition: rule.condition,
    createdAt: rule.createdAt,
    createdBy: rule.createdBy,
    enabled: rule.enabled,
    id: rule.id,
    ledgerId: rule.ledgerId,
    name: rule.name,
    updatedAt: rule.updatedAt,
    updatedBy: rule.updatedBy,
    workspaceId: rule.workspaceId,
  };
}

export function toRecurringTemplateResponse(
  recurringTemplate: RecurringTemplateRecord,
): z.infer<typeof RecurringTemplateResponseSchema> {
  return {
    archivedAt: recurringTemplate.archivedAt,
    cadence: recurringTemplate.cadence,
    createdAt: recurringTemplate.createdAt,
    createdBy: recurringTemplate.createdBy,
    id: recurringTemplate.id,
    intervalCount: recurringTemplate.intervalCount,
    lastGeneratedAt: recurringTemplate.lastGeneratedAt,
    ledgerId: recurringTemplate.ledgerId,
    nextRunAt: recurringTemplate.nextRunAt,
    payload: {
      currencyCode: recurringTemplate.payload.currencyCode,
      description: recurringTemplate.payload.description,
      lines: recurringTemplate.payload.lines.map((line) => ({
        amountMinor: line.amountMinor,
        budgetId: line.budgetId,
        categoryId: line.categoryId,
        description: line.description,
        destinationAccountId: line.destinationAccountId,
        reportingAmountMinor: line.reportingAmountMinor,
        reportingCurrencyCode: line.reportingCurrencyCode,
      })),
      sourceAccountId: recurringTemplate.payload.sourceAccountId,
      title: recurringTemplate.payload.title,
      type: recurringTemplate.payload.type,
    },
    status: recurringTemplate.status,
    updatedAt: recurringTemplate.updatedAt,
    updatedBy: recurringTemplate.updatedBy,
    workspaceId: recurringTemplate.workspaceId,
  };
}
