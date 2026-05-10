import {
  DEFAULT_DEMO_LOGIN,
  LoginCredentialsSchema,
  RegisterCredentialsSchema,
} from "@fastifly/common";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { apiClient, FastiflyApiError } from "../api/client";
import { en } from "../i18n/en";
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
  });
  const title = mode === "login" ? en.auth.loginTitle : en.auth.registerTitle;
  const submitLabel = mode === "login" ? en.auth.submitLogin : en.auth.submitRegister;
  const modeSwitchLabel = mode === "login" ? en.auth.switchToRegister : en.auth.switchToLogin;
  const errorMessage = mutation.isError
    ? mutation.error instanceof FastiflyApiError
      ? mutation.error.response.error.message
      : mutation.error.message
    : undefined;
  const fillDemoLogin = () => {
    mutation.reset();
    setCredentialsPreset({ ...DEFAULT_DEMO_LOGIN });
  };

  return (
    <main className="ff-liquid-bg flex min-h-screen items-center justify-center px-4 py-8 text-white">
      <AuthPanel className="w-full max-w-[27rem]">
        <AuthBrandHeader icon={ShieldCheck} title={title} />

        <AuthCredentialsForm
          errorMessage={errorMessage}
          initialCredentials={credentialsPreset}
          isPending={mutation.isPending}
          mode={mode}
          onSubmit={async (credentials) => {
            await mutation.mutateAsync(credentials);
          }}
          submitLabel={submitLabel}
        />

        <button
          className="ff-auth-secondary mt-4"
          onClick={() => {
            mutation.reset();
            setCredentialsPreset(undefined);
            setMode(mode === "login" ? "register" : "login");
          }}
          type="button"
        >
          {modeSwitchLabel}
        </button>

        {mode === "login" ? <DemoLoginCard onUseDemoLogin={fillDemoLogin} /> : null}
      </AuthPanel>
    </main>
  );
}
