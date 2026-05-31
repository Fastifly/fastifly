import {
  type AccountSubtype,
  type AccountWithBalanceResponse,
  isUserHeldAccountKind,
} from "@fastifly/common";

export type CurrencyAccountSummary = {
  readonly accountCount: number;
  readonly assetBalanceMinor: bigint;
  readonly currencyCode: string;
  readonly liabilityBalanceMinor: bigint;
  readonly liabilityExposureMinor: bigint;
  readonly netWorthMinor: bigint;
};

export type AccountSubtypeSummary = {
  readonly accountCount: number;
  readonly subtype: AccountSubtype;
};

export type AccountsOverview = {
  readonly accountTypeSummaries: readonly AccountSubtypeSummary[];
  readonly activeAccountCount: number;
  readonly activeAccounts: readonly AccountWithBalanceResponse[];
  readonly archivedAccountCount: number;
  readonly currencySummaries: readonly CurrencyAccountSummary[];
  readonly primaryCurrencySummary: CurrencyAccountSummary | null;
  readonly userAccounts: readonly AccountWithBalanceResponse[];
};

type MutableCurrencyAccountSummary = {
  accountCount: number;
  assetBalanceMinor: bigint;
  currencyCode: string;
  liabilityBalanceMinor: bigint;
  netWorthMinor: bigint;
};

export function deriveAccountsOverview(
  accounts: readonly AccountWithBalanceResponse[],
): AccountsOverview {
  const userAccounts = accounts.filter((account) => isUserHeldAccountKind(account.kind));
  const activeAccounts = userAccounts.filter(isActiveAccount);
  const archivedAccountCount = userAccounts.length - activeAccounts.length;
  const currencySummaries = summarizeAccountsByReportingCurrency(activeAccounts);
  const accountTypeSummaries = summarizeAccountsBySubtype(activeAccounts);

  return {
    accountTypeSummaries,
    activeAccountCount: activeAccounts.length,
    activeAccounts,
    archivedAccountCount,
    currencySummaries,
    primaryCurrencySummary: currencySummaries[0] ?? null,
    userAccounts,
  };
}

export function isActiveAccount(account: AccountWithBalanceResponse): boolean {
  return account.isActive && account.archivedAt === null;
}

function summarizeAccountsByReportingCurrency(
  accounts: readonly AccountWithBalanceResponse[],
): readonly CurrencyAccountSummary[] {
  const summaries = new Map<string, MutableCurrencyAccountSummary>();

  for (const account of accounts) {
    const currencyCode = account.reportingBalance.currencyCode;
    const balanceMinor = BigInt(account.reportingBalance.amountMinor);
    const summary =
      summaries.get(currencyCode) ??
      ({
        accountCount: 0,
        assetBalanceMinor: 0n,
        currencyCode,
        liabilityBalanceMinor: 0n,
        netWorthMinor: 0n,
      } satisfies MutableCurrencyAccountSummary);

    summary.accountCount += 1;
    summary.netWorthMinor += balanceMinor;

    if (account.kind === "asset") {
      summary.assetBalanceMinor += balanceMinor;
    }
    if (account.kind === "liability") {
      summary.liabilityBalanceMinor += balanceMinor;
    }

    summaries.set(currencyCode, summary);
  }

  return [...summaries.values()]
    .map((summary) => ({
      ...summary,
      liabilityExposureMinor:
        summary.liabilityBalanceMinor < 0n
          ? -summary.liabilityBalanceMinor
          : summary.liabilityBalanceMinor,
    }))
    .sort(compareCurrencySummaries);
}

function summarizeAccountsBySubtype(
  accounts: readonly AccountWithBalanceResponse[],
): readonly AccountSubtypeSummary[] {
  const counts = new Map<AccountSubtype, number>();

  for (const account of accounts) {
    counts.set(account.subtype, (counts.get(account.subtype) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([subtype, accountCount]) => ({ accountCount, subtype }))
    .sort((left, right) => {
      if (left.accountCount !== right.accountCount) {
        return right.accountCount - left.accountCount;
      }

      return left.subtype.localeCompare(right.subtype);
    });
}

function compareCurrencySummaries(
  left: CurrencyAccountSummary,
  right: CurrencyAccountSummary,
): number {
  if (left.accountCount !== right.accountCount) {
    return right.accountCount - left.accountCount;
  }

  return left.currencyCode.localeCompare(right.currencyCode);
}
