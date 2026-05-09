import type { LedgerScope, SyncedId, WorkspaceScope } from "@fastifly/common";

export type RepositoryClock = {
  readonly now: () => Date;
};

export const systemClock: RepositoryClock = {
  now: () => new Date(),
};

export type RepositoryContext = {
  readonly actorUserId: SyncedId;
  readonly requestId: string;
  readonly clock: RepositoryClock;
};

export type WorkspaceRepositoryContext = RepositoryContext & WorkspaceScope;
export type LedgerRepositoryContext = RepositoryContext & LedgerScope;

export function makeTimestamp(clock: RepositoryClock = systemClock): string {
  return clock.now().toISOString();
}

export function assertSameWorkspace(parent: WorkspaceScope, child: WorkspaceScope): void {
  if (parent.workspaceId !== child.workspaceId) {
    throw new Error("Workspace scope mismatch");
  }
}

export function assertLedgerScope(scope: LedgerScope): LedgerScope {
  if (!scope.workspaceId || !scope.ledgerId) {
    throw new Error("Ledger repository operations require workspaceId and ledgerId");
  }

  return scope;
}
