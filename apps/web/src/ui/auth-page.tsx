import {
  DEFAULT_DEMO_LOGIN,
  LoginCredentialsSchema,
  RegisterCredentialsSchema,
} from "@fastifly/common";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@ui/button";
import { ArrowRightLeft, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { apiClient, FastiflyApiError } from "../api/client";
import { SHOW_DEMO_LOGIN } from "../env";
import { en } from "../i18n/en";
import { testIds } from "../testing/testid-registry";
import {
  AuthBrandHeader,
  type AuthCredentials,
  AuthCredentialsForm,
  type AuthMode,
  AuthPanel,
  DemoLoginCard,
} from "./auth-components";

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [credentialsPreset, setCredentialsPreset] = useState<AuthCredentials>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: unknown) => {
      const credentials =
        mode === "login"
          ? LoginCredentialsSchema.parse(input)
          : RegisterCredentialsSchema.parse(input);
      return mode === "login"
        ? await apiClient.login(credentials)
        : await apiClient.register(credentials);
    },
    onSuccess: async () => {
      await queryClient.fetchQuery({
        queryFn: apiClient.getMeContext,
        queryKey: ["me", "context"],
      });
      await navigate({ replace: true, to: "/" });
    },
    onError: (error) => {
      toast.error(getAuthErrorMessage(error));
    },
  });
  const title = mode === "login" ? en.auth.loginTitle : en.auth.registerTitle;
  const submitLabel = mode === "login" ? en.auth.submitLogin : en.auth.submitRegister;
  const modeSwitchLabel = mode === "login" ? en.auth.switchToRegister : en.auth.switchToLogin;
  const fillDemoLogin = () => {
    mutation.reset();
    setCredentialsPreset({ ...DEFAULT_DEMO_LOGIN });
  };

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-background px-4 py-8 text-foreground"
      data-testid={testIds.auth.page}
    >
      <AuthPanel className="w-full max-w-[27rem]">
        <AuthBrandHeader icon={ShieldCheck} title={title} />

        <AuthCredentialsForm
          initialCredentials={credentialsPreset}
          isPending={mutation.isPending}
          mode={mode}
          onSubmit={async (credentials) => {
            await mutation.mutateAsync(credentials);
          }}
          submitLabel={submitLabel}
        />

        <Button
          className="mt-4 w-full"
          data-testid={testIds.auth.modeSwitchButton}
          onClick={() => {
            mutation.reset();
            setCredentialsPreset(undefined);
            setMode(mode === "login" ? "register" : "login");
          }}
          type="button"
          variant="outline"
        >
          <ArrowRightLeft aria-hidden="true" />
          {modeSwitchLabel}
        </Button>

        {mode === "login" && SHOW_DEMO_LOGIN ? (
          <DemoLoginCard onUseDemoLogin={fillDemoLogin} />
        ) : null}
      </AuthPanel>
    </main>
  );
}

function getAuthErrorMessage(error: unknown): string {
  if (error instanceof FastiflyApiError) {
    return error.response.error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return en.auth.unexpectedError;
}
