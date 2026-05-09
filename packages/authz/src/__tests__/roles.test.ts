import { describe, expect, it } from "vitest";

import {
  isWorkspaceRole,
  parseWorkspaceRole,
  UnknownWorkspaceRoleError,
  WORKSPACE_ROLES,
} from "../roles.js";

describe("workspace roles", () => {
  it("uses the canonical role set from architecture-v2", () => {
    expect(WORKSPACE_ROLES).toEqual(["owner", "admin", "editor", "viewer"]);
  });

  it("rejects stale or unknown roles", () => {
    expect(isWorkspaceRole("invalid_role")).toBe(false);
    expect(() => parseWorkspaceRole("invalid_role")).toThrow(UnknownWorkspaceRoleError);
  });
});
