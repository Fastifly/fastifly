import { z } from "zod";

import { SyncedIdSchema } from "./ids.js";

export const WorkspaceScopeSchema = z
  .object({
    workspaceId: SyncedIdSchema,
  })
  .strict();

export type WorkspaceScope = z.infer<typeof WorkspaceScopeSchema>;

export const LedgerScopeSchema = WorkspaceScopeSchema.extend({
  ledgerId: SyncedIdSchema,
}).strict();

export type LedgerScope = z.infer<typeof LedgerScopeSchema>;
