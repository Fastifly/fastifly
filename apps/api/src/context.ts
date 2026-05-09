import type { SyncedId } from "@fastifly/common";

export type AuthContext =
  | {
      readonly kind: "anonymous";
    }
  | {
      readonly kind: "user";
      readonly userId: SyncedId;
    };

export type AuthzAbility = {
  readonly can: (action: string, subject: string) => boolean;
};

export const anonymousAuthContext: AuthContext = { kind: "anonymous" };

export const denyAllAbility: AuthzAbility = {
  can: () => false,
};

declare module "fastify" {
  interface FastifyRequest {
    authContext: AuthContext;
    authzAbility: AuthzAbility;
  }
}
