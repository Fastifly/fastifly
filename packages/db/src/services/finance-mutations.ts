import type { AccountKind, AccountSubtype } from "@fastifly/common";
import type {
  LedgerMutationAuthorizationContext,
  LedgerMutationEnvelope,
  LedgerMutationRunner,
  LedgerMutationRunResult,
} from "../ledger-mutations.js";
import { LedgerMutationError } from "../ledger-mutations.js";
import type {
  AccountRecord,
  AccountRepository,
  CreateAccountInput,
  CreateAccountResult,
} from "../repositories/accounts.js";
import type {
  ArchiveCategoryInput,
  CategoryRecord,
  CategoryRepository,
  CreateCategoryInput,
} from "../repositories/categories.js";
import type {
  ArchiveTransactionGroupsInput,
  CreateTransactionInput,
  CreateTransactionLineInput,
  SetTransactionGroupStatusInput,
  TransactionGroupRecord,
  TransactionJournalRecord,
  TransactionPostingRecord,
  TransactionWriteRepository,
} from "../repositories/transactions.js";
import type { JsonObject } from "../schema-types.js";

export type CreateAccountMutationPayload = Omit<
  CreateAccountInput,
  "createdBy" | "ledgerId" | "workspaceId"
>;

export type CreateTransactionMutationPayload = Omit<
  CreateTransactionInput,
  "createdBy" | "ledgerId" | "workspaceId"
>;

export type CreateTypedTransactionMutationPayload = Omit<CreateTransactionMutationPayload, "type">;

export type ArchiveAccountMutationPayload = {
  readonly accountId: AccountRecord["id"];
};

export type CreateCategoryMutationPayload = Omit<
  CreateCategoryInput,
  "counterpartyAccountId" | "ledgerId" | "workspaceId"
>;

export type ArchiveCategoryMutationPayload = {
  readonly categoryId: CategoryRecord["id"];
};

export type ArchiveTransactionGroupsMutationPayload = {
  readonly groupIds: readonly TransactionGroupRecord["id"][];
};

export type SetTransactionGroupStatusMutationPayload = {
  readonly groupIds: readonly TransactionGroupRecord["id"][];
  readonly status: SetTransactionGroupStatusInput["status"];
};

export type CreateAccountMutationInput = {
  readonly envelope: LedgerMutationEnvelope;
  readonly account: CreateAccountMutationPayload;
};

export type ArchiveAccountMutationInput = {
  readonly envelope: LedgerMutationEnvelope;
  readonly account: ArchiveAccountMutationPayload;
};

export type CreateCategoryMutationInput = {
  readonly category: CreateCategoryMutationPayload;
  readonly envelope: LedgerMutationEnvelope;
};

export type ArchiveCategoryMutationInput = {
  readonly category: ArchiveCategoryMutationPayload;
  readonly envelope: LedgerMutationEnvelope;
};

export type CreateTransactionMutationInput = {
  readonly envelope: LedgerMutationEnvelope;
  readonly transaction: CreateTransactionMutationPayload;
};

export type ArchiveTransactionGroupsMutationInput = {
  readonly envelope: LedgerMutationEnvelope;
  readonly transactionGroups: ArchiveTransactionGroupsMutationPayload;
};

export type SetTransactionGroupStatusMutationInput = {
  readonly envelope: LedgerMutationEnvelope;
  readonly transactionGroups: SetTransactionGroupStatusMutationPayload;
};

export type CreateTypedTransactionMutationInput = {
  readonly envelope: LedgerMutationEnvelope;
  readonly transaction: CreateTypedTransactionMutationPayload;
};

export type LedgerFinanceMutationService = {
  readonly createAccount: (input: CreateAccountMutationInput) => Promise<LedgerMutationRunResult>;
  readonly createCategory: (
    input: CreateCategoryMutationInput,
  ) => Promise<LedgerMutationRunResult>;
  readonly archiveAccount: (input: ArchiveAccountMutationInput) => Promise<LedgerMutationRunResult>;
  readonly archiveCategory: (
    input: ArchiveCategoryMutationInput,
  ) => Promise<LedgerMutationRunResult>;
  readonly archiveTransactionGroups: (
    input: ArchiveTransactionGroupsMutationInput,
  ) => Promise<LedgerMutationRunResult>;
  readonly createExpense: (
    input: CreateTypedTransactionMutationInput,
  ) => Promise<LedgerMutationRunResult>;
  readonly createIncome: (
    input: CreateTypedTransactionMutationInput,
  ) => Promise<LedgerMutationRunResult>;
  readonly createTransfer: (
    input: CreateTypedTransactionMutationInput,
  ) => Promise<LedgerMutationRunResult>;
  readonly createTransaction: (
    input: CreateTransactionMutationInput,
  ) => Promise<LedgerMutationRunResult>;
  readonly setTransactionGroupStatus: (
    input: SetTransactionGroupStatusMutationInput,
  ) => Promise<LedgerMutationRunResult>;
};

export type LedgerFinanceMutationServiceOptions = {
  readonly accountRepository: AccountRepository;
  readonly categoryRepository?: CategoryRepository;
  readonly createAccountRepositoryForTransaction?: (transaction: unknown) => AccountRepository;
  readonly createCategoryRepositoryForTransaction?: (transaction: unknown) => CategoryRepository;
  readonly createTransactionRepositoryForTransaction?: (
    transaction: unknown,
  ) => TransactionWriteRepository;
  readonly transactionRepository: TransactionWriteRepository;
  readonly runner: LedgerMutationRunner<unknown>;
};

export class FinanceMutationError extends Error {
  constructor(
    message: string,
    readonly code: "ACCOUNT_NOT_FOUND_OR_ARCHIVED" | "CATEGORY_NOT_FOUND_OR_ARCHIVED",
  ) {
    super(message);
    this.name = "FinanceMutationError";
  }
}

export function createLedgerFinanceMutationService(
  options: LedgerFinanceMutationServiceOptions,
): LedgerFinanceMutationService {
  return {
    createAccount(input) {
      assertExpectedAuthorization(input.envelope, {
        action: "create",
        subject: "Account",
      });
      const requestPayload = serializeCreateAccountPayload(input.account);

      return options.runner.run({
        envelope: input.envelope,
        requestPayload,
        handler: ({ emitEvent, envelope, recordAudit, transaction }) => {
          if (envelope.dryRun) {
            return {
              body: {
                data: {
                  account: requestPayload,
                  dryRun: true,
                },
              },
              status: 200,
            };
          }

          const repository =
            options.createAccountRepositoryForTransaction?.(transaction) ??
            options.accountRepository;
          const result = repository.createAccount({
            ...input.account,
            createdBy: envelope.actorUserId,
            ledgerId: envelope.ledgerId,
            workspaceId: envelope.workspaceId,
          });

          return mapMaybePromise(result, (created) => {
            emitEvent({
              payload: {
                accountId: created.account.id,
                ledgerId: envelope.ledgerId,
                workspaceId: envelope.workspaceId,
              },
              type: "account.created",
            });
            recordAudit({
              action: "account.created",
              entityId: created.account.id,
              entityType: "account",
              metadataJson: {
                kind: created.account.kind,
                openingBalanceJournalId: created.openingBalanceJournalId,
                subtype: created.account.subtype,
              },
            });

            return {
              body: {
                data: serializeCreateAccountResult(created),
              },
              status: 201,
            };
          });
        },
      });
    },

    createCategory(input) {
      assertExpectedAuthorization(input.envelope, {
        action: "create",
        subject: "Category",
      });
      const requestPayload = serializeCreateCategoryPayload(input.category);

      return options.runner.run({
        envelope: input.envelope,
        requestPayload,
        handler: ({ emitEvent, envelope, scope, recordAudit, transaction }) => {
          if (envelope.dryRun) {
            return {
              body: {
                data: {
                  category: requestPayload,
                  dryRun: true,
                },
              },
              status: 200,
            };
          }

          const repository =
            options.createCategoryRepositoryForTransaction?.(transaction) ??
            options.categoryRepository;
          if (!repository) {
            throw new LedgerMutationError(
              "Category repository is not configured for this runtime.",
              "INVALID_MUTATION_RESPONSE",
            );
          }
          const accountRepository =
            options.createAccountRepositoryForTransaction?.(transaction) ??
            options.accountRepository;
          const activeAccountPage = accountRepository.listAccounts({
            cursor: null,
            ledgerId: envelope.ledgerId,
            limit: 100,
            workspaceId: envelope.workspaceId,
          });

          return mapMaybePromise(activeAccountPage, (page) => {
            const assetOrLiabilityAccount = page.items.find(
              (account) => account.kind === "asset" || account.kind === "liability",
            );
            const counterpartyCurrencyCode =
              assetOrLiabilityAccount?.currencyCode ??
              page.items[0]?.currencyCode ??
              scope.ledger.baseCurrencyCode;

            const counterpartyName = buildCategoryCounterpartyAccountName(
              input.category.name,
              envelope.requestId,
            );
            const counterparty = accountRepository.createAccount({
              createdBy: envelope.actorUserId,
              currencyCode: counterpartyCurrencyCode,
              kind: CATEGORY_COUNTERPARTY_ACCOUNT_KIND,
              ledgerId: envelope.ledgerId,
              name: counterpartyName,
              subtype: CATEGORY_COUNTERPARTY_ACCOUNT_SUBTYPE,
              workspaceId: envelope.workspaceId,
            });

            return mapMaybePromise(counterparty, (createdAccount) =>
              mapMaybePromise(
                repository.createCategory({
                  ...input.category,
                  counterpartyAccountId: createdAccount.account.id,
                  ledgerId: envelope.ledgerId,
                  workspaceId: envelope.workspaceId,
                }),
                (category) => {
                  emitEvent({
                    payload: {
                      categoryId: category.id,
                      ledgerId: envelope.ledgerId,
                      workspaceId: envelope.workspaceId,
                    },
                    type: "category.created",
                  });
                  recordAudit({
                    action: "category.created",
                    entityId: category.id,
                    entityType: "category",
                    metadataJson: {
                      counterpartyAccountId: category.counterpartyAccountId,
                      operation: "created",
                      parentId: category.parentId,
                    },
                  });

                  return {
                    body: {
                      data: {
                        category: serializeCategory(category),
                      },
                    },
                    status: 201,
                  };
                },
              ),
            );
          });
        },
      });
    },

    archiveAccount(input) {
      assertExpectedAuthorization(input.envelope, {
        action: "archive",
        subject: "Account",
      });
      const requestPayload = serializeArchiveAccountPayload(input.account);

      return options.runner.run({
        envelope: input.envelope,
        requestPayload,
        handler: ({ emitEvent, envelope, recordAudit, transaction }) => {
          if (envelope.dryRun) {
            return {
              body: {
                data: {
                  account: requestPayload,
                  dryRun: true,
                },
              },
              status: 200,
            };
          }

          const repository =
            options.createAccountRepositoryForTransaction?.(transaction) ??
            options.accountRepository;
          const result = repository.archiveAccount({
            accountId: input.account.accountId,
            ledgerId: envelope.ledgerId,
            workspaceId: envelope.workspaceId,
          });

          return mapMaybePromise(result, (account) => {
            if (!account) {
              throw new FinanceMutationError(
                "Account was not found or is already archived.",
                "ACCOUNT_NOT_FOUND_OR_ARCHIVED",
              );
            }

            emitEvent({
              payload: {
                accountId: account.id,
                ledgerId: envelope.ledgerId,
                workspaceId: envelope.workspaceId,
              },
              type: "account.updated",
            });
            recordAudit({
              action: "account.updated",
              entityId: account.id,
              entityType: "account",
              metadataJson: {
                archivedAt: account.archivedAt,
              },
            });

            return {
              body: {
                data: {
                  account: serializeAccount(account),
                },
              },
              status: 200,
            };
          });
        },
      });
    },

    archiveCategory(input) {
      assertExpectedAuthorization(input.envelope, {
        action: "archive",
        subject: "Category",
      });
      const requestPayload = serializeArchiveCategoryPayload(input.category);

      return options.runner.run({
        envelope: input.envelope,
        requestPayload,
        handler: ({ emitEvent, envelope, recordAudit, transaction }) => {
          if (envelope.dryRun) {
            return {
              body: {
                data: {
                  category: requestPayload,
                  dryRun: true,
                },
              },
              status: 200,
            };
          }

          const repository =
            options.createCategoryRepositoryForTransaction?.(transaction) ??
            options.categoryRepository;
          if (!repository) {
            throw new LedgerMutationError(
              "Category repository is not configured for this runtime.",
              "INVALID_MUTATION_RESPONSE",
            );
          }
          const result = repository.archiveCategory({
            categoryId: input.category.categoryId,
            ledgerId: envelope.ledgerId,
            workspaceId: envelope.workspaceId,
          });
          return mapMaybePromise(result, (category) => {
            if (!category) {
              throw new FinanceMutationError(
                "Category was not found or is already archived.",
                "CATEGORY_NOT_FOUND_OR_ARCHIVED",
              );
            }

            const accountRepository =
              options.createAccountRepositoryForTransaction?.(transaction) ??
              options.accountRepository;

            const finishResponse = () => {
              emitEvent({
                payload: {
                  categoryId: category.id,
                  ledgerId: envelope.ledgerId,
                  workspaceId: envelope.workspaceId,
                },
                type: "category.updated",
              });
              recordAudit({
                action: "category.updated",
                entityId: category.id,
                entityType: "category",
                metadataJson: {
                  archivedAt: category.archivedAt,
                  counterpartyAccountId: category.counterpartyAccountId,
                },
              });

              return {
                body: {
                  data: {
                    category: serializeCategory(category),
                  },
                },
                status: 200,
              };
            };

            if (!category.counterpartyAccountId) {
              return finishResponse();
            }

            return mapMaybePromise(
              accountRepository.archiveAccount({
                accountId: category.counterpartyAccountId,
                ledgerId: envelope.ledgerId,
                workspaceId: envelope.workspaceId,
              }),
              () => finishResponse(),
            );
          });
        },
      });
    },

    archiveTransactionGroups(input) {
      assertExpectedAuthorization(input.envelope, {
        action: "delete",
        subject: "TransactionGroup",
      });
      const requestPayload = serializeArchiveTransactionGroupsPayload(input.transactionGroups);

      return options.runner.run({
        envelope: input.envelope,
        requestPayload,
        handler: ({ envelope, recordAudit, transaction }) => {
          if (envelope.dryRun) {
            return {
              body: {
                data: {
                  archivedGroupIds: requestPayload.groupIds,
                  dryRun: true,
                },
              },
              status: 200,
            };
          }

          const repository =
            options.createTransactionRepositoryForTransaction?.(transaction) ??
            options.transactionRepository;
          const result = repository.archiveTransactionGroups({
            groupIds: input.transactionGroups.groupIds,
            ledgerId: envelope.ledgerId,
            updatedBy: envelope.actorUserId,
            workspaceId: envelope.workspaceId,
          } satisfies ArchiveTransactionGroupsInput);

          return mapMaybePromise(result, (archivedGroupIds) => {
            for (const groupId of archivedGroupIds) {
              recordAudit({
                action: "transaction.created",
                entityId: groupId,
                entityType: "transaction_group",
                metadataJson: { operation: "archived" },
              });
            }
            return {
              body: {
                data: {
                  archivedGroupIds,
                },
              },
              status: 200,
            };
          });
        },
      });
    },

    createExpense(input) {
      return createTypedTransaction(options, input, "expense");
    },

    createIncome(input) {
      return createTypedTransaction(options, input, "income");
    },

    createTransfer(input) {
      return createTypedTransaction(options, input, "transfer");
    },

    createTransaction(input) {
      return createTransactionMutation(options, input);
    },

    setTransactionGroupStatus(input) {
      assertExpectedAuthorization(input.envelope, {
        action: "update",
        subject: "TransactionGroup",
      });
      const requestPayload = serializeSetTransactionGroupStatusPayload(input.transactionGroups);

      return options.runner.run({
        envelope: input.envelope,
        requestPayload,
        handler: ({ envelope, recordAudit, transaction }) => {
          if (envelope.dryRun) {
            return {
              body: {
                data: {
                  dryRun: true,
                  status: input.transactionGroups.status,
                  updatedGroupIds: requestPayload.groupIds,
                },
              },
              status: 200,
            };
          }

          const repository =
            options.createTransactionRepositoryForTransaction?.(transaction) ??
            options.transactionRepository;
          const result = repository.setTransactionGroupStatus({
            groupIds: input.transactionGroups.groupIds,
            ledgerId: envelope.ledgerId,
            status: input.transactionGroups.status,
            updatedBy: envelope.actorUserId,
            workspaceId: envelope.workspaceId,
          } satisfies SetTransactionGroupStatusInput);

          return mapMaybePromise(result, (updatedGroupIds) => {
            for (const groupId of updatedGroupIds) {
              recordAudit({
                action: "transaction.created",
                entityId: groupId,
                entityType: "transaction_group",
                metadataJson: {
                  operation: "status_updated",
                  status: input.transactionGroups.status,
                },
              });
            }

            return {
              body: {
                data: {
                  status: input.transactionGroups.status,
                  updatedGroupIds,
                },
              },
              status: 200,
            };
          });
        },
      });
    },
  };
}

function createTypedTransaction(
  options: LedgerFinanceMutationServiceOptions,
  input: CreateTypedTransactionMutationInput,
  type: CreateTransactionMutationPayload["type"],
): Promise<LedgerMutationRunResult> {
  return createTransactionMutation(options, {
    envelope: input.envelope,
    transaction: {
      ...input.transaction,
      type,
    },
  });
}

function createTransactionMutation(
  options: LedgerFinanceMutationServiceOptions,
  input: CreateTransactionMutationInput,
): Promise<LedgerMutationRunResult> {
  assertExpectedAuthorizationOneOf(input.envelope, [
    { action: "create", subject: "TransactionGroup" },
    { action: "import", subject: "Import" },
  ]);
  const requestPayload = serializeCreateTransactionPayload(input.transaction);

  return options.runner.run({
    envelope: input.envelope,
    requestPayload,
    handler: ({ emitEvent, envelope, recordAudit, transaction }) => {
      if (envelope.dryRun) {
        return {
          body: {
            data: {
              dryRun: true,
              transaction: requestPayload,
            },
          },
          status: 200,
        };
      }

      const repository =
        options.createTransactionRepositoryForTransaction?.(transaction) ??
        options.transactionRepository;
      const result = repository.createTransaction({
        ...input.transaction,
        createdBy: envelope.actorUserId,
        ledgerId: envelope.ledgerId,
        workspaceId: envelope.workspaceId,
      });

      return mapMaybePromise(result, (group) => {
        emitEvent({
          payload: {
            ledgerId: envelope.ledgerId,
            transactionGroupId: group.id,
            type: group.type,
            workspaceId: envelope.workspaceId,
          },
          type: "transaction.created",
        });
        recordAudit({
          action: "transaction.created",
          entityId: group.id,
          entityType: "transaction_group",
          metadataJson: {
            journalCount: group.journals.length,
            type: group.type,
          },
        });

        return {
          body: {
            data: {
              transactionGroup: serializeTransactionGroup(group),
            },
          },
          status: 201,
        };
      });
    },
  });
}

type MaybePromise<T> = T | Promise<T>;

function assertExpectedAuthorization(
  envelope: LedgerMutationEnvelope,
  expected: LedgerMutationAuthorizationContext,
): void {
  if (
    envelope.authorization.action !== expected.action ||
    envelope.authorization.subject !== expected.subject
  ) {
    throw new LedgerMutationError(
      "Ledger mutation authorization context does not match the requested operation.",
      "MUTATION_FORBIDDEN",
    );
  }
}

function assertExpectedAuthorizationOneOf(
  envelope: LedgerMutationEnvelope,
  expected: readonly LedgerMutationAuthorizationContext[],
): void {
  for (const candidate of expected) {
    if (
      envelope.authorization.action === candidate.action &&
      envelope.authorization.subject === candidate.subject
    ) {
      return;
    }
  }

  throw new LedgerMutationError(
    "Ledger mutation authorization context does not match the requested operation.",
    "MUTATION_FORBIDDEN",
  );
}

function mapMaybePromise<TValue, TResult>(
  value: MaybePromise<TValue>,
  mapper: (value: TValue) => MaybePromise<TResult>,
): MaybePromise<TResult> {
  return isPromiseLike(value) ? value.then(mapper) : mapper(value);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    "then" in value &&
    typeof (value as { readonly then?: unknown }).then === "function"
  );
}

function serializeCreateAccountPayload(input: CreateAccountMutationPayload): JsonObject {
  return {
    currencyCode: input.currencyCode,
    kind: input.kind,
    name: input.name,
    openingBalanceDate: input.openingBalanceDate ?? null,
    openingBalanceMinor: input.openingBalanceMinor?.toString() ?? null,
    subtype: input.subtype,
  };
}

function serializeCreateCategoryPayload(input: CreateCategoryMutationPayload): JsonObject {
  return {
    color: input.color ?? null,
    icon: input.icon ?? null,
    name: input.name,
    parentId: input.parentId ?? null,
  };
}

function serializeCreateTransactionPayload(input: CreateTransactionMutationPayload): JsonObject {
  return {
    currencyCode: input.currencyCode,
    description: input.description,
    lines: input.lines.map(serializeTransactionLinePayload),
    occurredAt: input.occurredAt,
    source: input.source ?? null,
    sourceAccountId: input.sourceAccountId,
    status: input.status ?? null,
    title: input.title ?? null,
    type: input.type,
  };
}

function serializeArchiveAccountPayload(input: ArchiveAccountMutationPayload): JsonObject {
  return {
    accountId: input.accountId,
  };
}

function serializeArchiveCategoryPayload(input: ArchiveCategoryMutationPayload): JsonObject {
  return {
    categoryId: input.categoryId,
  };
}

function serializeArchiveTransactionGroupsPayload(
  input: ArchiveTransactionGroupsMutationPayload,
): JsonObject {
  return {
    groupIds: [...input.groupIds],
  };
}

function serializeSetTransactionGroupStatusPayload(
  input: SetTransactionGroupStatusMutationPayload,
): JsonObject {
  return {
    groupIds: [...input.groupIds],
    status: input.status,
  };
}

function serializeTransactionLinePayload(input: CreateTransactionLineInput): JsonObject {
  return {
    amountMinor: input.amountMinor.toString(),
    budgetId: input.budgetId ?? null,
    categoryId: input.categoryId ?? null,
    description: input.description ?? null,
    destinationAccountId: input.destinationAccountId,
    reportingAmountMinor: input.reportingAmountMinor?.toString() ?? null,
    reportingCurrencyCode: input.reportingCurrencyCode ?? null,
  };
}

function serializeCreateAccountResult(result: CreateAccountResult): JsonObject {
  return {
    account: serializeAccount(result.account),
    openingBalanceGroupId: result.openingBalanceGroupId,
    openingBalanceJournalId: result.openingBalanceJournalId,
  };
}

function serializeAccount(account: AccountRecord): JsonObject {
  return {
    archivedAt: account.archivedAt,
    createdAt: account.createdAt,
    currencyCode: account.currencyCode,
    id: account.id,
    isActive: account.isActive,
    kind: account.kind,
    ledgerId: account.ledgerId,
    name: account.name,
    openingBalanceDate: account.openingBalanceDate,
    openingBalanceMinor: account.openingBalanceMinor?.toString() ?? null,
    subtype: account.subtype,
    updatedAt: account.updatedAt,
    workspaceId: account.workspaceId,
  };
}

function serializeCategory(category: CategoryRecord): JsonObject {
  return {
    archivedAt: category.archivedAt,
    color: category.color,
    counterpartyAccountId: category.counterpartyAccountId,
    createdAt: category.createdAt,
    icon: category.icon,
    id: category.id,
    ledgerId: category.ledgerId,
    name: category.name,
    parentId: category.parentId,
    updatedAt: category.updatedAt,
    workspaceId: category.workspaceId,
  };
}

const CATEGORY_COUNTERPARTY_ACCOUNT_KIND: AccountKind = "expense";
const CATEGORY_COUNTERPARTY_ACCOUNT_SUBTYPE: AccountSubtype = "external";

function buildCategoryCounterpartyAccountName(name: string, requestId: string): string {
  const normalizedName = name.trim().replaceAll(/\s+/g, " ");
  const base = normalizedName.length > 0 ? normalizedName : "Category";
  const digest = requestId.slice(-12);
  const fullName = `Category Counterparty ${base} ${digest}`;

  return fullName.length <= 200 ? fullName : fullName.slice(0, 200);
}

function serializeTransactionGroup(group: TransactionGroupRecord): JsonObject {
  return {
    id: group.id,
    journals: group.journals.map(serializeTransactionJournal),
    ledgerId: group.ledgerId,
    title: group.title,
    type: group.type,
    workspaceId: group.workspaceId,
  };
}

function serializeTransactionJournal(journal: TransactionJournalRecord): JsonObject {
  return {
    description: journal.description,
    id: journal.id,
    occurredAt: journal.occurredAt,
    postings: journal.postings.map(serializeTransactionPosting),
    status: journal.status,
    type: journal.type,
  };
}

function serializeTransactionPosting(posting: TransactionPostingRecord): JsonObject {
  return {
    accountId: posting.accountId,
    amountMinor: posting.amountMinor.toString(),
    currencyCode: posting.currencyCode,
    id: posting.id,
    reportingAmountMinor: posting.reportingAmountMinor.toString(),
    reportingCurrencyCode: posting.reportingCurrencyCode,
  };
}
