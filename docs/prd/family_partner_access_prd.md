# PRD: Family and Partner Access Sharing

## Feature name

Family and Partner Access Sharing

## Status

Planned for day-one architecture and early product implementation.

## Summary

Fastifly must support shared access from the beginning. A user should be able to invite a partner, spouse, family member, or trusted person to access a shared financial workspace/ledger with controlled permissions.

This feature is not an afterthought. Workspace, ledger, account, transaction, import, budget, and report data should be designed with sharing and ownership from day one.

---

## Problem

Many people manage finances together:

- couples tracking shared spending
- families managing household budgets
- parents monitoring family expenses
- partners sharing a credit card or bank account
- users who want someone else to view reports but not edit data

Most personal finance apps are built around a single-user model first. Adding shared access later usually creates data ownership problems, permission issues, and migration pain.

Fastifly should avoid this by making shared workspaces part of the core architecture from day one.

---

## Goals

- Allow users to create shared workspaces.
- Allow workspace owners/admins to invite family members or partners.
- Support role-based access control.
- Support shared ledgers inside a workspace.
- Keep personal and shared data separate.
- Ensure all financial data is scoped by workspace and ledger.
- Provide clear UI showing who has access.
- Provide safe controls for inviting, removing, and changing workspace roles.
- Revalidate workspace membership during sync operation replay.
- Prepare architecture for future family/business/team use cases.

---

## Non-goals for first release

The first release does not need:

- real-time collaborative editing
- chat/comments
- approval workflows
- granular field-level permissions
- shared bank credential management
- multi-organization billing
- enterprise SSO
- complex custom roles
- child/minor-specific parental controls
- end-to-end encrypted shared vaults

These can be considered later.

---

## Personas

### 1. Individual user

A user tracks personal finances alone.

Needs:

- private workspace
- private ledger
- no sharing by default
- ability to invite someone later

### 2. Couple/partner

Two people manage shared household finances.

Needs:

- shared workspace
- both can add/edit transactions
- both can view budgets and reports
- one or both may be admins

### 3. Family member with limited access

A user wants a family member to view reports or add transactions but not change settings.

Needs:

- limited role
- clear permissions
- restricted settings access

### 4. Read-only viewer

A user wants someone to inspect finances without editing.

Needs:

- view dashboard
- view transactions/reports
- no write access

---

## Core concepts

### Workspace

A workspace is the top-level sharing boundary.

Examples:

- Personal
- Household
- Family
- Business

A workspace contains:

- members
- ledgers
- settings
- audit logs

### Ledger

A ledger is a financial book inside a workspace.

Examples:

- Personal ledger
- Household ledger
- Business ledger
- Travel ledger

Most financial records belong to both:

```text
workspace_id
ledger_id
```

### Member

A member is a user who has access to a workspace.

### Role

A role defines what a member can do inside a workspace.

---

## Roles and permissions

### Owner

The owner has full control.

Can:

- view all workspace data
- create/edit/delete transactions
- manage accounts
- manage budgets
- manage imports
- manage rules
- manage recurring transactions
- manage ledgers
- invite members
- remove members
- change workspace roles
- transfer ownership
- delete/archive workspace
- view audit log
- change workspace settings

### Admin

Admin has almost full control, except ownership transfer and workspace deletion.

Can:

- view all workspace data
- create/edit/delete transactions
- manage accounts
- manage budgets
- manage imports
- manage rules
- manage recurring transactions
- manage ledgers
- invite members
- remove non-owner members
- change non-owner roles
- view audit log
- change most workspace settings

Cannot:

- remove owner
- transfer ownership
- delete workspace
- change owner role

### Editor

Editor can manage daily financial data.

Can:

- view dashboard
- view accounts
- create/edit transactions
- create imports
- manage categories/tags
- view budgets
- update budget progress where relevant
- view reports

Cannot:

- invite/remove members
- change workspace settings
- delete workspace
- manage advanced permissions
- view sensitive audit/security settings

### Contributor

Contributor can add data but has limited editing rights.

Can:

- create transactions
- upload/import transactions if allowed
- view own created transactions
- optionally view selected shared accounts/budgets depending on later settings

Cannot:

- edit other users' transactions by default
- delete transactions
- manage accounts
- manage budgets
- invite members
- view full reports unless allowed

For the first implementation, this role can be postponed if it adds complexity. The system should still leave room for it.

### Viewer

Viewer has read-only access.

Can:

- view dashboard
- view accounts
- view transactions
- view budgets
- view reports

Cannot:

- create/edit/delete transactions
- import data
- manage settings
- invite members
- manage accounts
- manage budgets
- change rules

---

## Minimum role set for v0.1

Implement these first:

```text
owner
admin
editor
viewer
```

Design the permission system so `contributor` can be added later.

---

## Permission matrix

| Action | Owner | Admin | Editor | Viewer |
|---|---:|---:|---:|---:|
| View dashboard | Yes | Yes | Yes | Yes |
| View accounts | Yes | Yes | Yes | Yes |
| Create transactions | Yes | Yes | Yes | No |
| Edit transactions | Yes | Yes | Yes | No |
| Delete transactions | Yes | Yes | Yes | No |
| Reconcile transactions | Yes | Yes | Yes | No |
| Manage categories/tags | Yes | Yes | Yes | No |
| View budgets | Yes | Yes | Yes | Yes |
| Manage budgets | Yes | Yes | Yes | No |
| View reports | Yes | Yes | Yes | Yes |
| Upload imports | Yes | Yes | Yes | No |
| Commit imports | Yes | Yes | Yes | No |
| Manage accounts | Yes | Yes | Yes | No |
| Manage rules | Yes | Yes | Yes | No |
| Manage recurring transactions | Yes | Yes | Yes | No |
| Invite members | Yes | Yes | No | No |
| Remove members | Yes | Yes* | No | No |
| Change roles | Yes | Yes* | No | No |
| Transfer ownership | Yes | No | No | No |
| Delete/archive workspace | Yes | No | No | No |
| View audit log | Yes | Yes | No | No |
| Change workspace settings | Yes | Yes | No | No |

`Yes*` means admin cannot modify the owner.

---

## User flows

### Flow 1: Create personal workspace

1. User registers.
2. App creates a default personal workspace.
3. App creates a default ledger.
4. User becomes workspace owner.
5. No other members have access.

Acceptance:

- every user has at least one workspace
- first user is owner
- data is scoped to workspace and ledger

---

### Flow 2: Invite partner/family member

1. Owner/admin opens Settings → Members.
2. User clicks "Invite member".
3. User enters email address.
4. User selects role: admin, editor, or viewer.
5. App creates pending invitation.
6. Invitee receives invite link/email.
7. Invitee accepts invite.
8. Invitee becomes workspace member.

Acceptance:

- duplicate pending invites are prevented
- invite expires after configured duration
- accepted invite creates workspace membership
- invitation records who invited whom
- audit event is created

---

### Flow 3: Accept invitation

1. Invitee opens invite link.
2. If not logged in, invitee registers or logs in.
3. App shows workspace name and invited role.
4. Invitee accepts.
5. App adds invitee to workspace.
6. Invitee can switch to shared workspace.

Acceptance:

- invite token cannot be reused after acceptance
- expired invite cannot be accepted
- invite is email-bound where possible
- user sees correct role after joining

---

### Flow 4: Change role

1. Owner/admin opens member list.
2. User selects member.
3. User changes role.
4. App validates permission.
5. App updates membership.
6. App writes audit event.

Acceptance:

- admin cannot change owner role
- user cannot remove last owner
- member permissions update immediately or on next request

---

### Flow 5: Remove member

1. Owner/admin opens member list.
2. User chooses remove member.
3. App asks for confirmation.
4. Member is removed or deactivated.
5. Member loses workspace access.
6. Audit event is created.

Acceptance:

- owner cannot be removed by admin
- last owner cannot be removed
- removed member cannot access workspace data
- historical records created by removed member remain intact

---

### Flow 6: Switch workspace

1. User clicks workspace switcher.
2. App lists workspaces user belongs to.
3. User selects workspace.
4. App updates active workspace.
5. UI refreshes dashboard and data.

Acceptance:

- active workspace is visible in UI
- data from another workspace is not leaked
- API requests are scoped to selected workspace

---

## UX requirements

### Workspace switcher

A workspace switcher should be available in the app shell.

Displays:

- current workspace name
- current role, optionally
- list of accessible workspaces
- create workspace action, if supported

### Member settings page

Location:

```text
Settings → Members
```

Should show:

- member name/email
- role
- status
- joined date
- invited by
- actions based on current user's permission

### Invite form

Fields:

- email
- role
- optional message later

Default role:

```text
editor
```

The UI should explain roles clearly.

Example:

```text
Viewer: can view data but cannot make changes.
Editor: can add and edit financial data.
Admin: can manage members and workspace settings.
```

### Permission denial

When a user lacks permission, show a clear message:

```text
You do not have permission to perform this action.
Ask a workspace admin to change your role.
```

Do not expose hidden data in error messages.

---

## API requirements

Base path:

```text
/api/v1
```

### Workspace endpoints

```text
GET    /workspaces
POST   /workspaces
GET    /workspaces/:workspaceId
PATCH  /workspaces/:workspaceId
```

### Member endpoints

```text
GET    /workspaces/:workspaceId/members
PATCH  /workspaces/:workspaceId/members/:memberId
DELETE /workspaces/:workspaceId/members/:memberId
```

### Invitation endpoints

```text
POST   /workspaces/:workspaceId/invitations
GET    /invitations/:token
POST   /invitations/:token/accept
POST   /invitations/:token/decline
DELETE /workspaces/:workspaceId/invitations/:invitationId
```

### Workspace switch endpoint

Optional. The frontend can also store active workspace client-side.

```text
PATCH /me/preferences/active-workspace
```

---

## Data model

### workspaces

```text
id
name
slug
created_by
created_at
updated_at
archived_at
```

### workspace_members

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

Roles:

```text
owner
admin
editor
viewer
```

### workspace_invitations

```text
id
workspace_id
email
role
token_hash
status
invited_by
expires_at
accepted_by
accepted_at
declined_at
revoked_at
created_at
updated_at
```

Statuses:

```text
pending
accepted
declined
revoked
expired
```

### ledgers

```text
id
workspace_id
name
kind
base_currency_code
created_at
updated_at
archived_at
```

### user_settings

Add optional active workspace:

```text
user_id
active_workspace_id
active_ledger_id
```

---

## Authorization model

Every protected request should know:

```text
current_user_id
workspace_id
role
permissions
```

Permission checks should happen in backend services or auth guards, not only in the frontend.

Example permissions:

```text
workspace.members.invite
workspace.members.remove
workspace.members.update_role
workspace.settings.update
ledger.view
ledger.manage
transaction.create
transaction.update
transaction.delete
budget.manage
report.view
audit.view
```

Recommended implementation:

```ts
hasPermission(memberRole, "transaction.create")
```

Do not scatter role checks everywhere as raw strings.

---

## Security requirements

- Invitation tokens must be random and unguessable.
- Store invitation token hash, not raw token.
- Invite links must expire.
- Removed members must immediately lose access.
- API must enforce workspace ownership/membership.
- Frontend hiding is not security.
- All workspace data queries must filter by workspace/ledger.
- Do not leak whether an email address has an account unless necessary.
- Audit invite, accept, role change, and removal events.
- Prevent removing the last owner.
- Prevent admin from modifying owner.
- Require extra confirmation for ownership transfer.

---

## Audit events

Create audit events for:

```text
workspace.created
workspace.updated
workspace.archived

workspace_member.invited
workspace_member.invite_revoked
workspace_member.joined
workspace_member.role_changed
workspace_member.removed

ownership.transferred
```

Audit fields:

```text
actor_user_id
workspace_id
entity_type
entity_id
action
before_json
after_json
created_at
```

---

## Multi-language requirements

All member-sharing UI text must use i18n keys.

Examples:

```text
settings.members.title
settings.members.inviteMember
settings.members.role.owner
settings.members.role.admin
settings.members.role.editor
settings.members.role.viewer
settings.members.permissionDenied
```

---

## Mobile requirements

Family/partner sharing must work on mobile.

Required mobile screens:

- member list
- invite member form
- role selector
- invitation accept screen
- workspace switcher

Use simple cards instead of wide tables on mobile.

---

## Sync and device implications

Shared workspaces make offline replay riskier. A device can queue a valid command while the member still has access, then push it after the member was removed or downgraded.

Requirements:

- every sync push must include `device_id`, `workspace_id`, and `ledger_id`
- every pushed operation must re-check current workspace membership and role
- removed members cannot push new operations
- revoked devices cannot push operations
- role downgrades apply at replay time, not queue time
- conflicts or permission failures must be visible in the sync conflict UI
- audit logs should record both the acting user and device where available

Member removal must not delete historical transactions created by that member. It only blocks future access and future operation replay.

---

## Edge cases

- invited email already belongs to a member
- invited email has pending invite
- invitation expired
- invitation revoked
- user accepts invite while logged into another account
- owner tries to remove themselves
- admin tries to remove owner
- last owner would be removed
- user belongs to many workspaces
- member removed while they are currently active in that workspace
- removed member has unsynced outbox operations
- workspace role is downgraded before queued operations are pushed
- device is revoked while it has pending outbox operations
- transaction created by removed member remains visible
- workspace archived while members are active

---

## Acceptance criteria

### Workspace ownership

- New registered user gets default workspace.
- New registered user is owner of that workspace.
- Workspace data is isolated from other workspaces.

### Invitations

- Owner/admin can invite a member by email.
- Owner/admin can choose role.
- Invitee can accept invite.
- Expired invite cannot be accepted.
- Revoked invite cannot be accepted.
- Accepted invite cannot be reused.

### Permissions

- Viewer cannot create/edit/delete financial data.
- Editor can create/edit normal financial data.
- Admin can invite and manage non-owner members.
- Admin cannot remove or demote owner.
- Owner can transfer ownership later.
- Last owner cannot be removed.

### Data isolation

- Users can only access workspaces where they are active members.
- All financial queries are scoped by workspace.
- Workspace switcher only shows accessible workspaces.

### Audit

- Invite, accept, role change, and remove actions create audit events.

### Mobile

- Member management and invitation acceptance work on mobile.

---

## MVP scope

Must-have for first shared-access implementation:

- default workspace on registration
- workspace members table
- roles: owner, admin, editor, viewer
- invite by email/token
- accept invite
- remove member
- change role
- workspace switcher
- backend permission checks
- audit events
- mobile member management UI

Can wait:

- ownership transfer
- contributor role
- granular account-level permissions
- child/minor controls
- comments
- approval workflows
- custom roles
- real-time collaboration

---

## Resolved sharing decisions

- Invite links are copyable. Email delivery is not required.
- Multiple workspaces are allowed, but onboarding creates one default personal workspace.
- Invite role must be explicit; if the UI needs a default, use viewer.
- Import permissions are separate from transaction edit permissions.
- Viewers can see read-only dashboards/reports allowed by workspace policy.
- Admins can export data; viewers cannot export by default.
- Ownership transfer requires explicit confirmation and cannot remove the last owner.
