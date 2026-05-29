import type { AccountKind, AccountSubtype, AccountWithBalanceResponse } from "@fastifly/common";
import { describe, expect, it } from "vitest";
import { deriveAccountsOverview, isActiveAccount } from "../finance/accounts-overview.js";

describe("deriveAccountsOverview", () => {
  it("keeps only user-held accounts in the overview", () => {
    const overview = deriveAccountsOverview([
      account({ id: "checking", kind: "asset", subtype: "bank" }),
      account({ id: "expense", kind: "expense", subtype: "external" }),
      account({ id: "income", kind: "revenue", subtype: "external" }),
    ]);

    expect(overview.userAccounts.map((item) => item.id)).toEqual(["checking"]);
    expect(overview.activeAccountCount).toBe(1);
    expect(overview.archivedAccountCount).toBe(0);
  });

  it("summarizes active account balances by reporting currency", () => {
    const overview = deriveAccountsOverview([
      account({ id: "checking", kind: "asset", reportingAmountMinor: "125000", subtype: "bank" }),
      account({ id: "wallet", kind: "asset", reportingAmountMinor: "5000", subtype: "wallet" }),
      account({
        id: "credit-card",
        kind: "liability",
        reportingAmountMinor: "-30000",
        subtype: "credit_card",
      }),
      account({
        archivedAt: "2026-01-01T00:00:00.000Z",
        id: "old-loan",
        isActive: false,
        kind: "liability",
        reportingAmountMinor: "-90000",
        subtype: "loan",
      }),
    ]);

    expect(overview.currencySummaries).toEqual([
      {
        accountCount: 3,
        assetBalanceMinor: 130000n,
        currencyCode: "INR",
        liabilityBalanceMinor: -30000n,
        liabilityExposureMinor: 30000n,
        netWorthMinor: 100000n,
      },
    ]);
    expect(overview.primaryCurrencySummary?.netWorthMinor).toBe(100000n);
    expect(overview.archivedAccountCount).toBe(1);
  });

  it("counts active account types in a stable order", () => {
    const overview = deriveAccountsOverview([
      account({ id: "checking", kind: "asset", subtype: "bank" }),
      account({ id: "savings", kind: "asset", subtype: "bank" }),
      account({ id: "cash", kind: "asset", subtype: "cash" }),
      account({ id: "card", kind: "liability", subtype: "credit_card" }),
    ]);

    expect(overview.accountTypeSummaries).toEqual([
      { accountCount: 2, subtype: "bank" },
      { accountCount: 1, subtype: "cash" },
      { accountCount: 1, subtype: "credit_card" },
    ]);
  });
});

describe("isActiveAccount", () => {
  it("requires both active status and no archive timestamp", () => {
    expect(isActiveAccount(account({ id: "active" }))).toBe(true);
    expect(
      isActiveAccount(account({ archivedAt: "2026-01-01T00:00:00.000Z", id: "archived" })),
    ).toBe(false);
    expect(isActiveAccount(account({ id: "inactive", isActive: false }))).toBe(false);
  });
});

function account({
  archivedAt = null,
  balanceAmountMinor,
  currencyCode = "INR",
  id,
  isActive = true,
  kind = "asset",
  reportingAmountMinor,
  reportingCurrencyCode = currencyCode,
  subtype = "bank",
}: {
  readonly archivedAt?: string | null;
  readonly balanceAmountMinor?: string;
  readonly currencyCode?: string;
  readonly id: string;
  readonly isActive?: boolean;
  readonly kind?: AccountKind;
  readonly reportingAmountMinor?: string;
  readonly reportingCurrencyCode?: string;
  readonly subtype?: AccountSubtype;
}): AccountWithBalanceResponse {
  const now = "2026-01-01T00:00:00.000Z";
  const amountMinor = balanceAmountMinor ?? reportingAmountMinor ?? "0";

  return {
    archivedAt,
    balance: { amountMinor, currencyCode },
    createdAt: now,
    currencyCode,
    id,
    isActive,
    kind,
    ledgerId: "ledger",
    name: id,
    openingBalanceDate: null,
    openingBalanceMinor: null,
    reportingBalance: {
      amountMinor: reportingAmountMinor ?? amountMinor,
      currencyCode: reportingCurrencyCode,
    },
    subtype,
    updatedAt: now,
    workspaceId: "workspace",
  };
}
