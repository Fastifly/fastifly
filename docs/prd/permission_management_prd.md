# PRD: Permission Management

## Feature name

Permission Management

## Status

Planned for day-one implementation.

## Summary

Fastifly needs a permission system that supports family/partner sharing, workspace-scoped access, ledger-scoped data, simple and advanced UI modes, and future multi-user financial workflows.

The permission system will use **CASL** for shared frontend/backend authorization rules, with small custom policy helpers for finance-specific domain rules.

---

## Problem

Fastifly will support shared workspaces from day one. Users may invite partners, family members, or viewers into a workspace.

Without a clear permission system, the app risks:

- leaking financial data across workspaces
- allowing viewers to modify data
- allowing admins to remove owners
- duplicating role checks across backend and frontend
- creating inconsistent UI behavior
- introducing bugs in advanced financial workflows

---

## Goals

- Use a single authorization model across backend and frontend.
- Support workspace roles: owner, admin, editor, viewer.
- Support workspace-scoped and ledger-scoped access.
- Use CASL abilities for action/subject authorization.
- Use CASL conditions for object-level checks.
- Use custom policy helpers for aggregate/domain invariants.
- Keep frontend permission checks useful but never trusted as security.
- Ensure all backend data access is scoped by `workspace_id` and where needed `ledger_id`.
- Ensure sync operation replay performs the same permission checks as normal REST requests.

---

## Non-goals

Initial implementation will not include:

- OpenFGA
- Casbin
- external permission service
- custom role builder
- granular account-level sharing
- field-level permissions for every entity
- enterprise SSO authorization
- real-time collaborative permissions
- attribute policy editor in UI

These can be considered later.

---

## Permission model

### Roles

Minimum roles:

```text
owner
admin
editor
viewer
```

Future roles:

```text
contributor
accountant
auditor
```

### Actions

Initial CASL actions:

```text
manage
read
create
update
delete
archive
invite
remove
changeRole
reconcile
commit
undo
export
viewAudit
```

### Subjects

Initial CASL subjects:

```text
all
Workspace
WorkspaceMember
Ledger
Account
Transaction
Category
Tag
Budget
ImportJob
Rule
RecurringTransaction
Report
Settings
AuditLog
```

---

## Role behavior

### Owner

Can manage everything inside the workspace.

### Admin

Can manage most workspace data and members, but cannot:

- delete workspace
- transfer ownership
- remove owner
- demote owner
- remove the last owner

### Editor

Can manage day-to-day financial data:

- accounts
- transactions
- categories
- tags
- budgets
- imports
- rules
- recurring transactions
- reports

Cannot manage members or workspace settings.

### Viewer

Read-only access.

Can view:

- dashboard
- accounts
- transactions
- budgets
- reports
- settings summary

Cannot create, update, delete, import, reconcile, or manage members.

---

## CASL usage

Create package:

```text
packages/authz
```

Suggested structure:

```text
packages/authz/src/
├── actions.ts
├── subjects.ts
├── roles.ts
├── define-ability.ts
├── policies.ts
├── serialize.ts
└── index.ts
```

`defineAbilityFor()` receives:

```ts
type AbilityContext = {
  userId: string;
  workspaceId: string;
  ledgerId?: string;
  role: WorkspaceRole;
};
```

It returns a CASL ability used by backend and frontend.

---

## CASL conditions

Use CASL conditions for object-level authorization.

Examples:

```ts
can("read", "Transaction", {
  workspaceId: ctx.workspaceId,
});

can("update", "Transaction", {
  workspaceId: ctx.workspaceId,
  status: { $ne: "reconciled" },
});

cannot("delete", "Transaction", {
  status: "reconciled",
});

cannot(["remove", "changeRole"], "WorkspaceMember", {
  role: "owner",
});
```

CASL conditions are appropriate for:

- workspace-scoped reads
- ledger-scoped reads
- object ownership
- transaction status restrictions
- workspace role restrictions
- UI gating
- simple object-level rules

---

## Custom policy helpers

Use custom policy helpers for rules that require aggregate data, multiple objects, or finance-domain validation.

Examples:

```text
cannot remove the last owner
admin cannot modify owner
journal postings must balance
cross-currency transaction must store exchange-rate snapshot
import commit must be idempotent
account with postings should be archived instead of hard deleted
reconciled transaction edit needs explicit confirmation
```

Example helper:

```ts
assertCanRemoveMember({
  ability,
  targetMember,
  ownerCount,
  isSelf,
});
```

Pattern:

```text
CASL ability      → can this role perform this action on this object?
Custom policy     → is this action safe in the current business/domain context?
Repository filter → is data scoped by workspace_id and ledger_id?
```

---

## Backend requirements

### Fastify integration

Create Fastify authz plugin:

```text
apps/api/src/plugins/authz.ts
```

Responsibilities:

- load current user
- resolve workspace context
- load active workspace membership
- create CASL ability
- attach ability to request
- attach workspace/ledger context to request

Route usage:

```ts
ForbiddenError.from(request.ability).throwUnlessCan(
  "create",
  "Transaction"
);
```

### Service-level policies

Routes may perform basic authorization checks, but services must enforce critical business policies.

Example:

```text
route checks: can update Transaction
service checks: transaction is not reconciled unless confirmed
service checks: postings remain balanced
repository checks: workspace_id and ledger_id match
```

### Data scoping

Every user-owned database query must filter by workspace and, where applicable, ledger.

Bad:

```ts
getTransactionById(transactionId);
```

Good:

```ts
getTransactionById({
  workspaceId,
  ledgerId,
  transactionId,
});
```

Frontend permission checks are never a replacement for backend authorization.

---

## Frontend requirements

Frontend receives current ability context from:

```text
GET /api/v1/me/context
```

Response includes:

```json
{
  "activeWorkspace": {
    "id": "ws_123",
    "role": "editor",
    "permissions": []
  }
}
```

The frontend should use CASL to:

- hide unavailable navigation items
- hide or disable action buttons
- show permission-denied messages
- switch simple/advanced UI sections
- prevent users from opening actions they cannot complete

Example:

```tsx
<Can I="create" a="Transaction" ability={ability}>
  <Button>Add transaction</Button>
</Can>
```

---

## Database requirements

Required tables:

```text
workspaces
workspace_members
workspace_invitations
ledgers
audit_log
```

`workspace_members` must include:

```text
id
workspace_id
user_id
role
status
joined_at
created_at
updated_at
```

Statuses:

```text
active
removed
suspended
```

All financial tables must include:

```text
workspace_id
ledger_id
```

where applicable.

---

## API requirements

Permission-sensitive endpoints must enforce CASL and service policies.

Examples:

```text
GET    /api/v1/workspaces
POST   /api/v1/workspaces
GET    /api/v1/workspaces/:workspaceId/members
POST   /api/v1/workspaces/:workspaceId/invitations
PATCH  /api/v1/workspaces/:workspaceId/members/:memberId
DELETE /api/v1/workspaces/:workspaceId/members/:memberId

POST   /api/v1/workspaces/:workspaceId/transactions
PATCH  /api/v1/workspaces/:workspaceId/transactions/:transactionId
DELETE /api/v1/workspaces/:workspaceId/transactions/:transactionId
```

Standard permission error:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action.",
    "details": {},
    "requestId": "req_..."
  }
}
```

---

## Sync replay requirements

Offline command sync must not become a permission bypass.

Every sync operation replay must:

- load the current user, device, workspace, and ledger context
- reject revoked devices
- re-check current workspace membership and role
- re-check ledger scope
- apply the same CASL ability checks as the equivalent REST route
- apply domain policies such as reconciled-edit guards and account compatibility
- return a structured conflict or permission error for the outbox UI

Permission failures during sync replay should not silently disappear. They should remain visible to the user as failed or conflicted outbox operations.

---

## Audit requirements

Create audit events for permission-sensitive actions:

```text
workspace_member.invited
workspace_member.invite_revoked
workspace_member.joined
workspace_member.role_changed
workspace_member.removed
workspace.updated
workspace.archived
transaction.reconciled
transaction.deleted
import.committed
import.undone
```

Audit event should include:

```text
actor_user_id
workspace_id
ledger_id
entity_type
entity_id
action
before_json
after_json
created_at
```

---

## Acceptance criteria

### CASL setup

- `packages/authz` exists.
- Actions, subjects, roles, and ability builder are typed.
- Backend and frontend can import shared authorization definitions.

### Role behavior

- Owner can manage workspace.
- Admin can manage members except owner.
- Editor can manage financial data but not members.
- Viewer has read-only access.

### Backend enforcement

- Protected routes check CASL ability.
- Services enforce domain policies.
- Database queries are scoped by workspace and ledger.
- Forbidden requests return standard error shape.

### Frontend behavior

- UI hides or disables actions the user cannot perform.
- Viewer cannot see create/edit/delete buttons.
- Editor cannot see member-management actions.
- Permission-denied states are clear and mobile-friendly.

### Security

- Frontend permissions are not trusted as security.
- Removed members lose access.
- Admin cannot remove or demote owner.
- Last owner cannot be removed.
- Workspace data does not leak across memberships.

### Testing

Required tests:

- owner permissions
- admin permissions
- editor permissions
- viewer permissions
- admin cannot modify owner
- cannot remove last owner
- viewer cannot mutate financial data
- transaction queries require workspace scope
- ledger queries require workspace/ledger scope
- frontend permission helpers render correct UI states

---

## MVP scope

Must-have:

- CASL package
- shared roles/actions/subjects
- ability builder
- Fastify authz plugin
- `request.ability`
- backend route checks
- service policy helpers
- workspace/ledger-scoped queries
- frontend `Can` helper or `useCan` hook
- role tests
- permission error format

Can wait:

- field-level permissions
- custom role builder
- account-level sharing
- team-level groups
- OpenFGA/Casbin integration
- policy admin UI
