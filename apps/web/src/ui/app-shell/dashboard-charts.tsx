import {
  type CategoryResponse,
  formatMoneyMinor,
  type NetWorthTrendResponse,
  type TransactionGroupResponse,
} from "@fastifly/common";
import { Card, CardContent } from "@ui/card";
import { CircleOff } from "lucide-react";
import { useMemo } from "react";
import { en } from "../../i18n/en";
import { testIds } from "../../testing/testid-registry";
import { getCategoryIconComponent } from "../category-metadata";
import {
  buildMonthlyCashflowSeries,
  buildSpendingByCategorySeries,
  type MonthlyCashflowPoint,
  type SpendingCategoryPoint,
} from "./dashboard-chart-data";
import { GlassSection } from "./shared-components";

const MONTHLY_SERIES_WINDOW = 6;
const CATEGORY_SERIES_WINDOW_DAYS = 30;
const CATEGORY_SERIES_LIMIT = 5;

export function DashboardCharts({
  categories,
  currencyCode,
  netWorthTrend,
  transactions,
}: {
  readonly categories: readonly CategoryResponse[];
  readonly currencyCode: string;
  readonly netWorthTrend: readonly NetWorthTrendResponse["data"]["points"][number][];
  readonly transactions: readonly TransactionGroupResponse[];
}) {
  const now = useMemo(() => new Date(), []);
  const monthlySeries = useMemo(
    () =>
      buildMonthlyCashflowSeries({
        months: MONTHLY_SERIES_WINDOW,
        now,
        transactions,
      }),
    [now, transactions],
  );
  const categorySeries = useMemo(
    () =>
      buildSpendingByCategorySeries({
        categories,
        days: CATEGORY_SERIES_WINDOW_DAYS,
        fallbackCategoryId: "uncategorized",
        fallbackCategoryLabel: en.shell.spendingByCategoryUncategorized,
        limit: CATEGORY_SERIES_LIMIT,
        now,
        transactions,
      }),
    [categories, now, transactions],
  );

  return (
    <GlassSection
      description={en.shell.dashboardInsightsBody}
      testId={testIds.dashboard.chartsSection}
      title={en.shell.dashboardInsights}
    >
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        <NetWorthTrendChart
          currencyCode={currencyCode}
          data={netWorthTrend}
          title={en.shell.netWorthTrend}
        />
        <MonthlyIncomeVsSpendingChart
          currencyCode={currencyCode}
          data={monthlySeries}
          title={en.shell.incomeVsSpendingTrend}
        />
        <SpendingByCategoryChart
          currencyCode={currencyCode}
          data={categorySeries}
          title={en.shell.spendingByCategory}
        />
      </div>
    </GlassSection>
  );
}

function NetWorthTrendChart({
  currencyCode,
  data,
  title,
}: {
  readonly currencyCode: string;
  readonly data: readonly NetWorthTrendResponse["data"]["points"][number][];
  readonly title: string;
}) {
  const maxAbsChangeMinor = useMemo(() => {
    let max = 1n;
    for (const point of data) {
      const changeMinor = toAbsoluteBigInt(point.change.amountMinor);
      if (changeMinor > max) {
        max = changeMinor;
      }
    }
    return max;
  }, [data]);

  const latestNetWorthMinor = BigInt(data.at(-1)?.netWorth.amountMinor ?? "0");
  const netChangeMinor = useMemo(
    () => data.reduce((total, point) => total + BigInt(point.change.amountMinor), 0n),
    [data],
  );

  return (
    <Card data-testid={testIds.dashboard.netWorthTrendChart} size="sm">
      <CardContent className="space-y-3 p-4">
        <div className="space-y-1">
          <p className="font-medium text-sm text-foreground">{title}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {en.shell.netWorthUp}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              {en.shell.netWorthDown}
            </span>
          </div>
        </div>

        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{en.shell.noNetWorthTrendData}</p>
        ) : (
          <>
            <ul className="grid grid-cols-6 gap-2">
              {data.map((point) => {
                const changeMinor = BigInt(point.change.amountMinor);
                const barHeight = toHalfPercent(
                  toAbsoluteBigInt(point.change.amountMinor),
                  maxAbsChangeMinor,
                  8,
                );

                return (
                  <li
                    className="space-y-1.5"
                    data-testid={testIds.dashboard.netWorthTrendChartMonth(point.monthKey)}
                    key={point.monthKey}
                  >
                    <div className="relative h-28 rounded-md border border-border bg-muted/30 px-1 py-2">
                      <div className="absolute inset-x-2 top-1/2 h-px bg-border/80" />
                      {changeMinor === 0n ? null : (
                        <div
                          className={`absolute left-1/2 w-2.5 -translate-x-1/2 rounded-sm ${
                            changeMinor > 0n ? "bg-emerald-500/90" : "bg-rose-500/90"
                          }`}
                          style={
                            changeMinor > 0n
                              ? { bottom: "50%", height: `${barHeight}%` }
                              : { top: "50%", height: `${barHeight}%` }
                          }
                        />
                      )}
                    </div>
                    <p className="text-center text-[11px] text-muted-foreground">
                      {formatMonth(point.monthStart)}
                    </p>
                  </li>
                );
              })}
            </ul>

            <p className="text-[11px] text-muted-foreground">
              {en.shell.latestNetWorthSummary.replace(
                "{netWorth}",
                formatMoneyMinor(latestNetWorthMinor, currencyCode),
              )}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {en.shell.netWorthChangeSummary.replace(
                "{change}",
                formatMoneyMinor(netChangeMinor, currencyCode),
              )}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MonthlyIncomeVsSpendingChart({
  currencyCode,
  data,
  title,
}: {
  readonly currencyCode: string;
  readonly data: readonly MonthlyCashflowPoint[];
  readonly title: string;
}) {
  const maxMinor = useMemo(() => {
    let max = 0n;
    for (const point of data) {
      if (point.incomeMinor > max) {
        max = point.incomeMinor;
      }
      if (point.expenseMinor > max) {
        max = point.expenseMinor;
      }
    }
    return max === 0n ? 1n : max;
  }, [data]);

  return (
    <Card data-testid={testIds.dashboard.cashflowChart} size="sm">
      <CardContent className="space-y-3 p-4">
        <div className="space-y-1">
          <p className="font-medium text-sm text-foreground">{title}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {en.shell.income}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              {en.shell.spending}
            </span>
          </div>
        </div>

        <ul className="grid grid-cols-6 gap-2">
          {data.map((point) => {
            const incomeHeight = toPercent(point.incomeMinor, maxMinor, 0);
            const expenseHeight = toPercent(point.expenseMinor, maxMinor, 0);
            return (
              <li
                className="space-y-1.5"
                data-testid={testIds.dashboard.cashflowChartMonth(point.monthKey)}
                key={point.monthKey}
              >
                <div className="flex h-28 items-end justify-center gap-1 rounded-md border border-border bg-muted/30 px-1 py-2">
                  <div
                    className="w-2.5 rounded-sm bg-emerald-500/90"
                    style={{ height: `${incomeHeight}%` }}
                  />
                  <div
                    className="w-2.5 rounded-sm bg-rose-500/90"
                    style={{ height: `${expenseHeight}%` }}
                  />
                </div>
                <p className="text-center text-[11px] text-muted-foreground">{point.monthLabel}</p>
              </li>
            );
          })}
        </ul>

        <p className="text-[11px] text-muted-foreground">
          {en.shell.latestPeriodSummary
            .replace("{income}", formatMoneyMinor(data.at(-1)?.incomeMinor ?? 0n, currencyCode))
            .replace("{spending}", formatMoneyMinor(data.at(-1)?.expenseMinor ?? 0n, currencyCode))}
        </p>
      </CardContent>
    </Card>
  );
}

function SpendingByCategoryChart({
  currencyCode,
  data,
  title,
}: {
  readonly currencyCode: string;
  readonly data: readonly SpendingCategoryPoint[];
  readonly title: string;
}) {
  const totalMinor = useMemo(
    () => data.reduce((sum, category) => sum + category.amountMinor, 0n),
    [data],
  );

  return (
    <Card data-testid={testIds.dashboard.categoryChart} size="sm">
      <CardContent className="space-y-3 p-4">
        <p className="font-medium text-sm text-foreground">{title}</p>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{en.shell.noCategorySpendData}</p>
        ) : (
          <div className="space-y-2">
            {data.map((item) => {
              const ratio =
                totalMinor > 0n ? Number((item.amountMinor * 10000n) / totalMinor) / 100 : 0;
              const CategoryIcon = getCategoryIconComponent(item.categoryIcon);
              return (
                <div
                  className="space-y-1"
                  data-testid={testIds.dashboard.categoryChartItem(item.categoryId)}
                  key={item.categoryId}
                >
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-full border border-black/10 dark:border-white/20"
                        style={{ backgroundColor: item.categoryColor ?? "#94a3b8" }}
                      />
                      {CategoryIcon ? (
                        <CategoryIcon
                          aria-hidden="true"
                          className="size-3.5 shrink-0 text-muted-foreground"
                        />
                      ) : (
                        <CircleOff
                          aria-hidden="true"
                          className="size-3.5 shrink-0 text-muted-foreground"
                        />
                      )}
                      <p className="truncate font-medium text-foreground">
                        {item.parentCategoryName
                          ? `${item.categoryName} · ${item.parentCategoryName}`
                          : item.categoryName}
                      </p>
                    </div>
                    <p className="shrink-0 text-muted-foreground">
                      {formatMoneyMinor(item.amountMinor, currencyCode)}
                    </p>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-rose-500/90"
                      style={{ width: `${toPercentByNumber(ratio, 4)}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <p className="text-[11px] text-muted-foreground">
              {en.shell.spendingWindowSummary
                .replace("{days}", CATEGORY_SERIES_WINDOW_DAYS.toString())
                .replace("{total}", formatMoneyMinor(totalMinor, currencyCode))}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function toPercent(value: bigint, max: bigint, minimumVisiblePercent: number): number {
  if (max <= 0n) {
    return 0;
  }

  const percent = Number((value * 10000n) / max) / 100;
  if (percent <= 0) {
    return 0;
  }

  return Math.max(minimumVisiblePercent, Math.min(100, percent));
}

function toPercentByNumber(value: number, minimumVisiblePercent: number): number {
  if (value <= 0) {
    return 0;
  }

  return Math.max(minimumVisiblePercent, Math.min(100, value));
}

function toAbsoluteBigInt(value: string): bigint {
  const minor = BigInt(value);
  return minor < 0n ? -minor : minor;
}

function toHalfPercent(value: bigint, max: bigint, minimumVisiblePercent: number): number {
  if (max <= 0n || value <= 0n) {
    return 0;
  }

  const percent = Number((value * 10000n) / max) / 100;
  const normalized = Math.max(minimumVisiblePercent, Math.min(100, percent));
  return normalized * 0.48;
}

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});

function formatMonth(monthStart: string): string {
  return MONTH_LABEL_FORMATTER.format(new Date(`${monthStart}T00:00:00.000Z`));
}
