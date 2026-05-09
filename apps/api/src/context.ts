import { createFastiflyAbility, type FastiflyAbility } from "@fastifly/authz";
import type { SyncedId } from "@fastifly/common";
import type { UserWorkspaceContextRecord } from "@fastifly/db";

export type AuthContext =
  | {
      readonly kind: "anonymous";
    }
  | {
      readonly kind: "user";
      readonly userId: SyncedId;
    };

export const anonymousAuthContext: AuthContext = { kind: "anonymous" };

export const denyAllAbility: FastiflyAbility = createFastiflyAbility();

declare module "fastify" {
  interface FastifyRequest {
    authContext: AuthContext;
    authzAbility: FastiflyAbility;
    workspaceContext: UserWorkspaceContextRecord | null;
  }
}
