import { formatMoneyMinor } from "@fastifly/common";
import { Badge } from "@ui/badge";
import { Card } from "@ui/card";
import { en } from "../../i18n/en";
import { testIds } from "../../testing/testid-registry";
import { formatBudgetPeriodLabel } from "./utils";

type BudgetSummary = {
  readonly id: string;
  readonly limit: { readonly amountMinor: string; readonly currencyCode: string };
  readonly name: string;
  readonly period: string;
  readonly remaining: { readonly amountMinor: string; readonly currencyCode: string };
  readonly spent: { readonly amountMinor: string; readonly currencyCode: string };
};

export function BudgetSummaryCard({ budget }: { readonly budget: BudgetSummary }) {
  const limitMinor = BigInt(budget.limit.amountMinor);
  const spentMinor = BigInt(budget.spent.amountMinor);
  const remainingMinor = BigInt(budget.remaining.amountMinor);
  const spentRatio = limitMinor > 0n ? Number((spentMinor * 100n) / limitMinor) : 0;

  return (
    <Card
      className="border border-border bg-card p-4 text-card-foreground shadow-sm"
      data-testid={testIds.budgets.card(budget.id)}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium text-[15px]" data-testid={testIds.budgets.cardName(budget.id)}>
          {budget.name}
        </h3>
        <Badge variant="outline" data-testid={testIds.budgets.cardPeriod(budget.id)}>
          {formatBudgetPeriodLabel(budget.period)}
        </Badge>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
        <BudgetAmountCell
          label={en.budgets.limit}
          testId={testIds.budgets.cardLimit(budget.id)}
          value={formatMoneyMinor(limitMinor, budget.limit.currencyCode)}
        />
        <BudgetAmountCell
          label={en.budgets.spent}
          testId={testIds.budgets.cardSpent(budget.id)}
          value={formatMoneyMinor(spentMinor, budget.spent.currencyCode)}
        />
        <BudgetAmountCell
          label={en.budgets.remaining}
          testId={testIds.budgets.cardRemaining(budget.id)}
          value={formatMoneyMinor(remainingMinor, budget.remaining.currencyCode)}
        />
      </div>
      <p
        className="mt-3 text-[12px] text-slate-600 dark:text-white/62"
        data-testid={testIds.budgets.cardSpentRate(budget.id)}
      >
        {en.budgets.spentRate.replace("{value}", `${spentRatio}%`)}
      </p>
    </Card>
  );
}

export function BudgetAmountCell({
  label,
  testId,
  value,
}: {
  readonly label: string;
  readonly testId: string;
  readonly value: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-slate-500 dark:text-white/50">{label}</span>
      <span className="font-medium" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}
