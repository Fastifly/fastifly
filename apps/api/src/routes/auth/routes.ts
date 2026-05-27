import type { FastifyInstance } from "fastify";

import { registerAuthApiKeyRoutes } from "./api-keys.js";
import type { RegisterAuthRoutesOptions } from "./contracts.js";
import { registerAuthIdentityRoutes } from "./identity.js";
import { registerAuthPasskeyRoutes } from "./passkeys.js";
import { registerAuthRecoveryRoutes } from "./recovery.js";
import { registerAuthWorkspaceRoutes } from "./workspaces.js";

export async function registerAuthRoutes(
  app: FastifyInstance,
  options: RegisterAuthRoutesOptions,
): Promise<void> {
  await registerAuthIdentityRoutes(app, options);
  await registerAuthPasskeyRoutes(app, options);
  await registerAuthRecoveryRoutes(app, options);
  await registerAuthWorkspaceRoutes(app, options);
  await registerAuthApiKeyRoutes(app, options);
}
