import {
  createFastiflyAbilityBuilder,
  type FastiflyAbility,
  type FastiflyAbilityBuilder,
} from "./ability.js";
import type { AuthzAction } from "./actions.js";
import type { WorkspaceRole } from "./roles.js";
import { parseWorkspaceRole } from "./roles.js";
import type { DomainAuthzSubject } from "./subjects.js";

const READABLE_FINANCE_SUBJECTS = [
  "Workspace",
  "Ledger",
  "WorkspaceMember",
  "Account",
  "Category",
  "Budget",
  "Tag",
  "Payee",
  "TransactionGroup",
  "Report",
  "Sync",
] as const satisfies readonly DomainAuthzSubject[];

const EDITABLE_FINANCE_SUBJECTS = [
  "Account",
  "Category",
  "Budget",
  "Tag",
  "Payee",
  "TransactionGroup",
  "Import",
] as const satisfies readonly DomainAuthzSubject[];

const ADMIN_SUBJECTS = [
  "Workspace",
  "Ledger",
  "WorkspaceMember",
  "WorkspaceInvitation",
  "Device",
  "Settings",
  "AuditLog",
] as const satisfies readonly DomainAuthzSubject[];

function allow(
  builder: FastiflyAbilityBuilder,
  action: AuthzAction,
  subjects: readonly DomainAuthzSubject[],
): void {
  for (const subject of subjects) {
    builder.can(action, subject);
  }
}

function defineViewerPermissions(builder: FastiflyAbilityBuilder): void {
  allow(builder, "read", READABLE_FINANCE_SUBJECTS);
}

function defineEditorPermissions(builder: FastiflyAbilityBuilder): void {
  defineViewerPermissions(builder);
  allow(builder, "create", EDITABLE_FINANCE_SUBJECTS);
  allow(builder, "update", EDITABLE_FINANCE_SUBJECTS);
  allow(builder, "delete", ["TransactionGroup", "Tag", "Payee"]);
  allow(builder, "archive", ["Account"]);
  allow(builder, "reconcile", ["TransactionGroup"]);
  allow(builder, "import", ["Import"]);
  allow(builder, "sync", ["Sync"]);
}

function defineAdminPermissions(builder: FastiflyAbilityBuilder): void {
  defineEditorPermissions(builder);
  allow(builder, "read", ADMIN_SUBJECTS);
  allow(builder, "create", ["WorkspaceInvitation", "Device"]);
  allow(builder, "update", ADMIN_SUBJECTS);
  allow(builder, "delete", ["WorkspaceInvitation", "Device"]);
  allow(builder, "invite", ["WorkspaceInvitation"]);
  allow(builder, "revoke", ["WorkspaceInvitation", "Session", "Device"]);
  allow(builder, "export", ["Account", "Budget", "TransactionGroup", "Report"]);
  allow(builder, "administer", ["Workspace", "Ledger", "Settings"]);
}

function defineOwnerPermissions(builder: FastiflyAbilityBuilder): void {
  builder.can("manage", "all");
}

const ROLE_PERMISSION_DEFINERS = {
  admin: defineAdminPermissions,
  editor: defineEditorPermissions,
  owner: defineOwnerPermissions,
  viewer: defineViewerPermissions,
} as const satisfies Record<WorkspaceRole, (builder: FastiflyAbilityBuilder) => void>;

export type DefineWorkspaceAbilityInput = {
  readonly role: WorkspaceRole | string;
};

export function defineWorkspaceAbility(input: DefineWorkspaceAbilityInput): FastiflyAbility {
  const role = parseWorkspaceRole(input.role);
  const builder = createFastiflyAbilityBuilder();
  ROLE_PERMISSION_DEFINERS[role](builder);
  return builder.build();
}
