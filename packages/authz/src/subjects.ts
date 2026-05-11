export const AUTHZ_SUBJECTS = [
  "all",
  "Workspace",
  "Ledger",
  "WorkspaceMember",
  "WorkspaceInvitation",
  "Session",
  "Passkey",
  "RecoveryCode",
  "Device",
  "Account",
  "Category",
  "Budget",
  "Tag",
  "Payee",
  "TransactionGroup",
  "Import",
  "Rule",
  "RecurringTemplate",
  "Report",
  "Sync",
  "Backup",
  "Settings",
  "AuditLog",
] as const;

export type AuthzSubject = (typeof AUTHZ_SUBJECTS)[number];
export type DomainAuthzSubject = Exclude<AuthzSubject, "all">;

const AUTHZ_SUBJECT_SET = new Set<string>(AUTHZ_SUBJECTS);

export function isAuthzSubject(value: string): value is AuthzSubject {
  return AUTHZ_SUBJECT_SET.has(value);
}
