import { createUuidV7 } from "@fastifly/common";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { describe, expect, it } from "vitest";
import type { WebAuthnAdapter } from "../../../src/auth/webauthn.js";

import {
  createSqliteE2eSystem,
  getSessionCookie,
  mergeCookieFromResponse,
  registerAndResolveScope,
  requestWithCsrf,
} from "../helpers/system.js";

function createFakeWebAuthnAdapter(): WebAuthnAdapter {
  let registrationCounter = 0;
  let authenticationCounter = 0;

  return {
    async generateRegistrationOptions(input) {
      registrationCounter += 1;
      return {
        challenge: `registration-challenge-${registrationCounter}`,
        pubKeyCredParams: [{ alg: -7, type: "public-key" }],
        rp: { id: "localhost", name: input.config.webAuthnRpName },
        user: {
          displayName: input.displayName,
          id: input.userId,
          name: input.username,
        },
      };
    },

    async verifyRegistrationResponse(input) {
      const responseCredentialId =
        typeof input.response.id === "string" && input.response.id.length > 0
          ? input.response.id
          : `passkey-${createUuidV7()}`;

      return {
        counter: 0,
        credentialId: responseCredentialId,
        publicKey: Buffer.from(`public-key-${responseCredentialId}`).toString("base64url"),
        transportsJson: ["internal"],
      };
    },

    async generateAuthenticationOptions(input) {
      authenticationCounter += 1;
      const allowCredentials = input.passkeys?.map((passkey) => {
        const descriptor: {
          id: string;
          type: "public-key";
          transports?: AuthenticatorTransportFuture[];
        } = {
          id: passkey.credentialId,
          type: "public-key",
        };
        if (passkey.transportsJson && passkey.transportsJson.length > 0) {
          descriptor.transports = passkey.transportsJson.map(
            (transport) => transport as AuthenticatorTransportFuture,
          );
        }

        return descriptor;
      });
      return {
        challenge: `authentication-challenge-${authenticationCounter}`,
        rpId: "localhost",
        timeout: 60_000,
        userVerification: "required",
        ...(allowCredentials && allowCredentials.length > 0 ? { allowCredentials } : {}),
      };
    },

    async verifyAuthenticationResponse(input) {
      const responseCredentialId = typeof input.response.id === "string" ? input.response.id : null;
      if (!responseCredentialId || responseCredentialId !== input.passkey.credentialId) {
        return null;
      }

      return {
        counter: input.passkey.counter + 1,
        credentialId: input.passkey.credentialId,
      };
    },
  };
}

describe("e2e/api/workflow/auth-passkeys-workspace-context", () => {
  it("runs full passkey lifecycle including registration, login, list, rename, and delete", async () => {
    const system = await createSqliteE2eSystem({
      webAuthnAdapter: createFakeWebAuthnAdapter(),
    });

    try {
      const { app } = system;
      const owner = await registerAndResolveScope(app, {
        password: "password123",
        username: "passkey-owner-e2e",
      });
      let ownerCookie = owner.cookie;

      const startRegistration = await requestWithCsrf(app, ownerCookie, {
        method: "POST",
        payload: {},
        url: "/api/v1/auth/passkeys/registration/start",
      });
      expect(startRegistration.statusCode).toBe(200);
      ownerCookie = mergeCookieFromResponse(ownerCookie, startRegistration);

      const finishRegistration = await requestWithCsrf(app, ownerCookie, {
        method: "POST",
        payload: {
          response: {
            id: "cred-passkey-owner-1",
          },
        },
        url: "/api/v1/auth/passkeys/registration/finish",
      });
      expect(finishRegistration.statusCode).toBe(201);
      const createdPasskeyId = finishRegistration.json<{ data: { passkey: { id: string } } }>().data
        .passkey.id;

      const listPasskeysAfterCreate = await app.inject({
        headers: { cookie: ownerCookie },
        method: "GET",
        url: "/api/v1/me/passkeys",
      });
      expect(listPasskeysAfterCreate.statusCode).toBe(200);
      const createdCredentialId = listPasskeysAfterCreate.json<{
        data: { passkeys: Array<{ credentialId: string; id: string }> };
      }>().data.passkeys[0]?.credentialId;
      expect(createdCredentialId).toBe("cred-passkey-owner-1");

      const renamePasskey = await requestWithCsrf(app, ownerCookie, {
        method: "PATCH",
        payload: { name: "My iPhone passkey" },
        url: `/api/v1/me/passkeys/${createdPasskeyId}`,
      });
      expect(renamePasskey.statusCode).toBe(200);
      expect(renamePasskey.json<{ data: { passkey: { name: string } } }>().data.passkey.name).toBe(
        "My iPhone passkey",
      );

      const logout = await requestWithCsrf(app, ownerCookie, {
        method: "POST",
        payload: {},
        url: "/api/v1/auth/logout",
      });
      expect(logout.statusCode).toBe(204);

      let loginCookie = "";
      const startLogin = await requestWithCsrf(app, loginCookie, {
        method: "POST",
        payload: { username: "passkey-owner-e2e" },
        url: "/api/v1/auth/passkeys/login/start",
      });
      expect(startLogin.statusCode).toBe(200);
      loginCookie = mergeCookieFromResponse(loginCookie, startLogin);

      const finishLogin = await requestWithCsrf(app, loginCookie, {
        method: "POST",
        payload: {
          response: {
            id: "cred-passkey-owner-1",
          },
        },
        url: "/api/v1/auth/passkeys/login/finish",
      });
      expect(finishLogin.statusCode).toBe(200);
      const passkeySessionCookie = getSessionCookie(finishLogin);

      const meWithPasskeySession = await app.inject({
        headers: { cookie: passkeySessionCookie },
        method: "GET",
        url: "/api/v1/me/context",
      });
      expect(meWithPasskeySession.statusCode).toBe(200);

      const deletePasskey = await requestWithCsrf(app, passkeySessionCookie, {
        method: "DELETE",
        payload: {},
        url: `/api/v1/me/passkeys/${createdPasskeyId}`,
      });
      expect(deletePasskey.statusCode).toBe(204);

      const listPasskeysAfterDelete = await app.inject({
        headers: { cookie: passkeySessionCookie },
        method: "GET",
        url: "/api/v1/me/passkeys",
      });
      expect(listPasskeysAfterDelete.statusCode).toBe(200);
      expect(
        listPasskeysAfterDelete.json<{ data: { passkeys: unknown[] } }>().data.passkeys,
      ).toHaveLength(0);
    } finally {
      await system.cleanup();
    }
  });

  it("runs invitation decline and invitation revoke happy paths", async () => {
    const system = await createSqliteE2eSystem();

    try {
      const { app } = system;
      const owner = await registerAndResolveScope(app, {
        password: "password123",
        username: "workspace-owner-decline-e2e",
      });

      const inviteForDecline = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: { inviteeIdentifier: "decliner-user-e2e", role: "viewer" },
        url: `/api/v1/workspaces/${owner.workspaceId}/invitations`,
      });
      expect(inviteForDecline.statusCode).toBe(201);
      const declineToken = inviteForDecline
        .json<{ data: { invitation: { id: string }; inviteLink: string } }>()
        .data.inviteLink.split("/")
        .at(-1);
      expect(declineToken).toBeTruthy();

      const decliner = await registerAndResolveScope(app, {
        password: "password123",
        username: "decliner-user-e2e",
      });

      const declineInvite = await requestWithCsrf(app, decliner.cookie, {
        method: "POST",
        payload: {},
        url: `/api/v1/invitations/${declineToken}/decline`,
      });
      expect(declineInvite.statusCode).toBe(204);

      const declinedPreview = await app.inject({
        method: "GET",
        url: `/api/v1/invitations/${declineToken}`,
      });
      expect(declinedPreview.statusCode).toBe(404);

      const inviteForRevoke = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: { inviteeIdentifier: "revoke-user-e2e", role: "editor" },
        url: `/api/v1/workspaces/${owner.workspaceId}/invitations`,
      });
      expect(inviteForRevoke.statusCode).toBe(201);
      const revokePayload = inviteForRevoke.json<{
        data: { invitation: { id: string }; inviteLink: string };
      }>().data;
      const revokeToken = revokePayload.inviteLink.split("/").at(-1);
      expect(revokeToken).toBeTruthy();

      const revokeInvite = await requestWithCsrf(app, owner.cookie, {
        method: "DELETE",
        payload: {},
        url: `/api/v1/workspaces/${owner.workspaceId}/invitations/${revokePayload.invitation.id}`,
      });
      expect(revokeInvite.statusCode).toBe(204);

      const revokedPreview = await app.inject({
        method: "GET",
        url: `/api/v1/invitations/${revokeToken}`,
      });
      expect(revokedPreview.statusCode).toBe(404);
    } finally {
      await system.cleanup();
    }
  });

  it("switches active workspace context via preferred workspace header", async () => {
    const system = await createSqliteE2eSystem();

    try {
      const { app } = system;
      const ownerPrimary = await registerAndResolveScope(app, {
        password: "password123",
        username: "workspace-primary-owner-e2e",
      });
      const ownerSecondary = await registerAndResolveScope(app, {
        password: "password123",
        username: "workspace-secondary-owner-e2e",
      });

      const invite = await requestWithCsrf(app, ownerSecondary.cookie, {
        method: "POST",
        payload: { inviteeIdentifier: "workspace-primary-owner-e2e", role: "viewer" },
        url: `/api/v1/workspaces/${ownerSecondary.workspaceId}/invitations`,
      });
      expect(invite.statusCode).toBe(201);
      const inviteToken = invite
        .json<{ data: { inviteLink: string } }>()
        .data.inviteLink.split("/")
        .at(-1);
      expect(inviteToken).toBeTruthy();

      const accept = await requestWithCsrf(app, ownerPrimary.cookie, {
        method: "POST",
        payload: {},
        url: `/api/v1/invitations/${inviteToken}/accept`,
      });
      expect(accept.statusCode).toBe(200);

      const defaultContext = await app.inject({
        headers: { cookie: ownerPrimary.cookie },
        method: "GET",
        url: "/api/v1/me/context",
      });
      expect(defaultContext.statusCode).toBe(200);
      const defaultWorkspaceId = defaultContext.json<{
        data: { activeWorkspace: { id: string; role: string } };
      }>().data.activeWorkspace.id;
      expect(defaultWorkspaceId).toBe(ownerPrimary.workspaceId);

      const preferredContext = await app.inject({
        headers: {
          cookie: ownerPrimary.cookie,
          "x-fastifly-workspace-id": ownerSecondary.workspaceId,
        },
        method: "GET",
        url: "/api/v1/me/context",
      });
      expect(preferredContext.statusCode).toBe(200);
      const preferred = preferredContext.json<{
        data: { activeWorkspace: { id: string; role: string } };
      }>().data.activeWorkspace;
      expect(preferred.id).toBe(ownerSecondary.workspaceId);
      expect(preferred.role).toBe("viewer");
    } finally {
      await system.cleanup();
    }
  });
});
