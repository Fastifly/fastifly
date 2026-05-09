export const AUTHZ_ACTIONS = [
  "manage",
  "create",
  "read",
  "update",
  "delete",
  "invite",
  "accept",
  "revoke",
  "archive",
  "reconcile",
  "import",
  "export",
  "sync",
  "backup",
  "restore",
  "administer",
] as const;

export type AuthzAction = (typeof AUTHZ_ACTIONS)[number];

const AUTHZ_ACTION_SET = new Set<string>(AUTHZ_ACTIONS);

export function isAuthzAction(value: string): value is AuthzAction {
  return AUTHZ_ACTION_SET.has(value);
}
