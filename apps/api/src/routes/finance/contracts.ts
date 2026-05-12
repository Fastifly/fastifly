import {
  type FinanceCursorKind,
  makeValidationError,
  parseFinanceCursor,
  type ValidationError,
} from "@fastifly/common";
import type {
  AccountRepository,
  BudgetQueryService,
  CategoryRepository,
  LedgerFinanceMutationService,
  LedgerMutationSideEffectFlags,
  ReportQueryService,
  TransactionQueryService,
} from "@fastifly/db";
import { z } from "zod/v4";
import type { FinanceWorkflowService } from "../../services/finance-workflows.js";

export const LedgerParamsSchema = z.strictObject({
  ledgerId: z.uuidv7(),
  workspaceId: z.uuidv7(),
});

export const AccountParamsSchema = LedgerParamsSchema.extend({
  accountId: z.uuidv7(),
});

export const CategoryParamsSchema = LedgerParamsSchema.extend({
  categoryId: z.uuidv7(),
});

export const TransactionParamsSchema = LedgerParamsSchema.extend({
  transactionGroupId: z.uuidv7(),
});

export const ImportParamsSchema = LedgerParamsSchema.extend({
  importJobId: z.uuidv7(),
});

export const RuleParamsSchema = LedgerParamsSchema.extend({
  ruleId: z.uuidv7(),
});

export const RecurringTemplateParamsSchema = LedgerParamsSchema.extend({
  templateId: z.uuidv7(),
});

export type RegisterFinanceRoutesOptions = {
  readonly accountRepository?: AccountRepository | undefined;
  readonly budgetQueryService?: BudgetQueryService | undefined;
  readonly categoryRepository?: CategoryRepository | undefined;
  readonly financeMutationService?: LedgerFinanceMutationService | undefined;
  readonly reportQueryService?: ReportQueryService | undefined;
  readonly transactionQueryService?: TransactionQueryService | undefined;
  readonly workflowService?: FinanceWorkflowService | undefined;
};

export const makeSideEffectFlags = (
  input: {
    readonly applyRules?: boolean | undefined;
    readonly batchSubmission?: boolean | undefined;
    readonly fireWebhooks?: boolean | undefined;
    readonly recalculateBalances?: boolean | undefined;
    readonly skipNotifications?: boolean | undefined;
  } = {},
): LedgerMutationSideEffectFlags => ({
  applyRules: input.applyRules ?? false,
  batchSubmission: input.batchSubmission ?? false,
  fireWebhooks: input.fireWebhooks ?? false,
  recalculateBalances: input.recalculateBalances ?? true,
  skipNotifications: input.skipNotifications ?? false,
});

export function makeHttpError(statusCode: number, message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

export function validateFinanceCursorKind(
  cursor: string | undefined,
  expectedKind: FinanceCursorKind,
  requestId: string,
): ValidationError | null {
  if (!cursor) {
    return null;
  }
  try {
    parseFinanceCursor(cursor, expectedKind);
    return null;
  } catch {
    return makeValidationError({
      fields: {
        cursor: ["Cursor is invalid for this list endpoint."],
      },
      requestId,
    });
  }
}
