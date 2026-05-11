import type { ApiConfig } from "@fastifly/config";
import type { IdentityRepository } from "@fastifly/db";
import type { WebAuthnAdapter } from "../../auth/webauthn.js";

export const AUTH_RATE_LIMIT = {
  groupId: "auth",
  max: 10,
  timeWindow: "1 minute",
} as const;

export type RegisterAuthRoutesOptions = {
  readonly identityRepository: IdentityRepository;
  readonly config: ApiConfig;
  readonly webAuthnAdapter: WebAuthnAdapter;
};
