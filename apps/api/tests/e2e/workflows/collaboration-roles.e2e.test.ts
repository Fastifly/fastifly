import { createUuidV7 } from "@fastifly/common";
import { describe, expect, it } from "vitest";

import {
  createAccount,
  createSqliteE2eSystem,
  registerAndResolveScope,
  requestWithCsrf,
} from "../helpers/system.js";

describe("e2e/api/workflow/collaboration-roles", () => {
  it("runs owner/editor/viewer collaboration boundaries end-to-end", async () => {
    const system = await createSqliteE2eSystem();

    try {
      const { app } = system;
      const owner = await registerAndResolveScope(app, {
        password: "password123",
        username: "collab-owner-e2e",
      });

      const checking = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "asset",
        name: "Collab Checking",
        subtype: "bank",
      });
      const groceries = await createAccount(app, owner, {
        currencyCode: "INR",
        kind: "expense",
        name: "Collab Groceries",
        subtype: "external",
      });

      const editorInvite = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: { inviteeIdentifier: "collab-editor-e2e", role: "editor" },
        url: `/api/v1/workspaces/${owner.workspaceId}/invitations`,
      });
      expect(editorInvite.statusCode).toBe(201);
      const editorToken = editorInvite
        .json<{ data: { inviteLink: string } }>()
        .data.inviteLink.split("/")
        .at(-1);
      expect(editorToken).toBeTruthy();

      const viewerInvite = await requestWithCsrf(app, owner.cookie, {
        method: "POST",
        payload: { inviteeIdentifier: "collab-viewer-e2e", role: "viewer" },
        url: `/api/v1/workspaces/${owner.workspaceId}/invitations`,
      });
      expect(viewerInvite.statusCode).toBe(201);
      const viewerToken = viewerInvite
        .json<{ data: { inviteLink: string } }>()
        .data.inviteLink.split("/")
        .at(-1);
      expect(viewerToken).toBeTruthy();

      const editor = await registerAndResolveScope(app, {
        password: "password123",
        username: "collab-editor-e2e",
      });
      const viewer = await registerAndResolveScope(app, {
        password: "password123",
        username: "collab-viewer-e2e",
      });

      const acceptEditor = await requestWithCsrf(app, editor.cookie, {
        method: "POST",
        payload: {},
        url: `/api/v1/invitations/${editorToken}/accept`,
      });
      expect(acceptEditor.statusCode).toBe(200);

      const acceptViewer = await requestWithCsrf(app, viewer.cookie, {
        method: "POST",
        payload: {},
        url: `/api/v1/invitations/${viewerToken}/accept`,
      });
      expect(acceptViewer.statusCode).toBe(200);

      const editorCreateExpense = await requestWithCsrf(app, editor.cookie, {
        headers: { "idempotency-key": `editor-expense-${createUuidV7()}` },
        method: "POST",
        payload: {
          currencyCode: "INR",
          description: "Editor-created expense",
          occurredAt: "2026-05-11T17:00:00.000Z",
          sourceAccountId: checking,
          transactions: [{ amountMinor: "111000", destinationAccountId: groceries }],
          type: "expense",
        },
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/transactions`,
      });
      expect(editorCreateExpense.statusCode).toBe(201);

      const editorInviteAttempt = await requestWithCsrf(app, editor.cookie, {
        method: "POST",
        payload: { inviteeIdentifier: "blocked-user", role: "viewer" },
        url: `/api/v1/workspaces/${owner.workspaceId}/invitations`,
      });
      expect(editorInviteAttempt.statusCode).toBe(403);

      const viewerReadAccounts = await app.inject({
        headers: { cookie: viewer.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/accounts?limit=20`,
      });
      expect(viewerReadAccounts.statusCode).toBe(200);

      const viewerCreateAccountAttempt = await requestWithCsrf(app, viewer.cookie, {
        method: "POST",
        payload: {
          currencyCode: "INR",
          kind: "asset",
          name: "Viewer forbidden",
          subtype: "cash",
        },
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/accounts`,
      });
      expect(viewerCreateAccountAttempt.statusCode).toBe(403);

      const removeViewer = await requestWithCsrf(app, owner.cookie, {
        method: "DELETE",
        payload: {},
        url: `/api/v1/workspaces/${owner.workspaceId}/members/${viewer.userId}`,
      });
      expect(removeViewer.statusCode).toBe(204);

      const viewerReadAfterRemoval = await app.inject({
        headers: { cookie: viewer.cookie },
        method: "GET",
        url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/accounts?limit=20`,
      });
      expect(viewerReadAfterRemoval.statusCode).toBe(403);
    } finally {
      await system.cleanup();
    }
  });
});
