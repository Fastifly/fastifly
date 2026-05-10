import { DEFAULT_DEMO_LOGIN } from "@fastifly/common";
import { useForm } from "@tanstack/react-form";
import type { LucideIcon } from "lucide-react";
import { CircleDollarSign, Copy, LogIn, UserRound } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { en } from "../i18n/en";

export type AuthMode = "login" | "register";

export type AuthCredentials = {
  readonly password: string;
  readonly username: string;
};

type AuthPanelProps = {
  readonly ariaDescribedBy?: string | undefined;
  readonly children: ReactNode;
  readonly className?: string;
  readonly role?: "dialog";
};

type AuthBrandHeaderProps = {
  readonly icon: LucideIcon;
  readonly title: string;
};

type AuthDialogHeaderProps = {
  readonly description: string;
  readonly descriptionId: string;
  readonly icon: LucideIcon;
  readonly title: string;
};

type AuthCredentialsFormProps = {
  readonly errorMessage?: string | undefined;
  readonly initialCredentials?: AuthCredentials | undefined;
  readonly isPending: boolean;
  readonly lockedUsername?: string | undefined;
  readonly mode: AuthMode;
  readonly onSubmit: (credentials: AuthCredentials) => Promise<void>;
  readonly submitLabel: string;
};

export function AuthPanel({ ariaDescribedBy, children, className = "", role }: AuthPanelProps) {
  const dialogProps = role === "dialog" ? { "aria-modal": true, role } : {};

  return (
    <div
      aria-describedby={ariaDescribedBy}
      className={`ff-auth-panel p-5 ${className}`}
      {...dialogProps}
    >
      {children}
    </div>
  );
}

export function AuthBrandHeader({ icon: Icon, title }: AuthBrandHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="ff-brand-mark">
          <CircleDollarSign className="size-5" aria-hidden="true" />
        </div>
        <div>
          <p className="font-semibold text-[15px]">{en.appName}</p>
          <h1 className="mt-1 font-semibold text-[32px] leading-none">{title}</h1>
        </div>
      </div>
      <div className="ff-metric-icon text-cyan-100">
        <Icon className="size-4" aria-hidden="true" />
      </div>
    </div>
  );
}

export function AuthDialogHeader({
  description,
  descriptionId,
  icon: Icon,
  title,
}: AuthDialogHeaderProps) {
  return (
    <div className="ff-auth-dialog-header">
      <div className="ff-auth-dialog-icon">
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <h2 className="ff-auth-dialog-title">{title}</h2>
        <p className="ff-auth-dialog-description" id={descriptionId}>
          {description}
        </p>
      </div>
    </div>
  );
}

export function AuthCredentialsForm({
  errorMessage,
  initialCredentials,
  isPending,
  lockedUsername,
  mode,
  onSubmit,
  submitLabel,
}: AuthCredentialsFormProps) {
  const form = useForm({
    defaultValues: {
      password: initialCredentials?.password ?? "",
      username: lockedUsername ?? initialCredentials?.username ?? "",
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
  });
  const hasLockedUsername = Boolean(lockedUsername);

  useEffect(() => {
    if (lockedUsername) {
      form.setFieldValue("username", lockedUsername);
      return;
    }

    if (initialCredentials) {
      form.setFieldValue("username", initialCredentials.username);
      form.setFieldValue("password", initialCredentials.password);
    }
  }, [form, initialCredentials, lockedUsername]);

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      {hasLockedUsername ? (
        <>
          <input
            aria-label={en.auth.username}
            autoComplete="username"
            className="sr-only"
            name="username"
            readOnly
            tabIndex={-1}
            value={lockedUsername}
          />
          <div className="ff-auth-user-chip">
            <UserRound className="size-4" aria-hidden="true" />
            <span>{lockedUsername}</span>
          </div>
        </>
      ) : (
        <form.Field
          name="username"
          validators={{
            onChange: ({ value }) => (value.trim() ? undefined : en.auth.usernameRequired),
          }}
        >
          {(field) => (
            <label className="block text-sm">
              <span className="font-semibold">{en.auth.username}</span>
              <input
                autoComplete="username"
                className="ff-auth-input"
                name={field.name}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder={
                  mode === "login" ? DEFAULT_DEMO_LOGIN.username : en.auth.usernamePlaceholder
                }
                value={field.state.value}
              />
              <FieldError errors={field.state.meta.errors} />
            </label>
          )}
        </form.Field>
      )}

      <form.Field
        name="password"
        validators={{
          onChange: ({ value }) => {
            if (mode === "login") {
              return value.length > 0 ? undefined : en.auth.passwordRequired;
            }

            return value.length >= 8 ? undefined : en.auth.passwordPolicy;
          },
        }}
      >
        {(field) => (
          <label className="block text-sm">
            <span className="font-semibold">{en.auth.password}</span>
            <input
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="ff-auth-input"
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

      {errorMessage ? (
        <p className="rounded-[10px] border border-red-400/25 bg-red-500/10 p-3 text-red-100 text-sm">
          {errorMessage}
        </p>
      ) : null}

      <button className="ff-auth-primary" disabled={isPending} type="submit">
        {isPending ? en.auth.loading : submitLabel}
      </button>
    </form>
  );
}

export function DemoLoginCard({ onUseDemoLogin }: { readonly onUseDemoLogin: () => void }) {
  return (
    <section className="ff-demo-login-card mt-4" aria-label={en.auth.demoLoginHelper}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-[14px]">{en.auth.demoLoginHelper}</h2>
        <button className="ff-demo-use-button" onClick={onUseDemoLogin} type="button">
          <LogIn className="size-4" aria-hidden="true" />
          <span>{en.auth.useDemoLogin}</span>
        </button>
      </div>

      <div className="mt-3 space-y-2">
        <CredentialRow
          copyLabel={en.auth.copyUsername}
          label={en.auth.demoUsername}
          value={DEFAULT_DEMO_LOGIN.username}
        />
        <CredentialRow
          copyLabel={en.auth.copyPassword}
          label={en.auth.demoPassword}
          value={DEFAULT_DEMO_LOGIN.password}
        />
      </div>
    </section>
  );
}

function CredentialRow({
  copyLabel,
  label,
  value,
}: {
  readonly copyLabel: string;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="ff-demo-credential-row">
      <div className="min-w-0">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <button
        aria-label={copyLabel}
        className="ff-demo-copy-button"
        onClick={() => copyText(value)}
        type="button"
      >
        <Copy className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function copyText(value: string) {
  if (!navigator.clipboard) {
    return;
  }

  void navigator.clipboard.writeText(value).catch(() => undefined);
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
