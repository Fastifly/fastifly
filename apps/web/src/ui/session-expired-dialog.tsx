import { LoginCredentialsSchema } from "@fastifly/common";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LockKeyhole } from "lucide-react";
import { useEffect } from "react";
import { apiClient, FastiflyApiError } from "../api/client";
import { en } from "../i18n/en";
import { AuthCredentialsForm, AuthDialogHeader, AuthPanel } from "./auth-components";

type SessionExpiredDialogProps = {
  readonly onLoginSuccess: () => void;
  readonly onSwitchAccount: () => void;
  readonly open: boolean;
  readonly username?: string;
};

export function SessionExpiredDialog({
  onLoginSuccess,
  onSwitchAccount,
  open,
  username,
}: SessionExpiredDialogProps) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: unknown) => apiClient.login(LoginCredentialsSchema.parse(input)),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ["finance"] });
      await queryClient.fetchQuery({
        queryFn: apiClient.getMeContext,
        queryKey: ["me", "context"],
      });
      onLoginSuccess();
    },
  });
  const errorMessage = mutation.isError
    ? mutation.error instanceof FastiflyApiError
      ? mutation.error.response.error.message
      : mutation.error.message
    : undefined;

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="ff-auth-modal-backdrop" role="presentation">
      <AuthPanel
        ariaDescribedBy="session-expired-description"
        className="ff-auth-modal"
        role="dialog"
      >
        <AuthDialogHeader
          description={en.auth.sessionExpiredDescription}
          descriptionId="session-expired-description"
          icon={LockKeyhole}
          title={en.auth.sessionExpired}
        />

        <AuthCredentialsForm
          errorMessage={errorMessage}
          isPending={mutation.isPending}
          lockedUsername={username}
          mode="login"
          onSubmit={async (credentials) => {
            await mutation.mutateAsync(credentials);
          }}
          submitLabel={en.auth.loginAgain}
        />

        <button className="ff-auth-secondary mt-3" onClick={onSwitchAccount} type="button">
          {en.auth.switchAccount}
        </button>
      </AuthPanel>
    </div>
  );
}
