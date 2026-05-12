import {
  getTransactionDisplayType,
  getTransactionOccurredAt,
  getTransactionSignedMinor,
  type TransactionGroupResponse,
} from "@fastifly/common";
import { Link } from "@tanstack/react-router";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { Button } from "@ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Skeleton } from "@ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/table";
import { ArrowDownLeft, ArrowUpDown, ArrowUpRight, RefreshCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { en } from "../../i18n/en";
import { testIds } from "../../testing/testid-registry";
import { formatDate, formatTransactionAmount } from "./utils";

const transactionSkeletonRowKeys = [
  "skeleton-1",
  "skeleton-2",
  "skeleton-3",
  "skeleton-4",
  "skeleton-5",
  "skeleton-6",
] as const;

type TransactionTableRow = {
  readonly amount: string;
  readonly occurredAt: string;
  readonly signedAmountMinor: bigint;
  readonly transaction: TransactionGroupResponse;
  readonly typeLabel: string;
};

const transactionColumnHelper = createColumnHelper<TransactionTableRow>();

export function TransactionsPanel({
  descriptionTestId,
  description,
  emptyBodyId,
  emptyStateId,
  emptyTitleId,
  hasActiveFilters,
  hasNextPage,
  headerContent,
  isFetchingNextPage,
  listClassName,
  onLoadMore,
  onRetry,
  panelClassName,
  title,
  titleTestId,
  transactions,
  transactionsError,
  transactionsLoading,
}: {
  readonly descriptionTestId?: string | undefined;
  readonly description: string | null;
  readonly emptyBodyId?: string | undefined;
  readonly emptyStateId?: string | undefined;
  readonly emptyTitleId?: string | undefined;
  readonly hasActiveFilters: boolean;
  readonly hasNextPage: boolean;
  readonly headerContent?: ReactNode;
  readonly isFetchingNextPage: boolean;
  readonly listClassName?: string | undefined;
  readonly onLoadMore: () => void;
  readonly onRetry: () => void;
  readonly panelClassName?: string | undefined;
  readonly title: string;
  readonly titleTestId?: string | undefined;
  readonly transactions: readonly TransactionGroupResponse[];
  readonly transactionsError: boolean;
  readonly transactionsLoading: boolean;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const autoLoadRequestedRef = useRef(false);

  const hasTransactions = transactions.length > 0;
  const showInitialSkeleton = transactionsLoading && !hasTransactions && !transactionsError;
  const showErrorEmptyState = transactionsError && !hasTransactions;
  const [sorting, setSorting] = useState<SortingState>([{ desc: true, id: "occurredAt" }]);

  const transactionRows = useMemo<TransactionTableRow[]>(
    () =>
      transactions.map((transaction) => ({
        amount: formatTransactionAmount(transaction),
        occurredAt: getTransactionOccurredAt(transaction) ?? "",
        signedAmountMinor: getTransactionSignedMinor(transaction),
        transaction,
        typeLabel: formatTransactionTypeLabel(getTransactionDisplayType(transaction)),
      })),
    [transactions],
  );

  const columns = useMemo(
    () => [
      transactionColumnHelper.accessor((row) => row.transaction.title, {
        cell: ({ row }) => {
          const transaction = row.original.transaction;
          const isIncome = getTransactionDisplayType(transaction) === "income";

          return (
            <div className="flex min-w-0 items-center gap-2">
              <div
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-md border border-border bg-muted/40",
                  isIncome
                    ? "text-emerald-700 dark:text-emerald-200"
                    : "text-slate-700 dark:text-muted-foreground",
                )}
              >
                {isIncome ? (
                  <ArrowDownLeft className="size-3.5" />
                ) : (
                  <ArrowUpRight className="size-3.5" />
                )}
              </div>
              <div className="min-w-0">
                <p
                  className="truncate font-medium text-sm"
                  data-testid={testIds.transactions.rowTitle(transaction.id)}
                >
                  {transaction.title}
                </p>
                <p
                  className="truncate text-[12px] text-muted-foreground md:hidden"
                  data-testid={testIds.transactions.rowMeta(transaction.id)}
                >
                  {formatDate(row.original.occurredAt)} · {row.original.typeLabel}
                </p>
              </div>
            </div>
          );
        },
        header: () => en.transactions.description,
        id: "title",
      }),
      transactionColumnHelper.accessor("occurredAt", {
        cell: ({ row }) => (
          <p className="hidden whitespace-nowrap text-sm text-muted-foreground md:block">
            {formatDate(row.original.occurredAt)}
          </p>
        ),
        header: ({ column }) => (
          <Button
            className="hidden h-auto px-0 text-muted-foreground hover:text-foreground md:inline-flex"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            size="sm"
            type="button"
            variant="ghost"
          >
            {en.transactions.date}
            <ArrowUpDown className="size-3.5" />
          </Button>
        ),
        id: "occurredAt",
        sortingFn: (rowA, rowB) => rowA.original.occurredAt.localeCompare(rowB.original.occurredAt),
      }),
      transactionColumnHelper.accessor("typeLabel", {
        cell: ({ getValue, row }) => (
          <p
            className="hidden whitespace-nowrap text-sm text-muted-foreground md:block"
            data-testid={testIds.transactions.rowMeta(row.original.transaction.id)}
          >
            {getValue()}
          </p>
        ),
        header: () => <span className="hidden md:inline">{en.transactions.type}</span>,
        id: "type",
      }),
      transactionColumnHelper.accessor("amount", {
        cell: ({ getValue, row }) => (
          <p
            className="whitespace-nowrap text-right font-semibold text-sm"
            data-testid={testIds.transactions.rowAmount(row.original.transaction.id)}
          >
            {getValue()}
          </p>
        ),
        header: ({ column }) => (
          <Button
            className="h-auto px-0 text-muted-foreground hover:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            size="sm"
            type="button"
            variant="ghost"
          >
            {en.transactions.amount}
            <ArrowUpDown className="size-3.5" />
          </Button>
        ),
        id: "amount",
        sortingFn: (rowA, rowB) => {
          if (rowA.original.signedAmountMinor < rowB.original.signedAmountMinor) {
            return -1;
          }
          if (rowA.original.signedAmountMinor > rowB.original.signedAmountMinor) {
            return 1;
          }
          return 0;
        },
      }),
    ],
    [],
  );

  const table = useReactTable({
    columns,
    data: transactionRows,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

  useEffect(() => {
    if (!isFetchingNextPage) {
      autoLoadRequestedRef.current = false;
    }
  }, [isFetchingNextPage]);

  useEffect(() => {
    if (!hasNextPage || transactionsLoading || transactionsError) {
      return;
    }

    const listElement = listRef.current;
    const sentinelElement = loadMoreSentinelRef.current;
    if (!listElement || !sentinelElement) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || autoLoadRequestedRef.current) {
          return;
        }
        autoLoadRequestedRef.current = true;
        onLoadMore();
      },
      {
        root: listElement,
        rootMargin: "220px 0px",
        threshold: 0,
      },
    );

    observer.observe(sentinelElement);
    return () => observer.disconnect();
  }, [hasNextPage, onLoadMore, transactionsError, transactionsLoading]);

  return (
    <Card
      className={cn(
        "overflow-hidden border border-border bg-card text-card-foreground shadow-sm",
        panelClassName,
      )}
      data-testid={testIds.transactions.listPanel}
    >
      <CardHeader className={headerContent ? "gap-3" : undefined}>
        <div>
          <CardTitle data-testid={titleTestId}>{title}</CardTitle>
          {description ? (
            <CardDescription data-testid={descriptionTestId}>{description}</CardDescription>
          ) : null}
        </div>
        {headerContent ? <div>{headerContent}</div> : null}
      </CardHeader>
      <div
        className={cn("min-w-0", listClassName)}
        data-testid={testIds.transactions.list}
        ref={listRef}
      >
        {showInitialSkeleton ? (
          transactionSkeletonRowKeys.map((rowKey) => <TransactionRowSkeleton key={rowKey} />)
        ) : hasTransactions ? (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur supports-backdrop-filter:bg-card/70">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
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
                  data-testid={testIds.transactions.row(row.original.transaction.id)}
                  key={row.id}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : showErrorEmptyState ? (
          <div className="flex flex-col gap-3 p-4" data-testid={emptyStateId}>
            <p className="font-medium text-[14px]" data-testid={emptyTitleId}>
              {en.transactions.listErrorTitle}
            </p>
            <p
              className="break-words text-[14px] text-slate-600 dark:text-white/62"
              data-testid={emptyBodyId}
            >
              {en.transactions.listErrorBody}
            </p>
            <Button
              className="w-fit"
              data-testid={testIds.transactions.retryButton}
              onClick={onRetry}
              type="button"
              variant="outline"
            >
              <RefreshCcw aria-hidden="true" />
              {en.transactions.retry}
            </Button>
          </div>
        ) : (
          <div className="p-4" data-testid={emptyStateId}>
            <p className="font-medium text-[14px]" data-testid={emptyTitleId}>
              {en.shell.noTransactionsTitle}
            </p>
            <p
              className="mt-1 break-words text-[14px] text-slate-600 dark:text-white/62"
              data-testid={emptyBodyId}
            >
              {hasActiveFilters ? (
                en.transactions.noFilteredTransactionsBody
              ) : (
                <>
                  {en.shell.noTransactionsBody}{" "}
                  <Link
                    className="font-medium text-primary underline underline-offset-2"
                    to="/accounts"
                  >
                    {en.accounts.addAccount}
                  </Link>
                </>
              )}
            </p>
          </div>
        )}

        {hasTransactions ? (
          hasNextPage ? (
            <div
              className={cn(isFetchingNextPage ? "space-y-2 p-3" : "h-2")}
              data-testid={testIds.transactions.loadMoreButton}
              ref={loadMoreSentinelRef}
            >
              {isFetchingNextPage ? (
                <>
                  <p className="text-center text-[12px] text-slate-500 dark:text-white/50">
                    {en.transactions.loadingMore}
                  </p>
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-[80%]" />
                  </div>
                </>
              ) : null}
            </div>
          ) : transactionsError ? (
            <div className="p-3">
              <Button
                className="w-fit"
                data-testid={testIds.transactions.retryButton}
                onClick={onRetry}
                type="button"
                variant="outline"
              >
                <RefreshCcw aria-hidden="true" />
                {en.transactions.retry}
              </Button>
            </div>
          ) : (
            <div className="p-3">
              <p className="text-center text-[12px] text-slate-500 dark:text-white/50">
                {en.transactions.listEnd}
              </p>
            </div>
          )
        ) : null}
      </div>
    </Card>
  );
}

function TransactionRowSkeleton() {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 px-4 py-3.5 md:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <Skeleton className="size-8 rounded-lg" />
        <div className="min-w-0 space-y-1.5">
          <Skeleton className="h-4 w-40 max-w-full" />
          <Skeleton className="h-3 w-28 max-w-full" />
        </div>
      </div>
      <Skeleton className="h-4 w-24" />
    </div>
  );
}

function formatTransactionTypeLabel(type: TransactionGroupResponse["type"]): string {
  if (type === "expense") {
    return en.transactions.types.expense;
  }
  if (type === "income") {
    return en.transactions.types.income;
  }
  if (type === "transfer") {
    return en.transactions.types.transfer;
  }

  return type;
}
