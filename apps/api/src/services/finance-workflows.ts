import {
  CreateTransactionResponseSchema,
  IsoDateTimeSchema,
  inferTransactionType,
  parseAmountMinor,
  parseCurrencyCode,
  parseSyncedId,
  type SyncedId,
} from "@fastifly/common";
import type {
  AccountRepository,
  CategoryRepository,
  CreateTransactionLineInput,
  ImportJobRecord,
  ImportPreviewRow,
  LedgerFinanceMutationService,
  LedgerMutationEnvelope,
  RecurringTemplateRecord,
  RuleRecord,
  TransactionGroupRecord,
  TransactionQueryService,
  WorkflowRepository,
} from "@fastifly/db";

type WorkflowScope = {
  readonly ledgerId: SyncedId;
  readonly workspaceId: SyncedId;
};

type WorkflowMutationContext = {
  readonly actorUserId: SyncedId;
  readonly idempotencyKey: string | null;
  readonly requestId: string;
  readonly scope: WorkflowScope;
};

type CommitImportInput = WorkflowMutationContext & {
  readonly applyRules: boolean;
  readonly importJobId: SyncedId;
};

type UndoImportInput = WorkflowMutationContext & {
  readonly importJobId: SyncedId;
};

type ApplyRuleInput = WorkflowMutationContext & {
  readonly limit?: number;
  readonly ruleId: SyncedId;
};

type GenerateRecurringInput = WorkflowMutationContext & {
  readonly occurredAt: string | null;
  readonly recurringTemplateId: SyncedId;
};

export type CreateImportFromCsvInput = {
  readonly actorUserId: SyncedId;
  readonly csvText: string;
  readonly fileName: string | null;
  readonly scope: WorkflowScope;
};

export type RuleMatchInput = {
  readonly limit?: number;
  readonly ruleId: SyncedId;
  readonly scope: WorkflowScope;
};

export type CreateRuleInput = WorkflowScope & {
  readonly action: RuleRecord["action"];
  readonly actorUserId: SyncedId;
  readonly condition: RuleRecord["condition"];
  readonly enabled: boolean;
  readonly name: string;
};

export type UpdateRuleInput = WorkflowScope & {
  readonly action: RuleRecord["action"];
  readonly condition: RuleRecord["condition"];
  readonly enabled: boolean;
  readonly name: string;
  readonly ruleId: SyncedId;
  readonly updatedBy: SyncedId;
};

export type CreateRecurringTemplateInput = WorkflowScope & {
  readonly actorUserId: SyncedId;
  readonly cadence: RecurringTemplateRecord["cadence"];
  readonly intervalCount: number;
  readonly nextRunAt: string;
  readonly payload: RecurringTemplateRecord["payload"];
  readonly status: RecurringTemplateRecord["status"];
};

export type UpdateRecurringTemplateInput = WorkflowScope & {
  readonly cadence: RecurringTemplateRecord["cadence"];
  readonly intervalCount: number;
  readonly nextRunAt: string;
  readonly payload: RecurringTemplateRecord["payload"];
  readonly recurringTemplateId: SyncedId;
  readonly status: RecurringTemplateRecord["status"];
  readonly updatedBy: SyncedId;
};

export type FinanceWorkflowService = {
  readonly archiveRecurringTemplate: (
    input: WorkflowScope & { readonly recurringTemplateId: SyncedId; readonly updatedBy: SyncedId },
  ) => Promise<RecurringTemplateRecord | null>;
  readonly archiveRule: (
    input: WorkflowScope & { readonly ruleId: SyncedId; readonly updatedBy: SyncedId },
  ) => Promise<RuleRecord | null>;
  readonly applyRule: (input: ApplyRuleInput) => Promise<{
    readonly matchedTransactionGroupIds: readonly SyncedId[];
    readonly rule: RuleRecord;
    readonly status: RuleRecord["action"]["status"];
    readonly updatedTransactionGroupIds: readonly SyncedId[];
  }>;
  readonly commitImportJob: (
    input: CommitImportInput,
  ) => Promise<{ readonly importJob: ImportJobRecord }>;
  readonly createImportJobFromCsv: (input: CreateImportFromCsvInput) => Promise<ImportJobRecord>;
  readonly createRecurringTemplate: (
    input: CreateRecurringTemplateInput,
  ) => Promise<RecurringTemplateRecord>;
  readonly createRule: (input: CreateRuleInput) => Promise<RuleRecord>;
  readonly findImportJob: (
    input: WorkflowScope & { readonly importJobId: SyncedId },
  ) => Promise<ImportJobRecord | null>;
  readonly findRecurringTemplate: (
    input: WorkflowScope & { readonly recurringTemplateId: SyncedId },
  ) => Promise<RecurringTemplateRecord | null>;
  readonly findRule: (
    input: WorkflowScope & { readonly ruleId: SyncedId },
  ) => Promise<RuleRecord | null>;
  readonly generateRecurringTemplate: (input: GenerateRecurringInput) => Promise<{
    readonly recurringTemplate: RecurringTemplateRecord;
    readonly transactionGroup: TransactionGroupRecord;
  }>;
  readonly listImportJobs: (input: WorkflowScope) => Promise<readonly ImportJobRecord[]>;
  readonly listRecurringTemplates: (
    input: WorkflowScope,
  ) => Promise<readonly RecurringTemplateRecord[]>;
  readonly listRules: (input: WorkflowScope) => Promise<readonly RuleRecord[]>;
  readonly testRule: (input: RuleMatchInput) => Promise<readonly TransactionGroupRecord[]>;
  readonly undoImportJob: (input: UndoImportInput) => Promise<{
    readonly archivedGroupIds: readonly SyncedId[];
    readonly importJob: ImportJobRecord;
  }>;
  readonly updateRecurringTemplate: (
    input: UpdateRecurringTemplateInput,
  ) => Promise<RecurringTemplateRecord | null>;
  readonly updateRule: (input: UpdateRuleInput) => Promise<RuleRecord | null>;
};

export type FinanceWorkflowServiceOptions = {
  readonly accountRepository: AccountRepository;
  readonly categoryRepository?: CategoryRepository;
  readonly financeMutationService: LedgerFinanceMutationService;
  readonly transactionQueryService: TransactionQueryService;
  readonly workflowRepository: WorkflowRepository;
};

export class FinanceWorkflowServiceError extends Error {
  constructor(
    message: string,
    readonly code:
      | "IMPORT_JOB_NOT_FOUND"
      | "IMPORT_JOB_INVALID_STATE"
      | "INVALID_IMPORT_CSV"
      | "INVALID_RECURRING_TEMPLATE"
      | "RECURRING_TEMPLATE_NOT_FOUND"
      | "RULE_NOT_FOUND",
  ) {
    super(message);
    this.name = "FinanceWorkflowServiceError";
  }
}

export function createFinanceWorkflowService(
  options: FinanceWorkflowServiceOptions,
): FinanceWorkflowService {
  return {
    archiveRecurringTemplate(input) {
      return options.workflowRepository.archiveRecurringTemplate(input);
    },

    archiveRule(input) {
      return options.workflowRepository.archiveRule(input);
    },

    async applyRule(input) {
      const rule = await options.workflowRepository.findRule({
        ledgerId: input.scope.ledgerId,
        ruleId: input.ruleId,
        workspaceId: input.scope.workspaceId,
      });
      if (!rule) {
        throw new FinanceWorkflowServiceError("Rule was not found.", "RULE_NOT_FOUND");
      }

      const matched = await collectRuleMatches(options.transactionQueryService, rule, {
        ...(input.limit !== undefined ? { limit: clampLimit(input.limit, 1, 500, 100) } : {}),
        scope: input.scope,
      });
      const matchedGroupIds = matched.map((group) => group.id);
      if (matchedGroupIds.length === 0) {
        return {
          matchedTransactionGroupIds: [],
          rule,
          status: rule.action.status,
          updatedTransactionGroupIds: [],
        };
      }

      const result = await options.financeMutationService.setTransactionGroupStatus({
        envelope: makeEnvelope({
          action: "update",
          actorUserId: input.actorUserId,
          idempotencyKey: input.idempotencyKey,
          requestId: input.requestId,
          scope: input.scope,
          source: "rule",
          subject: "TransactionGroup",
        }),
        transactionGroups: {
          groupIds: matchedGroupIds,
          status: rule.action.status,
        },
      });
      const updatedGroupIds = readUpdatedGroupIds(result);

      return {
        matchedTransactionGroupIds: matchedGroupIds,
        rule,
        status: rule.action.status,
        updatedTransactionGroupIds: updatedGroupIds,
      };
    },

    async commitImportJob(input) {
      const importJob = await options.workflowRepository.findImportJob({
        importJobId: input.importJobId,
        ledgerId: input.scope.ledgerId,
        workspaceId: input.scope.workspaceId,
      });
      if (!importJob) {
        throw new FinanceWorkflowServiceError("Import job was not found.", "IMPORT_JOB_NOT_FOUND");
      }

      if (importJob.status === "committed") {
        return { importJob };
      }
      if (importJob.status !== "preview_ready") {
        throw new FinanceWorkflowServiceError(
          "Only preview-ready imports can be committed.",
          "IMPORT_JOB_INVALID_STATE",
        );
      }

      const committedGroupIds: SyncedId[] = [];
      for (const row of importJob.previewRows) {
        const create = {
          expense: options.financeMutationService.createExpense,
          income: options.financeMutationService.createIncome,
          transfer: options.financeMutationService.createTransfer,
        }[row.type].bind(options.financeMutationService);

        const result = await create({
          envelope: makeEnvelope({
            action: "import",
            actorUserId: input.actorUserId,
            idempotencyKey: withRowKey(input.idempotencyKey, row.rowNumber),
            requestId: `${input.requestId}:import:${row.rowNumber}`,
            scope: input.scope,
            sideEffectFlags: {
              applyRules: input.applyRules,
              batchSubmission: true,
              fireWebhooks: false,
              recalculateBalances: true,
              skipNotifications: true,
            },
            source: "import",
            subject: "Import",
          }),
          transaction: {
            currencyCode: row.currencyCode,
            description: row.description,
            lines: [toTransactionLine(row)],
            occurredAt: row.occurredAt,
            source: "import",
            sourceAccountId: row.sourceAccountId,
            title: row.description,
          },
        });
        committedGroupIds.push(readCreatedTransactionGroupId(result));
      }

      const updated = await options.workflowRepository.markImportJobCommitted({
        committedGroupIds,
        importJobId: input.importJobId,
        ledgerId: input.scope.ledgerId,
        workspaceId: input.scope.workspaceId,
      });

      if (!updated) {
        throw new FinanceWorkflowServiceError("Import job was not found.", "IMPORT_JOB_NOT_FOUND");
      }

      return { importJob: updated };
    },

    async createImportJobFromCsv(input) {
      const previewRows = parseImportCsv(input.csvText);
      return await options.workflowRepository.createImportJob({
        createdBy: input.actorUserId,
        csvText: input.csvText,
        fileName: input.fileName,
        ledgerId: input.scope.ledgerId,
        previewRows,
        workspaceId: input.scope.workspaceId,
      });
    },

    async createRecurringTemplate(input) {
      validateRecurringNextRunAt(input.nextRunAt);
      await validateRecurringTemplatePayload(options, {
        ledgerId: input.ledgerId,
        payload: input.payload,
        workspaceId: input.workspaceId,
      });

      return options.workflowRepository.createRecurringTemplate({
        cadence: input.cadence,
        createdBy: input.actorUserId,
        intervalCount: input.intervalCount,
        ledgerId: input.ledgerId,
        nextRunAt: input.nextRunAt,
        payload: input.payload,
        status: input.status,
        workspaceId: input.workspaceId,
      });
    },

    createRule(input) {
      return options.workflowRepository.createRule({
        action: input.action,
        condition: input.condition,
        createdBy: input.actorUserId,
        enabled: input.enabled,
        ledgerId: input.ledgerId,
        name: input.name,
        workspaceId: input.workspaceId,
      });
    },

    findImportJob(input) {
      return options.workflowRepository.findImportJob(input);
    },

    findRecurringTemplate(input) {
      return options.workflowRepository.findRecurringTemplate(input);
    },

    findRule(input) {
      return options.workflowRepository.findRule(input);
    },

    async generateRecurringTemplate(input) {
      const template = await options.workflowRepository.findRecurringTemplate({
        ledgerId: input.scope.ledgerId,
        recurringTemplateId: input.recurringTemplateId,
        workspaceId: input.scope.workspaceId,
      });
      if (!template) {
        throw new FinanceWorkflowServiceError(
          "Recurring template was not found.",
          "RECURRING_TEMPLATE_NOT_FOUND",
        );
      }
      if (template.status !== "active") {
        throw new FinanceWorkflowServiceError(
          "Only active recurring templates can generate transactions.",
          "IMPORT_JOB_INVALID_STATE",
        );
      }
      await validateRecurringTemplatePayload(options, {
        ledgerId: input.scope.ledgerId,
        payload: template.payload,
        workspaceId: input.scope.workspaceId,
      });

      const create = {
        expense: options.financeMutationService.createExpense,
        income: options.financeMutationService.createIncome,
        transfer: options.financeMutationService.createTransfer,
      }[template.payload.type].bind(options.financeMutationService);

      const occurredAt = input.occurredAt ?? template.nextRunAt;
      IsoDateTimeSchema.parse(occurredAt);
      const mutationResult = await create({
        envelope: makeEnvelope({
          action: "create",
          actorUserId: input.actorUserId,
          idempotencyKey: withSuffix(input.idempotencyKey, "recurring"),
          requestId: `${input.requestId}:recurring`,
          scope: input.scope,
          sideEffectFlags: {
            applyRules: false,
            batchSubmission: true,
            fireWebhooks: false,
            recalculateBalances: true,
            skipNotifications: false,
          },
          source: "recurring",
          subject: "TransactionGroup",
        }),
        transaction: {
          currencyCode: template.payload.currencyCode,
          description: template.payload.description,
          lines: template.payload.lines.map(toRecurringTransactionLine),
          occurredAt,
          source: "recurring",
          sourceAccountId: template.payload.sourceAccountId,
          title: template.payload.title ?? template.payload.description,
        },
      });
      const transactionGroup = readCreatedTransactionGroup(mutationResult);

      const generatedAt = new Date(occurredAt);
      const nextRunAt = incrementRecurringDate(
        generatedAt,
        template.cadence,
        template.intervalCount,
      );
      const recurringTemplate = await options.workflowRepository.markRecurringTemplateGenerated({
        ledgerId: input.scope.ledgerId,
        nextRunAt: nextRunAt.toISOString(),
        recurringTemplateId: input.recurringTemplateId,
        workspaceId: input.scope.workspaceId,
      });
      if (!recurringTemplate) {
        throw new FinanceWorkflowServiceError(
          "Recurring template was not found.",
          "RECURRING_TEMPLATE_NOT_FOUND",
        );
      }

      return {
        recurringTemplate,
        transactionGroup,
      };
    },

    listImportJobs(input) {
      return options.workflowRepository.listImportJobs(input);
    },

    listRecurringTemplates(input) {
      return options.workflowRepository.listRecurringTemplates(input);
    },

    listRules(input) {
      return options.workflowRepository.listRules(input);
    },

    testRule(input) {
      return collectRuleMatches(options.transactionQueryService, input.ruleId, {
        ...(input.limit !== undefined ? { limit: clampLimit(input.limit, 1, 200, 100) } : {}),
        ruleLookup: (ruleId) =>
          options.workflowRepository.findRule({
            ledgerId: input.scope.ledgerId,
            ruleId,
            workspaceId: input.scope.workspaceId,
          }),
        scope: input.scope,
      });
    },

    async undoImportJob(input) {
      const importJob = await options.workflowRepository.findImportJob({
        importJobId: input.importJobId,
        ledgerId: input.scope.ledgerId,
        workspaceId: input.scope.workspaceId,
      });
      if (!importJob) {
        throw new FinanceWorkflowServiceError("Import job was not found.", "IMPORT_JOB_NOT_FOUND");
      }
      if (importJob.status === "undone") {
        return {
          archivedGroupIds: importJob.committedGroupIds,
          importJob,
        };
      }
      if (importJob.status !== "committed") {
        throw new FinanceWorkflowServiceError(
          "Only committed imports can be undone.",
          "IMPORT_JOB_INVALID_STATE",
        );
      }

      let archivedGroupIds: readonly SyncedId[] = [];
      if (importJob.committedGroupIds.length > 0) {
        const result = await options.financeMutationService.archiveTransactionGroups({
          envelope: makeEnvelope({
            action: "delete",
            actorUserId: input.actorUserId,
            idempotencyKey: withSuffix(input.idempotencyKey, "undo"),
            requestId: `${input.requestId}:undo`,
            scope: input.scope,
            sideEffectFlags: {
              applyRules: false,
              batchSubmission: true,
              fireWebhooks: false,
              recalculateBalances: true,
              skipNotifications: true,
            },
            source: "import",
            subject: "TransactionGroup",
          }),
          transactionGroups: {
            groupIds: importJob.committedGroupIds,
          },
        });
        archivedGroupIds = readArchivedGroupIds(result);
      }

      const updated = await options.workflowRepository.markImportJobUndone({
        importJobId: input.importJobId,
        ledgerId: input.scope.ledgerId,
        workspaceId: input.scope.workspaceId,
      });
      if (!updated) {
        throw new FinanceWorkflowServiceError("Import job was not found.", "IMPORT_JOB_NOT_FOUND");
      }

      return {
        archivedGroupIds,
        importJob: updated,
      };
    },

    async updateRecurringTemplate(input) {
      const existing = await options.workflowRepository.findRecurringTemplate({
        ledgerId: input.ledgerId,
        recurringTemplateId: input.recurringTemplateId,
        workspaceId: input.workspaceId,
      });
      if (!existing) {
        return null;
      }

      if (!isRecurringStatusOnlyUpdate(existing, input)) {
        validateRecurringNextRunAt(input.nextRunAt);
        await validateRecurringTemplatePayload(options, {
          ledgerId: input.ledgerId,
          payload: input.payload,
          workspaceId: input.workspaceId,
        });
      }

      return options.workflowRepository.updateRecurringTemplate(input);
    },

    updateRule(input) {
      return options.workflowRepository.updateRule(input);
    },
  };
}

function isRecurringStatusOnlyUpdate(
  existing: RecurringTemplateRecord,
  input: UpdateRecurringTemplateInput,
): boolean {
  return (
    existing.cadence === input.cadence &&
    existing.intervalCount === input.intervalCount &&
    existing.nextRunAt === input.nextRunAt &&
    JSON.stringify(existing.payload) === JSON.stringify(input.payload)
  );
}

function validateRecurringNextRunAt(nextRunAt: string): void {
  const parsed = Date.parse(nextRunAt);
  if (!Number.isFinite(parsed)) {
    throw new FinanceWorkflowServiceError(
      "Choose a valid future start date.",
      "INVALID_RECURRING_TEMPLATE",
    );
  }

  const nextDayUtc = new Date(parsed);
  nextDayUtc.setUTCHours(0, 0, 0, 0);

  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);

  if (nextDayUtc.getTime() <= todayUtc.getTime()) {
    throw new FinanceWorkflowServiceError(
      "Choose a future start date.",
      "INVALID_RECURRING_TEMPLATE",
    );
  }
}

async function validateRecurringTemplatePayload(
  options: FinanceWorkflowServiceOptions,
  input: {
    readonly ledgerId: SyncedId;
    readonly payload: RecurringTemplateRecord["payload"];
    readonly workspaceId: SyncedId;
  },
): Promise<void> {
  const categoryRepository = options.categoryRepository;
  const sourceAccount = await options.accountRepository.findAccount({
    accountId: input.payload.sourceAccountId,
    ledgerId: input.ledgerId,
    workspaceId: input.workspaceId,
  });

  if (!sourceAccount?.isActive) {
    throw new FinanceWorkflowServiceError(
      "The source account for this subscription is missing or inactive.",
      "INVALID_RECURRING_TEMPLATE",
    );
  }

  if (sourceAccount.currencyCode !== input.payload.currencyCode) {
    throw new FinanceWorkflowServiceError(
      "The subscription currency must match the source account currency.",
      "INVALID_RECURRING_TEMPLATE",
    );
  }

  for (const [lineIndex, line] of input.payload.lines.entries()) {
    if (input.payload.type === "expense") {
      if (!categoryRepository) {
        throw new FinanceWorkflowServiceError(
          "Category validation is unavailable in this runtime.",
          "INVALID_RECURRING_TEMPLATE",
        );
      }
      if (!line.categoryId) {
        throw new FinanceWorkflowServiceError(
          `Choose a category in line ${lineIndex + 1}.`,
          "INVALID_RECURRING_TEMPLATE",
        );
      }

      const category = await categoryRepository.findCategory({
        categoryId: line.categoryId,
        ledgerId: input.ledgerId,
        workspaceId: input.workspaceId,
      });

      if (!category || category.archivedAt) {
        throw new FinanceWorkflowServiceError(
          `The category in line ${lineIndex + 1} is missing or archived.`,
          "INVALID_RECURRING_TEMPLATE",
        );
      }

      if (!category.counterpartyAccountId) {
        throw new FinanceWorkflowServiceError(
          `The category in line ${lineIndex + 1} is not linked to an internal account yet.`,
          "INVALID_RECURRING_TEMPLATE",
        );
      }

      if (line.destinationAccountId !== category.counterpartyAccountId) {
        throw new FinanceWorkflowServiceError(
          `The category in line ${lineIndex + 1} does not match the selected account.`,
          "INVALID_RECURRING_TEMPLATE",
        );
      }
    }

    const destinationAccount = await options.accountRepository.findAccount({
      accountId: line.destinationAccountId,
      ledgerId: input.ledgerId,
      workspaceId: input.workspaceId,
    });

    if (!destinationAccount?.isActive) {
      throw new FinanceWorkflowServiceError(
        `The destination account in line ${lineIndex + 1} is missing or inactive.`,
        "INVALID_RECURRING_TEMPLATE",
      );
    }

    if (destinationAccount.currencyCode !== input.payload.currencyCode) {
      throw new FinanceWorkflowServiceError(
        `The destination account in line ${lineIndex + 1} does not match the subscription currency.`,
        "INVALID_RECURRING_TEMPLATE",
      );
    }

    const inferredType = inferTransactionType(
      {
        kind: sourceAccount.kind,
        ...(sourceAccount.subtype ? { subtype: sourceAccount.subtype } : {}),
      },
      {
        kind: destinationAccount.kind,
        ...(destinationAccount.subtype ? { subtype: destinationAccount.subtype } : {}),
      },
    );

    if (inferredType !== input.payload.type) {
      throw new FinanceWorkflowServiceError(
        "The selected accounts do not match this transaction type.",
        "INVALID_RECURRING_TEMPLATE",
      );
    }
  }
}

function makeEnvelope(input: {
  readonly action: LedgerMutationEnvelope["authorization"]["action"];
  readonly actorUserId: SyncedId;
  readonly idempotencyKey: string | null;
  readonly requestId: string;
  readonly scope: WorkflowScope;
  readonly source: LedgerMutationEnvelope["source"];
  readonly subject: LedgerMutationEnvelope["authorization"]["subject"];
  readonly sideEffectFlags?: LedgerMutationEnvelope["sideEffectFlags"];
}): LedgerMutationEnvelope {
  return {
    actorUserId: input.actorUserId,
    authorization: {
      action: input.action,
      subject: input.subject,
    },
    baseRevision: null,
    deviceId: null,
    dryRun: false,
    idempotencyKey: input.idempotencyKey,
    ledgerId: input.scope.ledgerId,
    requestId: input.requestId,
    sideEffectFlags: input.sideEffectFlags ?? {
      applyRules: false,
      batchSubmission: false,
      fireWebhooks: false,
      recalculateBalances: true,
      skipNotifications: false,
    },
    source: input.source,
    syncOperation: null,
    workspaceId: input.scope.workspaceId,
  };
}

async function collectRuleMatches(
  transactionQueryService: TransactionQueryService,
  ruleOrRuleId: RuleRecord | SyncedId,
  input: {
    readonly limit?: number;
    readonly scope: WorkflowScope;
    readonly ruleLookup?: (ruleId: SyncedId) => Promise<RuleRecord | null>;
  },
): Promise<readonly TransactionGroupRecord[]> {
  const rule =
    typeof ruleOrRuleId === "string" ? await input.ruleLookup?.(ruleOrRuleId) : ruleOrRuleId;
  if (!rule) {
    throw new FinanceWorkflowServiceError("Rule was not found.", "RULE_NOT_FOUND");
  }

  const amountMaxMinor = rule.condition.amountMaxMinor
    ? parseAmountMinor(rule.condition.amountMaxMinor)
    : null;
  const amountMinMinor = rule.condition.amountMinMinor
    ? parseAmountMinor(rule.condition.amountMinMinor)
    : null;
  const descriptionFilter = rule.condition.descriptionContains?.trim().toLowerCase() ?? null;
  const matches: TransactionGroupRecord[] = [];
  let cursor: string | null = null;

  while (true) {
    if (input.limit !== undefined && matches.length >= input.limit) {
      break;
    }

    const pageLimit =
      input.limit === undefined ? 100 : Math.min(100, Math.max(0, input.limit - matches.length));
    if (pageLimit <= 0) {
      break;
    }

    const page = await transactionQueryService.listTransactionGroups({
      accountId: null,
      amountMaxMinor,
      amountMinMinor,
      budgetId: null,
      categoryId: null,
      cursor,
      currencyCode: null,
      fromOccurredAt: null,
      importJobId: null,
      ledgerId: input.scope.ledgerId,
      limit: pageLimit,
      reconciled: null,
      status: null,
      tagId: null,
      toOccurredAt: null,
      type: rule.condition.type ?? null,
      workspaceId: input.scope.workspaceId,
    });
    for (const group of page.items) {
      if (descriptionFilter && !transactionGroupMatchesDescription(group, descriptionFilter)) {
        continue;
      }
      matches.push(group);
      if (input.limit !== undefined && matches.length >= input.limit) {
        break;
      }
    }
    if (!page.hasNextPage || !page.nextCursor) {
      break;
    }
    cursor = page.nextCursor;
  }

  return matches;
}

function transactionGroupMatchesDescription(
  group: TransactionGroupRecord,
  descriptionFilter: string,
): boolean {
  if (group.title.toLowerCase().includes(descriptionFilter)) {
    return true;
  }
  return group.journals.some((journal) =>
    journal.description.toLowerCase().includes(descriptionFilter),
  );
}

function toTransactionLine(row: ImportPreviewRow): CreateTransactionLineInput {
  return {
    amountMinor: parseAmountMinor(row.amountMinor),
    budgetId: null,
    categoryId: null,
    description: row.description,
    destinationAccountId: row.destinationAccountId,
    reportingAmountMinor: null,
    reportingCurrencyCode: null,
  };
}

function toRecurringTransactionLine(
  line: RecurringTemplateRecord["payload"]["lines"][number],
): CreateTransactionLineInput {
  return {
    amountMinor: parseAmountMinor(line.amountMinor),
    budgetId: line.budgetId,
    categoryId: line.categoryId,
    description: line.description ?? null,
    destinationAccountId: line.destinationAccountId,
    reportingAmountMinor: line.reportingAmountMinor
      ? parseAmountMinor(line.reportingAmountMinor)
      : null,
    reportingCurrencyCode: line.reportingCurrencyCode ?? null,
  };
}

function parseImportCsv(csvText: string): readonly ImportPreviewRow[] {
  const trimmed = csvText.trim();
  if (trimmed.length === 0) {
    throw new FinanceWorkflowServiceError("CSV content is required.", "INVALID_IMPORT_CSV");
  }
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    throw new FinanceWorkflowServiceError(
      "CSV must include a header and at least one row.",
      "INVALID_IMPORT_CSV",
    );
  }

  const headerLine = lines[0];
  if (!headerLine) {
    throw new FinanceWorkflowServiceError("CSV must include a header row.", "INVALID_IMPORT_CSV");
  }

  const headers = parseCsvLine(headerLine).map((value) => value.trim());
  const requiredHeaders = [
    "type",
    "sourceAccountId",
    "destinationAccountId",
    "amountMinor",
    "currencyCode",
    "occurredAt",
    "description",
  ] as const;
  for (const header of requiredHeaders) {
    if (!headers.includes(header)) {
      throw new FinanceWorkflowServiceError(
        `CSV is missing required column "${header}".`,
        "INVALID_IMPORT_CSV",
      );
    }
  }

  const previewRows: ImportPreviewRow[] = [];
  for (const [index, line] of lines.slice(1).entries()) {
    const fields = parseCsvLine(line);
    if (fields.length !== headers.length) {
      throw new FinanceWorkflowServiceError(
        `CSV row ${index + 2} has ${fields.length} columns, expected ${headers.length}.`,
        "INVALID_IMPORT_CSV",
      );
    }
    const record = Object.fromEntries(
      headers.map((header, fieldIndex) => [header, fields[fieldIndex]?.trim() ?? ""]),
    ) as Record<string, string>;
    const type = parseImportType(readCsvField(record, "type"), index + 2);
    const sourceAccountId = parseCsvSyncedId(
      readCsvField(record, "sourceAccountId"),
      "sourceAccountId",
      index + 2,
    );
    const destinationAccountId = parseCsvSyncedId(
      readCsvField(record, "destinationAccountId"),
      "destinationAccountId",
      index + 2,
    );
    const amountMinor = parseCsvAmount(readCsvField(record, "amountMinor"), index + 2);
    const currencyCode = parseCsvCurrency(readCsvField(record, "currencyCode"), index + 2);
    const occurredAt = parseCsvOccurredAt(readCsvField(record, "occurredAt"), index + 2);
    const description = parseCsvDescription(readCsvField(record, "description"), index + 2);

    previewRows.push({
      amountMinor,
      currencyCode,
      description,
      destinationAccountId,
      occurredAt,
      rowNumber: index + 1,
      sourceAccountId,
      type,
    });
  }

  return previewRows;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      const next = line[index + 1];
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (inQuotes) {
    throw new FinanceWorkflowServiceError("CSV contains an unclosed quote.", "INVALID_IMPORT_CSV");
  }
  fields.push(current);
  return fields;
}

function readCsvField(record: Record<string, string>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    return "";
  }
  return value;
}

function parseImportType(value: string, lineNumber: number): ImportPreviewRow["type"] {
  if (value === "expense" || value === "income" || value === "transfer") {
    return value;
  }
  throw new FinanceWorkflowServiceError(
    `CSV row ${lineNumber} has invalid type "${value}".`,
    "INVALID_IMPORT_CSV",
  );
}

function parseCsvSyncedId(value: string, column: string, lineNumber: number): SyncedId {
  try {
    return parseSyncedId(value);
  } catch {
    throw new FinanceWorkflowServiceError(
      `CSV row ${lineNumber} has invalid ${column}.`,
      "INVALID_IMPORT_CSV",
    );
  }
}

function parseCsvAmount(value: string, lineNumber: number): string {
  try {
    return parseAmountMinor(value).toString();
  } catch {
    throw new FinanceWorkflowServiceError(
      `CSV row ${lineNumber} has invalid amountMinor.`,
      "INVALID_IMPORT_CSV",
    );
  }
}

function parseCsvCurrency(value: string, lineNumber: number): string {
  try {
    return parseCurrencyCode(value);
  } catch {
    throw new FinanceWorkflowServiceError(
      `CSV row ${lineNumber} has invalid currencyCode.`,
      "INVALID_IMPORT_CSV",
    );
  }
}

function parseCsvOccurredAt(value: string, lineNumber: number): string {
  try {
    return IsoDateTimeSchema.parse(value);
  } catch {
    throw new FinanceWorkflowServiceError(
      `CSV row ${lineNumber} has invalid occurredAt.`,
      "INVALID_IMPORT_CSV",
    );
  }
}

function parseCsvDescription(value: string, lineNumber: number): string {
  const description = value.trim();
  if (description.length === 0) {
    throw new FinanceWorkflowServiceError(
      `CSV row ${lineNumber} is missing description.`,
      "INVALID_IMPORT_CSV",
    );
  }
  return description;
}

function readCreatedTransactionGroupId(result: { readonly body: unknown }): SyncedId {
  const parsed = CreateTransactionResponseSchema.parse(result.body);
  return parseSyncedId(parsed.data.transactionGroup.id);
}

function readCreatedTransactionGroup(result: { readonly body: unknown }): TransactionGroupRecord {
  const parsed = CreateTransactionResponseSchema.parse(result.body);
  const group = parsed.data.transactionGroup;
  return {
    id: parseSyncedId(group.id),
    journals: group.journals.map((journal) => ({
      description: journal.description,
      id: parseSyncedId(journal.id),
      occurredAt: journal.occurredAt,
      postings: journal.postings.map((posting) => ({
        accountId: parseSyncedId(posting.accountId),
        amountMinor: parseAmountMinor(posting.amountMinor),
        currencyCode: posting.currencyCode,
        id: parseSyncedId(posting.id),
        reportingAmountMinor: parseAmountMinor(posting.reportingAmountMinor),
        reportingCurrencyCode: posting.reportingCurrencyCode,
      })),
      status: journal.status,
      type: journal.type,
    })),
    ledgerId: parseSyncedId(group.ledgerId),
    title: group.title,
    type: group.type,
    workspaceId: parseSyncedId(group.workspaceId),
  };
}

function readArchivedGroupIds(result: { readonly body: unknown }): readonly SyncedId[] {
  const body = result.body as {
    readonly data?: { readonly archivedGroupIds?: readonly string[] };
  };
  const values = body.data?.archivedGroupIds;
  if (!Array.isArray(values)) {
    return [];
  }
  return values.map(parseSyncedId);
}

function readUpdatedGroupIds(result: { readonly body: unknown }): readonly SyncedId[] {
  const body = result.body as {
    readonly data?: { readonly updatedGroupIds?: readonly string[] };
  };
  const values = body.data?.updatedGroupIds;
  if (!Array.isArray(values)) {
    return [];
  }
  return values.map(parseSyncedId);
}

function incrementRecurringDate(
  date: Date,
  cadence: RecurringTemplateRecord["cadence"],
  intervalCount: number,
): Date {
  const next = new Date(date);
  if (cadence === "daily") {
    next.setUTCDate(next.getUTCDate() + intervalCount);
    return next;
  }
  if (cadence === "weekly") {
    next.setUTCDate(next.getUTCDate() + intervalCount * 7);
    return next;
  }
  next.setUTCMonth(next.getUTCMonth() + intervalCount);
  return next;
}

function withRowKey(baseKey: string | null, rowNumber: number): string | null {
  return withSuffix(baseKey, `row-${rowNumber}`);
}

function withSuffix(baseKey: string | null, suffix: string): string | null {
  if (!baseKey) {
    return null;
  }
  return `${baseKey}:${suffix}`;
}

function clampLimit(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
