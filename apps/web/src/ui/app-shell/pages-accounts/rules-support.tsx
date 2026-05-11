import type { RuleResponse } from "@fastifly/common";
import { Input } from "@ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { en } from "../../../i18n/en";

export type RuleTypeOption = "any" | "expense" | "income" | "transfer";

export type RuleFormState = {
  readonly amountMax: string;
  readonly amountMin: string;
  readonly descriptionContains: string;
  readonly enabled: boolean;
  readonly name: string;
  readonly status: RuleResponse["action"]["status"];
  readonly type: RuleTypeOption;
};

export const RULE_STATUS_OPTIONS = [
  { label: en.transactions.statuses.pending, value: "pending" },
  { label: en.transactions.statuses.cleared, value: "cleared" },
  { label: en.transactions.statuses.reconciled, value: "reconciled" },
  { label: "Void", value: "void" },
] as const;

export const RULE_TYPE_OPTIONS = [
  { label: en.rules.anyType, value: "any" },
  { label: en.transactions.types.expense, value: "expense" },
  { label: en.transactions.types.income, value: "income" },
  { label: en.transactions.types.transfer, value: "transfer" },
] as const;

export function defaultRuleFormState(): RuleFormState {
  return {
    amountMax: "",
    amountMin: "",
    descriptionContains: "",
    enabled: true,
    name: "",
    status: "cleared",
    type: "any",
  };
}

export function ruleToFormState(rule: RuleResponse): RuleFormState {
  return {
    amountMax: rule.condition.amountMaxMinor ?? "",
    amountMin: rule.condition.amountMinMinor ?? "",
    descriptionContains: rule.condition.descriptionContains ?? "",
    enabled: rule.enabled,
    name: rule.name,
    status: rule.action.status,
    type: rule.condition.type ?? "any",
  };
}

export function toRuleCondition(form: RuleFormState): RuleResponse["condition"] | null {
  const condition: RuleResponse["condition"] = {};
  const descriptionContains = form.descriptionContains.trim();
  const amountMin = form.amountMin.trim();
  const amountMax = form.amountMax.trim();

  if (form.type !== "any") {
    condition.type = form.type;
  }
  if (descriptionContains) {
    condition.descriptionContains = descriptionContains;
  }
  if (amountMin) {
    condition.amountMinMinor = amountMin;
  }
  if (amountMax) {
    condition.amountMaxMinor = amountMax;
  }

  return Object.keys(condition).length > 0 ? condition : null;
}

export function RuleSummaryItem({
  title,
  value,
}: {
  readonly title: string;
  readonly value: string;
}) {
  return (
    <div className="space-y-1 rounded-md border border-border bg-muted/40 p-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <p className="text-[14px] leading-snug text-foreground">{value}</p>
    </div>
  );
}

export function RuleInput({
  label,
  onChange,
  testId,
  value,
}: {
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly testId: string;
  readonly value: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] leading-tight font-semibold text-muted-foreground">{label}</p>
      <Input
        data-testid={testId}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </div>
  );
}

export function RuleSelect({
  label,
  onValueChange,
  options,
  testId,
  value,
}: {
  readonly label: string;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  readonly testId: string;
  readonly value: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] leading-tight font-semibold text-muted-foreground">{label}</p>
      <Select onValueChange={onValueChange} value={value}>
        <SelectTrigger className="w-full" data-testid={testId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

export function formatRuleCondition(rule: RuleResponse): string {
  const { condition } = rule;
  const segments: string[] = [];

  if (condition.type) {
    segments.push(en.rules.conditionType.replace("{value}", getRuleTypeLabel(condition.type)));
  }
  if (condition.descriptionContains) {
    segments.push(
      en.rules.conditionDescriptionContains.replace("{value}", condition.descriptionContains),
    );
  }
  if (condition.amountMinMinor) {
    segments.push(en.rules.conditionAmountMin.replace("{value}", condition.amountMinMinor));
  }
  if (condition.amountMaxMinor) {
    segments.push(en.rules.conditionAmountMax.replace("{value}", condition.amountMaxMinor));
  }

  if (segments.length === 0) {
    return en.rules.conditionFallback;
  }

  return segments.join(" · ");
}

export function formatRuleAction(rule: RuleResponse): string {
  return en.rules.actionSummary.replace("{status}", formatRuleStatus(rule.action.status));
}

export function formatRuleStatus(status: RuleResponse["action"]["status"]): string {
  if (status === "pending") {
    return en.transactions.statuses.pending;
  }
  if (status === "cleared") {
    return en.transactions.statuses.cleared;
  }
  if (status === "reconciled") {
    return en.transactions.statuses.reconciled;
  }

  return "Void";
}

function getRuleTypeLabel(type: RuleResponse["condition"]["type"]): string {
  if (type === "expense") {
    return en.transactions.types.expense;
  }
  if (type === "income") {
    return en.transactions.types.income;
  }
  if (type === "transfer") {
    return en.transactions.types.transfer;
  }

  return en.rules.conditionFallback;
}
