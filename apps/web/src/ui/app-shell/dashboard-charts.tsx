import {
  type CategoryResponse,
  formatMoneyMinor,
  type NetWorthTrendResponse,
  type TransactionGroupResponse,
} from "@fastifly/common";
import { Card, CardContent } from "@ui/card";
import {
  Area,
  AreaChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { en } from "../../i18n/en";
import { testIds } from "../../testing/testid-registry";
import { CategoryToken } from "../category-metadata";
import {
  buildMonthlyCashflowSeries,
  buildSpendingByCategorySeries,
  type MonthlyCashflowPoint,
  type SpendingCategoryPoint,
} from "./dashboard-chart-data";
import { Separator } from "@/components/ui/separator";

const MONTHLY_SERIES_WINDOW = 6;
const CATEGORY_SERIES_LIMIT = 40;

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
  const latestMonthKey = monthlySeries.at(-1)?.monthKey ?? toMonthKey(now);
  const [selectedMonthKeyState, setSelectedMonthKeyState] = useState(latestMonthKey);
  const [selectedCategoryMonthKeyState, setSelectedCategoryMonthKeyState] = useState(latestMonthKey);
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const handleTooltipMonthChange = useCallback((monthKey: string) => {
    setIsTooltipVisible(true);
    setSelectedMonthKeyState((current) => (current === monthKey ? current : monthKey));
    setSelectedCategoryMonthKeyState((current) => (current === monthKey ? current : monthKey));
  }, []);
  useEffect(() => {
    if (!isTooltipVisible) {
      return undefined;
    }
    const handleOutsideInteraction = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest(".recharts-wrapper") || target.closest(".recharts-tooltip-wrapper")) {
        return;
      }
      setIsTooltipVisible(false);
    };
    document.addEventListener("mousedown", handleOutsideInteraction, true);
    document.addEventListener("touchstart", handleOutsideInteraction, true);
    return () => {
      document.removeEventListener("mousedown", handleOutsideInteraction, true);
      document.removeEventListener("touchstart", handleOutsideInteraction, true);
    };
  }, [isTooltipVisible]);
  const selectedCategoryMonthIndex = useMemo(() => {
    if (monthlySeries.length === 0) {
      return 0;
    }
    const index = monthlySeries.findIndex((point) => point.monthKey === selectedCategoryMonthKeyState);
    return index >= 0 ? index : monthlySeries.length - 1;
  }, [monthlySeries, selectedCategoryMonthKeyState]);
  const selectedCategoryMonth = monthlySeries[selectedCategoryMonthIndex];
  const selectedCategoryMonthKey = selectedCategoryMonth?.monthKey ?? latestMonthKey;
  const selectedCategoryMonthLabel =
    selectedCategoryMonth?.monthLabel ?? MONTH_LABEL_FORMATTER.format(now);
  const spendingCategorySeries = useMemo(
    () =>
      buildSpendingByCategorySeries({
        categories,
        fallbackCategoryId: "uncategorized",
        fallbackCategoryLabel: en.shell.spendingByCategoryUncategorized,
        journalType: "expense",
        limit: CATEGORY_SERIES_LIMIT,
        monthKey: selectedCategoryMonthKey,
        transactions,
      }),
    [categories, selectedCategoryMonthKey, transactions],
  );
  const incomeCategorySeries = useMemo(
    () =>
      buildSpendingByCategorySeries({
        categories,
        fallbackCategoryId: "uncategorized-income",
        fallbackCategoryLabel: en.shell.spendingByCategoryUncategorized,
        journalType: "income",
        limit: CATEGORY_SERIES_LIMIT,
        monthKey: selectedCategoryMonthKey,
        transactions,
      }),
    [categories, selectedCategoryMonthKey, transactions],
  );

  return (
    <div
      className="grid items-start gap-3 lg:grid-cols-3"
      data-testid={testIds.dashboard.chartsSection}
    >
      <NetWorthTrendChart
        className="lg:col-span-2"
        currencyCode={currencyCode}
        data={netWorthTrend}
        isTooltipVisible={isTooltipVisible}
        onMonthKeyChange={handleTooltipMonthChange}
        selectedMonthKey={selectedMonthKeyState}
        title={en.shell.netWorthTrend}
      />
      <CategoryBreakdownCard
        className="lg:row-span-2 lg:h-full lg:self-stretch"
        canGoNextMonth={selectedCategoryMonthIndex < monthlySeries.length - 1}
        canGoPreviousMonth={selectedCategoryMonthIndex > 0}
        currencyCode={currencyCode}
        incomeData={incomeCategorySeries}
        monthLabel={selectedCategoryMonthLabel}
        onNextMonth={() => {
          const nextMonth = monthlySeries[selectedCategoryMonthIndex + 1];
          if (nextMonth) {
            setSelectedCategoryMonthKeyState(nextMonth.monthKey);
          }
        }}
        onPreviousMonth={() => {
          const previousMonth = monthlySeries[selectedCategoryMonthIndex - 1];
          if (previousMonth) {
            setSelectedCategoryMonthKeyState(previousMonth.monthKey);
          }
        }}
        spendingData={spendingCategorySeries}
      />
      <MonthlyIncomeVsSpendingChart
        className="lg:col-span-2"
        currencyCode={currencyCode}
        data={monthlySeries}
        isTooltipVisible={isTooltipVisible}
        onMonthKeyChange={handleTooltipMonthChange}
        selectedMonthKey={selectedMonthKeyState}
        title={en.shell.incomeVsSpendingTrend}
      />
    </div>
  );
}

function NetWorthTrendChart({
  className,
  currencyCode,
  data,
  isTooltipVisible,
  onMonthKeyChange,
  selectedMonthKey,
  title,
}: {
  readonly className?: string;
  readonly currencyCode: string;
  readonly data: readonly NetWorthTrendResponse["data"]["points"][number][];
  readonly isTooltipVisible: boolean;
  readonly onMonthKeyChange: (monthKey: string) => void;
  readonly selectedMonthKey: string;
  readonly title: string;
}) {
  const gradientId = useId();
  const chartData = useMemo(
    () =>
      data.map((point) => ({
        changeMinorRaw: point.change.amountMinor,
        isDown: BigInt(point.change.amountMinor) < 0n,
        monthKey: point.monthKey,
        monthLabel: formatMonth(point.monthStart),
        netWorthMinor: toSafeChartNumber(BigInt(point.netWorth.amountMinor)),
      })),
    [data],
  );
  const selectedMonthIndex = useMemo(() => {
    if (chartData.length === 0) {
      return undefined;
    }
    const index = chartData.findIndex((point) => point.monthKey === selectedMonthKey);
    return index >= 0 ? index : chartData.length - 1;
  }, [chartData, selectedMonthKey]);

  const netChangeMinor = useMemo(() => {
    const firstMinor = BigInt(data[0]?.netWorth.amountMinor ?? "0");
    const lastMinor = BigInt(data.at(-1)?.netWorth.amountMinor ?? "0");
    return lastMinor - firstMinor;
  }, [data]);
  const currentNetWorthMinor = BigInt(data.at(-1)?.netWorth.amountMinor ?? "0");
  const absNetChangeMinor = netChangeMinor < 0n ? -netChangeMinor : netChangeMinor;
  const netChangePrefix = netChangeMinor > 0n ? "+" : netChangeMinor < 0n ? "-" : "";
  const currentNetWorthToneClass =
    currentNetWorthMinor < 0n ? "text-rose-700 dark:text-rose-300" : "text-foreground";
  const netWorthSeriesColor = currentNetWorthMinor < 0n ? "#e11d48" : "#10b981";
  const netWorthAreaColor = currentNetWorthMinor < 0n ? "#f43f5e" : "#10b981";
  const netChangeToneClass =
    netChangeMinor > 0n
      ? "text-emerald-700 dark:text-emerald-300"
      : netChangeMinor < 0n
        ? "text-rose-700 dark:text-rose-300"
        : "text-muted-foreground";

  return (
    <Card className={className} data-testid={testIds.dashboard.netWorthTrendChart} size="sm">
      <CardContent className="space-y-2 px-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-sm text-foreground">{title}</p>
          <p className={`text-right font-semibold text-[13px] leading-tight ${currentNetWorthToneClass}`}>
            {formatMoneyMinor(currentNetWorthMinor, currencyCode)}
          </p>
        </div>
        <div className="flex items-center justify-between gap-2">
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
          <p className={`text-right text-[11px] font-medium ${netChangeToneClass}`}>
            {netChangePrefix}
            {formatMoneyMinor(absNetChangeMinor, currencyCode)}
          </p>
        </div>

        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground">{en.shell.noNetWorthTrendData}</p>
        ) : (
          <>
            <div className="h-28">
              <ResponsiveContainer height="100%" width="100%">
                <AreaChart
                  accessibilityLayer
                  data={chartData}
                  margin={{ bottom: 12, left: 8, right: 8, top: 2 }}
                  onClick={(eventState) => {
                    const monthKey = getMonthKeyFromChartEvent(eventState, chartData);
                    if (monthKey) {
                      onMonthKeyChange(monthKey);
                    }
                  }}
                  onMouseMove={(eventState) => {
                    const monthKey = getMonthKeyFromChartEvent(eventState, chartData);
                    if (monthKey) {
                      onMonthKeyChange(monthKey);
                    }
                  }}
                  syncId="dashboard-month-sync"
                >
                  <defs>
                    <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor={netWorthAreaColor} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={netWorthAreaColor} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    axisLine={false}
                    dataKey="monthLabel"
                    interval={0}
                    minTickGap={0}
                    padding={{ left: 12, right: 12 }}
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    tickMargin={6}
                    tickLine={false}
                  />
                  <YAxis hide width={0} />
                  <Tooltip
                    active={isTooltipVisible && selectedMonthIndex !== undefined}
                    content={({ active, label, payload }) => {
                      if (!active) {
                        return null;
                      }
                      const first =
                        payload?.[0]?.payload as
                          | {
                              readonly changeMinorRaw: string;
                              readonly netWorthMinor: number;
                            }
                          | undefined;
                      if (!first) {
                        return null;
                      }
                      const netWorthMinor = BigInt(Math.trunc(first.netWorthMinor));
                      const netWorthToneClass =
                        netWorthMinor < 0n ? "text-rose-700 dark:text-rose-300" : "text-foreground";
                      const changeMinor = BigInt(first.changeMinorRaw);
                      const absChangeMinor = changeMinor < 0n ? -changeMinor : changeMinor;
                      const changePrefix = changeMinor > 0n ? "+" : changeMinor < 0n ? "-" : "";
                      const changeToneClass =
                        changeMinor > 0n
                          ? "text-emerald-600 dark:text-emerald-400"
                          : changeMinor < 0n
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-muted-foreground";
                      return (
                        <div className="min-w-[12rem] rounded-md border border-border bg-background px-2 py-1.5 text-[11px] shadow-sm">
                          <p className="mb-1 font-medium text-foreground">{String(label)}</p>
                          <div className="grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5">
                            <p className="text-muted-foreground">Net worth</p>
                            <p className={`text-right font-medium ${netWorthToneClass}`}>
                              {formatMoneyMinor(netWorthMinor, currencyCode)}
                            </p>
                            <p className="text-muted-foreground">Change</p>
                            <p className={`text-right font-medium ${changeToneClass}`}>
                              {changePrefix}
                              {formatMoneyMinor(absChangeMinor, currencyCode)}
                            </p>
                          </div>
                        </div>
                      );
                    }}
                    cursor={{ stroke: netWorthSeriesColor, strokeOpacity: 0.3 }}
                    defaultIndex={isTooltipVisible ? selectedMonthIndex : undefined}
                  />
                  <Area
                    dataKey="netWorthMinor"
                    dot={(props) => {
                      const point = props as {
                        readonly cx?: number;
                        readonly cy?: number;
                        readonly payload?: { readonly isDown?: boolean };
                      };
                      if (typeof point.cx !== "number" || typeof point.cy !== "number") {
                        return null;
                      }
                      const isDown = point.payload?.isDown === true;
                      return (
                        <circle
                          cx={point.cx}
                          cy={point.cy}
                          fill={isDown ? "#f43f5e" : "#10b981"}
                          r={isDown ? 3.5 : 2.5}
                          stroke="#ffffff"
                          strokeWidth={1}
                        />
                      );
                    }}
                    fill={`url(#${gradientId})`}
                    stroke={netWorthSeriesColor}
                    strokeWidth={2}
                    type="monotone"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="sr-only">
              {chartData.map((point) => (
                <span data-testid={testIds.dashboard.netWorthTrendChartMonth(point.monthKey)} key={point.monthKey} />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MonthlyIncomeVsSpendingChart({
  className,
  currencyCode,
  data,
  isTooltipVisible,
  onMonthKeyChange,
  selectedMonthKey,
  title,
}: {
  readonly className?: string;
  readonly currencyCode: string;
  readonly data: readonly MonthlyCashflowPoint[];
  readonly isTooltipVisible: boolean;
  readonly onMonthKeyChange: (monthKey: string) => void;
  readonly selectedMonthKey: string;
  readonly title: string;
}) {
  const chartData = useMemo(
    () =>
      data.map((point, index) => {
        const previous = index > 0 ? data[index - 1] : undefined;
        const savingsMinor = point.incomeMinor - point.expenseMinor;
        const previousSavingsMinor =
          previous === undefined ? null : previous.incomeMinor - previous.expenseMinor;
        return {
          expenseChangeMinorRaw:
            previous === undefined ? "0" : (point.expenseMinor - previous.expenseMinor).toString(),
          expenseDirectionGood:
            previous === undefined ? null : point.expenseMinor < previous.expenseMinor,
          expenseMinorRaw: point.expenseMinor.toString(),
          expenseMinor: toSafeChartNumber(point.expenseMinor),
          hasPrevious: previous !== undefined,
          incomeChangeMinorRaw:
            previous === undefined ? "0" : (point.incomeMinor - previous.incomeMinor).toString(),
          incomeDirectionGood:
            previous === undefined ? null : point.incomeMinor > previous.incomeMinor,
          incomeMinorRaw: point.incomeMinor.toString(),
          incomeMinor: toSafeChartNumber(point.incomeMinor),
          monthKey: point.monthKey,
          monthLabel: point.monthLabel,
          savingsChangeMinorRaw:
            previousSavingsMinor === null ? "0" : (savingsMinor - previousSavingsMinor).toString(),
          savingsMinorRaw: savingsMinor.toString(),
        };
      }),
    [data],
  );
  const selectedMonthIndex = useMemo(() => {
    if (chartData.length === 0) {
      return undefined;
    }
    const index = chartData.findIndex((point) => point.monthKey === selectedMonthKey);
    return index >= 0 ? index : chartData.length - 1;
  }, [chartData, selectedMonthKey]);

  return (
    <Card className={className} data-testid={testIds.dashboard.cashflowChart} size="sm">
      <CardContent className="space-y-2 px-3">
        <p className="font-medium text-sm text-foreground">{title}</p>
        <div className="space-y-1">
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

        <div className="h-28">
          <ResponsiveContainer height="100%" width="100%">
            <LineChart
              accessibilityLayer
              data={chartData}
              margin={{ bottom: 12, left: 8, right: 8, top: 2 }}
              onClick={(eventState) => {
                const monthKey = getMonthKeyFromChartEvent(eventState, chartData);
                if (monthKey) {
                  onMonthKeyChange(monthKey);
                }
              }}
              onMouseMove={(eventState) => {
                const monthKey = getMonthKeyFromChartEvent(eventState, chartData);
                if (monthKey) {
                  onMonthKeyChange(monthKey);
                }
              }}
              syncId="dashboard-month-sync"
            >
              <XAxis
                axisLine={false}
                dataKey="monthLabel"
                interval={0}
                minTickGap={0}
                padding={{ left: 12, right: 12 }}
                tick={{ fill: "#6b7280", fontSize: 11 }}
                tickMargin={6}
                tickLine={false}
              />
              <YAxis hide width={0} />
              <Tooltip
                active={isTooltipVisible && selectedMonthIndex !== undefined}
                content={({ active, label, payload }) => {
                  if (!active) {
                    return null;
                  }
                  const first =
                    payload?.[0]?.payload as
                      | {
                          readonly expenseChangeMinorRaw: string;
                          readonly expenseMinorRaw: string;
                          readonly hasPrevious: boolean;
                          readonly incomeChangeMinorRaw: string;
                          readonly incomeMinorRaw: string;
                          readonly savingsChangeMinorRaw: string;
                          readonly savingsMinorRaw: string;
                        }
                      | undefined;
                  if (!first) {
                    return null;
                  }
                  const savingsMinor = BigInt(first.savingsMinorRaw);
                  const absSavingsMinor = savingsMinor < 0n ? -savingsMinor : savingsMinor;
                  const savingsPrefix = savingsMinor > 0n ? "+" : savingsMinor < 0n ? "-" : "";
                  const savingsToneClass =
                    savingsMinor > 0n
                      ? "text-emerald-600 dark:text-emerald-400"
                      : savingsMinor < 0n
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-muted-foreground";
                  const incomeChangeMinor = BigInt(first.incomeChangeMinorRaw);
                  const absIncomeChangeMinor =
                    incomeChangeMinor < 0n ? -incomeChangeMinor : incomeChangeMinor;
                  const incomeChangePrefix =
                    incomeChangeMinor > 0n ? "+" : incomeChangeMinor < 0n ? "-" : "";
                  const incomeChangeToneClass = !first.hasPrevious
                    ? "text-muted-foreground"
                    : incomeChangeMinor >= 0n
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400";
                  const expenseChangeMinor = BigInt(first.expenseChangeMinorRaw);
                  const absExpenseChangeMinor =
                    expenseChangeMinor < 0n ? -expenseChangeMinor : expenseChangeMinor;
                  const expenseChangePrefix =
                    expenseChangeMinor > 0n ? "+" : expenseChangeMinor < 0n ? "-" : "";
                  const expenseChangeToneClass = !first.hasPrevious
                    ? "text-muted-foreground"
                    : expenseChangeMinor <= 0n
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400";
                  const savingsChangeMinor = BigInt(first.savingsChangeMinorRaw);
                  const absSavingsChangeMinor =
                    savingsChangeMinor < 0n ? -savingsChangeMinor : savingsChangeMinor;
                  const savingsChangePrefix =
                    savingsChangeMinor > 0n ? "+" : savingsChangeMinor < 0n ? "-" : "";
                  const savingsChangeToneClass = !first.hasPrevious
                    ? "text-muted-foreground"
                    : savingsChangeMinor >= 0n
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400";

                  return (
                    <div className="min-w-[12.25rem] rounded-md border border-border bg-background px-1.5 py-1 text-[11px] shadow-sm">
                      <p className="mb-1 font-medium text-foreground">{String(label)}</p>
                      <div className="grid grid-cols-[auto_auto_auto] gap-x-1.5 gap-y-0.5">
                        <p />
                        <p className="text-right text-[10px] text-muted-foreground/85">Amount</p>
                        <p className="text-right text-[10px] text-muted-foreground/85">Change</p>
                        <p className="text-muted-foreground">{en.shell.income}</p>
                        <p className="text-right font-medium text-emerald-600 dark:text-emerald-400">
                          {formatMoneyMinorCompact(BigInt(first.incomeMinorRaw), currencyCode)}
                        </p>
                        <p className={`text-right font-medium ${incomeChangeToneClass}`}>
                          {first.hasPrevious
                            ? `${incomeChangePrefix}${formatMoneyMinorCompact(absIncomeChangeMinor, currencyCode)}`
                            : "—"}
                        </p>
                        <p className="text-muted-foreground">{en.shell.spending}</p>
                        <p className="text-right font-medium text-rose-600 dark:text-rose-400">
                          {formatMoneyMinorCompact(BigInt(first.expenseMinorRaw), currencyCode)}
                        </p>
                        <p className={`text-right font-medium ${expenseChangeToneClass}`}>
                          {first.hasPrevious
                            ? `${expenseChangePrefix}${formatMoneyMinorCompact(absExpenseChangeMinor, currencyCode)}`
                            : "—"}
                        </p>
                        <p className="text-muted-foreground">{en.shell.savings}</p>
                        <p className={`text-right font-medium ${savingsToneClass}`}>
                          {savingsPrefix}
                          {formatMoneyMinorCompact(absSavingsMinor, currencyCode)}
                        </p>
                        <p className={`text-right font-medium ${savingsChangeToneClass}`}>
                          {first.hasPrevious
                            ? `${savingsChangePrefix}${formatMoneyMinorCompact(absSavingsChangeMinor, currencyCode)}`
                            : "—"}
                        </p>
                      </div>
                    </div>
                  );
                }}
                cursor={{ stroke: "#64748b", strokeOpacity: 0.3 }}
                defaultIndex={isTooltipVisible ? selectedMonthIndex : undefined}
              />
              <Line
                dataKey="incomeMinor"
                dot={(props) => {
                  const point = props as {
                    readonly cx?: number;
                    readonly cy?: number;
                    readonly payload?: { readonly incomeDirectionGood?: boolean | null };
                  };
                  if (typeof point.cx !== "number" || typeof point.cy !== "number") {
                    return null;
                  }
                  const isGood = point.payload?.incomeDirectionGood;
                  return (
                    <circle
                      cx={point.cx}
                      cy={point.cy}
                      fill={isGood === null ? "#94a3b8" : isGood ? "#10b981" : "#e11d48"}
                      r={isGood === null ? 2.5 : 3.5}
                      stroke="#ffffff"
                      strokeWidth={1}
                    />
                  );
                }}
                stroke="#10b981"
                strokeWidth={2}
                type="monotone"
              />
              <Line
                dataKey="expenseMinor"
                dot={(props) => {
                  const point = props as {
                    readonly cx?: number;
                    readonly cy?: number;
                    readonly payload?: { readonly expenseDirectionGood?: boolean | null };
                  };
                  if (typeof point.cx !== "number" || typeof point.cy !== "number") {
                    return null;
                  }
                  return (
                    <circle
                      cx={point.cx}
                      cy={point.cy}
                      fill={
                        point.payload?.expenseDirectionGood === null
                          ? "#94a3b8"
                          : point.payload?.expenseDirectionGood
                            ? "#10b981"
                            : "#e11d48"
                      }
                      r={point.payload?.expenseDirectionGood === null ? 2.5 : 3.5}
                      stroke="#ffffff"
                      strokeWidth={1}
                    />
                  );
                }}
                stroke="#f43f5e"
                strokeWidth={2}
                type="monotone"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="sr-only">
          {chartData.map((point) => (
            <span data-testid={testIds.dashboard.cashflowChartMonth(point.monthKey)} key={point.monthKey} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryBreakdownCard({
  canGoNextMonth,
  canGoPreviousMonth,
  className,
  currencyCode,
  incomeData,
  monthLabel,
  onNextMonth,
  onPreviousMonth,
  spendingData,
}: {
  readonly canGoNextMonth: boolean;
  readonly canGoPreviousMonth: boolean;
  readonly className?: string;
  readonly currencyCode: string;
  readonly incomeData: readonly SpendingCategoryPoint[];
  readonly monthLabel: string;
  readonly onNextMonth: () => void;
  readonly onPreviousMonth: () => void;
  readonly spendingData: readonly SpendingCategoryPoint[];
}) {
  const spendingTotalMinor = useMemo(
    () => spendingData.reduce((sum, category) => sum + category.amountMinor, 0n),
    [spendingData],
  );
  const incomeTotalMinor = useMemo(
    () => incomeData.reduce((sum, category) => sum + category.amountMinor, 0n),
    [incomeData],
  );
  const spendingProgressData = useMemo(
    () => buildCategoryProgressData(spendingData, spendingTotalMinor),
    [spendingData, spendingTotalMinor],
  );
  const incomeProgressData = useMemo(
    () => buildCategoryProgressData(incomeData, incomeTotalMinor),
    [incomeData, incomeTotalMinor],
  );

  return (
    <Card className={className} data-testid={testIds.dashboard.categoryChart} size="sm">
      <CardContent className="flex h-full min-h-0 flex-col space-y-2 px-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-sm text-foreground">{en.shell.topCategories}</p>
          <div className="flex items-center gap-1">
            <button
              aria-label={en.shell.previousMonth}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground text-xs transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canGoPreviousMonth}
              onClick={onPreviousMonth}
              type="button"
            >
              {"<"}
            </button>
            <span className="min-w-[2.75rem] text-center font-medium text-[11px] text-foreground">
              {monthLabel}
            </span>
            <button
              aria-label={en.shell.nextMonth}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground text-xs transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canGoNextMonth}
              onClick={onNextMonth}
              type="button"
            >
              {">"}
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <CategoryBreakdownSection
            currencyCode={currencyCode}
            data={spendingProgressData}
            emptyStateTemplate={en.shell.noCategorySpendDataForMonth}
            monthLabel={monthLabel}
            title={en.shell.spending}
          />
          <CategoryBreakdownSection
            currencyCode={currencyCode}
            data={incomeProgressData}
            emptyStateTemplate={en.shell.noCategoryIncomeDataForMonth}
            monthLabel={monthLabel}
            title={en.shell.income}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryBreakdownSection({
  currencyCode,
  data,
  emptyStateTemplate,
  monthLabel,
  title,
}: {
  readonly currencyCode: string;
  readonly data: readonly {
    readonly amountMinorRaw: bigint;
    readonly barColor: string;
    readonly categoryColor: string | null;
    readonly categoryIcon: string | null;
    readonly categoryId: string;
    readonly categoryName: string;
    readonly parentCategoryName: string | null;
    readonly share: number;
  }[];
  readonly emptyStateTemplate: string;
  readonly monthLabel: string;
  readonly title: string;
}) {
  const [renderData, setRenderData] = useState(data);
  const [animatedHeight, setAnimatedHeight] = useState<number | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);
  const resizeRafRef = useRef<number | null>(null);
  const hasMountedRef = useRef(false);
  const lastAppliedSignatureRef = useRef<string | null>(null);
  const dataSignature = useMemo(
    () =>
      [...data]
        .sort((a, b) => a.categoryId.localeCompare(b.categoryId))
        .map((item) => `${item.categoryId}:${item.amountMinorRaw.toString()}:${item.barColor}`)
        .join("|"),
    [data],
  );

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      setRenderData(data);
      lastAppliedSignatureRef.current = dataSignature;
      return undefined;
    }

    if (lastAppliedSignatureRef.current === dataSignature) {
      return undefined;
    }
    lastAppliedSignatureRef.current = dataSignature;

    const startHeight = contentRef.current?.getBoundingClientRect().height;
    if (typeof startHeight === "number" && Number.isFinite(startHeight)) {
      setAnimatedHeight(startHeight);
    }

    setRenderData(data);

    if (resizeRafRef.current !== null) {
      window.cancelAnimationFrame(resizeRafRef.current);
    }
    resizeRafRef.current = window.requestAnimationFrame(() => {
      const nextHeight = contentRef.current?.scrollHeight;
      if (typeof nextHeight === "number" && Number.isFinite(nextHeight)) {
        setAnimatedHeight(nextHeight);
      }
      resizeRafRef.current = null;
    });
    return () => {
      if (resizeRafRef.current !== null) {
        window.cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
    };
  }, [data, dataSignature]);

  useEffect(() => {
    return () => {
      if (resizeRafRef.current !== null) {
        window.cancelAnimationFrame(resizeRafRef.current);
      }
    };
  }, []);

  const renderedTotalMinor = useMemo(
    () => renderData.reduce((sum, item) => sum + item.amountMinorRaw, 0n),
    [renderData],
  );

  return (
    <section className="space-y-2">
      <p className="font-semibold text-foreground">{title}</p>
      <div
        className="overflow-hidden transition-[height] duration-200"
        onTransitionEnd={(event) => {
          if (event.propertyName === "height") {
            setAnimatedHeight(null);
          }
        }}
        style={animatedHeight === null ? undefined : { height: `${animatedHeight}px` }}
      >
        {renderData.length === 0 ? (
          <p className="text-sm text-muted-foreground" ref={contentRef}>
            {emptyStateTemplate.replace("{month}", monthLabel)}
          </p>
        ) : (
          <div className="space-y-1.5" ref={contentRef}>
            {renderData.map((item) => (
              <div
                className="space-y-1"
                data-testid={testIds.dashboard.categoryChartItem(item.categoryId)}
                key={item.categoryId}
              >
                <div className="flex items-center justify-between gap-2 text-[12px]">
                  <p className="min-w-0 truncate font-medium text-foreground">
                    {CategoryToken({
                      color: item.categoryColor,
                      icon: item.categoryIcon,
                      name: item.categoryName,
                      parentName: item.parentCategoryName,
                    })}
                  </p>
                  <p className="shrink-0 text-muted-foreground">
                    {formatMoneyMinor(item.amountMinorRaw, currencyCode)}
                  </p>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-[width] duration-300 ease-out"
                    style={{
                      backgroundColor: item.barColor,
                      width: `${item.share > 0 ? Math.max(item.share, 2) : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {renderData.length > 0 ? (
        <>
          <Separator className="mt-3"></Separator>
          <p className="text-right text-[12px] text-foreground">
            {en.shell.spendingMonthSummary
              .replace("{month}", monthLabel)
              .replace("{total}", formatMoneyMinor(renderedTotalMinor, currencyCode))}
          </p>
        </>
      ) : null}
    </section>
  );
}

function buildCategoryProgressData(
  categories: readonly SpendingCategoryPoint[],
  totalMinor: bigint,
): readonly {
  amountMinorRaw: bigint;
  barColor: string;
  categoryColor: string | null;
  categoryIcon: string | null;
  categoryId: string;
  categoryName: string;
  parentCategoryName: string | null;
  share: number;
}[] {
  return categories.map((item, index) => ({
    amountMinorRaw: item.amountMinor,
    barColor:
      item.categoryColor ?? getStableCategoryFallbackColor(item.categoryId),
    categoryColor: item.categoryColor,
    categoryIcon: item.categoryIcon,
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    parentCategoryName: item.parentCategoryName,
    share:
      totalMinor > 0n
        ? Number((item.amountMinor * 10000n) / totalMinor) / 100
        : 0,
  }));
}

const CATEGORY_PROGRESS_FALLBACK_COLORS = [
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#0ea5e9",
  "#8b5cf6",
] as const;

function getStableCategoryFallbackColor(categoryId: string): string {
  let hash = 0;
  for (let index = 0; index < categoryId.length; index += 1) {
    hash = (hash * 31 + categoryId.charCodeAt(index)) >>> 0;
  }
  return CATEGORY_PROGRESS_FALLBACK_COLORS[hash % CATEGORY_PROGRESS_FALLBACK_COLORS.length];
}

function toSafeChartNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number.MAX_SAFE_INTEGER;
  }
  if (value < BigInt(Number.MIN_SAFE_INTEGER)) {
    return Number.MIN_SAFE_INTEGER;
  }
  return Number(value);
}

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});
const STANDARD_CURRENCY_FORMATTER_BY_CODE = new Map<string, Intl.NumberFormat>();
const COMPACT_CURRENCY_FORMATTER_BY_CODE = new Map<string, Intl.NumberFormat>();
const CURRENCY_SYMBOL_BY_CODE = new Map<string, string>();

function formatMonth(monthStart: string): string {
  return MONTH_LABEL_FORMATTER.format(new Date(`${monthStart}T00:00:00.000Z`));
}

function toMonthKey(date: Date): string {
  const year = date.getUTCFullYear().toString();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${year}-${month}`;
}

function getMonthKeyFromChartEvent(
  eventState: unknown,
  data: readonly {
    readonly monthKey: string;
    readonly monthLabel: string;
  }[],
): string | null {
  if (typeof eventState !== "object" || eventState === null) {
    return null;
  }
  const isTooltipActive = (eventState as { readonly isTooltipActive?: unknown }).isTooltipActive;
  if (isTooltipActive !== true) {
    return null;
  }
  const activeTooltipIndex = (eventState as { readonly activeTooltipIndex?: unknown }).activeTooltipIndex;
  if (typeof activeTooltipIndex === "number" && Number.isFinite(activeTooltipIndex)) {
    const point = data[activeTooltipIndex];
    if (point) {
      return point.monthKey;
    }
  }
  const activeLabel = (eventState as { readonly activeLabel?: unknown }).activeLabel;
  if (typeof activeLabel === "string" || typeof activeLabel === "number") {
    const labelText = String(activeLabel);
    const point = data.find((entry) => entry.monthLabel === labelText || entry.monthKey === labelText);
    if (point) {
      return point.monthKey;
    }
  }
  const activePayload = (eventState as { readonly activePayload?: unknown }).activePayload;
  if (!Array.isArray(activePayload) || activePayload.length === 0) {
    return null;
  }
  const firstPayload = activePayload[0] as
    | {
        readonly payload?: {
          readonly monthKey?: unknown;
        };
      }
    | undefined;
  const monthKey = firstPayload?.payload?.monthKey;
  return typeof monthKey === "string" ? monthKey : null;
}

function formatMoneyMinorCompact(amountMinor: bigint, currencyCode: string): string {
  const isNegative = amountMinor < 0n;
  const absMinor = isNegative ? -amountMinor : amountMinor;
  const amountMajor = toSafeChartNumber(absMinor) / 100;

  let rendered: string;
  if (currencyCode === "INR" && amountMajor >= 10000000) {
    rendered = `${getCurrencySymbol(currencyCode)}${formatIndianShortNumber(amountMajor / 10000000)}Cr`;
  } else if (currencyCode === "INR" && amountMajor >= 100000) {
    rendered = `${getCurrencySymbol(currencyCode)}${formatIndianShortNumber(amountMajor / 100000)}L`;
  } else if (currencyCode !== "INR") {
    rendered = getCompactCurrencyFormatter(currencyCode).format(amountMajor);
  } else {
    rendered = getStandardCurrencyFormatter(currencyCode).format(amountMajor);
  }

  return isNegative ? `-${rendered}` : rendered;
}

function getStandardCurrencyFormatter(currencyCode: string): Intl.NumberFormat {
  const cached = STANDARD_CURRENCY_FORMATTER_BY_CODE.get(currencyCode);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  STANDARD_CURRENCY_FORMATTER_BY_CODE.set(currencyCode, formatter);
  return formatter;
}

function getCompactCurrencyFormatter(currencyCode: string): Intl.NumberFormat {
  const cached = COMPACT_CURRENCY_FORMATTER_BY_CODE.get(currencyCode);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.NumberFormat("en-US", {
    compactDisplay: "short",
    maximumFractionDigits: 1,
    notation: "compact",
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 0,
  });
  COMPACT_CURRENCY_FORMATTER_BY_CODE.set(currencyCode, formatter);
  return formatter;
}

function getCurrencySymbol(currencyCode: string): string {
  const cached = CURRENCY_SYMBOL_BY_CODE.get(currencyCode);
  if (cached) {
    return cached;
  }
  const symbolFormatter = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currencyCode,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  const symbol = symbolFormatter.formatToParts(0).find((part) => part.type === "currency")?.value ?? currencyCode;
  CURRENCY_SYMBOL_BY_CODE.set(currencyCode, symbol);
  return symbol;
}

function formatIndianShortNumber(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: value >= 10 ? 0 : 1,
  }).format(value);
}
