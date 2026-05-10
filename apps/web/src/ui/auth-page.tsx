import { AuthCredentialsSchema } from "@fastifly/common";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { CircleDollarSign } from "lucide-react";
import { useState } from "react";
import { apiClient, FastiflyApiError } from "../api/client";
import { en } from "../i18n/en";

type AuthMode = "login" | "register";

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: unknown) => {
      const credentials = AuthCredentialsSchema.parse(input);
      return mode === "login"
        ? await apiClient.login(credentials)
        : await apiClient.register(credentials);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      await navigate({ to: "/" });
    },
  });
  const form = useForm({
    defaultValues: {
      password: "",
      username: "",
    },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync(value);
    },
  });
  const title = mode === "login" ? en.auth.loginTitle : en.auth.registerTitle;
  const submitLabel = mode === "login" ? en.auth.submitLogin : en.auth.submitRegister;
  const modeSwitchLabel = mode === "login" ? en.auth.switchToRegister : en.auth.switchToLogin;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <CircleDollarSign className="size-5" aria-hidden="true" />
          </div>
          <div>
            <p className="font-semibold text-base">{en.appName}</p>
            <h1 className="font-semibold text-xl">{title}</h1>
          </div>
        </div>

        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <form.Field
            name="username"
            validators={{
              onChange: ({ value }) => (value.trim() ? undefined : en.auth.usernameRequired),
            }}
          >
            {(field) => (
              <label className="block text-sm">
                <span className="font-medium">{en.auth.username}</span>
                <input
                  autoComplete="username"
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-600 dark:border-slate-800 dark:bg-slate-950"
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder={en.auth.usernamePlaceholder}
                  value={field.state.value}
                />
                <FieldError errors={field.state.meta.errors} />
              </label>
            )}
          </form.Field>

          <form.Field
            name="password"
            validators={{
              onChange: ({ value }) => (value.length >= 12 ? undefined : en.auth.passwordPolicy),
            }}
          >
            {(field) => (
              <label className="block text-sm">
                <span className="font-medium">{en.auth.password}</span>
                <input
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-600 dark:border-slate-800 dark:bg-slate-950"
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder={en.auth.passwordPlaceholder}
                  type="password"
                  value={field.state.value}
                />
                <FieldError errors={field.state.meta.errors} />
              </label>
            )}
          </form.Field>

          {mutation.isError ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-red-900 text-sm dark:border-red-900 dark:bg-red-950 dark:text-red-100">
              {mutation.error instanceof FastiflyApiError
                ? mutation.error.response.error.message
                : mutation.error.message}
            </p>
          ) : null}

          <button
            className="w-full rounded-md bg-slate-900 px-3 py-2 font-medium text-sm text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
            disabled={mutation.isPending}
            type="submit"
          >
            {mutation.isPending ? en.auth.loading : submitLabel}
          </button>
        </form>

        <button
          className="mt-4 w-full rounded-md border border-slate-200 px-3 py-2 font-medium text-sm transition hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          type="button"
        >
          {modeSwitchLabel}
        </button>

        <Link
          className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-md text-center text-slate-500 text-sm transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          to="/"
        >
          {en.nav.dashboard}
        </Link>
      </section>
    </main>
  );
}

function FieldError({ errors }: { readonly errors: readonly unknown[] }) {
  const firstError = errors[0];

  if (!firstError) {
    return null;
  }

  return (
    <span className="mt-1 block text-red-700 text-xs dark:text-red-300">{String(firstError)}</span>
  );
}
