import {
  type AccountSubtype,
  type AccountWithBalanceResponse,
  formatMoneyMinor,
} from "@fastifly/common";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type Column,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Skeleton } from "@ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/table";
import {
  ArrowUpDown,
  CreditCard,
  Landmark,
  type LucideIcon,
  PiggyBank,
  PlusCircle,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { apiClient } from "../../../api/client";
import {
  type AccountsOverview,
  deriveAccountsOverview,
  isActiveAccount,
} from "../../../finance/accounts-overview";
import { en } from "../../../i18n/en";
import { testIds } from "../../../testing/testid-registry";
import { AccountCreateDialog } from "../../account-create-panel";
import { AccountArchiveAction } from "../shared-components";
import { formatAccountArchiveSuccess, getAccountArchiveError } from "../utils";
import type { AccountsPageProps } from "./types";

type AccountTableRow = {
  readonly account: AccountWithBalanceResponse;
  readonly balanceLabel: string;
  readonly balanceMinor: bigint;
  readonly currencyCode: string;
  readonly kindLabel: string;
  readonly name: string;
  readonly openingBalanceLabel: string;
  readonly statusLabel: string;
  readonly typeLabel: string;
};

const accountColumnHelper = createColumnHelper<AccountTableRow>();
const accountSkeletonRowKeys = ["account-skeleton-1", "account-skeleton-2", "account-skeleton-3"];
const accountMixBarClasses = [
  "bg-emerald-500",
  "bg-sky-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-slate-500",
] as const;
const DEFAULT_REPORTING_CURRENCY = "INR";

export function AccountsPage({ accounts, accountsLoading, ledgerContext }: AccountsPageProps) {
  const queryClient = useQueryClient();
  const [sorting, setSorting] = useState<SortingState>([{ desc: true, id: "balance" }]);
  const overview = useMemo(() => deriveAccountsOverview(accounts), [accounts]);
  const rows = useMemo(
    () => overview.activeAccounts.map(toAccountTableRow),
    [overview.activeAccounts],
  );
  const archiveMutation = useMutation({
    mutationFn: async (account: AccountWithBalanceResponse) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }

      await apiClient.archiveAccount({
        accountId: account.id,
        ledgerId: ledgerContext.ledgerId,
        workspaceId: ledgerContext.workspaceId,
      });
    },
    onSuccess: async (_data, account) => {
      toast.success(formatAccountArchiveSuccess(account.name));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["finance", "accounts", ledgerContext?.workspaceId, ledgerContext?.ledgerId],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            "finance",
            "transactions",
            ledgerContext?.workspaceId,
            ledgerContext?.ledgerId,
          ],
        }),
      ]);
    },
  });

  const archiveAccount = useCallback(
    async (account: AccountWithBalanceResponse) => {
      try {
        await archiveMutation.mutateAsync(account);
      } catch (error) {
        toast.error(getAccountArchiveError(error));
      }
    },
    [archiveMutation],
  );
  const archivingAccountId = archiveMutation.variables?.id;
  const columns = useMemo(
    () => [
      accountColumnHelper.accessor("name", {
        cell: ({ row }) => <AccountNameCell row={row.original} />,
        header: ({ column }) => (
          <SortableColumnHeader column={column} label={en.accounts.columns.account} />
        ),
        id: "account",
      }),
      accountColumnHelper.accessor("typeLabel", {
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.typeLabel}</p>
            <p className="text-muted-foreground text-xs">{row.original.kindLabel}</p>
          </div>
        ),
        header: en.accounts.columns.type,
        id: "type",
      }),
      accountColumnHelper.accessor("currencyCode", {
        cell: ({ getValue }) => (
          <Badge className="rounded-full" variant="outline">
            {getValue()}
          </Badge>
        ),
        header: en.accounts.columns.currency,
        id: "currency",
      }),
      accountColumnHelper.accessor("balanceMinor", {
        cell: ({ row }) => (
          <p
            className="break-words text-right font-semibold"
            data-testid={testIds.accounts.rowBalance(row.original.account.id)}
          >
            {row.original.balanceLabel}
          </p>
        ),
        header: ({ column }) => (
          <SortableColumnHeader align="right" column={column} label={en.accounts.columns.balance} />
        ),
        id: "balance",
        sortingFn: (left, right) =>
          compareBigint(left.original.balanceMinor, right.original.balanceMinor),
      }),
      accountColumnHelper.accessor("openingBalanceLabel", {
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue()}</span>,
        header: en.accounts.columns.openingBalance,
        id: "openingBalance",
      }),
      accountColumnHelper.accessor("statusLabel", {
        cell: ({ row }) => (
          <AccountStatusBadge
            account={row.original.account}
            testId={testIds.accounts.rowStatus(row.original.account.id)}
          />
        ),
        header: en.accounts.columns.status,
        id: "status",
      }),
      accountColumnHelper.display({
        cell: ({ row }) => (
          <AccountRowActions
            account={row.original.account}
            isArchiving={
              archiveMutation.isPending && archivingAccountId === row.original.account.id
            }
            onArchive={archiveAccount}
            testIdsEnabled={true}
          />
        ),
        header: () => <span className="sr-only">{en.accounts.columns.actions}</span>,
        id: "actions",
      }),
    ],
    [archiveAccount, archiveMutation.isPending, archivingAccountId],
  );
  const table = useReactTable({
    columns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.account.id,
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });
  const showLoadingState = accountsLoading && overview.userAccounts.length === 0;

  return (
    <section
      className="mt-2 space-y-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] xl:pb-0"
      data-testid={testIds.accounts.page}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-semibold text-2xl tracking-normal">{en.accounts.pageTitle}</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground text-sm">
            {en.accounts.pageDescription}
          </p>
        </div>
        <AccountCreateDialog
          ledgerContext={ledgerContext}
          trigger={
            <Button
              className="w-full sm:w-auto"
              data-testid={testIds.accounts.create.openButton}
              type="button"
            >
              <PlusCircle aria-hidden="true" />
              {en.accounts.addAccount}
            </Button>
          }
        />
      </div>

      <AccountsSummary overview={overview} />

      <Card className="overflow-hidden border border-border bg-card text-card-foreground shadow-sm">
        <CardHeader>
          <CardTitle>{en.accounts.register}</CardTitle>
          <CardDescription>{en.accounts.registerBody}</CardDescription>
        </CardHeader>
        <CardContent className="p-0" data-testid={testIds.accounts.list}>
          {showLoadingState ? (
            <AccountsLoadingState />
          ) : rows.length > 0 ? (
            <>
              <div className="hidden md:block" data-testid={testIds.accounts.table}>
                <Table className="table-fixed lg:table-auto">
                  <TableHeader className="bg-muted/40">
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <TableHead
                            className={getAccountHeaderClassName(header.column.id)}
                            key={header.id}
                          >
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows.map((row) => (
                      <TableRow
                        data-testid={testIds.accounts.row(row.original.account.id)}
                        key={row.id}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell
                            className={getAccountCellClassName(cell.column.id)}
                            key={cell.id}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="divide-y md:hidden" data-testid={testIds.accounts.mobileList}>
                {table.getRowModel().rows.map((row) => (
                  <AccountMobileRow
                    isArchiving={
                      archiveMutation.isPending && archivingAccountId === row.original.account.id
                    }
                    key={row.id}
                    onArchive={archiveAccount}
                    row={row.original}
                  />
                ))}
              </div>
            </>
          ) : (
            <AccountsEmptyState />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.48fr)]">
        <CurrencyBreakdownCard overview={overview} />
        <AccountMixCard overview={overview} />
      </div>
    </section>
  );
}

function AccountsSummary({ overview }: { readonly overview: AccountsOverview }) {
  const summary = overview.primaryCurrencySummary;
  const currencyCode = summary?.currencyCode ?? DEFAULT_REPORTING_CURRENCY;

  return (
    <div
      className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-4"
      data-testid={testIds.accounts.summary}
    >
      <AccountMetricCard
        body={en.accounts.netWorthBody}
        icon={PiggyBank}
        label={en.accounts.netWorth}
        testId={testIds.accounts.netWorthMetric}
        tone="success"
        value={formatMoneyMinor(summary?.netWorthMinor ?? 0n, currencyCode)}
      />
      <AccountMetricCard
        body={en.accounts.reportedAssetsBody}
        icon={Landmark}
        label={en.accounts.reportedAssets}
        testId={testIds.accounts.assetsMetric}
        tone="info"
        value={formatMoneyMinor(summary?.assetBalanceMinor ?? 0n, currencyCode)}
      />
      <AccountMetricCard
        body={en.accounts.debtTrackedBody}
        icon={CreditCard}
        label={en.accounts.debtTracked}
        testId={testIds.accounts.liabilitiesMetric}
        tone="danger"
        value={formatMoneyMinor(summary?.liabilityExposureMinor ?? 0n, currencyCode)}
      />
      <AccountMetricCard
        body={formatArchivedAccountBody(overview.archivedAccountCount)}
        icon={WalletCards}
        label={en.accounts.activeAccounts}
        testId={testIds.accounts.activeCountMetric}
        tone="neutral"
        value={formatAccountCount(overview.activeAccountCount)}
      />
    </div>
  );
}

function AccountMetricCard({
  body,
  icon: Icon,
  label,
  testId,
  tone,
  value,
}: {
  readonly body: string;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly testId: string;
  readonly tone: "danger" | "info" | "neutral" | "success";
  readonly value: string;
}) {
  return (
    <Card
      className="min-w-0 border border-border bg-card p-0 text-card-foreground shadow-sm"
      data-testid={testId}
      size="sm"
    >
      <CardContent className="flex h-full flex-col gap-2 p-3 sm:grid sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-3 sm:gap-y-2 sm:p-4">
        <div
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-lg border border-border bg-muted/40 sm:size-9",
            getMetricToneClassName(tone),
          )}
        >
          <Icon aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium text-muted-foreground text-xs">{label}</p>
          <p className="mt-1 break-words font-semibold text-[1.05rem] leading-tight sm:text-xl">
            {value}
          </p>
        </div>
        <p className="hidden text-muted-foreground text-xs leading-relaxed sm:col-span-2 sm:block">
          {body}
        </p>
      </CardContent>
    </Card>
  );
}

function CurrencyBreakdownCard({ overview }: { readonly overview: AccountsOverview }) {
  return (
    <Card
      className="border border-border bg-card text-card-foreground shadow-sm"
      data-testid={testIds.accounts.currencyBreakdown}
    >
      <CardHeader>
        <CardTitle>{en.accounts.currencyBreakdown}</CardTitle>
        <CardDescription>{en.accounts.currencyBreakdownBody}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {overview.currencySummaries.length > 0 ? (
          overview.currencySummaries.map((summary) => (
            <div
              className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3 md:grid-cols-[minmax(0,1fr)_auto]"
              key={summary.currencyCode}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{summary.currencyCode}</p>
                  <Badge className="rounded-full" variant="secondary">
                    {formatAccountCount(summary.accountCount)}
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground text-xs">
                  {en.accounts.reportedAssets}:{" "}
                  {formatMoneyMinor(summary.assetBalanceMinor, summary.currencyCode)} /{" "}
                  {en.accounts.debtTracked}:{" "}
                  {formatMoneyMinor(summary.liabilityExposureMinor, summary.currencyCode)}
                </p>
              </div>
              <p className="break-words font-semibold text-lg md:text-right">
                {formatMoneyMinor(summary.netWorthMinor, summary.currencyCode)}
              </p>
            </div>
          ))
        ) : (
          <p className="text-muted-foreground text-sm">{en.accounts.emptyBody}</p>
        )}
      </CardContent>
    </Card>
  );
}

function AccountMixCard({ overview }: { readonly overview: AccountsOverview }) {
  return (
    <Card
      className="border border-border bg-card text-card-foreground shadow-sm"
      data-testid={testIds.accounts.accountMix}
    >
      <CardHeader>
        <CardTitle>{en.accounts.accountMix}</CardTitle>
        <CardDescription>{en.accounts.accountMixBody}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {overview.accountTypeSummaries.length > 0 ? (
          overview.accountTypeSummaries.map((summary, index) => {
            const percent =
              overview.activeAccountCount > 0
                ? Math.round((summary.accountCount / overview.activeAccountCount) * 100)
                : 0;

            return (
              <div className="space-y-1.5" key={summary.subtype}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium">
                    {getAccountSubtypeLabel(summary.subtype)}
                  </span>
                  <span className="text-muted-foreground">
                    {formatAccountCount(summary.accountCount)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      accountMixBarClasses[index % accountMixBarClasses.length],
                    )}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-muted-foreground text-sm">{en.accounts.emptyBody}</p>
        )}
      </CardContent>
    </Card>
  );
}

function AccountNameCell({ row }: { readonly row: AccountTableRow }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-semibold" data-testid={testIds.accounts.cardName(row.account.id)}>
        {row.name}
      </p>
      <p className="mt-1 truncate text-muted-foreground text-xs lg:hidden">
        {row.typeLabel} / {row.currencyCode}
      </p>
    </div>
  );
}

function AccountRowActions({
  account,
  isArchiving,
  onArchive,
  testIdsEnabled,
}: {
  readonly account: AccountWithBalanceResponse;
  readonly isArchiving: boolean;
  readonly onArchive: (account: AccountWithBalanceResponse) => Promise<void>;
  readonly testIdsEnabled: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button
        asChild
        data-testid={testIdsEnabled ? testIds.accounts.viewTransactions(account.id) : undefined}
        size="sm"
        variant="outline"
      >
        <a href={getAccountTransactionsHref(account.id)}>
          <ReceiptText aria-hidden="true" />
          {en.accounts.viewTransactions}
        </a>
      </Button>
      {isActiveAccount(account) ? (
        <AccountArchiveAction
          account={account}
          disabled={isArchiving}
          onArchive={onArchive}
          testIdsEnabled={testIdsEnabled}
        />
      ) : (
        <AccountStatusBadge account={account} />
      )}
    </div>
  );
}

function AccountMobileRow({
  isArchiving,
  onArchive,
  row,
}: {
  readonly isArchiving: boolean;
  readonly onArchive: (account: AccountWithBalanceResponse) => Promise<void>;
  readonly row: AccountTableRow;
}) {
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{row.name}</p>
          <p className="mt-1 text-muted-foreground text-xs">
            {row.typeLabel} / {row.currencyCode}
          </p>
        </div>
        <AccountStatusBadge account={row.account} />
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-muted-foreground text-xs">{en.accounts.columns.balance}</p>
          <p className="mt-1 break-words font-semibold">{row.balanceLabel}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">{en.accounts.columns.openingBalance}</p>
          <p className="mt-1 break-words text-muted-foreground">{row.openingBalanceLabel}</p>
        </div>
      </div>
      <AccountRowActions
        account={row.account}
        isArchiving={isArchiving}
        onArchive={onArchive}
        testIdsEnabled={false}
      />
    </div>
  );
}

function AccountStatusBadge({
  account,
  testId,
}: {
  readonly account: AccountWithBalanceResponse;
  readonly testId?: string;
}) {
  const active = isActiveAccount(account);

  return (
    <Badge
      className={cn(
        "rounded-full",
        active
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
          : "border-border bg-muted text-muted-foreground",
      )}
      data-testid={testId}
      variant="outline"
    >
      {active ? en.accounts.active : en.accounts.inactive}
    </Badge>
  );
}

function SortableColumnHeader<TValue>({
  align = "left",
  column,
  label,
}: {
  readonly align?: "left" | "right";
  readonly column: Column<AccountTableRow, TValue>;
  readonly label: string;
}) {
  return (
    <Button
      className={cn(
        "h-auto px-0 py-0 text-muted-foreground hover:bg-transparent",
        align === "right" && "ml-auto",
      )}
      onClick={column.getToggleSortingHandler()}
      size="sm"
      type="button"
      variant="ghost"
    >
      {label}
      <ArrowUpDown className="size-3.5" />
    </Button>
  );
}

function AccountsLoadingState() {
  return (
    <div className="space-y-0">
      {accountSkeletonRowKeys.map((key) => (
        <div className="grid gap-3 border-b p-4 md:grid-cols-[minmax(0,1fr)_8rem_8rem]" key={key}>
          <Skeleton className="h-5 w-56 max-w-full" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-28 md:justify-self-end" />
        </div>
      ))}
    </div>
  );
}

function AccountsEmptyState() {
  return (
    <div
      className="flex flex-col items-center gap-2 px-4 py-10 text-center"
      data-testid={testIds.accounts.emptyState}
    >
      <Landmark className="size-9 text-muted-foreground" aria-hidden="true" />
      <p className="font-semibold">{en.accounts.emptyTitle}</p>
      <p className="max-w-sm text-muted-foreground text-sm">{en.accounts.emptyBody}</p>
    </div>
  );
}

function toAccountTableRow(account: AccountWithBalanceResponse): AccountTableRow {
  return {
    account,
    balanceLabel: formatMoneyMinor(
      BigInt(account.balance.amountMinor),
      account.balance.currencyCode,
    ),
    balanceMinor: BigInt(account.reportingBalance.amountMinor),
    currencyCode: account.currencyCode,
    kindLabel: getAccountKindLabel(account),
    name: account.name,
    openingBalanceLabel: formatOpeningBalance(account),
    statusLabel: isActiveAccount(account) ? en.accounts.active : en.accounts.inactive,
    typeLabel: getAccountSubtypeLabel(account.subtype),
  };
}

function getMetricToneClassName(tone: "danger" | "info" | "neutral" | "success"): string {
  if (tone === "success") {
    return "text-emerald-700 dark:text-emerald-200";
  }
  if (tone === "info") {
    return "text-sky-700 dark:text-sky-200";
  }
  if (tone === "danger") {
    return "text-rose-700 dark:text-rose-200";
  }

  return "text-foreground";
}

function getAccountHeaderClassName(columnId: string): string {
  if (columnId === "account") {
    return "min-w-[13rem] px-3";
  }
  if (columnId === "type" || columnId === "status") {
    return "hidden lg:table-cell";
  }
  if (columnId === "currency") {
    return "hidden md:table-cell";
  }
  if (columnId === "openingBalance") {
    return "hidden xl:table-cell";
  }
  if (columnId === "balance") {
    return "w-[10rem] px-3 text-right";
  }
  if (columnId === "actions") {
    return "w-[15rem] px-3 text-right";
  }

  return "px-3";
}

function getAccountCellClassName(columnId: string): string {
  if (columnId === "type" || columnId === "status") {
    return "hidden lg:table-cell";
  }
  if (columnId === "currency") {
    return "hidden md:table-cell";
  }
  if (columnId === "openingBalance") {
    return "hidden xl:table-cell";
  }
  if (columnId === "balance") {
    return "w-[10rem] px-3 py-3 text-right";
  }
  if (columnId === "actions") {
    return "w-[15rem] px-3 py-3";
  }

  return "px-3 py-3";
}

function getAccountKindLabel(account: AccountWithBalanceResponse): string {
  if (account.kind === "asset") {
    return en.accounts.kinds.asset;
  }
  if (account.kind === "liability") {
    return en.accounts.kinds.liability;
  }

  return account.kind;
}

function getAccountSubtypeLabel(subtype: AccountSubtype): string {
  const subtypeLabels = en.accounts.types as Partial<Record<AccountSubtype, string>>;

  return subtypeLabels[subtype] ?? subtype;
}

function formatOpeningBalance(account: AccountWithBalanceResponse): string {
  if (!account.openingBalanceMinor) {
    return en.accounts.noOpeningBalance;
  }

  const amount = formatMoneyMinor(BigInt(account.openingBalanceMinor), account.currencyCode);
  if (!account.openingBalanceDate) {
    return amount;
  }

  return `${amount} (${formatFullDate(account.openingBalanceDate)})`;
}

function formatFullDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatAccountCount(count: number): string {
  return count === 1
    ? en.accounts.accountCountOne
    : en.accounts.accountCountMany.replace("{count}", count.toString());
}

function formatArchivedAccountBody(count: number): string {
  return en.accounts.activeAccountsBody.replace("{count}", count.toString());
}

function getAccountTransactionsHref(accountId: string): string {
  return `/transactions?accountId=${encodeURIComponent(accountId)}`;
}

function compareBigint(left: bigint, right: bigint): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }

  return 0;
}
