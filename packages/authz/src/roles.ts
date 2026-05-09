export const WORKSPACE_ROLES = ["owner", "admin", "editor", "viewer"] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

const WORKSPACE_ROLE_SET = new Set<string>(WORKSPACE_ROLES);

export class UnknownWorkspaceRoleError extends Error {
  constructor(role: string) {
    super(`Unknown workspace role: ${role}`);
    this.name = "UnknownWorkspaceRoleError";
  }
}

export function isWorkspaceRole(value: string): value is WorkspaceRole {
  return WORKSPACE_ROLE_SET.has(value);
}

export function parseWorkspaceRole(value: string): WorkspaceRole {
  if (!isWorkspaceRole(value)) {
    throw new UnknownWorkspaceRoleError(value);
  }

  return value;
}
