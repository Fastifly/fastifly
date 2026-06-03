import {
  ACTUAL_IMPORT_MAX_ARCHIVE_BYTES,
  type ActualBudgetExport,
  type ActualImportPlan,
  buildActualImportPlan,
  CreateAccountResponseSchema,
  CreateCategoryResponseSchema,
  CreateTransactionResponseSchema,
  IsoDateTimeSchema,
  inferTransactionType,
  type PlannedRef,
  type PlannedTransactionLine,
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

export type ImportTargetCurrency = {
  readonly code: string;
  readonly decimalPlaces: number;
};

export type ResolveImportTargetCurrency = (scope: WorkflowScope) => Promise<ImportTargetCurrency>;

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

export type CreateImportFromActualBudgetInput = {
  readonly actorUserId: SyncedId;
  readonly fileBase64: string;
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
  readonly createImportJobFromActualBudget: (
    input: CreateImportFromActualBudgetInput,
  ) => Promise<ImportJobRecord>;
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
  readonly parseActualBudgetExport?: (zipBytes: Uint8Array) => ActualBudgetExport;
  readonly resolveImportTargetCurrency?: ResolveImportTargetCurrency;
  readonly transactionQueryService: TransactionQueryService;
  readonly workflowRepository: WorkflowRepository;
};

export class FinanceWorkflowServiceError extends Error {
  constructor(
    message: string,
    readonly code:
      | "ACTUAL_IMPORT_UNAVAILABLE"
      | "IMPORT_JOB_NOT_FOUND"
      | "IMPORT_JOB_INVALID_STATE"
      | "INVALID_ACTUAL_IMPORT"
      | "INVALID_IMPORT_CSV"
      | "INVALID_RECURRING_TEMPLATE"
      | "RECURRING_TEMPLATE_NOT_FOUND"
      | "RULE_NOT_FOUND",
    readonly details: Record<string, unknown> = {},
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

      if (importJob.kind === "actual_budget") {
        if (!importJob.plan) {
          throw new FinanceWorkflowServiceError(
            "Import job has no Actual Budget plan to commit.",
            "IMPORT_JOB_INVALID_STATE",
          );
        }
        try {
          await assertActualImportHasNoNameConflicts(options, input.scope, importJob.plan);
        } catch (error) {
          if (error instanceof FinanceWorkflowServiceError) {
            await options.workflowRepository.markImportJobFailed({
              importJobId: input.importJobId,
              ledgerId: input.scope.ledgerId,
              workspaceId: input.scope.workspaceId,
            });
          }
          throw error;
        }
        const actualCommittedGroupIds = await commitActualImportPlan(options, {
          actorUserId: input.actorUserId,
          applyRules: input.applyRules,
          // Derive a stable per-job key when the client omits an Idempotency-Key
          // header, so a retried commit replays prior sub-mutations instead of
          // creating duplicate accounts/categories/transactions.
          idempotencyKey: input.idempotencyKey ?? `actual-import-commit:${input.importJobId}`,
          plan: importJob.plan,
          requestId: input.requestId,
          scope: input.scope,
        });
        const committed = await options.workflowRepository.markImportJobCommitted({
          committedGroupIds: actualCommittedGroupIds,
          importJobId: input.importJobId,
          ledgerId: input.scope.ledgerId,
          workspaceId: input.scope.workspaceId,
        });
        if (!committed) {
          throw new FinanceWorkflowServiceError(
            "Import job was not found.",
            "IMPORT_JOB_NOT_FOUND",
          );
        }
        return { importJob: committed };
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

    async createImportJobFromActualBudget(input) {
      const parse = options.parseActualBudgetExport;
      const resolveCurrency = options.resolveImportTargetCurrency;
      if (!parse || !resolveCurrency) {
        throw new FinanceWorkflowServiceError(
          "Actual Budget import is not available in this runtime.",
          "ACTUAL_IMPORT_UNAVAILABLE",
        );
      }

      const zipBytes = decodeBase64(input.fileBase64);
      let exportData: ActualBudgetExport;
      try {
        exportData = parse(zipBytes);
      } catch (error) {
        throw new FinanceWorkflowServiceError(
          error instanceof Error ? error.message : "The Actual Budget file could not be parsed.",
          "INVALID_ACTUAL_IMPORT",
        );
      }

      const currency = await resolveCurrency(input.scope);
      const plan = buildActualImportPlan({
        export: exportData,
        targetCurrencyCode: currency.code,
        targetCurrencyMinorUnits: currency.decimalPlaces,
      });
      await assertActualImportHasNoNameConflicts(options, input.scope, plan);

      return await options.workflowRepository.createImportJob({
        createdBy: input.actorUserId,
        csvText: "",
        fileName: input.fileName,
        kind: "actual_budget",
        ledgerId: input.scope.ledgerId,
        plan,
        previewRows: [],
        workspaceId: input.scope.workspaceId,
      });
    },

    async createImportJobFromCsv(input) {
      const previewRows = parseImportCsv(input.csvText);
      return await options.workflowRepository.createImportJob({
        createdBy: input.actorUserId,
        csvText: input.csvText,
        fileName: input.fileName,
        kind: "csv",
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

type CommitActualPlanInput = {
  readonly actorUserId: SyncedId;
  readonly applyRules: boolean;
  readonly idempotencyKey: string | null;
  readonly plan: ActualImportPlan | null;
  readonly requestId: string;
  readonly scope: WorkflowScope;
};

async function commitActualImportPlan(
  options: FinanceWorkflowServiceOptions,
  input: CommitActualPlanInput,
): Promise<readonly SyncedId[]> {
  const plan = input.plan;
  if (!plan) {
    throw new FinanceWorkflowServiceError(
      "Import job has no Actual Budget plan to commit.",
      "IMPORT_JOB_INVALID_STATE",
    );
  }
  if (plan.expenseCategories.length > 0 && !options.categoryRepository) {
    throw new FinanceWorkflowServiceError(
      "Category creation is unavailable in this runtime.",
      "INVALID_ACTUAL_IMPORT",
    );
  }

  const sideEffectFlags = {
    applyRules: input.applyRules,
    batchSubmission: true,
    fireWebhooks: false,
    recalculateBalances: true,
    skipNotifications: true,
  } satisfies LedgerMutationEnvelope["sideEffectFlags"];

  const accountIdByActual = new Map<string, SyncedId>();
  const incomeSourceIdByActual = new Map<string, SyncedId>();
  const categoryByActual = new Map<
    string,
    { readonly categoryId: SyncedId; readonly counterpartyAccountId: SyncedId }
  >();
  const committedGroupIds: SyncedId[] = [];

  for (const account of plan.accounts) {
    const hasOpening = account.openingBalanceMinor !== null && account.openingBalanceDate !== null;
    const result = await options.financeMutationService.createAccount({
      account: {
        currencyCode: plan.targetCurrencyCode,
        kind: account.kind,
        name: account.name,
        subtype: account.subtype,
        ...(hasOpening
          ? {
              openingBalanceDate: account.openingBalanceDate,
              openingBalanceMinor: parseAmountMinor(account.openingBalanceMinor as string),
            }
          : {}),
      },
      envelope: makeEnvelope({
        action: "create",
        actorUserId: input.actorUserId,
        idempotencyKey: withSuffix(input.idempotencyKey, `account:${account.actualId}`),
        requestId: `${input.requestId}:account:${account.actualId}`,
        scope: input.scope,
        sideEffectFlags,
        source: "import",
        subject: "Account",
      }),
    });
    const parsed = CreateAccountResponseSchema.parse(result.body);
    accountIdByActual.set(account.actualId, parseSyncedId(parsed.data.account.id));
    if (parsed.data.openingBalanceGroupId) {
      committedGroupIds.push(parseSyncedId(parsed.data.openingBalanceGroupId));
    }
  }

  for (const source of plan.incomeSources) {
    const result = await options.financeMutationService.createAccount({
      account: {
        currencyCode: plan.targetCurrencyCode,
        kind: "revenue",
        name: source.name,
        subtype: "external",
      },
      envelope: makeEnvelope({
        action: "create",
        actorUserId: input.actorUserId,
        idempotencyKey: withSuffix(input.idempotencyKey, `income:${source.actualId}`),
        requestId: `${input.requestId}:income:${source.actualId}`,
        scope: input.scope,
        sideEffectFlags,
        source: "import",
        subject: "Account",
      }),
    });
    const parsed = CreateAccountResponseSchema.parse(result.body);
    incomeSourceIdByActual.set(source.actualId, parseSyncedId(parsed.data.account.id));
  }

  for (const expenseCategory of plan.expenseCategories) {
    const result = await options.financeMutationService.createCategory({
      category: { name: expenseCategory.name },
      envelope: makeEnvelope({
        action: "create",
        actorUserId: input.actorUserId,
        idempotencyKey: withSuffix(input.idempotencyKey, `category:${expenseCategory.actualId}`),
        requestId: `${input.requestId}:category:${expenseCategory.actualId}`,
        scope: input.scope,
        sideEffectFlags,
        source: "import",
        subject: "Category",
      }),
    });
    const parsed = CreateCategoryResponseSchema.parse(result.body);
    const counterpartyAccountId = parsed.data.category.counterpartyAccountId;
    if (!counterpartyAccountId) {
      throw new FinanceWorkflowServiceError(
        "Imported category is missing its internal account.",
        "INVALID_ACTUAL_IMPORT",
      );
    }
    categoryByActual.set(expenseCategory.actualId, {
      categoryId: parseSyncedId(parsed.data.category.id),
      counterpartyAccountId: parseSyncedId(counterpartyAccountId),
    });
  }

  const resolveAccount = (ref: PlannedRef): SyncedId => {
    const id =
      ref.kind === "income_source"
        ? incomeSourceIdByActual.get(ref.actualId)
        : accountIdByActual.get(ref.actualId);
    if (!id) {
      throw new FinanceWorkflowServiceError(
        "Imported transaction referenced an unresolved account.",
        "INVALID_ACTUAL_IMPORT",
      );
    }
    return id;
  };

  const resolveLine = (line: PlannedTransactionLine): CreateTransactionLineInput => {
    if (line.destination.kind === "expense_category") {
      const category = categoryByActual.get(line.destination.actualId);
      if (!category) {
        throw new FinanceWorkflowServiceError(
          "Imported transaction referenced an unresolved category.",
          "INVALID_ACTUAL_IMPORT",
        );
      }
      return {
        amountMinor: parseAmountMinor(line.amountMinor),
        budgetId: null,
        categoryId: category.categoryId,
        description: line.description,
        destinationAccountId: category.counterpartyAccountId,
        reportingAmountMinor: null,
        reportingCurrencyCode: null,
      };
    }
    return {
      amountMinor: parseAmountMinor(line.amountMinor),
      budgetId: null,
      categoryId: null,
      description: line.description,
      destinationAccountId: resolveAccount(line.destination),
      reportingAmountMinor: null,
      reportingCurrencyCode: null,
    };
  };

  for (const [index, transaction] of plan.transactions.entries()) {
    const create = {
      expense: options.financeMutationService.createExpense,
      income: options.financeMutationService.createIncome,
      transfer: options.financeMutationService.createTransfer,
    }[transaction.type].bind(options.financeMutationService);

    const result = await create({
      envelope: makeEnvelope({
        action: "import",
        actorUserId: input.actorUserId,
        idempotencyKey: withSuffix(input.idempotencyKey, `txn:${index}`),
        requestId: `${input.requestId}:txn:${index}`,
        scope: input.scope,
        sideEffectFlags,
        source: "import",
        subject: "Import",
      }),
      transaction: {
        currencyCode: transaction.currencyCode,
        description: transaction.description,
        lines: transaction.lines.map(resolveLine),
        occurredAt: transaction.occurredAt,
        source: "import",
        sourceAccountId: resolveAccount(transaction.source),
        status: transaction.status,
        title: transaction.title,
      },
    });
    committedGroupIds.push(readCreatedTransactionGroupId(result));
  }

  return committedGroupIds;
}

async function assertActualImportHasNoNameConflicts(
  options: FinanceWorkflowServiceOptions,
  scope: WorkflowScope,
  plan: ActualImportPlan,
): Promise<void> {
  const plannedAccountNames = [...plan.accounts, ...plan.incomeSources].map((row) => row.name);
  const plannedCategoryNames = plan.expenseCategories.map((row) => row.name);
  const duplicatePlannedAccounts = findDuplicateNames(plannedAccountNames);
  const duplicatePlannedCategories = findDuplicateNames(plannedCategoryNames);
  if (duplicatePlannedAccounts.length > 0 || duplicatePlannedCategories.length > 0) {
    throw new FinanceWorkflowServiceError(
      formatActualImportNameConflictMessage({
        accountNames: duplicatePlannedAccounts,
        categoryNames: duplicatePlannedCategories,
        source: "within this Actual Budget export",
      }),
      "IMPORT_JOB_INVALID_STATE",
      makeActualImportNameConflictDetails({
        accountNames: duplicatePlannedAccounts,
        categoryNames: duplicatePlannedCategories,
        source: "actual_export",
      }),
    );
  }

  const [existingAccountNames, existingCategoryNames] = await Promise.all([
    listAllAccountNames(options.accountRepository, scope),
    options.categoryRepository
      ? listAllCategoryNames(options.categoryRepository, scope)
      : Promise.resolve(new Set<string>()),
  ]);
  const conflictingAccountNames = intersectNames(plannedAccountNames, existingAccountNames);
  const conflictingCategoryNames = intersectNames(plannedCategoryNames, existingCategoryNames);
  if (conflictingAccountNames.length === 0 && conflictingCategoryNames.length === 0) {
    return;
  }

  throw new FinanceWorkflowServiceError(
    formatActualImportNameConflictMessage({
      accountNames: conflictingAccountNames,
      categoryNames: conflictingCategoryNames,
      source: "already exist in this ledger",
    }),
    "IMPORT_JOB_INVALID_STATE",
    makeActualImportNameConflictDetails({
      accountNames: conflictingAccountNames,
      categoryNames: conflictingCategoryNames,
      source: "ledger",
    }),
  );
}

function makeActualImportNameConflictDetails(input: {
  readonly accountNames: readonly string[];
  readonly categoryNames: readonly string[];
  readonly source: "actual_export" | "ledger";
}): Record<string, unknown> {
  return {
    accountNames: input.accountNames,
    categoryNames: input.categoryNames,
    kind: "actual_import_name_conflict",
    source: input.source,
  };
}

async function listAllAccountNames(
  repository: AccountRepository,
  scope: WorkflowScope,
): Promise<Set<string>> {
  const names = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await repository.listAccounts({
      cursor,
      includeArchived: true,
      ledgerId: scope.ledgerId,
      limit: 100,
      workspaceId: scope.workspaceId,
    });
    for (const account of page.items) {
      names.add(account.name);
    }
    cursor = page.nextCursor;
  } while (cursor);
  return names;
}

async function listAllCategoryNames(
  repository: CategoryRepository,
  scope: WorkflowScope,
): Promise<Set<string>> {
  const names = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await repository.listCategories({
      cursor,
      includeArchived: true,
      ledgerId: scope.ledgerId,
      limit: 100,
      workspaceId: scope.workspaceId,
    });
    for (const category of page.items) {
      if (category.parentId === null) {
        names.add(category.name);
      }
    }
    cursor = page.nextCursor;
  } while (cursor);
  return names;
}

function findDuplicateNames(names: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) {
      duplicates.add(name);
      continue;
    }
    seen.add(name);
  }
  return [...duplicates].sort();
}

function intersectNames(
  names: readonly string[],
  existingNames: ReadonlySet<string>,
): readonly string[] {
  return [...new Set(names.filter((name) => existingNames.has(name)))].sort();
}

function formatActualImportNameConflictMessage(input: {
  readonly accountNames: readonly string[];
  readonly categoryNames: readonly string[];
  readonly source: string;
}): string {
  const parts: string[] = [];
  if (input.accountNames.length > 0) {
    parts.push(`accounts ${formatNameList(input.accountNames)}`);
  }
  if (input.categoryNames.length > 0) {
    parts.push(`categories ${formatNameList(input.categoryNames)}`);
  }
  if (input.source === "within this Actual Budget export") {
    return `This Actual Budget import cannot continue because ${parts.join(" and ")} appear more than once within this Actual Budget export. Rename them in Actual Budget and export again.`;
  }
  return `This Actual Budget import cannot continue because ${parts.join(" and ")} ${input.source}. Rename the conflicting accounts/categories before importing.`;
}

function formatNameList(names: readonly string[]): string {
  const visible = names.slice(0, 5).map((name) => `"${name}"`);
  const remaining = names.length - visible.length;
  return remaining > 0 ? `${visible.join(", ")} and ${remaining} more` : visible.join(", ");
}

function decodeBase64(value: string): Uint8Array {
  const decoded = Buffer.from(value, "base64");
  if (decoded.length === 0) {
    throw new FinanceWorkflowServiceError(
      "Actual Budget export is empty.",
      "INVALID_ACTUAL_IMPORT",
    );
  }
  if (decoded.length > ACTUAL_IMPORT_MAX_ARCHIVE_BYTES) {
    throw new FinanceWorkflowServiceError(
      "Actual Budget export is too large. Upload a ZIP export up to 32 MB.",
      "INVALID_ACTUAL_IMPORT",
    );
  }
  return new Uint8Array(decoded);
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
