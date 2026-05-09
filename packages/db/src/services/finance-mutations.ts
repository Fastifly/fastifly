import type {
  LedgerMutationEnvelope,
  LedgerMutationRunner,
  LedgerMutationRunResult,
} from "../ledger-mutations.js";
import type {
  AccountRecord,
  AccountRepository,
  CreateAccountInput,
  CreateAccountResult,
} from "../repositories/accounts.js";
import type {
  CreateTransactionInput,
  CreateTransactionLineInput,
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

export type ArchiveAccountMutationPayload = {
  readonly accountId: AccountRecord["id"];
};

export type CreateAccountMutationInput = {
  readonly envelope: LedgerMutationEnvelope;
  readonly account: CreateAccountMutationPayload;
};

export type ArchiveAccountMutationInput = {
  readonly envelope: LedgerMutationEnvelope;
  readonly account: ArchiveAccountMutationPayload;
};

export type CreateTransactionMutationInput = {
  readonly envelope: LedgerMutationEnvelope;
  readonly transaction: CreateTransactionMutationPayload;
};

export type LedgerFinanceMutationService = {
  readonly createAccount: (input: CreateAccountMutationInput) => Promise<LedgerMutationRunResult>;
  readonly archiveAccount: (input: ArchiveAccountMutationInput) => Promise<LedgerMutationRunResult>;
  readonly createTransaction: (
    input: CreateTransactionMutationInput,
  ) => Promise<LedgerMutationRunResult>;
};

export type LedgerFinanceMutationServiceOptions = {
  readonly accountRepository: AccountRepository;
  readonly createAccountRepositoryForTransaction?: (transaction: unknown) => AccountRepository;
  readonly createTransactionRepositoryForTransaction?: (
    transaction: unknown,
  ) => TransactionWriteRepository;
  readonly transactionRepository: TransactionWriteRepository;
  readonly runner: LedgerMutationRunner<unknown>;
};

export function createLedgerFinanceMutationService(
  options: LedgerFinanceMutationServiceOptions,
): LedgerFinanceMutationService {
  return {
    createAccount(input) {
      const requestPayload = serializeCreateAccountPayload(input.account);

      return options.runner.run({
        envelope: input.envelope,
        requestPayload,
        handler: ({ emitEvent, envelope, recordAudit, transaction }) => {
          if (envelope.dryRun) {
            return {
              body: {
                account: requestPayload,
                dryRun: true,
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
              body: serializeCreateAccountResult(created),
              status: 201,
            };
          });
        },
      });
    },

    archiveAccount(input) {
      const requestPayload = serializeArchiveAccountPayload(input.account);

      return options.runner.run({
        envelope: input.envelope,
        requestPayload,
        handler: ({ emitEvent, envelope, recordAudit, transaction }) => {
          if (envelope.dryRun) {
            return {
              body: {
                account: requestPayload,
                dryRun: true,
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
              return {
                body: {
                  account: null,
                  code: "ACCOUNT_NOT_FOUND_OR_ARCHIVED",
                  message: "Account was not found or is already archived.",
                },
                status: 404,
              };
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
                account: serializeAccount(account),
              },
              status: 200,
            };
          });
        },
      });
    },

    createTransaction(input) {
      const requestPayload = serializeCreateTransactionPayload(input.transaction);

      return options.runner.run({
        envelope: input.envelope,
        requestPayload,
        handler: ({ emitEvent, envelope, recordAudit, transaction }) => {
          if (envelope.dryRun) {
            return {
              body: {
                dryRun: true,
                transaction: requestPayload,
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
                transactionGroup: serializeTransactionGroup(group),
              },
              status: 201,
            };
          });
        },
      });
    },
  };
}

type MaybePromise<T> = T | Promise<T>;

function mapMaybePromise<TValue, TResult>(
  value: MaybePromise<TValue>,
  mapper: (value: TValue) => TResult,
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
