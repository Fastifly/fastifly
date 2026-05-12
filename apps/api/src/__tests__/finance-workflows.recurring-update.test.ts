import { parseSyncedId, type SyncedId } from "@fastifly/common";
import type {
  AccountRecord,
  AccountRepository,
  LedgerFinanceMutationService,
  RecurringTemplateRecord,
  TransactionQueryService,
  WorkflowRepository,
} from "@fastifly/db";
import { describe, expect, it, vi } from "vitest";

import {
  createFinanceWorkflowService,
  type FinanceWorkflowServiceError,
} from "../services/finance-workflows.js";

const WORKSPACE_ID = parseSyncedId("00000000-0000-7000-a000-000000001101");
const LEDGER_ID = parseSyncedId("00000000-0000-7000-a000-000000001201");
const USER_ID = parseSyncedId("00000000-0000-7000-a000-000000000001");
const TEMPLATE_ID = parseSyncedId("00000000-0000-7000-a000-000000004001");
const SOURCE_ACCOUNT_ID = parseSyncedId("00000000-0000-7000-a000-000000002001");
const DESTINATION_ACCOUNT_ID = parseSyncedId("00000000-0000-7000-a000-000000002002");

describe("finance workflows recurring updates", () => {
  it("rejects recurring create when start date is not in the future", async () => {
    const template = makeLegacyTemplate();
    const createRecurringTemplate = vi.fn();
    const accountRepository = makeAccountRepository([
      makeAccount(SOURCE_ACCOUNT_ID, "asset", "bank"),
      makeAccount(DESTINATION_ACCOUNT_ID, "asset", "cash"),
    ]);
    const workflowRepository = {
      createRecurringTemplate,
    } as unknown as WorkflowRepository;

    const service = createFinanceWorkflowService({
      accountRepository: accountRepository as AccountRepository,
      financeMutationService: {} as LedgerFinanceMutationService,
      transactionQueryService: {} as TransactionQueryService,
      workflowRepository,
    });

    await expect(
      service.createRecurringTemplate({
        actorUserId: USER_ID,
        cadence: template.cadence,
        intervalCount: template.intervalCount,
        ledgerId: LEDGER_ID,
        nextRunAt: "2000-01-01T00:00:00.000Z",
        payload: template.payload,
        status: "active",
        workspaceId: WORKSPACE_ID,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_RECURRING_TEMPLATE",
    } satisfies Partial<FinanceWorkflowServiceError>);

    expect(createRecurringTemplate).not.toHaveBeenCalled();
    expect(accountRepository.findAccount).not.toHaveBeenCalled();
  });

  it("allows pause/resume status-only updates for legacy invalid templates", async () => {
    const template = makeLegacyTemplate();
    const findRecurringTemplate = vi.fn(async () => template);
    const updateRecurringTemplate = vi.fn(
      async () =>
        ({
          ...template,
          status: "paused",
        }) as RecurringTemplateRecord,
    );
    const accountRepository = makeAccountRepository([
      makeAccount(SOURCE_ACCOUNT_ID, "asset", "bank"),
      makeAccount(DESTINATION_ACCOUNT_ID, "asset", "cash"),
    ]);
    const workflowRepository = {
      findRecurringTemplate,
      updateRecurringTemplate,
    } as unknown as WorkflowRepository;

    const service = createFinanceWorkflowService({
      accountRepository: accountRepository as AccountRepository,
      financeMutationService: {} as LedgerFinanceMutationService,
      transactionQueryService: {} as TransactionQueryService,
      workflowRepository,
    });

    const result = await service.updateRecurringTemplate({
      cadence: template.cadence,
      intervalCount: template.intervalCount,
      ledgerId: LEDGER_ID,
      nextRunAt: template.nextRunAt,
      payload: template.payload,
      recurringTemplateId: TEMPLATE_ID,
      status: "paused",
      updatedBy: USER_ID,
      workspaceId: WORKSPACE_ID,
    });

    expect(result?.status).toBe("paused");
    expect(findRecurringTemplate).toHaveBeenCalledTimes(1);
    expect(updateRecurringTemplate).toHaveBeenCalledTimes(1);
    expect(accountRepository.findAccount).not.toHaveBeenCalled();
  });

  it("still enforces account/type validation when recurring definition changes", async () => {
    const template = makeLegacyTemplate();
    const findRecurringTemplate = vi.fn(async () => template);
    const updateRecurringTemplate = vi.fn();
    const accountRepository = makeAccountRepository([
      makeAccount(SOURCE_ACCOUNT_ID, "asset", "bank"),
      makeAccount(DESTINATION_ACCOUNT_ID, "asset", "cash"),
    ]);
    const workflowRepository = {
      findRecurringTemplate,
      updateRecurringTemplate,
    } as unknown as WorkflowRepository;

    const service = createFinanceWorkflowService({
      accountRepository: accountRepository as AccountRepository,
      financeMutationService: {} as LedgerFinanceMutationService,
      transactionQueryService: {} as TransactionQueryService,
      workflowRepository,
    });

    await expect(
      service.updateRecurringTemplate({
        cadence: template.cadence,
        intervalCount: template.intervalCount,
        ledgerId: LEDGER_ID,
        nextRunAt: "2026-07-01T00:00:00.000Z",
        payload: template.payload,
        recurringTemplateId: TEMPLATE_ID,
        status: "paused",
        updatedBy: USER_ID,
        workspaceId: WORKSPACE_ID,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_RECURRING_TEMPLATE",
    } satisfies Partial<FinanceWorkflowServiceError>);

    expect(accountRepository.findAccount).toHaveBeenCalledTimes(1);
    expect(accountRepository.findAccount).toHaveBeenCalledWith({
      accountId: SOURCE_ACCOUNT_ID,
      ledgerId: LEDGER_ID,
      workspaceId: WORKSPACE_ID,
    });
    expect(updateRecurringTemplate).not.toHaveBeenCalled();
  });
});

function makeLegacyTemplate(): RecurringTemplateRecord {
  return {
    archivedAt: null,
    cadence: "monthly",
    createdAt: "2026-05-12T00:00:00.000Z",
    createdBy: USER_ID,
    id: TEMPLATE_ID,
    intervalCount: 1,
    lastGeneratedAt: null,
    ledgerId: LEDGER_ID,
    nextRunAt: "2026-06-01T00:00:00.000Z",
    payload: {
      currencyCode: "INR",
      description: "Legacy recurring",
      lines: [
        {
          amountMinor: "10000",
          budgetId: null,
          categoryId: null,
          description: "Legacy recurring",
          destinationAccountId: DESTINATION_ACCOUNT_ID,
          reportingAmountMinor: null,
          reportingCurrencyCode: null,
        },
      ],
      sourceAccountId: SOURCE_ACCOUNT_ID,
      title: "Legacy recurring",
      type: "expense",
    },
    status: "active",
    updatedAt: "2026-05-12T00:00:00.000Z",
    updatedBy: USER_ID,
    workspaceId: WORKSPACE_ID,
  };
}

function makeAccountRepository(
  accounts: readonly AccountRecord[],
): Pick<AccountRepository, "findAccount"> {
  const accountById = new Map(accounts.map((account) => [account.id, account] as const));
  return {
    findAccount: vi.fn(async ({ accountId }) => accountById.get(accountId) ?? null),
  };
}

function makeAccount(
  id: SyncedId,
  kind: AccountRecord["kind"],
  subtype: AccountRecord["subtype"],
): AccountRecord {
  return {
    archivedAt: null,
    createdAt: "2026-05-12T00:00:00.000Z",
    currencyCode: "INR",
    id,
    isActive: true,
    kind,
    ledgerId: LEDGER_ID,
    name: id,
    openingBalanceDate: null,
    openingBalanceMinor: null,
    subtype,
    updatedAt: "2026-05-12T00:00:00.000Z",
    workspaceId: WORKSPACE_ID,
  };
}
