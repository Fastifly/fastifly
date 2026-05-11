import type { TransactionGroupResponse } from "@fastifly/common";
import { Button } from "@ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { en } from "../../i18n/en";
import { testIds } from "../../testing/testid-registry";
import { formatDate, formatTransactionAmount } from "./utils";

export function TransactionsPanel({
  descriptionTestId,
  description,
  emptyBodyId,
  emptyStateId,
  emptyTitleId,
  hasActiveFilters,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
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
  readonly isFetchingNextPage: boolean;
  readonly onLoadMore: () => void;
  readonly title: string;
  readonly titleTestId?: string | undefined;
  readonly transactions: readonly TransactionGroupResponse[];
  readonly transactionsError: boolean;
  readonly transactionsLoading: boolean;
}) {
  return (
    <Card className="ff-glass-panel overflow-hidden" data-testid={testIds.transactions.listPanel}>
      <CardHeader>
        <div>
          <CardTitle data-testid={titleTestId}>{title}</CardTitle>
          {description ? (
            <CardDescription data-testid={descriptionTestId}>{description}</CardDescription>
          ) : null}
        </div>
      </CardHeader>
      <div
        className="min-w-0 divide-y divide-white/45 dark:divide-white/10"
        data-testid={testIds.transactions.list}
      >
        {transactions.length > 0 ? (
          transactions.map((transaction) => (
            <TransactionRow key={transaction.id} transaction={transaction} />
          ))
        ) : (
          <div className="p-4" data-testid={emptyStateId}>
            <p className="font-medium text-[14px]" data-testid={emptyTitleId}>
              {transactionsLoading
                ? en.shell.loadingData
                : transactionsError
                  ? en.transactions.listErrorTitle
                  : en.shell.noTransactionsTitle}
            </p>
            <p
              className="mt-1 break-words text-[14px] text-slate-600 dark:text-white/62"
              data-testid={emptyBodyId}
            >
              {transactionsError
                ? en.transactions.listErrorBody
                : hasActiveFilters
                  ? en.transactions.noFilteredTransactionsBody
                  : en.shell.noTransactionsBody}
            </p>
          </div>
        )}
      </div>
      {transactions.length > 0 ? (
        <div className="border-t border-white/45 p-3 dark:border-white/10">
          {hasNextPage ? (
            <Button
              className="w-full"
              data-testid={testIds.transactions.loadMoreButton}
              disabled={isFetchingNextPage}
              onClick={onLoadMore}
              type="button"
              variant="outline"
            >
              {isFetchingNextPage ? en.transactions.loadingMore : en.transactions.loadMore}
            </Button>
          ) : (
            <p className="text-center text-[12px] text-slate-500 dark:text-white/50">
              {en.transactions.listEnd}
            </p>
          )}
        </div>
      ) : null}
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
          className={`ff-row-icon ${isIncome ? "text-emerald-700 dark:text-emerald-200" : "text-slate-700 dark:text-white/72"}`}
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
