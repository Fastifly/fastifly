import { ACTUAL_IMPORT_MAX_ARCHIVE_BYTES, type ImportJobResponse } from "@fastifly/common";
import { FastiflyApiError } from "../../../api/client";
import { en } from "../../../i18n/en";

const ZIP_MIME_TYPES = new Set(["application/x-zip-compressed", "application/zip"]);

type FileInfo = {
  readonly name: string;
  readonly size: number;
  readonly type: string;
};

export type ImportJobAction = "commit" | "undo";
export type ImportFeedbackActionTarget = "accounts" | "categories";
export type ImportFeedbackActionLink = {
  readonly label: string;
  readonly target: ImportFeedbackActionTarget;
  readonly to: "/accounts" | "/categories";
};
export type ImportErrorPresentation = {
  readonly actionLinks: readonly ImportFeedbackActionLink[];
  readonly message: string;
};

export function formatImportJobStatus(status: ImportJobResponse["status"]): string {
  switch (status) {
    case "preview_ready":
      return en.imports.statusPreviewReady;
    case "committed":
      return en.imports.statusCommitted;
    case "undone":
      return en.imports.statusUndone;
    case "failed":
      return en.imports.statusFailed;
  }
}

export function getImportJobActions(
  status: ImportJobResponse["status"],
): readonly ImportJobAction[] {
  switch (status) {
    case "preview_ready":
      return ["commit"];
    case "committed":
      return ["undo"];
    case "failed":
    case "undone":
      return [];
  }
}

export function validateActualImportFile(file: FileInfo): string | null {
  if (file.size <= 0) {
    return en.imports.actualFileEmpty;
  }

  if (file.size > ACTUAL_IMPORT_MAX_ARCHIVE_BYTES) {
    return en.imports.actualFileTooLarge(formatFileSize(ACTUAL_IMPORT_MAX_ARCHIVE_BYTES));
  }

  const hasZipExtension = file.name.toLocaleLowerCase("en-US").endsWith(".zip");
  if (!hasZipExtension && !ZIP_MIME_TYPES.has(file.type)) {
    return en.imports.actualFileType;
  }

  return null;
}

export function getImportErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof FastiflyApiError) {
    return error.response.error.message;
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

export function getImportErrorPresentation(
  error: unknown,
  fallback: string,
): ImportErrorPresentation {
  return {
    actionLinks: getImportErrorActionLinks(error),
    message: getImportErrorMessage(error, fallback),
  };
}

export function makeImportErrorPresentation(message: string): ImportErrorPresentation {
  return { actionLinks: [], message };
}

function getImportErrorActionLinks(error: unknown): readonly ImportFeedbackActionLink[] {
  if (!(error instanceof FastiflyApiError)) {
    return [];
  }

  const details = error.response.error.details;
  if (!isActualImportNameConflictDetails(details) || details.source !== "ledger") {
    return [];
  }

  const links: ImportFeedbackActionLink[] = [];
  if (details.accountNames.length > 0) {
    links.push({
      label: en.imports.openConflictingAccounts,
      target: "accounts",
      to: "/accounts",
    });
  }
  if (details.categoryNames.length > 0) {
    links.push({
      label: en.imports.openConflictingCategories,
      target: "categories",
      to: "/categories",
    });
  }
  return links;
}

function isActualImportNameConflictDetails(details: Record<string, unknown>): details is {
  readonly accountNames: readonly string[];
  readonly categoryNames: readonly string[];
  readonly kind: "actual_import_name_conflict";
  readonly source: "actual_export" | "ledger";
} {
  return (
    details.kind === "actual_import_name_conflict" &&
    (details.source === "actual_export" || details.source === "ledger") &&
    isStringArray(details.accountNames) &&
    isStringArray(details.categoryNames)
  );
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB"] as const;
  let value = bytes / 1024;
  for (const unit of units) {
    if (value < 1024 || unit === "GB") {
      return `${new Intl.NumberFormat("en", {
        maximumFractionDigits: value >= 10 ? 0 : 1,
      }).format(value)} ${unit}`;
    }
    value /= 1024;
  }
  return `${bytes} B`;
}

export function summarizeActualImport(importJob: ImportJobResponse): string | null {
  const actualImport = importJob.actualImport;
  if (!actualImport) {
    return null;
  }
  const { summary } = actualImport;
  return en.imports.actualSummaryLine({
    accounts: summary.accountCount,
    categories: summary.expenseCategoryCount,
    incomeSources: summary.incomeSourceCount,
    transactions: summary.transactionCount,
    transfers: summary.transferCount,
  });
}
