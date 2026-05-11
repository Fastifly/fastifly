import type { AccountWithBalanceResponse } from "@fastifly/common";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient } from "../../../api/client";
import { en } from "../../../i18n/en";
import { testIds } from "../../../testing/testid-registry";
import { AccountCreatePanel } from "../../account-create-panel";
import { AccountCard, GlassSection } from "../shared-components";
import { formatAccountArchiveSuccess, getAccountArchiveError } from "../utils";
import type { AccountsPageProps } from "./types";

export function AccountsPage({ accounts, accountsLoading, ledgerContext }: AccountsPageProps) {
  const queryClient = useQueryClient();
  const archiveMutation = useMutation({
    mutationFn: async (account: AccountWithBalanceResponse) => {
      if (!ledgerContext) {
        throw new Error(en.accounts.ledgerRequired);
      }

      await apiClient.archiveAccount({
        accountId: account.id,
        ledgerId: ledgerContext.ledgerId,
        workspaceId: ledgerContext.workspaceId,
      });
    },
    onSuccess: async (_data, account) => {
      toast.success(formatAccountArchiveSuccess(account.name));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["finance", "accounts", ledgerContext?.workspaceId, ledgerContext?.ledgerId],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            "finance",
            "transactions",
            ledgerContext?.workspaceId,
            ledgerContext?.ledgerId,
          ],
        }),
      ]);
    },
  });

  const archiveAccount = async (account: AccountWithBalanceResponse) => {
    try {
      await archiveMutation.mutateAsync(account);
    } catch (error) {
      toast.error(getAccountArchiveError(error));
    }
  };

  return (
    <section className="mt-2 space-y-4" data-testid={testIds.accounts.page}>
      <AccountCreatePanel ledgerContext={ledgerContext} />
      <GlassSection title={en.shell.allAccounts} description={en.shell.accountsBody}>
        <div className="flex flex-col gap-3">
          <div
            className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3"
            data-testid={testIds.accounts.list}
          >
            {accounts.length > 0 ? (
              accounts.map((account) => (
                <AccountCard
                  account={account}
                  isArchiving={
                    archiveMutation.isPending && archiveMutation.variables?.id === account.id
                  }
                  key={account.id}
                  onArchive={archiveAccount}
                />
              ))
            ) : (
              <p
                className="text-[14px] text-slate-600 dark:text-white/62"
                data-testid={testIds.accounts.emptyState}
              >
                {accountsLoading ? en.shell.loadingData : en.shell.noAccountsBody}
              </p>
            )}
          </div>
        </div>
      </GlassSection>
    </section>
  );
}
