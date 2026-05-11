import { describe, expect, it } from "vitest";

import {
  createSqliteE2eSystem,
  registerAndResolveScope,
  requestWithCsrf,
} from "../helpers/system.js";

describe("e2e/api/workflow/auth-membership", () => {
  it("runs auth, invite, membership role, and permission lifecycle", async () => {
    const system = await createSqliteE2eSystem();

    try {
      const { app } = system;
      const owner = await registerAndResolveScope(app, {
        password: "password123",
        username: "owner-e2e",
      });
      expect(owner.role).toBe("owner");

      const passkeyStart = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: { name: "Owner passkey" },
        url: "/api/v1/auth/passkeys/registration/start",
      });
      expect(passkeyStart.statusCode).toBe(200);
      expect(
        passkeyStart.json<{ data: { options: { challenge: string } } }>().data.options.challenge,
      ).toHaveLength(43);

      const generateRecoveryCodes = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        url: "/api/v1/me/recovery-codes",
      });
      expect(generateRecoveryCodes.statusCode).toBe(201);
      expect(
        generateRecoveryCodes.json<{ data: { recoveryCodes: readonly string[] } }>().data
          .recoveryCodes,
      ).toHaveLength(10);

      const revokeRecoveryCodes = await requestWithCsrf(app, owner.cookie, {
        method: "DELETE",
        url: "/api/v1/me/recovery-codes",
      });
      expect(revokeRecoveryCodes.statusCode).toBe(204);

      const createInvite = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: { inviteeIdentifier: "partner-e2e", role: "editor" },
        url: `/api/v1/workspaces/${owner.workspaceId}/invitations`,
      });
      expect(createInvite.statusCode).toBe(201);
      const invitePayload = createInvite.json<{
        data: {
          invitation: { id: string };
          inviteLink: string;
        };
      }>().data;
      const inviteToken = invitePayload.inviteLink.split("/").at(-1);
      expect(inviteToken).toBeTruthy();

      const getInvite = await app.inject({
        method: "GET",
        url: `/api/v1/invitations/${inviteToken}`,
      });
      expect(getInvite.statusCode).toBe(200);

      const invitee = await registerAndResolveScope(app, {
        password: "password123",
        username: "partner-e2e",
      });

      const acceptInvite = await requestWithCsrf(app, invitee.cookie, {
        method: "POST",
        payload: {},
        url: `/api/v1/invitations/${inviteToken}/accept`,
      });
      expect(acceptInvite.statusCode).toBe(200);

      const membersAfterAccept = await app.inject({
        headers: { cookie: owner.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/members`,
      });
      expect(membersAfterAccept.statusCode).toBe(200);
      expect(
        membersAfterAccept
          .json<{ data: { members: ReadonlyArray<{ user: { id: string }; role: string }> } }>()
          .data.members.some(
            (member) => member.user.id === invitee.userId && member.role === "editor",
          ),
      ).toBe(true);

      const updateMemberRole = await requestWithCsrf(app, owner.cookie, {
        method: "PATCH",
        payload: { role: "viewer" },
        url: `/api/v1/workspaces/${owner.workspaceId}/members/${invitee.userId}`,
      });
      expect(updateMemberRole.statusCode).toBe(200);

      const forbiddenAccountCreate = await requestWithCsrf(app, invitee.cookie, {
        method: "POST",
        payload: {
          currencyCode: "INR",
          kind: "asset",
          name: "Viewer should not create",
          subtype: "bank",
        },
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/accounts`,
      });
      expect(forbiddenAccountCreate.statusCode).toBe(403);

      const removeMember = await requestWithCsrf(app, owner.cookie, {
        method: "DELETE",
        payload: {},
        url: `/api/v1/workspaces/${owner.workspaceId}/members/${invitee.userId}`,
      });
      expect(removeMember.statusCode).toBe(204);

      const inviteeMembersAfterRemoval = await app.inject({
        headers: { cookie: invitee.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/members`,
      });
      expect(inviteeMembersAfterRemoval.statusCode).toBe(403);

      const revokeInvite = await requestWithCsrf(app, owner.cookie, {
        method: "DELETE",
        payload: {},
        url: `/api/v1/workspaces/${owner.workspaceId}/invitations/${invitePayload.invitation.id}`,
      });
      expect(revokeInvite.statusCode).toBe(404);
    } finally {
      await system.cleanup();
    }
  });
});
