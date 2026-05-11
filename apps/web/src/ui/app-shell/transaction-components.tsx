import type { TransactionGroupResponse } from "@fastifly/common";
import { Button } from "@ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Skeleton } from "@ui/skeleton";
import { ArrowDownLeft, ArrowUpRight, RefreshCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
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
        className={cn("min-w-0 divide-y divide-border", listClassName)}
        data-testid={testIds.transactions.list}
        ref={listRef}
      >
        {showInitialSkeleton ? (
          transactionSkeletonRowKeys.map((rowKey) => <TransactionRowSkeleton key={rowKey} />)
        ) : hasTransactions ? (
          transactions.map((transaction) => (
            <TransactionRow key={transaction.id} transaction={transaction} />
          ))
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
              {hasActiveFilters
                ? en.transactions.noFilteredTransactionsBody
                : en.shell.noTransactionsBody}
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

function TransactionRow({ transaction }: { readonly transaction: TransactionGroupResponse }) {
  const signedAmount = formatTransactionAmount(transaction);
  const isIncome = transaction.type === "income";

  return (
    <div
      className="flex min-w-0 items-center justify-between gap-3 px-4 py-3.5 md:px-5"
      data-testid={testIds.transactions.row(transaction.id)}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`inline-flex size-8 items-center justify-center rounded-lg border border-border bg-muted/40 ${isIncome ? "text-emerald-700 dark:text-emerald-200" : "text-slate-700 dark:text-muted-foreground"}`}
        >
          {isIncome ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
        </div>
        <div className="min-w-0">
          <p
            className="truncate font-semibold text-[14px]"
            data-testid={testIds.transactions.rowTitle(transaction.id)}
          >
            {transaction.title}
          </p>
          <p
            className="mt-0.5 text-[12px] text-slate-500 capitalize dark:text-white/50"
            data-testid={testIds.transactions.rowMeta(transaction.id)}
          >
            {formatDate(transaction.journals[0]?.occurredAt)} · {transaction.type}
          </p>
        </div>
      </div>
      <p
        className="shrink-0 text-right font-semibold text-[14px]"
        data-testid={testIds.transactions.rowAmount(transaction.id)}
      >
        {signedAmount}
      </p>
    </div>
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
