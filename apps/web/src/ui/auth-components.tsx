import { DEFAULT_DEMO_LOGIN } from "@fastifly/common";
import { useForm } from "@tanstack/react-form";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { Field, FieldGroup, FieldLabel, FieldError as ShadcnFieldError } from "@ui/field";
import { Input } from "@ui/input";
import type { LucideIcon } from "lucide-react";
import { Copy, LogIn, UserPlus, UserRound } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { cn } from "@/lib/utils";
import { SHOW_DEMO_LOGIN } from "../env";
import { en } from "../i18n/en";
import { testIds } from "../testing/testid-registry";
import { BlockedActionGate } from "./blocked-action-gate";
import { FastiflyIcon } from "./fastifly-icon";

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

type AuthCredentialsFormProps = {
  readonly initialCredentials?: AuthCredentials | undefined;
  readonly isPending: boolean;
  readonly lockedUsername?: string | undefined;
  readonly mode: AuthMode;
  readonly onSubmit: (credentials: AuthCredentials) => Promise<void>;
  readonly submitLabel: string;
  readonly testIds?: AuthCredentialsFormTestIds | undefined;
};

type AuthCredentialsFormTestIds = {
  readonly errorAlert?: string | undefined;
  readonly errorMessage?: string | undefined;
  readonly form?: string | undefined;
  readonly lockedUsername?: string | undefined;
  readonly passwordError?: string | undefined;
  readonly passwordInput?: string | undefined;
  readonly submitButton?: string | undefined;
  readonly usernameError?: string | undefined;
  readonly usernameInput?: string | undefined;
};

export function AuthPanel({ ariaDescribedBy, children, className = "", role }: AuthPanelProps) {
  const dialogProps = role === "dialog" ? { "aria-modal": true, role } : {};

  return (
    <Card
      aria-describedby={ariaDescribedBy}
      className={cn("border border-border bg-card p-5 text-card-foreground shadow-sm", className)}
      data-testid={testIds.auth.panel}
      {...dialogProps}
    >
      {children}
    </Card>
  );
}

export function AuthBrandHeader({ icon: Icon, title }: AuthBrandHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm dark:bg-emerald-400 dark:text-black">
          <FastiflyIcon className="size-7" />
        </div>
        <div>
          <p className="font-semibold text-[15px]">{en.appName}</p>
          <h1
            className="mt-1 font-semibold text-[32px] leading-none"
            data-testid={testIds.auth.title}
          >
            {title}
          </h1>
        </div>
      </div>
      <div className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-muted/40 text-cyan-700 dark:text-cyan-300">
        <Icon aria-hidden="true" />
      </div>
    </div>
  );
}

export function AuthCredentialsForm({
  initialCredentials,
  isPending,
  lockedUsername,
  mode,
  onSubmit,
  submitLabel,
  testIds: formTestIds,
}: AuthCredentialsFormProps) {
  const resolvedTestIds = {
    errorAlert: testIds.auth.errorAlert,
    errorMessage: testIds.auth.errorMessage,
    form: testIds.auth.form,
    lockedUsername: testIds.auth.lockedUsername,
    passwordError: testIds.auth.passwordError,
    passwordInput: testIds.auth.passwordInput,
    submitButton: testIds.auth.submitButton,
    usernameError: testIds.auth.usernameError,
    usernameInput: testIds.auth.usernameInput,
    ...formTestIds,
  };
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
      className="mt-6 flex flex-col gap-4"
      data-testid={resolvedTestIds.form}
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <FieldGroup>
        {hasLockedUsername ? (
          <>
            <Input
              aria-label={en.auth.username}
              autoComplete="username"
              className="sr-only"
              data-testid={resolvedTestIds.usernameInput}
              name="username"
              readOnly
              tabIndex={-1}
              value={lockedUsername}
            />
            <Badge
              className="flex min-h-11 w-full justify-between rounded-lg px-3 py-2 text-sm"
              data-testid={resolvedTestIds.lockedUsername}
              variant="outline"
            >
              <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                <UserRound aria-hidden="true" />
                <span>{en.auth.username}</span>
              </span>
              <span className="min-w-0 truncate text-foreground">{lockedUsername}</span>
            </Badge>
          </>
        ) : (
          <form.Field
            name="username"
            validators={{
              onChange: ({ value }) => (value.trim() ? undefined : en.auth.usernameRequired),
            }}
          >
            {(field) => (
              <Field data-invalid={field.state.meta.errors.length > 0}>
                <FieldLabel htmlFor={field.name}>{en.auth.username}</FieldLabel>
                <Input
                  aria-invalid={field.state.meta.errors.length > 0}
                  autoComplete="username"
                  data-testid={resolvedTestIds.usernameInput}
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder={
                    mode === "login" && SHOW_DEMO_LOGIN
                      ? DEFAULT_DEMO_LOGIN.username
                      : en.auth.usernamePlaceholder
                  }
                  value={field.state.value}
                />
                <AuthFieldError
                  errors={field.state.meta.errors}
                  testId={resolvedTestIds.usernameError}
                />
              </Field>
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
            <Field data-invalid={field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor={field.name}>{en.auth.password}</FieldLabel>
              <Input
                aria-invalid={field.state.meta.errors.length > 0}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                data-testid={resolvedTestIds.passwordInput}
                id={field.name}
                name={field.name}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder={en.auth.passwordPlaceholder}
                type="password"
                value={field.state.value}
              />
              <AuthFieldError
                errors={field.state.meta.errors}
                testId={resolvedTestIds.passwordError}
              />
            </Field>
          )}
        </form.Field>
      </FieldGroup>

      <BlockedActionGate blocked={isPending} reason={en.actionGate.inProgress}>
        <Button
          className="w-full"
          data-testid={resolvedTestIds.submitButton}
          size="lg"
          type="submit"
        >
          {mode === "login" ? <LogIn aria-hidden="true" /> : <UserPlus aria-hidden="true" />}
          {isPending ? en.auth.loading : submitLabel}
        </Button>
      </BlockedActionGate>
    </form>
  );
}

export function DemoLoginCard({ onUseDemoLogin }: { readonly onUseDemoLogin: () => void }) {
  return (
    <section
      className="mt-4 rounded-lg border bg-muted/45 p-3 text-card-foreground"
      aria-label={en.auth.demoLoginHelper}
      data-testid={testIds.auth.demoLoginCard}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-[14px]" data-testid={testIds.auth.demoLoginTitle}>
          {en.auth.demoLoginHelper}
        </h2>
        <Button
          data-testid={testIds.auth.useDemoLoginButton}
          onClick={onUseDemoLogin}
          size="sm"
          type="button"
          variant="outline"
        >
          <LogIn aria-hidden="true" data-icon="inline-start" />
          <span>{en.auth.useDemoLogin}</span>
        </Button>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <CredentialRow
          copyButtonTestId={testIds.auth.copyDemoUsernameButton}
          copyLabel={en.auth.copyUsername}
          label={en.auth.demoUsername}
          valueTestId={testIds.auth.demoUsernameValue}
          value={DEFAULT_DEMO_LOGIN.username}
        />
        <CredentialRow
          copyButtonTestId={testIds.auth.copyDemoPasswordButton}
          copyLabel={en.auth.copyPassword}
          label={en.auth.demoPassword}
          valueTestId={testIds.auth.demoPasswordValue}
          value={DEFAULT_DEMO_LOGIN.password}
        />
      </div>
    </section>
  );
}

function CredentialRow({
  copyButtonTestId,
  copyLabel,
  label,
  valueTestId,
  value,
}: {
  readonly copyButtonTestId: string;
  readonly copyLabel: string;
  readonly label: string;
  readonly valueTestId: string;
  readonly value: string;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border bg-card p-2">
      <div className="min-w-0">
        <span className="block font-semibold text-muted-foreground text-xs">{label}</span>
        <strong
          className="block font-semibold text-sm [overflow-wrap:anywhere]"
          data-testid={valueTestId}
        >
          {value}
        </strong>
      </div>
      <Button
        aria-label={copyLabel}
        data-testid={copyButtonTestId}
        onClick={() => copyText(value)}
        size="icon-sm"
        type="button"
        variant="outline"
      >
        <Copy aria-hidden="true" />
      </Button>
    </div>
  );
}

function copyText(value: string) {
  if (!navigator.clipboard) {
    return;
  }

  void navigator.clipboard.writeText(value).catch(() => undefined);
}

function AuthFieldError({
  errors,
  testId,
}: {
  readonly errors: readonly unknown[];
  readonly testId?: string | undefined;
}) {
  const firstError = errors[0];

  if (!firstError) {
    return null;
  }

  return <ShadcnFieldError data-testid={testId}>{String(firstError)}</ShadcnFieldError>;
}
