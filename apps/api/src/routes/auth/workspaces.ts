import { IdentityRepositoryError, normalizeInviteeIdentifier } from "@fastifly/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod/v4";
import { generateInvitationToken, hashInvitationToken } from "../../auth/sessions.js";
import {
  requireAbility,
  requireActiveWorkspace,
  requireAuthenticatedUser,
  requireWritableWorkspace,
} from "../../policies.js";
import { ErrorResponseSchemas } from "../../schemas.js";
import type { RegisterAuthRoutesOptions } from "./contracts.js";
import {
  CreateInvitationBodySchema,
  CreateLedgerRequestSchema,
  CreateWorkspaceRequestSchema,
  createInvitationExpiry,
  createInvitationLink,
  InvitationPreviewResponseSchema,
  InvitationResponseSchema,
  InvitationTokenParamsSchema,
  LedgerListResponseSchema,
  LedgerParamsSchema,
  LedgerResponseSchema,
  makeHttpError,
  toLedgerResponse,
  toWorkspaceMemberResponse,
  toWorkspaceResponse,
  UpdateLedgerRequestSchema,
  UpdateWorkspaceMemberBodySchema,
  UpdateWorkspaceRequestSchema,
  WorkspaceInvitationParamsSchema,
  WorkspaceListResponseSchema,
  WorkspaceMemberListResponseSchema,
  WorkspaceMemberParamsSchema,
  WorkspaceMemberResponseSchema,
  WorkspaceParamsSchema,
  WorkspaceResponseSchema,
} from "./definitions.js";

export async function registerAuthWorkspaceRoutes(
  app: FastifyInstance,
  options: RegisterAuthRoutesOptions,
): Promise<void> {
  const { config, identityRepository } = options;

  app.get(
    "/api/v1/workspaces",
    {
      schema: {
        response: {
          200: WorkspaceListResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const userId = requireAuthenticatedUser(request);
      const workspaces = await identityRepository.listWorkspacesForUser(userId);

      return {
        data: {
          workspaces: workspaces.map((workspace) =>
            toWorkspaceResponse(workspace, workspace.ledgers),
          ),
        },
      };
    },
  );

  app.post(
    "/api/v1/workspaces",
    {
      onRequest: app.csrfProtection,
      schema: {
        body: CreateWorkspaceRequestSchema,
        response: {
          201: WorkspaceResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const userId = requireAuthenticatedUser(request);
      const input = CreateWorkspaceRequestSchema.parse(request.body);
      const state = await identityRepository.createWorkspace({
        baseCurrencyCode: input.baseCurrencyCode,
        ledgerName: input.ledgerName,
        name: input.name,
        userId,
      });

      await identityRepository.recordWorkspaceAuditEvent({
        action: "workspace.created",
        actorUserId: userId,
        entityId: state.workspace.id,
        entityType: "workspace",
        metadataJson: {
          ledgerId: state.ledger.id,
          ledgerName: state.ledger.name,
          name: state.workspace.name,
        },
        workspaceId: state.workspace.id,
      });

      return reply.status(201).send({
        data: {
          workspace: toWorkspaceResponse({ ...state.workspace, role: state.membership.role }, [
            state.ledger,
          ]),
        },
      });
    },
  );

  app.patch(
    "/api/v1/workspaces/:workspaceId",
    {
      onRequest: app.csrfProtection,
      schema: {
        body: UpdateWorkspaceRequestSchema,
        params: WorkspaceParamsSchema,
        response: {
          200: WorkspaceResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const userId = requireAuthenticatedUser(request);
      const params = WorkspaceParamsSchema.parse(request.params);
      const input = UpdateWorkspaceRequestSchema.parse(request.body);

      requireWritableWorkspace(request, params.workspaceId);
      requireAbility(request, "update", "Workspace");

      const workspace = await identityRepository.updateWorkspace({
        name: input.name,
        workspaceId: params.workspaceId,
      });

      if (!workspace) {
        throw makeHttpError(404, "Workspace was not found.");
      }

      await identityRepository.recordWorkspaceAuditEvent({
        action: "workspace.updated",
        actorUserId: userId,
        entityId: workspace.id,
        entityType: "workspace",
        metadataJson: { name: workspace.name },
        workspaceId: workspace.id,
      });

      const context = requireActiveWorkspace(request, params.workspaceId);
      const ledgers = await identityRepository.listLedgersForWorkspace(params.workspaceId);

      return {
        data: {
          workspace: toWorkspaceResponse(
            { ...workspace, role: context.activeWorkspace.role },
            ledgers,
          ),
        },
      };
    },
  );

  app.get(
    "/api/v1/workspaces/:workspaceId/ledgers",
    {
      schema: {
        params: WorkspaceParamsSchema,
        response: {
          200: LedgerListResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      requireAuthenticatedUser(request);
      const params = WorkspaceParamsSchema.parse(request.params);

      requireActiveWorkspace(request, params.workspaceId);
      requireAbility(request, "read", "Ledger");

      const ledgers = await identityRepository.listLedgersForWorkspace(params.workspaceId);

      return { data: { ledgers: ledgers.map(toLedgerResponse) } };
    },
  );

  app.post(
    "/api/v1/workspaces/:workspaceId/ledgers",
    {
      onRequest: app.csrfProtection,
      schema: {
        body: CreateLedgerRequestSchema,
        params: WorkspaceParamsSchema,
        response: {
          201: LedgerResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const userId = requireAuthenticatedUser(request);
      const params = WorkspaceParamsSchema.parse(request.params);
      const input = CreateLedgerRequestSchema.parse(request.body);

      requireWritableWorkspace(request, params.workspaceId);
      requireAbility(request, "create", "Ledger");

      try {
        const ledger = await identityRepository.createLedger({
          baseCurrencyCode: input.baseCurrencyCode,
          ...(input.firstDayOfWeek !== undefined ? { firstDayOfWeek: input.firstDayOfWeek } : {}),
          name: input.name,
          workspaceId: params.workspaceId,
        });

        await identityRepository.recordWorkspaceAuditEvent({
          action: "ledger.created",
          actorUserId: userId,
          entityId: ledger.id,
          entityType: "ledger",
          ledgerId: ledger.id,
          metadataJson: { name: ledger.name },
          workspaceId: params.workspaceId,
        });

        return reply.status(201).send({ data: { ledger: toLedgerResponse(ledger) } });
      } catch (error) {
        handleIdentityRepositoryError(error);
      }
    },
  );

  app.patch(
    "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId",
    {
      onRequest: app.csrfProtection,
      schema: {
        body: UpdateLedgerRequestSchema,
        params: LedgerParamsSchema,
        response: {
          200: LedgerResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const userId = requireAuthenticatedUser(request);
      const params = LedgerParamsSchema.parse(request.params);
      const input = UpdateLedgerRequestSchema.parse(request.body);

      requireWritableWorkspace(request, params.workspaceId);
      requireAbility(request, "update", "Ledger");

      try {
        const ledger = await identityRepository.updateLedger({
          ...(input.firstDayOfWeek !== undefined ? { firstDayOfWeek: input.firstDayOfWeek } : {}),
          ledgerId: params.ledgerId,
          name: input.name,
          workspaceId: params.workspaceId,
        });

        if (!ledger) {
          throw makeHttpError(404, "Ledger was not found.");
        }

        await identityRepository.recordWorkspaceAuditEvent({
          action: "ledger.updated",
          actorUserId: userId,
          entityId: ledger.id,
          entityType: "ledger",
          ledgerId: ledger.id,
          metadataJson: { name: ledger.name },
          workspaceId: params.workspaceId,
        });

        return { data: { ledger: toLedgerResponse(ledger) } };
      } catch (error) {
        handleIdentityRepositoryError(error);
      }
    },
  );

  app.delete(
    "/api/v1/workspaces/:workspaceId/ledgers/:ledgerId",
    {
      onRequest: app.csrfProtection,
      schema: {
        params: LedgerParamsSchema,
        response: {
          200: LedgerResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const userId = requireAuthenticatedUser(request);
      const params = LedgerParamsSchema.parse(request.params);

      requireWritableWorkspace(request, params.workspaceId);
      requireAbility(request, "archive", "Ledger");

      try {
        const ledger = await identityRepository.archiveLedger({
          ledgerId: params.ledgerId,
          workspaceId: params.workspaceId,
        });

        if (!ledger) {
          throw makeHttpError(404, "Ledger was not found.");
        }

        await identityRepository.recordWorkspaceAuditEvent({
          action: "ledger.archived",
          actorUserId: userId,
          entityId: ledger.id,
          entityType: "ledger",
          ledgerId: ledger.id,
          metadataJson: { name: ledger.name },
          workspaceId: params.workspaceId,
        });

        return { data: { ledger: toLedgerResponse(ledger) } };
      } catch (error) {
        handleIdentityRepositoryError(error);
      }
    },
  );

  app.post(
    "/api/v1/workspaces/:workspaceId/invitations",
    {
      onRequest: app.csrfProtection,
      schema: {
        body: CreateInvitationBodySchema,
        params: WorkspaceParamsSchema,
        response: {
          201: InvitationResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const userId = requireAuthenticatedUser(request);
      const params = WorkspaceParamsSchema.parse(request.params);
      const input = CreateInvitationBodySchema.parse(request.body);

      requireWritableWorkspace(request, params.workspaceId);
      requireAbility(request, "invite", "WorkspaceInvitation");

      const pendingInvitation = await identityRepository.findPendingWorkspaceInvitationByInvitee({
        inviteeIdentifier: input.inviteeIdentifier,
        workspaceId: params.workspaceId,
      });

      if (pendingInvitation) {
        throw makeHttpError(409, "A pending invitation already exists for this invitee.");
      }

      const token = generateInvitationToken();
      const invitation = await identityRepository.createWorkspaceInvitation({
        expiresAt: createInvitationExpiry(config),
        invitedByUserId: userId,
        inviteeIdentifier: input.inviteeIdentifier,
        role: input.role,
        tokenHash: hashInvitationToken(token),
        workspaceId: params.workspaceId,
      });
      await identityRepository.recordWorkspaceAuditEvent({
        action: "workspace_member.invited",
        actorUserId: userId,
        entityId: invitation.id,
        entityType: "workspace_invitation",
        metadataJson: {
          inviteeIdentifier: invitation.inviteeIdentifier,
          role: invitation.role,
        },
        workspaceId: params.workspaceId,
      });

      return reply.status(201).send({
        data: {
          invitation: {
            expiresAt: invitation.expiresAt,
            id: invitation.id,
            inviteeIdentifier: invitation.inviteeIdentifier,
            role: invitation.role,
            workspaceId: invitation.workspaceId,
          },
          inviteLink: createInvitationLink(config, token),
        },
      });
    },
  );

  app.get(
    "/api/v1/invitations/:token",
    {
      schema: {
        params: InvitationTokenParamsSchema,
        response: {
          200: InvitationPreviewResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const params = InvitationTokenParamsSchema.parse(request.params);
      const invitation = await identityRepository.findActiveWorkspaceInvitationByTokenHash({
        tokenHash: hashInvitationToken(params.token),
      });

      if (!invitation) {
        throw makeHttpError(404, "Invitation was not found.");
      }

      const workspace = await identityRepository.findWorkspaceById(invitation.workspaceId);

      if (!workspace || workspace.archivedAt) {
        throw makeHttpError(404, "Invitation was not found.");
      }

      return {
        data: {
          invitation: {
            expiresAt: invitation.expiresAt,
            id: invitation.id,
            inviteeIdentifier: invitation.inviteeIdentifier,
            role: invitation.role,
            workspaceId: invitation.workspaceId,
            workspaceName: workspace.name,
          },
        },
      };
    },
  );

  app.post(
    "/api/v1/invitations/:token/accept",
    {
      onRequest: app.csrfProtection,
      schema: {
        params: InvitationTokenParamsSchema,
        response: {
          200: WorkspaceMemberResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const userId = requireAuthenticatedUser(request);
      const params = InvitationTokenParamsSchema.parse(request.params);
      const user = await identityRepository.findUserById(userId);
      const invitation = await identityRepository.findActiveWorkspaceInvitationByTokenHash({
        tokenHash: hashInvitationToken(params.token),
      });

      if (!user || user.disabledAt) {
        throw makeHttpError(401, "Authentication is required.");
      }

      if (!invitation) {
        throw makeHttpError(404, "Invitation was not found.");
      }

      const normalizedInviteeIdentifier = normalizeInviteeIdentifier(invitation.inviteeIdentifier);

      if (normalizedInviteeIdentifier !== user.usernameNormalized) {
        throw makeHttpError(403, "This invitation is not for the current account.");
      }

      const member = await identityRepository.acceptWorkspaceInvitation({
        invitationId: invitation.id,
        inviteeIdentifierNormalized: normalizedInviteeIdentifier,
        userId,
      });

      if (!member) {
        throw makeHttpError(409, "Invitation can no longer be accepted.");
      }

      await identityRepository.recordWorkspaceAuditEvent({
        action: "workspace_member.joined",
        actorUserId: userId,
        entityId: member.id,
        entityType: "workspace_member",
        metadataJson: {
          invitationId: invitation.id,
          role: member.role,
        },
        workspaceId: member.workspaceId,
      });

      return {
        data: {
          member: toWorkspaceMemberResponse({
            ...member,
            user: {
              disabledAt: user.disabledAt,
              displayName: user.displayName,
              id: user.id,
              username: user.username,
            },
          }),
        },
      };
    },
  );

  app.post(
    "/api/v1/invitations/:token/decline",
    {
      onRequest: app.csrfProtection,
      schema: {
        params: InvitationTokenParamsSchema,
        response: {
          204: z.null(),
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const userId = requireAuthenticatedUser(request);
      const params = InvitationTokenParamsSchema.parse(request.params);
      const user = await identityRepository.findUserById(userId);
      const invitation = await identityRepository.findActiveWorkspaceInvitationByTokenHash({
        tokenHash: hashInvitationToken(params.token),
      });

      if (!user || user.disabledAt) {
        throw makeHttpError(401, "Authentication is required.");
      }

      if (!invitation) {
        throw makeHttpError(404, "Invitation was not found.");
      }

      if (normalizeInviteeIdentifier(invitation.inviteeIdentifier) !== user.usernameNormalized) {
        throw makeHttpError(403, "This invitation is not for the current account.");
      }

      await identityRepository.declineWorkspaceInvitation({ invitationId: invitation.id });
      await identityRepository.recordWorkspaceAuditEvent({
        action: "workspace_member.invite_revoked",
        actorUserId: userId,
        entityId: invitation.id,
        entityType: "workspace_invitation",
        metadataJson: { reason: "declined" },
        workspaceId: invitation.workspaceId,
      });

      return reply.status(204).send();
    },
  );

  app.delete(
    "/api/v1/workspaces/:workspaceId/invitations/:invitationId",
    {
      onRequest: app.csrfProtection,
      schema: {
        params: WorkspaceInvitationParamsSchema,
        response: {
          204: z.null(),
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const userId = requireAuthenticatedUser(request);
      const params = WorkspaceInvitationParamsSchema.parse(request.params);

      requireWritableWorkspace(request, params.workspaceId);
      requireAbility(request, "revoke", "WorkspaceInvitation");

      const invitation = await identityRepository.revokeWorkspaceInvitation({
        invitationId: params.invitationId,
        workspaceId: params.workspaceId,
      });

      if (!invitation) {
        throw makeHttpError(404, "Invitation was not found.");
      }

      await identityRepository.recordWorkspaceAuditEvent({
        action: "workspace_member.invite_revoked",
        actorUserId: userId,
        entityId: invitation.id,
        entityType: "workspace_invitation",
        metadataJson: { reason: "revoked" },
        workspaceId: invitation.workspaceId,
      });

      return reply.status(204).send();
    },
  );

  app.get(
    "/api/v1/workspaces/:workspaceId/members",
    {
      schema: {
        params: WorkspaceParamsSchema,
        response: {
          200: WorkspaceMemberListResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      requireAuthenticatedUser(request);
      const params = WorkspaceParamsSchema.parse(request.params);

      requireActiveWorkspace(request, params.workspaceId);
      requireAbility(request, "read", "WorkspaceMember");

      const members = await identityRepository.listWorkspaceMembers(params.workspaceId);

      return { data: { members: members.map(toWorkspaceMemberResponse) } };
    },
  );

  app.patch(
    "/api/v1/workspaces/:workspaceId/members/:userId",
    {
      onRequest: app.csrfProtection,
      schema: {
        body: UpdateWorkspaceMemberBodySchema,
        params: WorkspaceMemberParamsSchema,
        response: {
          200: WorkspaceMemberResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      requireAuthenticatedUser(request);
      const params = WorkspaceMemberParamsSchema.parse(request.params);
      const input = UpdateWorkspaceMemberBodySchema.parse(request.body);

      requireWritableWorkspace(request, params.workspaceId);
      requireAbility(request, "update", "WorkspaceMember");

      const target = await identityRepository.findWorkspaceMember(
        params.workspaceId,
        params.userId,
      );

      if (!target) {
        throw makeHttpError(404, "Workspace member was not found.");
      }

      if (target.role === "owner") {
        throw makeHttpError(409, "Workspace owners cannot be changed through member editing.");
      }

      const updated = await identityRepository.updateWorkspaceMemberRole({
        role: input.role,
        userId: params.userId,
        workspaceId: params.workspaceId,
      });
      const user = await identityRepository.findUserById(params.userId);

      if (!updated || !user) {
        throw makeHttpError(404, "Workspace member was not found.");
      }

      return {
        data: {
          member: toWorkspaceMemberResponse({
            ...updated,
            user: {
              disabledAt: user.disabledAt,
              displayName: user.displayName,
              id: user.id,
              username: user.username,
            },
          }),
        },
      };
    },
  );

  app.delete(
    "/api/v1/workspaces/:workspaceId/members/:userId",
    {
      onRequest: app.csrfProtection,
      schema: {
        params: WorkspaceMemberParamsSchema,
        response: {
          204: z.null(),
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      requireAuthenticatedUser(request);
      const params = WorkspaceMemberParamsSchema.parse(request.params);

      requireWritableWorkspace(request, params.workspaceId);
      requireAbility(request, "delete", "WorkspaceMember");

      const target = await identityRepository.findWorkspaceMember(
        params.workspaceId,
        params.userId,
      );

      if (!target) {
        throw makeHttpError(404, "Workspace member was not found.");
      }

      if (target.role === "owner") {
        throw makeHttpError(409, "Workspace owners cannot be removed.");
      }

      await identityRepository.removeWorkspaceMember({
        userId: params.userId,
        workspaceId: params.workspaceId,
      });

      return reply.status(204).send();
    },
  );
}

function handleIdentityRepositoryError(error: unknown): never {
  if (error instanceof IdentityRepositoryError) {
    if (error.code === "DUPLICATE_LEDGER_NAME") {
      throw makeHttpError(409, "Ledger name is already used in this workspace.");
    }
    if (error.code === "LAST_ACTIVE_LEDGER") {
      throw makeHttpError(409, "A workspace must keep at least one active ledger.");
    }
    if (error.code === "LAST_ACTIVE_WORKSPACE") {
      throw makeHttpError(409, "Your account must keep at least one active workspace.");
    }
  }

  throw error;
}
