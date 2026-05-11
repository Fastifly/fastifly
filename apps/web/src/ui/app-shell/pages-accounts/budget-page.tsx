import { ArrowDownLeft, ArrowUpRight, ShieldCheck, WalletCards } from "lucide-react";
import { useBudgetsQuery } from "../../../api/queries";
import { en } from "../../../i18n/en";
import { testIds } from "../../../testing/testid-registry";
import { BudgetSummaryCard } from "../budget-components";
import { GlassSection, MetricTile } from "../shared-components";
import type { BudgetPageProps } from "./types";

export function BudgetPage({
  cashflow,
  income,
  ledgerContext,
  spending,
  spendingRate,
}: BudgetPageProps) {
  const budgetsQuery = useBudgetsQuery(ledgerContext, { limit: 50 });
  const budgets = budgetsQuery.data?.data ?? [];

  return (
    <section className="ff-single-page space-y-4" data-testid={testIds.budgets.page}>
      <GlassSection title={en.shell.budgetWatch} description={en.shell.budgetWatchBody}>
        <div
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
          data-testid={testIds.budgets.summary}
        >
          <MetricTile
            icon={ArrowDownLeft}
            label={en.shell.incomeThisMonth}
            testId={testIds.budgets.incomeMetric}
            value={income}
            tone="green"
          />
          <MetricTile
            icon={ArrowUpRight}
            label={en.shell.spentThisMonth}
            testId={testIds.budgets.spendingMetric}
            value={spending}
            tone="rose"
          />
          <MetricTile
            icon={WalletCards}
            label={en.shell.availableAfterSpending}
            testId={testIds.budgets.availableMetric}
            value={cashflow}
          />
          <MetricTile
            icon={ShieldCheck}
            label={en.shell.spendingRate}
            testId={testIds.budgets.spendingRateMetric}
            value={spendingRate}
          />
        </div>
      </GlassSection>
      <GlassSection title={en.budgets.listTitle} description={en.budgets.listDescription}>
        <div className="grid gap-3 md:grid-cols-2" data-testid={testIds.budgets.list}>
          {budgets.length > 0 ? (
            budgets.map((budget) => <BudgetSummaryCard budget={budget} key={budget.id} />)
          ) : (
            <p
              className="text-[14px] text-slate-600 dark:text-white/62"
              data-testid={testIds.budgets.emptyState}
            >
              {budgetsQuery.isPending
                ? en.shell.loadingData
                : budgetsQuery.isError
                  ? en.budgets.loadError
                  : en.budgets.emptyState}
            </p>
          )}
        </div>
      </GlassSection>
    </section>
  );
}
