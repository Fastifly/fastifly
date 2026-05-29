import { type MeContextResponse, MIN_PASSWORD_LENGTH, type Passkey } from "@fastifly/common";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@ui/alert-dialog";
import { Button } from "@ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@ui/field";
import { Input } from "@ui/input";
import { Edit3, Eye, EyeOff, Fingerprint, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { apiClient, FastiflyApiError } from "../../api/client";
import { passkeysQueryKey, usePasskeysQuery } from "../../api/queries";
import { en } from "../../i18n/en";
import { testIds } from "../../testing/testid-registry";
import { ApiKeysPanel } from "../api-keys-panel";
import { SystemStatusRow } from "./navigation-components";
import { GlassSection } from "./shared-components";
import { formatDateTime } from "./utils";

type ProfileUser = MeContextResponse["data"]["user"];
type WorkspaceRole = MeContextResponse["data"]["activeWorkspace"]["role"];

type PasswordFormState = {
  readonly confirmPassword: string;
  readonly currentPassword: string;
  readonly newPassword: string;
};

type PasswordField = keyof PasswordFormState;

type PasswordStrength = "fair" | "good" | "strong" | "weak";

export function ProfilePage({
  ledgerName,
  user,
  workspaceName,
  workspaceRole,
}: {
  readonly ledgerName: string;
  readonly user: ProfileUser;
  readonly workspaceName: string;
  readonly workspaceRole: WorkspaceRole;
}) {
  return (
    <section
      className="mt-2 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(24rem,0.9fr)]"
      data-testid={testIds.profile.page}
    >
      <div className="space-y-4">
        <header className="space-y-1">
          <h2 className="font-semibold text-lg leading-none tracking-tight">{en.profile.title}</h2>
          <p className="text-muted-foreground text-sm">{en.profile.body}</p>
        </header>

        <GlassSection
          description={en.profile.summaryBody}
          testId={testIds.profile.summaryCard}
          title={en.profile.summaryTitle}
        >
          <div className="space-y-2">
            <SystemStatusRow label={en.profile.displayName} value={user.displayName} />
            <SystemStatusRow label={en.profile.username} value={user.username} />
            <SystemStatusRow label={en.profile.workspace} value={workspaceName} />
            <SystemStatusRow label={en.profile.ledger} value={ledgerName} />
            <SystemStatusRow label={en.profile.role} value={formatRole(workspaceRole)} />
          </div>
        </GlassSection>

        <PasskeysPanel />
      </div>

      <aside className="flex flex-col gap-4">
        <PasswordChangePanel />
        <ApiKeysPanel />
      </aside>
    </section>
  );
}

function PasskeysPanel() {
  const queryClient = useQueryClient();
  const passkeysQuery = usePasskeysQuery();
  const passkeys = passkeysQuery.data ?? [];
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addCurrentPassword, setAddCurrentPassword] = useState("");
  const [renameTarget, setRenameTarget] = useState<Passkey | null>(null);
  const [renameName, setRenameName] = useState("");

  const invalidatePasskeys = () => queryClient.invalidateQueries({ queryKey: passkeysQueryKey });

  const addPasskeyMutation = useMutation({
    mutationFn: async () => {
      const trimmedName = addName.trim();
      if (trimmedName.length > 100) {
        throw new Error(en.profile.passkeyNameTooLong);
      }
      if (!addCurrentPassword) {
        throw new Error(en.profile.passkeyPasswordRequired);
      }

      const { browserSupportsWebAuthn, startRegistration } = await import(
        "@simplewebauthn/browser"
      );
      if (!browserSupportsWebAuthn()) {
        throw new Error(en.profile.passkeyBrowserUnsupported);
      }

      const optionsJSON = (await apiClient.startPasskeyRegistration({
        currentPassword: addCurrentPassword,
      })) as PublicKeyCredentialCreationOptionsJSON;
      const credential: RegistrationResponseJSON = await startRegistration({ optionsJSON });
      return await apiClient.finishPasskeyRegistration({
        ...(trimmedName ? { name: trimmedName } : {}),
        response: credential as unknown as Record<string, unknown>,
      });
    },
    onError: (error) => {
      toast.error(resolvePasskeyAddErrorMessage(error));
    },
    onSuccess: async () => {
      toast.success(en.profile.passkeyAdded);
      setAddDialogOpen(false);
      setAddName("");
      setAddCurrentPassword("");
      await invalidatePasskeys();
    },
  });

  const renamePasskeyMutation = useMutation({
    mutationFn: async () => {
      const target = renameTarget;
      const trimmedName = renameName.trim();
      if (!target) {
        throw new Error(en.profile.passkeyRenameFailed);
      }
      if (!trimmedName) {
        throw new Error(en.profile.fieldRequired);
      }
      if (trimmedName.length > 100) {
        throw new Error(en.profile.passkeyNameTooLong);
      }

      return await apiClient.renamePasskey({ name: trimmedName, passkeyId: target.id });
    },
    onError: (error) => {
      toast.error(resolveErrorMessage(error, en.profile.passkeyRenameFailed));
    },
    onSuccess: async () => {
      toast.success(en.profile.passkeyRenamed);
      setRenameTarget(null);
      setRenameName("");
      await invalidatePasskeys();
    },
  });

  const removePasskeyMutation = useMutation({
    mutationFn: async (passkeyId: string) => {
      await apiClient.removePasskey({ passkeyId });
    },
    onError: (error) => {
      toast.error(resolveErrorMessage(error, en.profile.passkeyRemoveFailed));
    },
    onSuccess: async () => {
      toast.success(en.profile.passkeyRemoved);
      await invalidatePasskeys();
    },
  });

  const handleAddOpenChange = (nextOpen: boolean) => {
    setAddDialogOpen(nextOpen);
    if (!nextOpen) {
      setAddName("");
      setAddCurrentPassword("");
      addPasskeyMutation.reset();
    }
  };

  const openRenameDialog = (passkey: Passkey) => {
    setRenameTarget(passkey);
    setRenameName(passkey.name);
    renamePasskeyMutation.reset();
  };

  return (
    <>
      <GlassSection
        description={en.profile.passkeysBody}
        testId={testIds.profile.passkeysCard}
        title={en.profile.passkeysTitle}
        headerAction={
          <Button
            data-testid={testIds.profile.addPasskeyButton}
            onClick={() => setAddDialogOpen(true)}
            size="sm"
            type="button"
          >
            <Plus aria-hidden="true" />
            {en.profile.addPasskey}
          </Button>
        }
      >
        {passkeysQuery.isPending ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            {en.shell.loadingData}
          </div>
        ) : passkeysQuery.isError ? (
          <p className="text-destructive text-sm">{en.profile.passkeysLoadFailed}</p>
        ) : passkeys.length === 0 ? (
          <button
            className="flex w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-muted-foreground text-sm transition-colors hover:border-emerald-500/45 hover:bg-emerald-500/5 hover:text-foreground"
            data-testid={testIds.profile.passkeysEmpty}
            onClick={() => setAddDialogOpen(true)}
            type="button"
          >
            <span className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-background">
              <Fingerprint aria-hidden="true" className="size-5" />
            </span>
            {en.profile.passkeysEmpty}
          </button>
        ) : (
          <ul className="space-y-2" data-testid={testIds.profile.passkeysList}>
            {passkeys.map((passkey) => (
              <li
                className="flex items-start justify-between gap-3 rounded-lg bg-muted/40 p-3"
                data-testid={testIds.profile.passkeyRow(passkey.id)}
                key={passkey.id}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">{passkey.name}</p>
                  <p className="mt-1 break-all text-[12px] text-muted-foreground">
                    {`${en.profile.passkeyCredential}: ${formatCredentialId(passkey.credentialId)}`}
                  </p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {`${en.profile.registeredAt}: ${formatDateTime(passkey.createdAt)} · ${
                      en.profile.lastUsedAt
                    }: ${passkey.lastUsedAt ? formatDateTime(passkey.lastUsedAt) : en.profile.never}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    aria-label={en.profile.renamePasskey}
                    data-testid={testIds.profile.renamePasskeyButton(passkey.id)}
                    onClick={() => openRenameDialog(passkey)}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Edit3 aria-hidden="true" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        aria-label={en.profile.removePasskey}
                        className="text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
                        data-testid={testIds.profile.removePasskeyButton(passkey.id)}
                        disabled={removePasskeyMutation.isPending}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{en.profile.removePasskey}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {`${en.profile.removePasskeyBody} ${passkey.name}`}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{en.rules.cancel}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => void removePasskeyMutation.mutateAsync(passkey.id)}
                          variant="destructive"
                        >
                          {removePasskeyMutation.isPending
                            ? en.profile.removingPasskey
                            : en.profile.removePasskey}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </li>
            ))}
          </ul>
        )}
      </GlassSection>

      <Dialog open={addDialogOpen} onOpenChange={handleAddOpenChange}>
        <DialogContent data-testid={testIds.profile.addPasskeyDialog}>
          <DialogHeader>
            <DialogTitle>{en.profile.addPasskey}</DialogTitle>
            <DialogDescription>{en.profile.passkeysBody}</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            data-testid={testIds.profile.addPasskeyForm}
            onSubmit={(event) => {
              event.preventDefault();
              void addPasskeyMutation.mutateAsync();
            }}
          >
            <Field>
              <FieldLabel htmlFor="profile-passkey-name">{en.profile.passkeyName}</FieldLabel>
              <Input
                autoComplete="off"
                data-testid={testIds.profile.addPasskeyNameInput}
                disabled={addPasskeyMutation.isPending}
                id="profile-passkey-name"
                maxLength={100}
                onChange={(event) => setAddName(event.target.value)}
                placeholder={en.profile.passkeyNamePlaceholder}
                value={addName}
              />
              <FieldDescription>{en.profile.passkeyNameHint}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-passkey-current-password">
                {en.profile.passkeyCurrentPassword}
              </FieldLabel>
              <Input
                autoComplete="current-password"
                data-testid={testIds.profile.addPasskeyPasswordInput}
                disabled={addPasskeyMutation.isPending}
                id="profile-passkey-current-password"
                onChange={(event) => setAddCurrentPassword(event.target.value)}
                type="password"
                value={addCurrentPassword}
              />
            </Field>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {en.rules.cancel}
                </Button>
              </DialogClose>
              <Button
                data-testid={testIds.profile.addPasskeySubmitButton}
                disabled={addPasskeyMutation.isPending}
                type="submit"
              >
                {addPasskeyMutation.isPending ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <KeyRound aria-hidden="true" />
                )}
                {addPasskeyMutation.isPending ? en.profile.addingPasskey : en.profile.addPasskey}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setRenameTarget(null);
            setRenameName("");
            renamePasskeyMutation.reset();
          }
        }}
      >
        <DialogContent data-testid={testIds.profile.renamePasskeyDialog}>
          <DialogHeader>
            <DialogTitle>{en.profile.renamePasskey}</DialogTitle>
            <DialogDescription>{en.profile.renamePasskeyBody}</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void renamePasskeyMutation.mutateAsync();
            }}
          >
            <Field>
              <FieldLabel htmlFor="profile-rename-passkey-name">
                {en.profile.passkeyName}
              </FieldLabel>
              <Input
                data-testid={testIds.profile.renamePasskeyNameInput}
                disabled={renamePasskeyMutation.isPending}
                id="profile-rename-passkey-name"
                maxLength={100}
                onChange={(event) => setRenameName(event.target.value)}
                value={renameName}
              />
            </Field>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {en.rules.cancel}
                </Button>
              </DialogClose>
              <Button
                data-testid={testIds.profile.renamePasskeySubmitButton}
                disabled={renamePasskeyMutation.isPending}
                type="submit"
              >
                {renamePasskeyMutation.isPending
                  ? en.profile.savingPasskeyName
                  : en.profile.savePasskeyName}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PasswordChangePanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<PasswordFormState>({
    confirmPassword: "",
    currentPassword: "",
    newPassword: "",
  });
  const [errors, setErrors] = useState<Partial<Record<PasswordField, string>>>({});
  const [showPassword, setShowPassword] = useState<Record<PasswordField, boolean>>({
    confirmPassword: false,
    currentPassword: false,
    newPassword: false,
  });
  const passwordStrength = useMemo(
    () => scorePassword(formState.newPassword),
    [formState.newPassword],
  );
  const strengthMeta = getStrengthMeta(passwordStrength);

  const changePasswordMutation = useMutation({
    mutationFn: apiClient.changePassword,
    onError: (error) => {
      toast.error(resolveErrorMessage(error, en.profile.passwordChangeFailed));
    },
    onSuccess: async () => {
      toast.success(en.profile.passwordChanged);
      queryClient.clear();
      await navigate({ replace: true, to: "/login" });
    },
  });

  const updateField = (field: PasswordField, value: string) => {
    setFormState((current) => ({ ...current, [field]: value }));
    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: undefined }));
    }
  };

  const handleSubmit = () => {
    const nextErrors = validatePasswordForm(formState);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    changePasswordMutation.mutate({
      currentPassword: formState.currentPassword,
      newPassword: formState.newPassword,
    });
  };

  return (
    <GlassSection
      description={en.profile.passwordBody}
      testId={testIds.profile.passwordForm}
      title={en.profile.passwordTitle}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <FieldGroup>
          <PasswordFieldInput
            autoComplete="current-password"
            error={errors.currentPassword}
            id="profile-current-password"
            label={en.profile.currentPassword}
            onChange={(value) => updateField("currentPassword", value)}
            onToggleVisibility={() =>
              setShowPassword((current) => ({
                ...current,
                currentPassword: !current.currentPassword,
              }))
            }
            showPassword={showPassword.currentPassword}
            testId={testIds.profile.currentPasswordInput}
            value={formState.currentPassword}
          />
          <PasswordFieldInput
            autoComplete="new-password"
            error={errors.newPassword}
            id="profile-new-password"
            label={en.profile.newPassword}
            onChange={(value) => updateField("newPassword", value)}
            onToggleVisibility={() =>
              setShowPassword((current) => ({ ...current, newPassword: !current.newPassword }))
            }
            showPassword={showPassword.newPassword}
            testId={testIds.profile.newPasswordInput}
            value={formState.newPassword}
          />
          <div className="space-y-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full transition-all ${strengthMeta.tone}`}
                style={{ width: strengthMeta.width }}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              {`${en.profile.passwordStrength}: ${strengthMeta.label}`}
            </p>
          </div>
          <PasswordFieldInput
            autoComplete="new-password"
            error={errors.confirmPassword}
            id="profile-confirm-password"
            label={en.profile.confirmPassword}
            onChange={(value) => updateField("confirmPassword", value)}
            onToggleVisibility={() =>
              setShowPassword((current) => ({
                ...current,
                confirmPassword: !current.confirmPassword,
              }))
            }
            showPassword={showPassword.confirmPassword}
            testId={testIds.profile.confirmPasswordInput}
            value={formState.confirmPassword}
          />
        </FieldGroup>

        <div className="rounded-lg border bg-muted/35 p-3 text-muted-foreground text-xs">
          <p className="mb-1.5 font-medium text-foreground">{en.profile.passwordRequirements}</p>
          <ul className="space-y-1 pl-4">
            <li className="list-disc">{en.profile.passwordRequirementLength}</li>
            <li className="list-disc">{en.profile.passwordRequirementMixedCase}</li>
            <li className="list-disc">{en.profile.passwordRequirementNumber}</li>
            <li className="list-disc">{en.profile.passwordRequirementDifferent}</li>
          </ul>
        </div>

        <Button
          className="w-full"
          data-testid={testIds.profile.passwordSubmitButton}
          disabled={changePasswordMutation.isPending}
          type="submit"
        >
          {changePasswordMutation.isPending ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <KeyRound aria-hidden="true" />
          )}
          {changePasswordMutation.isPending
            ? en.profile.changingPassword
            : en.profile.changePassword}
        </Button>
      </form>
    </GlassSection>
  );
}

function PasswordFieldInput({
  autoComplete,
  error,
  id,
  label,
  onChange,
  onToggleVisibility,
  showPassword,
  testId,
  value,
}: {
  readonly autoComplete: "current-password" | "new-password";
  readonly error?: string | undefined;
  readonly id: string;
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly onToggleVisibility: () => void;
  readonly showPassword: boolean;
  readonly testId: string;
  readonly value: string;
}) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <Input
          aria-invalid={Boolean(error)}
          autoComplete={autoComplete}
          className="pr-9"
          data-testid={testId}
          id={id}
          onChange={(event) => onChange(event.target.value)}
          type={showPassword ? "text" : "password"}
          value={value}
        />
        <Button
          aria-label={showPassword ? en.profile.hidePassword : en.profile.showPassword}
          aria-pressed={showPassword}
          className="absolute top-1/2 right-1 size-7 -translate-y-1/2"
          onClick={onToggleVisibility}
          size="icon-sm"
          tabIndex={-1}
          type="button"
          variant="ghost"
        >
          {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

function validatePasswordForm(input: PasswordFormState): Partial<Record<PasswordField, string>> {
  const errors: Partial<Record<PasswordField, string>> = {};
  if (!input.currentPassword) {
    errors.currentPassword = en.profile.fieldRequired;
  }
  if (!input.newPassword) {
    errors.newPassword = en.profile.fieldRequired;
  } else if (input.newPassword.length < MIN_PASSWORD_LENGTH) {
    errors.newPassword = en.profile.newPasswordTooShort;
  } else if (input.currentPassword === input.newPassword) {
    errors.newPassword = en.profile.passwordMustDiffer;
  }
  if (!input.confirmPassword) {
    errors.confirmPassword = en.profile.fieldRequired;
  } else if (input.confirmPassword !== input.newPassword) {
    errors.confirmPassword = en.profile.passwordsDoNotMatch;
  }
  return errors;
}

function scorePassword(value: string): PasswordStrength {
  if (value.length < MIN_PASSWORD_LENGTH) {
    return "weak";
  }

  let score = 0;
  if (value.length >= 12) {
    score += 1;
  }
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) {
    score += 1;
  }
  if (/\d/.test(value)) {
    score += 1;
  }
  if (/[^A-Za-z0-9]/.test(value)) {
    score += 1;
  }

  if (score <= 1) {
    return "fair";
  }
  if (score === 2) {
    return "good";
  }
  return "strong";
}

function getStrengthMeta(strength: PasswordStrength): {
  readonly label: string;
  readonly tone: string;
  readonly width: string;
} {
  if (strength === "weak") {
    return { label: en.profile.passwordStrengthWeak, tone: "bg-destructive", width: "25%" };
  }
  if (strength === "fair") {
    return { label: en.profile.passwordStrengthFair, tone: "bg-amber-500", width: "50%" };
  }
  if (strength === "good") {
    return { label: en.profile.passwordStrengthGood, tone: "bg-sky-500", width: "75%" };
  }
  return { label: en.profile.passwordStrengthStrong, tone: "bg-emerald-500", width: "100%" };
}

function formatRole(role: WorkspaceRole): string {
  return `${role.slice(0, 1).toUpperCase()}${role.slice(1)}`;
}

function formatCredentialId(value: string): string {
  if (value.length <= 24) {
    return value;
  }

  return `${value.slice(0, 12)}...${value.slice(-8)}`;
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof FastiflyApiError) {
    return error.response.error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

function resolvePasskeyAddErrorMessage(error: unknown): string {
  const browserErrorName = readErrorName(error);

  if (browserErrorName === "AbortError") {
    return en.profile.passkeyRegistrationCancelled;
  }
  if (browserErrorName === "NotAllowedError") {
    return en.profile.passkeyRegistrationNotAllowed;
  }
  if (browserErrorName === "SecurityError") {
    return en.profile.passkeyRegistrationSecurityError;
  }
  if (error instanceof FastiflyApiError && error.response.error.code === "INTERNAL_SERVER_ERROR") {
    return en.profile.passkeyAddFailed;
  }

  return resolveErrorMessage(error, en.profile.passkeyAddFailed);
}

function readErrorName(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("name" in error)) {
    return null;
  }

  return typeof error.name === "string" ? error.name : null;
}
