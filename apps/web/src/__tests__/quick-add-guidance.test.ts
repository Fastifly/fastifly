import { describe, expect, it } from "vitest";

import {
  getQuickAddSuggestion,
  mapQuickAddReasonToMessage,
  mapQuickAddReasonToMessageForType,
} from "../ui/quick-add-guidance";

describe("quick-add guidance", () => {
  it("maps generic reasons to user-facing messages", () => {
    expect(mapQuickAddReasonToMessage("ledger-required")).toMatch(/ledger/i);
    expect(mapQuickAddReasonToMessage("add-account")).toMatch(/account/i);
    expect(mapQuickAddReasonToMessage("add-category")).toMatch(/category/i);
    expect(mapQuickAddReasonToMessage("add-second-account")).toMatch(/another|transfer/i);
    expect(mapQuickAddReasonToMessage("add-compatible-setup")).toMatch(/setup/i);
    expect(mapQuickAddReasonToMessage("categories-loading")).toMatch(/loading/i);
    expect(mapQuickAddReasonToMessage("ok")).toBe("");
  });

  it("maps type-specific compatibility messages", () => {
    expect(
      mapQuickAddReasonToMessageForType({ reason: "add-compatible-setup", type: "expense" }),
    ).toMatch(/expense|category/i);
    expect(
      mapQuickAddReasonToMessageForType({ reason: "add-compatible-setup", type: "income" }),
    ).toMatch(/income/i);
    expect(
      mapQuickAddReasonToMessageForType({ reason: "add-compatible-setup", type: "transfer" }),
    ).toMatch(/transfer/i);
  });

  it("returns stable suggestions for blocked actions", () => {
    expect(getQuickAddSuggestion("add-category")).toEqual({
      label: expect.any(String),
      to: "/categories",
    });
    expect(getQuickAddSuggestion("add-account")).toEqual({
      label: expect.any(String),
      to: "/accounts",
    });
    expect(getQuickAddSuggestion("ok")).toBeUndefined();
  });
});
