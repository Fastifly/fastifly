import type { AccountWithBalanceResponse } from "@fastifly/common";
import { Field, FieldLabel, FieldError as ShadcnFieldError } from "@ui/field";
import { Label } from "@ui/label";
import { RadioGroup, RadioGroupItem } from "@ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import type { ReactNode } from "react";
import { en } from "../../../i18n/en";

type ChoiceOption = {
  readonly label: string;
  readonly value: string;
};

export function AccountChooser({
  onValueChange,
  options,
  preferredOptionIds = [],
  selectTestId,
  value,
}: {
  readonly onValueChange: (accountId: string) => void;
  readonly options: readonly AccountWithBalanceResponse[];
  readonly preferredOptionIds?: readonly string[];
  readonly selectTestId: string;
  readonly value: string;
}) {
  const mappedOptions = options.map((account) => ({
    label: account.name,
    value: account.id,
  }));

  return (
    <OptionChooser
      onValueChange={onValueChange}
      options={mappedOptions}
      preferredOptionIds={preferredOptionIds}
      selectTestId={selectTestId}
      value={value}
    />
  );
}

export function OptionChooser({
  onValueChange,
  options,
  preferredOptionIds = [],
  selectTestId,
  value,
}: {
  readonly onValueChange: (value: string) => void;
  readonly options: readonly ChoiceOption[];
  readonly preferredOptionIds?: readonly string[];
  readonly selectTestId: string;
  readonly value: string;
}) {
  const orderedOptions = orderByPreferredIds(options, preferredOptionIds);

  if (orderedOptions.length <= 3) {
    return (
      <InlineChoiceGroup
        onValueChange={onValueChange}
        options={orderedOptions}
        testId={selectTestId}
        value={value}
      />
    );
  }

  const quickOptions = orderedOptions.slice(0, 3);
  const overflowOptions = orderedOptions.slice(3);
  const quickValue = quickOptions.some((option) => option.value === value) ? value : undefined;
  const overflowValue = overflowOptions.some((option) => option.value === value)
    ? value
    : undefined;

  return (
    <div className="space-y-2" data-testid={selectTestId}>
      <InlineChoiceGroup
        onValueChange={onValueChange}
        options={quickOptions}
        value={quickValue}
      />

      <Select onValueChange={onValueChange} {...(overflowValue ? { value: overflowValue } : {})}>
        <SelectTrigger>
          <SelectValue placeholder={en.recurring.moreAccounts} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>{en.recurring.moreAccounts}</SelectLabel>
            {overflowOptions.map((option) => (
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

export function InlineChoiceGroup({
  onValueChange,
  options,
  testId,
  value,
}: {
  readonly onValueChange: (value: string) => void;
  readonly options: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  readonly testId?: string;
  readonly value: string | undefined;
}) {
  return (
    <RadioGroup
      className="flex flex-wrap gap-1.5"
      data-testid={testId}
      onValueChange={onValueChange}
      orientation="horizontal"
      value={value ?? null}
    >
      {options.map((option) => {
        const id = `inline-choice-${option.value}`;
        return (
          <Label
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[0.8125rem] leading-none transition-colors hover:bg-accent/40"
            htmlFor={id}
            key={option.value}
          >
            <RadioGroupItem className="size-3.5" id={id} value={option.value} />
            <span className="truncate">{option.label}</span>
          </Label>
        );
      })}
    </RadioGroup>
  );
}

function orderByPreferredIds(
  options: readonly ChoiceOption[],
  preferredOptionIds: readonly string[],
): readonly ChoiceOption[] {
  if (preferredOptionIds.length === 0) {
    return options;
  }

  const indexById = new Map(preferredOptionIds.map((id, index) => [id, index] as const));
  return [...options].sort((left, right) => {
    const leftOrder = indexById.get(left.value);
    const rightOrder = indexById.get(right.value);
    if (leftOrder === undefined && rightOrder === undefined) {
      return 0;
    }
    if (leftOrder === undefined) {
      return 1;
    }
    if (rightOrder === undefined) {
      return -1;
    }
    return leftOrder - rightOrder;
  });
}

export function FormField({
  children,
  errors,
  inputId,
  label,
}: {
  readonly children: ReactNode;
  readonly errors: readonly unknown[];
  readonly inputId: string;
  readonly label: string;
}) {
  return (
    <Field data-invalid={errors.length > 0}>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      {children}
      <FieldError errors={errors} />
    </Field>
  );
}

export function getAmountFieldError(value: string): string | undefined {
  const amount = value.trim();
  if (!amount) {
    return en.recurring.amountRequired;
  }

  const normalized = Number(amount);
  if (!Number.isFinite(normalized)) {
    return en.recurring.amountInvalid;
  }
  if (normalized <= 0) {
    return en.recurring.amountPositive;
  }
  if (!/^-?\d+(\.\d{1,2})?$/.test(amount)) {
    return en.recurring.amountInvalid;
  }

  return undefined;
}

export function getNextRunOnFieldError(
  value: string,
  minimumStartDate: string,
): string | undefined {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return en.recurring.nextRunOnInvalid;
  }
  if (normalized < minimumStartDate) {
    return en.recurring.nextRunOnFuture;
  }
  return undefined;
}

function FieldError({ errors }: { readonly errors: readonly unknown[] }) {
  const firstError = errors[0];
  if (!firstError) {
    return null;
  }

  return <ShadcnFieldError>{String(firstError)}</ShadcnFieldError>;
}
