import { type AccountWithBalanceResponse, formatMoneyMinor } from "@fastifly/common";
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
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import type { LucideIcon } from "lucide-react";
import { Archive } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { en } from "../../i18n/en";
import { testIds } from "../../testing/testid-registry";
import { formatAccountArchiveTitle } from "./utils";

export function GlassSection({
  children,
  description,
  headerAction,
  testId,
  title,
}: {
  readonly children: ReactNode;
  readonly description?: string;
  readonly headerAction?: ReactNode;
  readonly testId?: string;
  readonly title: ReactNode;
}) {
  return (
    <Card
      className="border border-border bg-card text-card-foreground shadow-sm"
      data-testid={testId}
    >
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? (
          <CardDescription className="max-w-2xl">{description}</CardDescription>
        ) : null}
        {headerAction ? <CardAction>{headerAction}</CardAction> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function MetricTile({
  className,
  compact = false,
  dense = false,
  icon: Icon,
  label,
  testId,
  tone = "neutral",
  value,
}: {
  readonly compact?: boolean;
  readonly className?: string;
  readonly icon: LucideIcon;
  readonly dense?: boolean;
  readonly label: string;
  readonly testId?: string | undefined;
  readonly tone?: "neutral" | "green" | "rose" | "blue";
  readonly value: string;
}) {
  const toneClass =
    tone === "green"
      ? "text-emerald-700 dark:text-emerald-200"
      : tone === "rose"
        ? "text-rose-700 dark:text-rose-200"
        : tone === "blue"
          ? "text-sky-700 dark:text-sky-200"
          : "text-slate-700 dark:text-white/76";

  return (
    <Card
      className={cn(
        "min-w-0 rounded-lg border border-border bg-card p-0 text-card-foreground shadow-sm",
        compact && "bg-muted/40 shadow-none",
        className,
      )}
      data-testid={testId}
      size="sm"
    >
      <CardContent
        className={cn(
          compact
            ? "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 p-3 text-left max-[380px]:p-2.5"
            : dense
              ? "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1.5 p-2.5 text-left"
              : "p-3.5",
        )}
      >
        <div
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-lg border border-border bg-muted/40",
            compact && "size-7",
            dense && "size-7",
            toneClass,
          )}
        >
          <Icon aria-hidden="true" />
        </div>
        <p
          className={cn(
            "font-medium text-muted-foreground",
            compact
              ? "m-0 text-[0.72rem] leading-tight"
              : dense
                ? "m-0 text-[0.75rem] leading-tight"
                : "mt-3 text-[12px]",
          )}
        >
          {label}
        </p>
        <p
          className={cn(
            "break-words font-semibold leading-[1.15] text-foreground",
            compact
              ? "col-span-2 mt-0.5 text-base leading-tight max-[380px]:text-[0.875rem]"
              : dense
                ? "col-span-2 mt-0 text-[1.0625rem] leading-tight"
                : "mt-1 text-[clamp(1.05rem,4vw,1.35rem)]",
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export function AccountCard({
  account,
  isArchiving,
  onArchive,
}: {
  readonly account: AccountWithBalanceResponse;
  readonly isArchiving: boolean;
  readonly onArchive: (account: AccountWithBalanceResponse) => Promise<void>;
}) {
  return (
    <Card
      className="min-w-0 rounded-lg border border-border bg-card p-0 text-card-foreground shadow-sm"
      data-testid={testIds.accounts.card(account.id)}
      size="sm"
    >
      <CardContent className="p-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className="truncate font-semibold text-[15px]"
              data-testid={testIds.accounts.cardName(account.id)}
            >
              {account.name}
            </p>
            <p
              className="mt-1 text-[12px] text-muted-foreground capitalize"
              data-testid={testIds.accounts.cardType(account.id)}
            >
              {account.kind} / {account.subtype}
            </p>
          </div>
          <Badge
            className="rounded-full border border-border bg-muted/40 text-muted-foreground"
            data-testid={testIds.accounts.cardCurrency(account.id)}
            variant="outline"
          >
            {account.currencyCode}
          </Badge>
        </div>
        <div className="mt-6 flex items-end justify-between gap-3">
          <p
            className="min-w-0 break-words font-semibold text-[24px] leading-tight"
            data-testid={testIds.accounts.cardBalance(account.id)}
          >
            {formatMoneyMinor(BigInt(account.balance.amountMinor), account.balance.currencyCode)}
          </p>
          <AccountArchiveAction account={account} disabled={isArchiving} onArchive={onArchive} />
        </div>
      </CardContent>
    </Card>
  );
}

function AccountArchiveAction({
  account,
  disabled,
  onArchive,
}: {
  readonly account: AccountWithBalanceResponse;
  readonly disabled: boolean;
  readonly onArchive: (account: AccountWithBalanceResponse) => Promise<void>;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          data-testid={testIds.accounts.archive.button(account.id)}
          disabled={disabled}
          size="sm"
          type="button"
          variant="destructive"
        >
          <Archive aria-hidden="true" data-icon="inline-start" />
          {disabled ? en.accounts.archiving : en.accounts.archive}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent data-testid={testIds.accounts.archive.dialog(account.id)}>
        <AlertDialogHeader>
          <AlertDialogTitle data-testid={testIds.accounts.archive.title(account.id)}>
            {formatAccountArchiveTitle(account.name)}
          </AlertDialogTitle>
          <AlertDialogDescription data-testid={testIds.accounts.archive.description(account.id)}>
            {en.accounts.archiveDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid={testIds.accounts.archive.cancelButton(account.id)}>
            {en.accounts.archiveCancel}
          </AlertDialogCancel>
          <AlertDialogAction
            data-testid={testIds.accounts.archive.confirmButton(account.id)}
            disabled={disabled}
            onClick={() => {
              void onArchive(account);
            }}
            variant="destructive"
          >
            {disabled ? en.accounts.archiving : en.accounts.archiveConfirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function AccountBalanceCard({ account }: { readonly account: AccountWithBalanceResponse }) {
  const toneClass =
    account.kind === "liability"
      ? "border-red-500/25 bg-red-500/[0.08]"
      : account.kind === "asset"
        ? "border-emerald-500/25 bg-emerald-500/[0.08]"
        : "bg-muted/40";

  return (
    <Card
      className={cn("min-w-0 p-0 shadow-none", toneClass)}
      data-testid={testIds.accounts.balanceCard(account.id)}
      size="sm"
    >
      <CardContent className="p-3.5">
        <div className="grid min-w-0 gap-3">
          <div className="min-w-0">
            <p
              className="truncate font-semibold text-[14px]"
              data-testid={testIds.accounts.balanceName(account.id)}
            >
              {account.name}
            </p>
            <p
              className="mt-0.5 text-[12px] text-muted-foreground capitalize"
              data-testid={testIds.accounts.balanceKind(account.id)}
            >
              {account.kind}
            </p>
          </div>
          <p
            className="break-words text-left font-bold text-[0.875rem] leading-[1.15]"
            data-testid={testIds.accounts.balanceAmount(account.id)}
          >
            {formatMoneyMinor(BigInt(account.balance.amountMinor), account.balance.currencyCode)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
