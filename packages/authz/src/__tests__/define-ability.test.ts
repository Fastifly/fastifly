import { describe, expect, it } from "vitest";

import { assertCan } from "../ability.js";
import { defineWorkspaceAbility } from "../define-ability.js";

describe("workspace abilities", () => {
  it("lets viewers read finance data but not mutate it", () => {
    const ability = defineWorkspaceAbility({ role: "viewer" });

    expect(ability.can("read", "TransactionGroup")).toBe(true);
    expect(ability.can("create", "TransactionGroup")).toBe(false);
    expect(ability.can("export", "TransactionGroup")).toBe(false);
    expect(ability.can("invite", "WorkspaceInvitation")).toBe(false);
  });

  it("lets editors mutate finance data without member administration", () => {
    const ability = defineWorkspaceAbility({ role: "editor" });

    expect(ability.can("create", "TransactionGroup")).toBe(true);
    expect(ability.can("reconcile", "TransactionGroup")).toBe(true);
    expect(ability.can("import", "Import")).toBe(true);
    expect(ability.can("invite", "WorkspaceInvitation")).toBe(false);
    expect(ability.can("administer", "Settings")).toBe(false);
  });

  it("lets admins manage workspace operations without owner-only powers", () => {
    const ability = defineWorkspaceAbility({ role: "admin" });

    expect(ability.can("invite", "WorkspaceInvitation")).toBe(true);
    expect(ability.can("delete", "WorkspaceMember")).toBe(true);
    expect(ability.can("export", "TransactionGroup")).toBe(true);
    expect(ability.can("restore", "Backup")).toBe(false);
    expect(ability.can("manage", "all")).toBe(false);
  });

  it("lets owners manage every subject", () => {
    const ability = defineWorkspaceAbility({ role: "owner" });

    expect(ability.can("manage", "all")).toBe(true);
    expect(ability.can("restore", "Backup")).toBe(true);
    expect(() => assertCan(ability, "delete", "Workspace")).not.toThrow();
  });

  it("fails closed for unknown roles", () => {
    expect(() => defineWorkspaceAbility({ role: "invalid_role" })).toThrow(
      "Unknown workspace role",
    );
  });
});
