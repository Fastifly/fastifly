import { LoginCredentialsSchema } from "@fastifly/common";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@ui/dialog";
import { LockKeyhole } from "lucide-react";
import { apiClient, FastiflyApiError } from "../api/client";
import { en } from "../i18n/en";
import { testIds } from "../testing/testid-registry";
import { AuthCredentialsForm } from "./auth-components";

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

  return (
    <Dialog open={open}>
      <DialogContent
        className="w-[calc(100%-2rem)] max-w-[27rem]"
        data-testid={testIds.auth.sessionExpired.dialog}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        showCloseButton={false}
      >
        <DialogHeader className="flex flex-row items-start gap-3 text-left">
          <div className="ff-auth-dialog-icon">
            <LockKeyhole aria-hidden="true" />
          </div>
          <div>
            <DialogTitle className="text-[1.45rem]" data-testid={testIds.auth.sessionExpired.title}>
              {en.auth.sessionExpired}
            </DialogTitle>
            <DialogDescription
              data-testid={testIds.auth.sessionExpired.description}
              id={testIds.auth.sessionExpired.description}
            >
              {en.auth.sessionExpiredDescription}
            </DialogDescription>
          </div>
        </DialogHeader>

        <AuthCredentialsForm
          errorMessage={errorMessage}
          isPending={mutation.isPending}
          lockedUsername={username}
          mode="login"
          onSubmit={async (credentials) => {
            await mutation.mutateAsync(credentials);
          }}
          submitLabel={en.auth.loginAgain}
          testIds={{
            errorAlert: testIds.auth.sessionExpired.errorAlert,
            errorMessage: testIds.auth.sessionExpired.errorMessage,
            form: testIds.auth.sessionExpired.form,
            lockedUsername: testIds.auth.sessionExpired.lockedUsername,
            passwordError: testIds.auth.sessionExpired.passwordError,
            passwordInput: testIds.auth.sessionExpired.passwordInput,
            submitButton: testIds.auth.sessionExpired.submitButton,
            usernameInput: testIds.auth.sessionExpired.usernameInput,
          }}
        />

        <Button
          className="mt-3 w-full"
          data-testid={testIds.auth.sessionExpired.switchAccountButton}
          onClick={onSwitchAccount}
          type="button"
          variant="outline"
        >
          {en.auth.switchAccount}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
