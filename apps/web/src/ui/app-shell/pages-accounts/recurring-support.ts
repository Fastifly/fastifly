import type { RecurringTemplateResponse } from "@fastifly/common";
import { FastiflyApiError } from "../../../api/client";
import type { RecurringCreateDefaults } from "../../../finance/recurring-form";
import { en } from "../../../i18n/en";

export function isDueSoon(nextRunAt: string): boolean {
  const next = Date.parse(nextRunAt);
  if (Number.isNaN(next)) {
    return false;
  }

  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return next >= now && next <= now + sevenDaysMs;
}

export function getRecurringError(error: unknown): string {
  if (error instanceof FastiflyApiError) {
    return error.response.error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }

  return en.recurring.createFailed;
}

export function getRecurringStatusError(error: unknown): string {
  if (error instanceof FastiflyApiError) {
    return error.response.error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }

  return en.recurring.statusFailed;
}

export function deriveRecurringCreateDefaults(
  templates: readonly RecurringTemplateResponse[],
): RecurringCreateDefaults {
  const preferredTemplates = templates.filter((template) => template.status === "active");
  const candidates = preferredTemplates.length > 0 ? preferredTemplates : templates;
  if (candidates.length === 0) {
    return {};
  }

  const preferredType =
    pickMostCommon(candidates, (template) => template.payload.type) ?? "expense";
  const typedCandidates = candidates.filter((template) => template.payload.type === preferredType);
  const preferredCadence = pickMostCommon(typedCandidates, (template) => template.cadence);
  const preferredSourceAccountId = pickMostCommon(
    typedCandidates,
    (template) => template.payload.sourceAccountId,
  );
  const sourceScopedCandidates = preferredSourceAccountId
    ? typedCandidates.filter(
        (template) => template.payload.sourceAccountId === preferredSourceAccountId,
      )
    : typedCandidates;
  const preferredCategoryId =
    preferredType === "expense"
      ? pickMostCommon(sourceScopedCandidates, (template) => template.payload.lines[0]?.categoryId)
      : undefined;
  const preferredDestinationAccountId =
    preferredType === "expense"
      ? undefined
      : pickMostCommon(
          sourceScopedCandidates,
          (template) => template.payload.lines[0]?.destinationAccountId,
        );

  return {
    type: preferredType,
    ...(preferredCadence ? { cadence: preferredCadence } : {}),
    ...(preferredSourceAccountId ? { sourceAccountId: preferredSourceAccountId } : {}),
    ...(preferredCategoryId ? { categoryId: preferredCategoryId } : {}),
    ...(preferredDestinationAccountId
      ? { destinationAccountId: preferredDestinationAccountId }
      : {}),
  };
}

function pickMostCommon<T, Key extends string>(
  values: readonly T[],
  getKey: (value: T) => Key | null | undefined,
): Key | undefined {
  if (values.length === 0) {
    return undefined;
  }

  const scoreByKey = new Map<
    Key,
    {
      count: number;
      latestUpdateMs: number;
    }
  >();

  for (const value of values) {
    const key = getKey(value);
    if (!key) {
      continue;
    }

    const candidate = value as { readonly updatedAt?: string };
    const parsedUpdatedAt = candidate.updatedAt ? Date.parse(candidate.updatedAt) : Number.NaN;
    const updatedAtMs = Number.isFinite(parsedUpdatedAt) ? parsedUpdatedAt : -1;
    const previous = scoreByKey.get(key);

    if (!previous) {
      scoreByKey.set(key, { count: 1, latestUpdateMs: updatedAtMs });
      continue;
    }

    scoreByKey.set(key, {
      count: previous.count + 1,
      latestUpdateMs: Math.max(previous.latestUpdateMs, updatedAtMs),
    });
  }

  let winner: { key: Key; count: number; latestUpdateMs: number } | null = null;
  for (const [key, score] of scoreByKey.entries()) {
    if (!winner) {
      winner = { key, ...score };
      continue;
    }

    if (
      score.count > winner.count ||
      (score.count === winner.count && score.latestUpdateMs > winner.latestUpdateMs)
    ) {
      winner = { key, ...score };
    }
  }

  return winner?.key;
}
