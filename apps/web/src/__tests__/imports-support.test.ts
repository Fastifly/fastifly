import { describe, expect, it } from "vitest";

import { FastiflyApiError } from "../api/client";
import {
  formatFileSize,
  formatImportJobStatus,
  getImportErrorMessage,
  getImportErrorPresentation,
  getImportJobActions,
  makeImportErrorPresentation,
  summarizeActualImport,
  validateActualImportFile,
} from "../ui/app-shell/pages-accounts/imports-support";

describe("Actual import UI support", () => {
  it("only exposes actions that are valid for the import status", () => {
    expect(getImportJobActions("preview_ready")).toEqual(["commit"]);
    expect(getImportJobActions("committed")).toEqual(["undo"]);
    expect(getImportJobActions("undone")).toEqual([]);
    expect(getImportJobActions("failed")).toEqual([]);
  });

  it("shows readable import status labels", () => {
    expect(formatImportJobStatus("preview_ready")).toBe("Ready to commit");
    expect(formatImportJobStatus("committed")).toBe("Committed");
    expect(formatImportJobStatus("undone")).toBe("Undone");
    expect(formatImportJobStatus("failed")).toBe("Failed");
  });

  it("accepts Actual ZIP exports and rejects empty, oversized, and unrelated files", () => {
    expect(
      validateActualImportFile({ name: "budget.zip", size: 1024, type: "application/zip" }),
    ).toBeNull();
    expect(validateActualImportFile({ name: "budget.zip", size: 1024, type: "" })).toBeNull();
    expect(validateActualImportFile({ name: "budget.zip", size: 0, type: "application/zip" })).toBe(
      "The selected file is empty.",
    );
    expect(
      validateActualImportFile({
        name: "budget.zip",
        size: 33 * 1024 * 1024,
        type: "application/zip",
      }),
    ).toBe("Actual Budget exports must be 32 MB or smaller.");
    expect(validateActualImportFile({ name: "budget.csv", size: 100, type: "text/csv" })).toBe(
      "Use an Actual Budget ZIP export.",
    );
  });

  it("surfaces API error messages instead of replacing them with a generic import failure", () => {
    const error = new FastiflyApiError({
      error: {
        code: "BAD_REQUEST",
        details: {},
        message: "The uploaded file is not a valid ZIP archive.",
        requestId: "request-1",
      },
    });

    expect(getImportErrorMessage(error, "fallback")).toBe(
      "The uploaded file is not a valid ZIP archive.",
    );
    expect(getImportErrorMessage(new Error("Local read failed."), "fallback")).toBe(
      "Local read failed.",
    );
    expect(getImportErrorMessage({}, "fallback")).toBe("fallback");
  });

  it("adds links for ledger-side Actual import name conflicts", () => {
    const error = new FastiflyApiError({
      error: {
        code: "CONFLICT",
        details: {
          accountNames: ["Checking"],
          categoryNames: ["Food"],
          kind: "actual_import_name_conflict",
          source: "ledger",
        },
        message:
          "This Actual Budget import cannot continue because account and category names already exist.",
        requestId: "request-2",
      },
    });

    expect(getImportErrorPresentation(error, "fallback")).toEqual({
      actionLinks: [
        { label: "Open accounts", target: "accounts", to: "/accounts" },
        { label: "Open categories", target: "categories", to: "/categories" },
      ],
      message:
        "This Actual Budget import cannot continue because account and category names already exist.",
    });
    expect(makeImportErrorPresentation("Browser validation failed.")).toEqual({
      actionLinks: [],
      message: "Browser validation failed.",
    });
  });

  it("does not link app pages for conflicts inside the Actual export", () => {
    const error = new FastiflyApiError({
      error: {
        code: "CONFLICT",
        details: {
          accountNames: ["Checking"],
          categoryNames: [],
          kind: "actual_import_name_conflict",
          source: "actual_export",
        },
        message: "Rename the duplicate account in Actual Budget and export again.",
        requestId: "request-3",
      },
    });

    expect(getImportErrorPresentation(error, "fallback")).toEqual({
      actionLinks: [],
      message: "Rename the duplicate account in Actual Budget and export again.",
    });
  });

  it("formats sizes and Actual plan summaries for import cards", () => {
    expect(formatFileSize(32 * 1024 * 1024)).toBe("32 MB");
    expect(
      summarizeActualImport({
        actualImport: {
          budgetName: "Budget",
          summary: {
            accountCount: 2,
            expenseCategoryCount: 3,
            incomeSourceCount: 1,
            skippedCount: 0,
            splitCount: 0,
            transactionCount: 4,
            transferCount: 1,
            warningCount: 0,
          },
          targetCurrencyCode: "INR",
          warnings: [],
        },
        committedAt: null,
        committedGroupIds: [],
        createdAt: "2026-05-31T00:00:00.000Z",
        createdBy: "01999999-9999-7999-8999-999999999999",
        fileName: "budget.zip",
        id: "01999999-9999-7999-8999-999999999998",
        kind: "actual_budget",
        ledgerId: "01999999-9999-7999-8999-999999999997",
        previewRows: [],
        status: "preview_ready",
        undoneAt: null,
        updatedAt: "2026-05-31T00:00:00.000Z",
        workspaceId: "01999999-9999-7999-8999-999999999996",
      }),
    ).toBe("2 accounts, 3 categories, 1 income source, 4 transactions, 1 transfer");
  });
});
